import type { AppData } from '../types';
import type { GoogleUserProfile } from './googleDriveSync';

const STORAGE_KEY = 'clipwise-data';
const STORAGE_UPDATED_AT_KEY = 'clipwise-data-updated-at';
const CLOUD_SESSION_KEY = 'clipwise-cloud-session';

export interface StoredAppData {
  data: AppData;
  updatedAt: number;
}

export interface StoredCloudSession {
  accessToken: string;
  fileId: string | null;
  lastSyncedAt: number | null;
  lastSavedDataAt: number | null;
  userProfile: GoogleUserProfile | null;
}

function emptyAppData(): AppData {
  return { videos: [], instances: [], folders: [], remixes: [] };
}

function now(): number {
  return Date.now();
}

export function loadAppData(): AppData {
  return loadStoredAppData().data;
}

export function loadStoredAppData(): StoredAppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as AppData;
      const updatedAt = Number(localStorage.getItem(STORAGE_UPDATED_AT_KEY)) || now();
      return { data, updatedAt };
    }
  } catch (e) {
    console.error('Failed to load app data:', e);
  }
  return { data: emptyAppData(), updatedAt: now() };
}

export function saveAppData(data: AppData, updatedAt = now()): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    localStorage.setItem(STORAGE_UPDATED_AT_KEY, String(updatedAt));
  } catch (e) {
    console.error('Failed to save app data:', e);
  }
}

export function clearAppData(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(STORAGE_UPDATED_AT_KEY);
}

export function loadCloudSession(): StoredCloudSession | null {
  try {
    const raw = localStorage.getItem(CLOUD_SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredCloudSession;
  } catch (e) {
    console.error('Failed to load cloud session:', e);
    return null;
  }
}

export function saveCloudSession(session: StoredCloudSession): void {
  try {
    localStorage.setItem(CLOUD_SESSION_KEY, JSON.stringify(session));
  } catch (e) {
    console.error('Failed to save cloud session:', e);
  }
}

export function clearCloudSession(): void {
  localStorage.removeItem(CLOUD_SESSION_KEY);
}
