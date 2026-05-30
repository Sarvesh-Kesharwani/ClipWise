import React, { useState, useCallback, useEffect } from 'react';
import type { AppData, Video, Instance, Clip, Folder, Remix, FeatureRequest, FeedList, FeedSettings } from '../types';
import { AppContext } from './AppContextValue';
import type { CloudSyncState } from './AppContextValue';
import {
  clearAppData,
  clearCloudSession,
  loadCloudSession,
  loadStoredAppData,
  saveAppData,
  saveCloudSession,
} from '../utils/storage';
import { generateClipsForDuration, generateId } from '../utils/helpers';
import { emptyProgress, ensureProgress, recordClipCompletion } from '../utils/progress';
import {
  DEFAULT_USER_LIFE_CONTEXT,
  isLegacyLifeRecommendation,
  normalizeUserLifeContext,
} from '../utils/lifeRecommendations';
import { getDescendantFolderIds } from '../utils/folders';
import { clearAllVideoFiles } from '../utils/videoDb';
import {
  createCloudPayload,
  loadFromCloud as loadCloudPayload,
  logoutPasscodeSession,
  saveToCloud,
} from '../utils/supabaseSync';

function createDefaultFolder(): Folder {
  return {
    id: generateId(),
    name: 'Uncategorized',
    createdAt: Date.now(),
  };
}

function defaultFeedSettings(): FeedSettings {
  return {
    lastListId: null,
    lastFolderId: null,
    sourceFolderIds: [],
    clipSize: 30,
    autoStart: true,
    preferSound: false,
    includeSubfolders: true,
  };
}

function migrateAppData(data: AppData): AppData {
  let migrated: AppData = {
    ...data,
    instances: Array.isArray(data.instances)
      ? data.instances.map(instance => ({
          ...instance,
          clips: instance.clips.map(clip => (
            clip.lifeRecommendations?.some(isLegacyLifeRecommendation)
              ? { ...clip, lifeRecommendations: undefined, lifeContextSnapshot: undefined }
              : clip
          )),
        }))
      : [],
    folders: Array.isArray(data.folders) ? data.folders : [],
    remixes: Array.isArray(data.remixes) ? data.remixes : [],
    featureRequests: Array.isArray(data.featureRequests) ? data.featureRequests : [],
    feedLists: Array.isArray(data.feedLists) ? data.feedLists : [],
    feedSettings: { ...defaultFeedSettings(), ...(data.feedSettings ?? {}) },
    progress: ensureProgress(data.progress),
    userLifeContext: normalizeUserLifeContext(data.userLifeContext),
  };

  // Ensure the app always has at least one folder to render into.
  if (!Array.isArray(data.folders) || data.folders.length === 0) {
    const defaultFolder = createDefaultFolder();
    migrated = {
      ...migrated,
      folders: [defaultFolder],
      videos: migrated.videos.map(v => v.folderId ? v : { ...v, folderId: defaultFolder.id }),
    };
  }

  // Assign orphaned videos (no folderId) to first folder
  const hasOrphans = migrated.videos.some(v => !v.folderId);
  if (hasOrphans && migrated.folders.length > 0) {
    const fallbackId = migrated.folders[0].id;
    migrated = {
      ...migrated,
      videos: migrated.videos.map(v => v.folderId ? v : { ...v, folderId: fallbackId }),
    };
  }

  return migrated;
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [storedData] = useState(() => loadStoredAppData());
  const [storedCloudSession] = useState(() => loadCloudSession());
  const needsInitialCloudRestore = true;
  const [data, setData] = useState<AppData>(() => migrateAppData(storedData.data));
  const [dataUpdatedAt, setDataUpdatedAt] = useState(storedData.updatedAt);
  const [cloudSync, setCloudSync] = useState<CloudSyncState>({
    isConfigured: true,
    isSignedIn: true,
    hasPendingChanges: false,
    requiresDriveRestore: needsInitialCloudRestore,
    status: 'restoring',
    message: 'Loading Supabase data before local edits...',
    lastSyncedAt: storedCloudSession?.lastSyncedAt ?? null,
    fileId: storedCloudSession?.fileId ?? null,
    userProfile: storedCloudSession?.userProfile ?? {
      name: 'ClipWise',
      email: 'Passcode session',
      picture: '',
    },
  });
  const syncFileIdRef = React.useRef<string | null>(storedCloudSession?.fileId ?? null);
  const lastCloudSavedAtRef = React.useRef<number | null>(
    storedCloudSession?.lastSavedDataAt ?? null
  );
  const autoSyncTimerRef = React.useRef<number | null>(null);
  const dataRef = React.useRef(data);
  const dataUpdatedAtRef = React.useRef(dataUpdatedAt);
  const cloudSyncRef = React.useRef(cloudSync);
  const driveRestoreReadyRef = React.useRef(!needsInitialCloudRestore);
  const autoRestoreStartedRef = React.useRef(false);

  useEffect(() => {
    dataRef.current = data;
    dataUpdatedAtRef.current = dataUpdatedAt;
    cloudSyncRef.current = cloudSync;
  }, [cloudSync, data, dataUpdatedAt]);

  useEffect(() => {
    saveAppData(data, dataUpdatedAt);
  }, [data, dataUpdatedAt]);

  const persistCloudSession = useCallback((overrides: {
    fileId?: string | null;
    lastSyncedAt?: number | null;
    lastSavedDataAt?: number | null;
    userProfile?: CloudSyncState['userProfile'];
  } = {}) => {
    const hasOverride = (key: keyof typeof overrides) =>
      Object.prototype.hasOwnProperty.call(overrides, key);

    saveCloudSession({
      fileId: hasOverride('fileId') ? overrides.fileId ?? null : syncFileIdRef.current ?? null,
      lastSyncedAt: hasOverride('lastSyncedAt')
        ? overrides.lastSyncedAt ?? null
        : cloudSyncRef.current.lastSyncedAt ?? null,
      lastSavedDataAt: hasOverride('lastSavedDataAt')
        ? overrides.lastSavedDataAt ?? null
        : lastCloudSavedAtRef.current ?? null,
      userProfile: hasOverride('userProfile')
        ? overrides.userProfile ?? null
        : cloudSyncRef.current.userProfile ?? null,
    });
  }, []);

  const setDataWithLocalChange = useCallback((updater: (prev: AppData) => AppData) => {
    if (!driveRestoreReadyRef.current) return;
    const updatedAt = Date.now();
    setData(prev => updater(prev));
    setDataUpdatedAt(updatedAt);
  }, []);

  const addVideo = useCallback((video: Video) => {
    setDataWithLocalChange(prev => {
      const folders = prev.folders.length > 0 ? prev.folders : [createDefaultFolder()];
      const fallbackFolderId = folders[0]?.id;
      return {
        ...prev,
        folders,
        videos: [
          ...prev.videos,
          {
            ...video,
            folderId: video.folderId ?? fallbackFolderId,
          },
        ],
      };
    });
  }, [setDataWithLocalChange]);

  const deleteVideo = useCallback((videoId: string) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      videos: prev.videos.filter(v => v.id !== videoId),
      instances: prev.instances.filter(i => i.videoId !== videoId),
      feedLists: prev.feedLists.map(list => ({
        ...list,
        videoIds: list.videoIds.filter(id => id !== videoId),
        updatedAt: Date.now(),
      })),
      remixes: prev.remixes
        .map(remix => ({
          ...remix,
          clipRefs: remix.clipRefs.filter(ref => ref.videoId !== videoId),
        }))
        .filter(remix => remix.clipRefs.length > 0),
    }));
  }, [setDataWithLocalChange]);

  const updateVideo = useCallback((video: Video) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      videos: prev.videos.map(v => v.id === video.id ? video : v),
    }));
  }, [setDataWithLocalChange]);

  const addInstance = useCallback((instance: Instance) => {
    setDataWithLocalChange(prev => ({ ...prev, instances: [...prev.instances, instance] }));
  }, [setDataWithLocalChange]);

  const deleteInstance = useCallback((instanceId: string) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      instances: prev.instances.filter(i => i.id !== instanceId),
      remixes: prev.remixes
        .map(remix => ({
          ...remix,
          clipRefs: remix.clipRefs.filter(ref => ref.instanceId !== instanceId),
        }))
        .filter(remix => remix.clipRefs.length > 0),
    }));
  }, [setDataWithLocalChange]);

  const updateClip = useCallback((instanceId: string, clipIndex: number, updates: Partial<Clip>) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      instances: prev.instances.map(inst => {
        if (inst.id !== instanceId) return inst;
        return {
          ...inst,
          clips: inst.clips.map(clip =>
            clip.index === clipIndex ? { ...clip, ...updates } : clip
          ),
        };
      }),
    }));
  }, [setDataWithLocalChange]);

  /**
   * Mark a clip as watched: only updates the video's lastWatchedAt timestamp.
   * Daily progress is NOT incremented here — only summarized clips count
   * toward the daily target (see recordClipSummarized).
   */
  const recordClipWatched = useCallback((videoId: string) => {
    const now = Date.now();
    setDataWithLocalChange(prev => ({
      ...prev,
      videos: prev.videos.map(v => v.id === videoId ? { ...v, lastWatchedAt: now } : v),
    }));
  }, [setDataWithLocalChange]);

  /**
   * Record a summarized clip: bumps daily progress, lastWatchedAt, and
   * (if applicable) the streak. Caller ensures one call per clip per save.
   */
  const recordClipSummarized = useCallback((videoId: string) => {
    const now = Date.now();
    setDataWithLocalChange(prev => ({
      ...prev,
      progress: recordClipCompletion(prev.progress ?? emptyProgress(), new Date(now)),
      videos: prev.videos.map(v => v.id === videoId ? { ...v, lastWatchedAt: now } : v),
    }));
  }, [setDataWithLocalChange]);

  const useStreakFreeze = useCallback(() => {
    setDataWithLocalChange(prev => {
      const progress = ensureProgress(prev.progress);
      if (progress.freezes <= 0) return prev;
      return {
        ...prev,
        progress: { ...progress, freezes: progress.freezes - 1 },
      };
    });
  }, [setDataWithLocalChange]);

  const getInstancesForVideo = useCallback((videoId: string) => {
    return data.instances.filter(i => i.videoId === videoId);
  }, [data.instances]);

  const getInstance = useCallback((instanceId: string) => {
    return data.instances.find(i => i.id === instanceId);
  }, [data.instances]);

  const getVideo = useCallback((videoId: string) => {
    return data.videos.find(v => v.id === videoId);
  }, [data.videos]);

  const generateClips = useCallback((instanceId: string, duration: number) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      instances: prev.instances.map(inst => {
        if (inst.id !== instanceId || inst.clips.length > 0) return inst;
        return { ...inst, clips: generateClipsForDuration(duration, inst.clipSizeMinutes) };
      }),
    }));
  }, [setDataWithLocalChange]);

  const addFolder = useCallback((folder: Folder) => {
    setDataWithLocalChange(prev => ({ ...prev, folders: [...prev.folders, folder] }));
  }, [setDataWithLocalChange]);

  const renameFolder = useCallback((folderId: string, name: string) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      folders: prev.folders.map(f => f.id === folderId ? { ...f, name } : f),
    }));
  }, [setDataWithLocalChange]);

  const deleteFolder = useCallback((folderId: string) => {
    setDataWithLocalChange(prev => {
      const deletedIds = new Set([folderId, ...getDescendantFolderIds(prev.folders, folderId)]);
      const remaining = prev.folders.filter(f => !deletedIds.has(f.id));
      const fallbackId = remaining[0]?.id ?? null;
      return {
        ...prev,
        folders: remaining,
        videos: prev.videos.map(v =>
          v.folderId && deletedIds.has(v.folderId) ? { ...v, folderId: fallbackId ?? undefined } : v
        ),
        feedSettings: {
          ...(prev.feedSettings ?? defaultFeedSettings()),
          lastFolderId: prev.feedSettings?.lastFolderId && deletedIds.has(prev.feedSettings.lastFolderId)
            ? fallbackId
            : prev.feedSettings?.lastFolderId ?? null,
          sourceFolderIds: (prev.feedSettings?.sourceFolderIds ?? []).filter(id => !deletedIds.has(id)),
        },
      };
    });
  }, [setDataWithLocalChange]);

  const moveVideoToFolder = useCallback((videoId: string, folderId: string | null) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      videos: prev.videos.map(v =>
        v.id === videoId ? { ...v, folderId: folderId ?? undefined } : v
      ),
    }));
  }, [setDataWithLocalChange]);

  const addRemix = useCallback((remix: Remix) => {
    setDataWithLocalChange(prev => ({ ...prev, remixes: [...prev.remixes, remix] }));
  }, [setDataWithLocalChange]);

  const updateRemix = useCallback((remix: Remix) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      remixes: prev.remixes.map(r => r.id === remix.id ? remix : r),
    }));
  }, [setDataWithLocalChange]);

  const deleteRemix = useCallback((remixId: string) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      remixes: prev.remixes.filter(remix => remix.id !== remixId),
    }));
  }, [setDataWithLocalChange]);

  const getRemix = useCallback((remixId: string) => {
    return data.remixes.find(remix => remix.id === remixId);
  }, [data.remixes]);

  const addFeatureRequest = useCallback((request: FeatureRequest) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      featureRequests: [request, ...prev.featureRequests],
    }));
  }, [setDataWithLocalChange]);

  const toggleFeatureRequestComplete = useCallback((requestId: string) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      featureRequests: prev.featureRequests.map(request => (
        request.id === requestId
          ? {
              ...request,
              completed: !request.completed,
              completedAt: request.completed ? undefined : Date.now(),
            }
          : request
      )),
    }));
  }, [setDataWithLocalChange]);

  const deleteFeatureRequest = useCallback((requestId: string) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      featureRequests: prev.featureRequests.filter(request => request.id !== requestId),
    }));
  }, [setDataWithLocalChange]);

  const addFeedList = useCallback((list: FeedList) => {
    setDataWithLocalChange(prev => ({ ...prev, feedLists: [...prev.feedLists, list] }));
  }, [setDataWithLocalChange]);

  const renameFeedList = useCallback((listId: string, name: string) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      feedLists: prev.feedLists.map(list =>
        list.id === listId ? { ...list, name, updatedAt: Date.now() } : list
      ),
    }));
  }, [setDataWithLocalChange]);

  const deleteFeedList = useCallback((listId: string) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      feedLists: prev.feedLists.filter(list => list.id !== listId),
    }));
  }, [setDataWithLocalChange]);

  const updateFeedSettings = useCallback((settings: Partial<FeedSettings>) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      feedSettings: { ...(prev.feedSettings ?? defaultFeedSettings()), ...settings },
    }));
  }, [setDataWithLocalChange]);

  const updateUserLifeContext = useCallback((context: string) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      userLifeContext: normalizeUserLifeContext(context),
    }));
  }, [setDataWithLocalChange]);

  const setFeedListVideos = useCallback((listId: string, videoIds: string[]) => {
    const uniqueVideoIds = Array.from(new Set(videoIds));
    setDataWithLocalChange(prev => ({
      ...prev,
      feedLists: prev.feedLists.map(list =>
        list.id === listId ? { ...list, videoIds: uniqueVideoIds, updatedAt: Date.now() } : list
      ),
    }));
  }, [setDataWithLocalChange]);

  const resetProgress = useCallback(() => {
    if (!driveRestoreReadyRef.current) return;
    const emptyData: AppData = {
      videos: [],
      instances: [],
      folders: [createDefaultFolder()],
      remixes: [],
      featureRequests: [],
      feedLists: [],
      feedSettings: defaultFeedSettings(),
      progress: emptyProgress(),
      userLifeContext: DEFAULT_USER_LIFE_CONTEXT,
    };
    clearAppData();
    void clearAllVideoFiles();
    setData(emptyData);
    setDataUpdatedAt(Date.now());
  }, []);

  // Wipe all local data (app data + IndexedDB videos + cloud session).
  // Called on explicit sign-out and when a session expires.
  const clearLocalData = useCallback(() => {
    driveRestoreReadyRef.current = true;
    clearAppData();
    void clearAllVideoFiles();
    const emptyData: AppData = {
      videos: [],
      instances: [],
      folders: [createDefaultFolder()],
      remixes: [],
      featureRequests: [],
      feedLists: [],
      feedSettings: defaultFeedSettings(),
      progress: emptyProgress(),
      userLifeContext: DEFAULT_USER_LIFE_CONTEXT,
    };
    setData(emptyData);
    setDataUpdatedAt(Date.now());
  }, []);

  const syncToCloud = useCallback(async () => {
    if (!driveRestoreReadyRef.current || cloudSyncRef.current.requiresDriveRestore) {
      setCloudSync(prev => ({
        ...prev,
        status: 'restoring',
        message: 'Loading Supabase data before saving local changes.',
      }));
      return;
    }

    setCloudSync(prev => ({ ...prev, status: 'syncing', message: 'Saving to Supabase...' }));

    try {
      const payload = createCloudPayload(dataRef.current, dataUpdatedAtRef.current);
      const saved = await saveToCloud(payload);
      syncFileIdRef.current = 'primary';
      lastCloudSavedAtRef.current = saved.savedAt;
      const syncedAt = Date.now();
      persistCloudSession({
        fileId: 'primary',
        lastSyncedAt: syncedAt,
        lastSavedDataAt: saved.savedAt,
      });
      setCloudSync(prev => ({
        ...prev,
        fileId: 'primary',
        isSignedIn: true,
        hasPendingChanges: false,
        requiresDriveRestore: false,
        status: 'idle',
        message: 'Saved to Supabase.',
        lastSyncedAt: syncedAt,
      }));
    } catch (error) {
      setCloudSync(prev => ({
        ...prev,
        status: 'error',
        message: error instanceof Error ? error.message : 'Supabase sync failed.',
      }));
    }
  }, [persistCloudSession]);

  const loadFromCloud = useCallback(async () => {
    driveRestoreReadyRef.current = false;
    setCloudSync(prev => ({
      ...prev,
      isSignedIn: true,
      hasPendingChanges: false,
      requiresDriveRestore: true,
      status: 'loading',
      message: 'Loading from Supabase...',
    }));

    try {
      const payload = await loadCloudPayload();
      driveRestoreReadyRef.current = true;

      if (!payload) {
        syncFileIdRef.current = 'primary';
        lastCloudSavedAtRef.current = null;
        persistCloudSession({
          fileId: 'primary',
          lastSyncedAt: null,
          lastSavedDataAt: null,
        });
        setCloudSync(prev => ({
          ...prev,
          isSignedIn: true,
          hasPendingChanges: true,
          requiresDriveRestore: false,
          fileId: 'primary',
          status: 'idle',
          message: 'No Supabase backup found. Local data can create the first backup now.',
          lastSyncedAt: null,
        }));
        return;
      }

      const migrated = migrateAppData(payload.data);
      lastCloudSavedAtRef.current = payload.savedAt;
      syncFileIdRef.current = 'primary';
      setData(migrated);
      setDataUpdatedAt(payload.savedAt);
      const syncedAt = Date.now();
      persistCloudSession({
        fileId: 'primary',
        lastSyncedAt: syncedAt,
        lastSavedDataAt: payload.savedAt,
      });
      setCloudSync(prev => ({
        ...prev,
        isSignedIn: true,
        hasPendingChanges: false,
        requiresDriveRestore: false,
        fileId: 'primary',
        status: 'idle',
        message: 'Loaded data from Supabase.',
        lastSyncedAt: syncedAt,
      }));
    } catch (error) {
      driveRestoreReadyRef.current = true;
      setCloudSync(prev => ({
        ...prev,
        isSignedIn: true,
        requiresDriveRestore: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not load from Supabase.',
      }));
    }
  }, [persistCloudSession]);

  const signOut = useCallback(async () => {
    clearCloudSession();
    clearLocalData();
    await logoutPasscodeSession();
    window.location.assign('/login');
  }, [clearLocalData]);

  useEffect(() => {
    if (autoRestoreStartedRef.current) return;
    autoRestoreStartedRef.current = true;
    void loadFromCloud();
  }, [loadFromCloud]);

  useEffect(() => {
    if (cloudSync.requiresDriveRestore || !driveRestoreReadyRef.current) {
      setCloudSync(prev => (
        prev.hasPendingChanges ? { ...prev, hasPendingChanges: false } : prev
      ));
      return;
    }

    const hasPendingChanges = dataUpdatedAt !== lastCloudSavedAtRef.current;

    setCloudSync(prev => (
      prev.hasPendingChanges === hasPendingChanges
        ? prev
        : { ...prev, hasPendingChanges }
    ));
  }, [cloudSync.requiresDriveRestore, dataUpdatedAt]);

  useEffect(() => {
    if (cloudSync.requiresDriveRestore || !driveRestoreReadyRef.current) return;
    if (lastCloudSavedAtRef.current === dataUpdatedAt) return;

    if (autoSyncTimerRef.current) window.clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = window.setTimeout(() => {
      void syncToCloud();
    }, 1500);

    return () => {
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
  }, [cloudSync.requiresDriveRestore, dataUpdatedAt, syncToCloud]);
  const showDriveRestoreOverlay = cloudSync.requiresDriveRestore;

  return (
    <AppContext.Provider value={{
      videos: data.videos,
      instances: data.instances,
      folders: data.folders,
      remixes: data.remixes,
      featureRequests: data.featureRequests,
      feedLists: data.feedLists,
      feedSettings: data.feedSettings ?? defaultFeedSettings(),
      progress: data.progress,
      userLifeContext: data.userLifeContext ?? DEFAULT_USER_LIFE_CONTEXT,
      cloudSync,
      addVideo, deleteVideo, updateVideo,
      addInstance, deleteInstance, updateClip,
      getInstancesForVideo, getInstance, getVideo,
      generateClips,
      addFolder, renameFolder, deleteFolder, moveVideoToFolder,
      addRemix, updateRemix, deleteRemix, getRemix,
      addFeatureRequest, toggleFeatureRequestComplete, deleteFeatureRequest,
      addFeedList, renameFeedList, deleteFeedList, setFeedListVideos,
      updateFeedSettings,
      updateUserLifeContext,
      recordClipWatched, recordClipSummarized, useStreakFreeze,
      resetProgress,
      signOut,
      syncToCloud,
      loadFromCloud,
    }}>
      {children}
      {showDriveRestoreOverlay && (
        <div className="drive-restore-overlay" role="alertdialog" aria-modal="true" aria-live="assertive">
          <div className="drive-restore-card">
            <div className="drive-restore-spinner" aria-hidden="true" />
            <span className="drive-restore-kicker">Supabase</span>
            <h2>Loading cloud data</h2>
            <p>{cloudSync.message}</p>
            <p className="drive-restore-note">
              Local edits are locked until Supabase data is restored.
            </p>
            {cloudSync.status === 'error' && (
              <div className="drive-restore-actions">
                <button className="btn-primary" onClick={() => void loadFromCloud()}>
                  Retry
                </button>
                <button className="btn-secondary" onClick={() => void signOut()}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}
