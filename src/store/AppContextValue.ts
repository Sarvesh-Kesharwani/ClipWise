import { createContext } from 'react';
import type { Video, Instance, Clip, Folder, Remix, FeatureRequest, FeedList, FeedSettings, ProgressState } from '../types';
import type { BackupListing, GoogleUserProfile } from '../utils/googleDriveSync';

export interface RestoreResult {
  ok: boolean;
  error?: string;
  /** Counts from the data we just restored (videos / instances / folders). */
  restored?: { videos: number; instances: number; folders: number };
  /** Backup file we restored from. */
  fromName?: string;
  /** Snapshot we made of the previous primary, if any. */
  snapshotName?: string;
}

export type CloudSyncStatus = 'idle' | 'signing-in' | 'syncing' | 'loading' | 'restoring' | 'error';

export interface CloudSyncState {
  isConfigured: boolean;
  isSignedIn: boolean;
  hasPendingChanges: boolean;
  requiresDriveRestore: boolean;
  status: CloudSyncStatus;
  message: string;
  lastSyncedAt: number | null;
  fileId: string | null;
  userProfile: GoogleUserProfile | null;
}

export interface AppContextType {
  videos: Video[];
  instances: Instance[];
  folders: Folder[];
  remixes: Remix[];
  featureRequests: FeatureRequest[];
  feedLists: FeedList[];
  feedSettings: FeedSettings;
  progress: ProgressState;
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
  addFeatureRequest: (request: FeatureRequest) => void;
  toggleFeatureRequestComplete: (requestId: string) => void;
  deleteFeatureRequest: (requestId: string) => void;
  addFeedList: (list: FeedList) => void;
  renameFeedList: (listId: string, name: string) => void;
  deleteFeedList: (listId: string) => void;
  setFeedListVideos: (listId: string, videoIds: string[]) => void;
  updateFeedSettings: (settings: Partial<FeedSettings>) => void;
  recordClipWatched: (videoId: string) => void;
  recordClipSummarized: (videoId: string) => void;
  useStreakFreeze: () => void;
  resetProgress: () => void;
  signInWithGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;
  syncToGoogleDrive: () => Promise<void>;
  loadFromGoogleDrive: () => Promise<void>;
  listDriveBackups: () => Promise<BackupListing>;
  restoreDriveBackup: (date?: string) => Promise<RestoreResult>;
}

export const AppContext = createContext<AppContextType | null>(null);
