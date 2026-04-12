import { createContext } from 'react';
import type { Video, Instance, Clip, Folder, Remix } from '../types';

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
  folders: Folder[];
  remixes: Remix[];
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
  addFolder: (folder: Folder) => void;
  renameFolder: (folderId: string, name: string) => void;
  deleteFolder: (folderId: string) => void;
  moveVideoToFolder: (videoId: string, folderId: string | null) => void;
  addRemix: (remix: Remix) => void;
  updateRemix: (remix: Remix) => void;
  deleteRemix: (remixId: string) => void;
  getRemix: (remixId: string) => Remix | undefined;
  signInWithGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;
  syncToGoogleDrive: () => Promise<void>;
  loadFromGoogleDrive: () => Promise<void>;
}

export const AppContext = createContext<AppContextType | null>(null);
