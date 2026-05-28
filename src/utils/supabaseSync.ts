import type { AppData } from '../types';

const SCHEMA_VERSION = 1;

export interface CloudSyncPayload {
  app: 'clipwise';
  schemaVersion: number;
  savedAt: number;
  data: AppData;
}

export interface CloudUserProfile {
  name: string;
  email: string;
  picture: string;
}

export function createCloudPayload(data: AppData, savedAt = Date.now()): CloudSyncPayload {
  return {
    app: 'clipwise',
    schemaVersion: SCHEMA_VERSION,
    savedAt,
    data,
  };
}

export function isCloudPayload(value: unknown): value is CloudSyncPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<CloudSyncPayload>;
  return payload.app === 'clipwise'
    && typeof payload.schemaVersion === 'number'
    && typeof payload.savedAt === 'number'
    && Boolean(payload.data)
    && Array.isArray(payload.data?.videos)
    && Array.isArray(payload.data?.instances);
}

export async function loadFromCloud(): Promise<CloudSyncPayload | null> {
  const response = await fetch('/api/sync', {
    method: 'GET',
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await readError(response, 'Supabase load failed.'));

  const body = await response.json() as { data?: unknown; savedAt?: unknown };
  const payload = {
    app: 'clipwise',
    schemaVersion: SCHEMA_VERSION,
    savedAt: typeof body.savedAt === 'number' ? body.savedAt : Date.now(),
    data: body.data,
  };

  if (!isCloudPayload(payload)) throw new Error('Supabase backup was not valid ClipWise data.');
  return payload;
}

export async function saveToCloud(payload: CloudSyncPayload): Promise<CloudSyncPayload> {
  const response = await fetch('/api/sync', {
    method: 'POST',
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data: payload.data, savedAt: payload.savedAt }),
  });

  if (!response.ok) throw new Error(await readError(response, 'Supabase save failed.'));

  const body = await response.json() as { data?: unknown; savedAt?: unknown };
  const saved = {
    app: 'clipwise',
    schemaVersion: SCHEMA_VERSION,
    savedAt: typeof body.savedAt === 'number' ? body.savedAt : payload.savedAt,
    data: body.data,
  };

  if (!isCloudPayload(saved)) throw new Error('Supabase save response was invalid.');
  return saved;
}

export async function logoutPasscodeSession() {
  await fetch('/api/auth', {
    method: 'DELETE',
    credentials: 'include',
  });
}

async function readError(response: Response, fallback: string) {
  try {
    const body = await response.json() as { error?: string };
    return body.error || fallback;
  } catch {
    return fallback;
  }
}
