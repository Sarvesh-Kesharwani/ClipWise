import type { AppData } from '../types';

const GOOGLE_IDENTITY_SCRIPT = 'https://accounts.google.com/gsi/client';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
const SYNC_FILE_NAME = 'clipwise-data.json';
const BACKUP_FOLDER_NAME = 'clipwise-backups';
const DAILY_BACKUP_PREFIX = 'clipwise-state-';
const SNAPSHOT_BACKUP_PREFIX = 'clipwise-snapshot-';
const SCHEMA_VERSION = 1;
const FALLBACK_APP_TIME_ZONE = 'Asia/Calcutta';

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

export interface GoogleUserProfile {
  name: string;
  email: string;
  picture: string;
}

export async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile | null> {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return null;
    const data = await response.json() as { name?: string; email?: string; picture?: string };
    return {
      name: data.name ?? '',
      email: data.email ?? '',
      picture: data.picture ?? '',
    };
  } catch {
    return null;
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

export async function requestGoogleDriveToken(clientId: string, silent = false): Promise<string> {
  if (!clientId) {
    throw new Error('Add VITE_GOOGLE_CLIENT_ID to enable Google Drive sync.');
  }

  await loadGoogleIdentityScript();

  return new Promise((resolve, reject) => {
    // 'none' = silent / no UI (used for token refresh).
    // ''     = let Google decide — shows account picker only when needed,
    //          skips consent if already granted.  Using 'consent' would force
    //          the full consent screen every time.
    const promptMode = silent ? 'none' : '';
    const tokenClient = window.google?.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_APPDATA_SCOPE,
      prompt: promptMode,
      callback: (response) => {
        if (response.error) {
          reject(new Error(formatGoogleAuthError(response.error_description || response.error)));
          return;
        }

        if (!response.access_token) {
          reject(new Error('Google did not return an access token.'));
          return;
        }

        resolve(response.access_token);
      },
      error_callback: error => reject(new Error(formatGoogleAuthError(error))),
    });

    tokenClient?.requestAccessToken({ prompt: promptMode });
  });
}

function formatGoogleAuthError(error: unknown): string {
  const raw = typeof error === 'string'
    ? error
    : error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message)
      : 'Google sign-in failed.';
  const origin = window.location.origin;
  const lower = raw.toLowerCase();

  if (lower.includes('redirect_uri_mismatch') || lower.includes('origin') || lower.includes('not allowed')) {
    return `Google OAuth rejected this app origin (${origin}). Add this exact URL to the OAuth client's Authorized JavaScript origins.`;
  }

  return `${raw} Origin: ${origin}.`;
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

/* =====================================================================
   Backup layer
   - Daily backups: at most one per local-date.
   - Snapshot backups: created per overwrite for fine-grained recovery.
   - All backups live in `clipwise-backups` folder inside appDataFolder
     (private to the app, never publicly exposed).
   ===================================================================== */

export interface BackupFileRef extends DriveFileRef {
  kind: 'daily' | 'snapshot' | 'unknown';
  /** Local-date key (YYYY-MM-DD) inferred from filename. */
  dateKey: string | null;
}

export interface BackupListing {
  backups: BackupFileRef[];
  /** Default restore date (yesterday, local TZ). */
  defaultDate: string;
  /** True when a daily or snapshot backup exists for `defaultDate`. */
  hasYesterdayBackup: boolean;
}

export interface DriveRestoreResponse {
  ok: boolean;
  error?: string;
  fromName?: string;
  snapshotName?: string;
  fileId?: string;
  savedAt?: number;
  payload?: DriveSyncPayload;
  restored?: { videos: number; instances: number; folders: number };
}

let backupFolderIdCache: string | null = null;

export function getAppTimeZone(): string {
  const configured = import.meta.env.VITE_APP_TIME_ZONE as string | undefined;
  return normalizeTimeZone(configured)
    ?? normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
    ?? FALLBACK_APP_TIME_ZONE;
}

export function normalizeTimeZone(value?: string | null): string | null {
  if (!value) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return null;
  }
}

export function localDateKey(d: Date = new Date(), timeZone = getAppTimeZone()): string {
  const parts = datePartsInZone(d, timeZone);
  return formatDateKey(parts.year, parts.month, parts.day);
}

export function yesterdayKey(now: Date = new Date(), timeZone = getAppTimeZone()): string {
  const parts = datePartsInZone(now, timeZone);
  const yesterdayNoonUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 12) - 86_400_000;
  const yesterday = new Date(yesterdayNoonUtc);
  return formatDateKey(yesterday.getUTCFullYear(), yesterday.getUTCMonth() + 1, yesterday.getUTCDate());
}

function snapshotStamp(d: Date = new Date()): string {
  // ISO 8601 with `Z`, sanitized for filenames (replace `:` with `-`).
  return d.toISOString().replace(/:/g, '-');
}

function dailyBackupName(dateKey: string): string {
  return `${DAILY_BACKUP_PREFIX}${dateKey}.json`;
}

function snapshotBackupName(d: Date = new Date()): string {
  return `${SNAPSHOT_BACKUP_PREFIX}${snapshotStamp(d)}.json`;
}

function classifyBackupName(name: string, timeZone = getAppTimeZone()): { kind: BackupFileRef['kind']; dateKey: string | null } {
  if (name.startsWith(DAILY_BACKUP_PREFIX) && name.endsWith('.json')) {
    const dateKey = name.slice(DAILY_BACKUP_PREFIX.length, -'.json'.length);
    return { kind: 'daily', dateKey };
  }
  if (name.startsWith(SNAPSHOT_BACKUP_PREFIX) && name.endsWith('.json')) {
    const stamp = name.slice(SNAPSHOT_BACKUP_PREFIX.length, -'.json'.length);
    const isoLike = stamp.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/, '$1T$2:$3:$4');
    const parsed = new Date(isoLike);
    return {
      kind: 'snapshot',
      dateKey: isNaN(parsed.getTime()) ? null : localDateKey(parsed, timeZone),
    };
  }
  return { kind: 'unknown', dateKey: null };
}

function datePartsInZone(d: Date, timeZone: string): { year: number; month: number; day: number } {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(d);
  const year = Number(parts.find(part => part.type === 'year')?.value);
  const month = Number(parts.find(part => part.type === 'month')?.value);
  const day = Number(parts.find(part => part.type === 'day')?.value);
  if (!year || !month || !day) {
    throw new Error(`Could not format date for timezone ${timeZone}.`);
  }
  return { year, month, day };
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

async function findOrCreateBackupFolder(accessToken: string): Promise<string> {
  if (backupFolderIdCache) return backupFolderIdCache;
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name)',
    pageSize: '5',
    q: `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  });
  const listResp = await driveFetch(accessToken, `${DRIVE_API_BASE}/files?${params.toString()}`);
  const listed = await listResp.json() as { files?: DriveFileRef[] };
  const existing = listed.files?.[0];
  if (existing) {
    backupFolderIdCache = existing.id;
    return existing.id;
  }

  const createResp = await driveFetch(accessToken, `${DRIVE_API_BASE}/files?fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['appDataFolder'],
    }),
  });
  const created = await createResp.json() as DriveFileRef;
  backupFolderIdCache = created.id;
  return created.id;
}

async function listFilesInFolder(accessToken: string, folderId: string): Promise<DriveFileRef[]> {
  const all: DriveFileRef[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      fields: 'nextPageToken,files(id,name,modifiedTime)',
      pageSize: '100',
      q: `'${folderId}' in parents and trashed = false`,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const resp = await driveFetch(accessToken, `${DRIVE_API_BASE}/files?${params.toString()}`);
    const body = await resp.json() as { files?: DriveFileRef[]; nextPageToken?: string };
    if (body.files) all.push(...body.files);
    pageToken = body.nextPageToken;
  } while (pageToken);
  return all;
}

export async function listDriveBackups(accessToken: string, timeZone = getAppTimeZone()): Promise<BackupListing> {
  const folderId = await findOrCreateBackupFolder(accessToken);
  const files = await listFilesInFolder(accessToken, folderId);
  const backups: BackupFileRef[] = files.map(f => {
    const meta = classifyBackupName(f.name, timeZone);
    return { ...f, kind: meta.kind, dateKey: meta.dateKey };
  });
  // Newest first.
  backups.sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''));
  const defaultDate = yesterdayKey(new Date(), timeZone);
  const hasYesterdayBackup = Boolean(pickBackupForDate(backups, defaultDate));
  return { backups, defaultDate, hasYesterdayBackup };
}

export function pickBackupForDate(backups: BackupFileRef[], dateKey: string): BackupFileRef | null {
  const daily = backups.find(b => b.kind === 'daily' && b.dateKey === dateKey);
  if (daily) return daily;
  const snapshots = backups
    .filter(b => b.kind === 'snapshot' && b.dateKey === dateKey)
    .sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''));
  return snapshots[0] ?? null;
}

export async function listDriveBackupsViaApi(accessToken: string): Promise<BackupListing> {
  return driveRestoreApiFetch<BackupListing>(accessToken);
}

export async function restoreDriveBackupViaApi(accessToken: string, date?: string): Promise<DriveRestoreResponse> {
  return driveRestoreApiFetch<DriveRestoreResponse>(accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(date ? { date } : {}),
  });
}

async function uploadBackupFile(
  accessToken: string,
  folderId: string,
  fileName: string,
  payload: DriveSyncPayload,
): Promise<DriveFileRef> {
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    parents: [folderId],
  };
  const multipart = buildMultipartBody(metadata, payload);
  const resp = await driveFetch(
    accessToken,
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,modifiedTime`,
    {
      method: 'POST',
      headers: { 'Content-Type': multipart.contentType },
      body: multipart.body,
    },
  );
  return await resp.json() as DriveFileRef;
}

/**
 * Save a backup of the *previous* primary file before overwriting it.
 * Creates one snapshot every call, plus a daily backup if one doesn't yet
 * exist for today's local date. Failures are surfaced — callers should
 * decide whether to abort the overwrite or proceed.
 */
export async function backupPreviousPrimary(
  accessToken: string,
  previousPayload: DriveSyncPayload,
  now: Date = new Date(),
  timeZone = getAppTimeZone(),
): Promise<{ daily: DriveFileRef | null; snapshot: DriveFileRef }> {
  const folderId = await findOrCreateBackupFolder(accessToken);
  const todayKey = localDateKey(now, timeZone);
  const existing = await listFilesInFolder(accessToken, folderId);
  const hasDaily = existing.some(f => f.name === dailyBackupName(todayKey));

  const snapshot = await uploadBackupFile(
    accessToken,
    folderId,
    snapshotBackupName(now),
    previousPayload,
  );

  let daily: DriveFileRef | null = null;
  if (!hasDaily) {
    daily = await uploadBackupFile(
      accessToken,
      folderId,
      dailyBackupName(todayKey),
      previousPayload,
    );
  }
  return { daily, snapshot };
}

async function driveRestoreApiFetch<T>(accessToken: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);
  headers.set('X-ClipWise-Time-Zone', getAppTimeZone());

  const response = await fetch('/api/drive/restore', {
    ...init,
    headers,
  });
  const body = await response.json().catch(() => null) as { error?: string } | null;

  if (!response.ok) {
    if (response.status === 401) throw new TokenExpiredError();
    throw new Error(body?.error ?? `Restore request failed with ${response.status}.`);
  }

  return body as T;
}

export function resetBackupFolderCache() {
  backupFolderIdCache = null;
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
