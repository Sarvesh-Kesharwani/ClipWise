import type { AppData } from '../types';

const STORAGE_KEY = 'clipwise-data';
const STORAGE_UPDATED_AT_KEY = 'clipwise-data-updated-at';

export interface StoredAppData {
  data: AppData;
  updatedAt: number;
}

function emptyAppData(): AppData {
  return { videos: [], instances: [] };
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
