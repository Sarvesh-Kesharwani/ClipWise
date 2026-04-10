import { createContext } from 'react';
import type { Video, Instance, Clip } from '../types';

export type CloudSyncStatus = 'idle' | 'signing-in' | 'syncing' | 'loading' | 'error';

export interface CloudSyncState {
  isConfigured: boolean;
  isSignedIn: boolean;
  status: CloudSyncStatus;
  message: string;
  lastSyncedAt: number | null;
  fileId: string | null;
}

export interface AppContextType {
  videos: Video[];
  instances: Instance[];
  cloudSync: CloudSyncState;
  addVideo: (video: Video) => void;
  deleteVideo: (videoId: string) => void;
  updateVideo: (video: Video) => void;
  addInstance: (instance: Instance) => void;
  deleteInstance: (instanceId: string) => void;
  updateClip: (instanceId: string, clipIndex: number, updates: Partial<Clip>) => void;
  getInstancesForVideo: (videoId: string) => Instance[];
  getInstance: (instanceId: string) => Instance | undefined;
  getVideo: (videoId: string) => Video | undefined;
  generateClips: (instanceId: string, duration: number) => void;
  signInWithGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;
  syncToGoogleDrive: () => Promise<void>;
  loadFromGoogleDrive: () => Promise<void>;
}

export const AppContext = createContext<AppContextType | null>(null);
