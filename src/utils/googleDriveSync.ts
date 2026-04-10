import type { AppData } from '../types';

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SYNC_FILE_NAME = 'clipwise-data.json';
const SCHEMA_VERSION = 1;

export interface DriveSyncPayload {
  app: 'clipwise';
  schemaVersion: number;
  savedAt: number;
  data: AppData;
}

export interface DriveFileRef {
  id: string;
  name: string;
  modifiedTime?: string;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  prompt?: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: unknown) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: TokenClientConfig) => TokenClient;
          revoke: (accessToken: string, done?: () => void) => void;
        };
      };
    };
  }
}

export class TokenExpiredError extends Error {
  constructor() {
    super('Google access token expired.');
    this.name = 'TokenExpiredError';
  }
}

export function getGoogleClientId(): string {
  return import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '';
}

export function createDrivePayload(data: AppData, savedAt = Date.now()): DriveSyncPayload {
  return {
    app: 'clipwise',
    schemaVersion: SCHEMA_VERSION,
    savedAt,
    data,
  };
}

export function isDrivePayload(value: unknown): value is DriveSyncPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<DriveSyncPayload>;
  return payload.app === 'clipwise'
    && typeof payload.schemaVersion === 'number'
    && typeof payload.savedAt === 'number'
    && Boolean(payload.data)
    && Array.isArray(payload.data?.videos)
    && Array.isArray(payload.data?.instances);
}

export async function requestGoogleDriveToken(clientId: string): Promise<string> {
  if (!clientId) {
    throw new Error('Add VITE_GOOGLE_CLIENT_ID to enable Google Drive sync.');
  }

  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    const tokenClient = window.google?.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_APPDATA_SCOPE,
      prompt: 'consent',
      callback: (response) => {
        if (response.error) {
          reject(new Error(response.error_description || response.error));
          return;
        }

        if (!response.access_token) {
          reject(new Error('Google did not return an access token.'));
          return;
        }

        resolve(response.access_token);
      },
      error_callback: reject,
    });

    tokenClient?.requestAccessToken({ prompt: 'consent' });
  });
}

export function revokeGoogleDriveToken(accessToken: string): Promise<void> {
  if (!window.google?.accounts.oauth2.revoke) return Promise.resolve();

  return new Promise(resolve => {
    window.google?.accounts.oauth2.revoke(accessToken, resolve);
  });
}

export async function findSyncFile(accessToken: string): Promise<DriveFileRef | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name,modifiedTime)',
    pageSize: '10',
    q: `name = '${SYNC_FILE_NAME}' and trashed = false`,
  });
  const response = await driveFetch(accessToken, `${DRIVE_API_BASE}/files?${params.toString()}`);
  const body = await response.json() as { files?: DriveFileRef[] };
  return body.files?.[0] ?? null;
}

export async function downloadSyncPayload(accessToken: string, fileId: string): Promise<DriveSyncPayload | null> {
  const response = await driveFetch(accessToken, `${DRIVE_API_BASE}/files/${fileId}?alt=media`);
  const payload = await response.json() as unknown;
  return isDrivePayload(payload) ? payload : null;
}

export async function saveSyncPayload(
  accessToken: string,
  payload: DriveSyncPayload,
  fileId?: string | null,
): Promise<DriveFileRef> {
  const metadata: Record<string, unknown> = {
    name: SYNC_FILE_NAME,
    mimeType: 'application/json',
  };

  if (!fileId) {
    metadata.parents = ['appDataFolder'];
  }

  const multipart = buildMultipartBody(metadata, payload);
  const endpoint = fileId
    ? `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=multipart&fields=id,name,modifiedTime`
    : `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,modifiedTime`;

  const response = await driveFetch(accessToken, endpoint, {
    method: fileId ? 'PATCH' : 'POST',
    headers: { 'Content-Type': multipart.contentType },
    body: multipart.body,
  });

  return await response.json() as DriveFileRef;
}

async function loadGoogleIdentityScript(): Promise<void> {
  if (window.google?.accounts.oauth2) return;

  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GOOGLE_IDENTITY_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google sign-in.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = GOOGLE_IDENTITY_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google sign-in.'));
    document.head.appendChild(script);
  });

  if (!window.google?.accounts.oauth2) {
    throw new Error('Google sign-in was not available after loading.');
  }
}

async function driveFetch(accessToken: string, input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(input, { ...init, headers });
  if (!response.ok) {
    if (response.status === 401) {
      throw new TokenExpiredError();
    }
    const errorText = await response.text();
    throw new Error(errorText || `Google Drive request failed with ${response.status}.`);
  }
  return response;
}

function buildMultipartBody(metadata: Record<string, unknown>, payload: DriveSyncPayload) {
  const boundary = `clipwise_${crypto.randomUUID().replaceAll('-', '')}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    JSON.stringify(payload),
    `--${boundary}--`,
    '',
  ].join('\r\n');

  return {
    body,
    contentType: `multipart/related; boundary=${boundary}`,
  };
}
