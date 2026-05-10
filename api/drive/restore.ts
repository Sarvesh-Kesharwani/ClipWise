interface ApiRequest extends AsyncIterable<unknown> {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const SYNC_FILE_NAME = 'clipwise-data.json';
const BACKUP_FOLDER_NAME = 'clipwise-backups';
const DAILY_BACKUP_PREFIX = 'clipwise-state-';
const SNAPSHOT_BACKUP_PREFIX = 'clipwise-snapshot-';
const FALLBACK_APP_TIME_ZONE = 'Asia/Calcutta';

interface DriveSyncPayload {
  app: 'clipwise';
  schemaVersion: number;
  savedAt: number;
  data: {
    videos?: unknown[];
    instances?: unknown[];
    folders?: unknown[];
    [key: string]: unknown;
  };
}

interface DriveFileRef {
  id: string;
  name: string;
  modifiedTime?: string;
}

interface BackupFileRef extends DriveFileRef {
  kind: 'daily' | 'snapshot' | 'unknown';
  dateKey: string | null;
}

class AuthError extends Error {}
class MissingBackupError extends Error {}
class BadRequestError extends Error {}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  const token = getBearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: 'Sign in with Google before restoring backups.' });
    return;
  }

  const timeZone = readTimeZone(req);

  try {
    if (req.method === 'GET') {
      sendJson(res, 200, await listBackups(token, timeZone));
      return;
    }

    if (req.method === 'POST') {
      const body = await readJsonBody(req);
      const date = getRequestedDate(body, timeZone);
      sendJson(res, 200, await restoreBackup(token, date, timeZone));
      return;
    }

    sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    if (error instanceof AuthError) {
      sendJson(res, 401, { error: 'Google Drive session expired. Please sign in again.' });
      return;
    }
    if (error instanceof BadRequestError) {
      sendJson(res, 400, { error: error.message });
      return;
    }
    if (error instanceof MissingBackupError) {
      sendJson(res, 404, { error: error.message });
      return;
    }
    const message = error instanceof Error ? error.message : 'Drive restore failed.';
    sendJson(res, 502, { error: message });
  }
}

async function listBackups(accessToken: string, timeZone: string) {
  const defaultDate = yesterdayKey(new Date(), timeZone);
  const folder = await findBackupFolder(accessToken);
  if (!folder) {
    return { backups: [], defaultDate, hasYesterdayBackup: false };
  }

  const backups = await listBackupFiles(accessToken, folder.id, timeZone);
  return {
    backups,
    defaultDate,
    hasYesterdayBackup: Boolean(pickBackupForDate(backups, defaultDate)),
  };
}

async function restoreBackup(accessToken: string, dateKey: string, timeZone: string) {
  const listing = await listBackups(accessToken, timeZone);
  const selected = pickBackupForDate(listing.backups, dateKey);
  if (!selected) throw new MissingBackupError(`No backup found for ${dateKey}.`);

  const primary = await findSyncFile(accessToken);
  let snapshotName: string | undefined;
  if (primary) {
    const currentPayload = await downloadPayload(accessToken, primary.id);
    if (!currentPayload) {
      throw new Error('Current Drive sync file is unreadable; restore was not performed.');
    }
    snapshotName = (await createSnapshotBackup(accessToken, currentPayload)).name;
  }

  const restoredPayload = await downloadPayload(accessToken, selected.id);
  if (!restoredPayload) throw new Error('Backup file was unreadable.');

  const savedFile = await savePrimaryPayload(accessToken, restoredPayload, primary?.id ?? null);
  return {
    ok: true,
    fromName: selected.name,
    snapshotName,
    fileId: savedFile.id,
    savedAt: restoredPayload.savedAt,
    payload: restoredPayload,
    restored: {
      videos: restoredPayload.data.videos?.length ?? 0,
      instances: restoredPayload.data.instances?.length ?? 0,
      folders: restoredPayload.data.folders?.length ?? 0,
    },
  };
}

async function findSyncFile(accessToken: string): Promise<DriveFileRef | null> {
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

async function findBackupFolder(accessToken: string): Promise<DriveFileRef | null> {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    fields: 'files(id,name)',
    pageSize: '5',
    q: `name = '${BACKUP_FOLDER_NAME}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  });
  const response = await driveFetch(accessToken, `${DRIVE_API_BASE}/files?${params.toString()}`);
  const body = await response.json() as { files?: DriveFileRef[] };
  return body.files?.[0] ?? null;
}

async function findOrCreateBackupFolder(accessToken: string): Promise<string> {
  const existing = await findBackupFolder(accessToken);
  if (existing) return existing.id;

  const response = await driveFetch(accessToken, `${DRIVE_API_BASE}/files?fields=id,name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
      parents: ['appDataFolder'],
    }),
  });
  const created = await response.json() as DriveFileRef;
  return created.id;
}

async function listBackupFiles(accessToken: string, folderId: string, timeZone: string): Promise<BackupFileRef[]> {
  const all: BackupFileRef[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      fields: 'nextPageToken,files(id,name,modifiedTime)',
      pageSize: '100',
      q: `'${folderId}' in parents and trashed = false`,
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await driveFetch(accessToken, `${DRIVE_API_BASE}/files?${params.toString()}`);
    const body = await response.json() as { files?: DriveFileRef[]; nextPageToken?: string };
    for (const file of body.files ?? []) {
      const meta = classifyBackupName(file.name, timeZone);
      all.push({ ...file, kind: meta.kind, dateKey: meta.dateKey });
    }
    pageToken = body.nextPageToken;
  } while (pageToken);

  return all.sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''));
}

function pickBackupForDate(backups: BackupFileRef[], dateKey: string): BackupFileRef | null {
  const daily = backups.find(backup => backup.kind === 'daily' && backup.dateKey === dateKey);
  if (daily) return daily;
  return backups
    .filter(backup => backup.kind === 'snapshot' && backup.dateKey === dateKey)
    .sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? ''))[0] ?? null;
}

async function downloadPayload(accessToken: string, fileId: string): Promise<DriveSyncPayload | null> {
  const response = await driveFetch(accessToken, `${DRIVE_API_BASE}/files/${fileId}?alt=media`);
  const payload = await response.json() as unknown;
  return isDrivePayload(payload) ? payload : null;
}

async function createSnapshotBackup(accessToken: string, payload: DriveSyncPayload): Promise<DriveFileRef> {
  const folderId = await findOrCreateBackupFolder(accessToken);
  return uploadJsonFile(accessToken, {
    name: snapshotBackupName(new Date()),
    mimeType: 'application/json',
    parents: [folderId],
  }, payload);
}

async function savePrimaryPayload(
  accessToken: string,
  payload: DriveSyncPayload,
  fileId: string | null,
): Promise<DriveFileRef> {
  const metadata: Record<string, unknown> = {
    name: SYNC_FILE_NAME,
    mimeType: 'application/json',
  };
  if (!fileId) metadata.parents = ['appDataFolder'];

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

async function uploadJsonFile(
  accessToken: string,
  metadata: Record<string, unknown>,
  payload: DriveSyncPayload,
): Promise<DriveFileRef> {
  const multipart = buildMultipartBody(metadata, payload);
  const response = await driveFetch(accessToken, `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,modifiedTime`, {
    method: 'POST',
    headers: { 'Content-Type': multipart.contentType },
    body: multipart.body,
  });
  return await response.json() as DriveFileRef;
}

async function driveFetch(accessToken: string, input: string | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${accessToken}`);

  const response = await fetch(input, { ...init, headers });
  if (!response.ok) {
    if (response.status === 401) throw new AuthError('Google Drive token expired.');
    const errorText = await response.text();
    throw new Error(errorText || `Google Drive request failed with ${response.status}.`);
  }
  return response;
}

function classifyBackupName(name: string, timeZone: string): { kind: BackupFileRef['kind']; dateKey: string | null } {
  if (name.startsWith(DAILY_BACKUP_PREFIX) && name.endsWith('.json')) {
    return { kind: 'daily', dateKey: name.slice(DAILY_BACKUP_PREFIX.length, -'.json'.length) };
  }

  if (name.startsWith(SNAPSHOT_BACKUP_PREFIX) && name.endsWith('.json')) {
    const stamp = name.slice(SNAPSHOT_BACKUP_PREFIX.length, -'.json'.length);
    const isoLike = stamp.replace(/^(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})/, '$1T$2:$3:$4');
    const parsed = new Date(isoLike);
    return {
      kind: 'snapshot',
      dateKey: Number.isNaN(parsed.getTime()) ? null : localDateKey(parsed, timeZone),
    };
  }

  return { kind: 'unknown', dateKey: null };
}

function snapshotBackupName(d: Date): string {
  return `${SNAPSHOT_BACKUP_PREFIX}${d.toISOString().replace(/:/g, '-')}.json`;
}

function isDrivePayload(value: unknown): value is DriveSyncPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<DriveSyncPayload>;
  return payload.app === 'clipwise'
    && typeof payload.schemaVersion === 'number'
    && typeof payload.savedAt === 'number'
    && Boolean(payload.data)
    && Array.isArray(payload.data?.videos)
    && Array.isArray(payload.data?.instances);
}

function localDateKey(d: Date, timeZone: string): string {
  const parts = datePartsInZone(d, timeZone);
  return formatDateKey(parts.year, parts.month, parts.day);
}

function yesterdayKey(now: Date, timeZone: string): string {
  const parts = datePartsInZone(now, timeZone);
  const yesterdayNoonUtc = Date.UTC(parts.year, parts.month - 1, parts.day, 12) - 86_400_000;
  const yesterday = new Date(yesterdayNoonUtc);
  return formatDateKey(yesterday.getUTCFullYear(), yesterday.getUTCMonth() + 1, yesterday.getUTCDate());
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
  if (!year || !month || !day) throw new Error(`Could not format date for timezone ${timeZone}.`);
  return { year, month, day };
}

function formatDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function readTimeZone(req: ApiRequest): string {
  const raw = req.headers['x-clipwise-time-zone'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return normalizeTimeZone(value) ?? FALLBACK_APP_TIME_ZONE;
}

function normalizeTimeZone(value?: string | null): string | null {
  if (!value) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return null;
  }
}

function getRequestedDate(body: unknown, timeZone: string): string {
  if (!body || typeof body !== 'object' || !('date' in body)) {
    return yesterdayKey(new Date(), timeZone);
  }

  const date = (body as { date?: unknown }).date;
  if (date == null || date === '') return yesterdayKey(new Date(), timeZone);
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new BadRequestError('date must be YYYY-MM-DD.');
  }
  return date;
}

async function readJsonBody(req: ApiRequest): Promise<unknown> {
  let raw = '';
  for await (const chunk of req) raw += String(chunk);
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new BadRequestError('Request body must be valid JSON.');
  }
}

function getBearerToken(req: ApiRequest): string | null {
  const auth = req.headers.authorization;
  const value = Array.isArray(auth) ? auth[0] : auth;
  const match = value?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
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

function sendJson(res: ApiResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
