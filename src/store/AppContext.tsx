import React, { useState, useCallback, useEffect } from 'react';
import type { AppData, Video, Instance, Clip, Folder, Remix, FeatureRequest, FeedList } from '../types';
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
import { clearAllVideoFiles } from '../utils/videoDb';
import {
  createDrivePayload,
  downloadSyncPayload,
  fetchGoogleUserProfile,
  findSyncFile,
  getGoogleClientId,
  requestGoogleDriveToken,
  saveSyncPayload,
  TokenExpiredError,
} from '../utils/googleDriveSync';
const GOOGLE_CLIENT_ID = getGoogleClientId();

function createDefaultFolder(): Folder {
  return {
    id: generateId(),
    name: 'Uncategorized',
    createdAt: Date.now(),
  };
}

function migrateAppData(data: AppData): AppData {
  let migrated: AppData = {
    ...data,
    folders: Array.isArray(data.folders) ? data.folders : [],
    remixes: Array.isArray(data.remixes) ? data.remixes : [],
    featureRequests: Array.isArray(data.featureRequests) ? data.featureRequests : [],
    feedLists: Array.isArray(data.feedLists) ? data.feedLists : [],
    progress: ensureProgress(data.progress),
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
  const needsInitialDriveRestore = Boolean(GOOGLE_CLIENT_ID && storedCloudSession?.accessToken);
  const [data, setData] = useState<AppData>(() => migrateAppData(storedData.data));
  const [dataUpdatedAt, setDataUpdatedAt] = useState(storedData.updatedAt);
  const [cloudSync, setCloudSync] = useState<CloudSyncState>({
    isConfigured: Boolean(GOOGLE_CLIENT_ID),
    isSignedIn: Boolean(storedCloudSession?.accessToken),
    hasPendingChanges: false,
    requiresDriveRestore: needsInitialDriveRestore,
    status: needsInitialDriveRestore ? 'restoring' : 'idle',
    message: GOOGLE_CLIENT_ID
      ? (storedCloudSession?.accessToken ? 'Loading Google Drive backup before local edits...' : 'Google Drive sync is ready.')
      : 'Add VITE_GOOGLE_CLIENT_ID to enable Google Drive sync.',
    lastSyncedAt: storedCloudSession?.lastSyncedAt ?? null,
    fileId: storedCloudSession?.fileId ?? null,
    userProfile: storedCloudSession?.userProfile ?? null,
  });
  const accessTokenRef = React.useRef<string | null>(storedCloudSession?.accessToken ?? null);
  const syncFileIdRef = React.useRef<string | null>(storedCloudSession?.fileId ?? null);
  const lastCloudSavedAtRef = React.useRef<number | null>(
    storedCloudSession?.lastSavedDataAt ?? null
  );
  const autoSyncTimerRef = React.useRef<number | null>(null);
  const dataRef = React.useRef(data);
  const dataUpdatedAtRef = React.useRef(dataUpdatedAt);
  const cloudSyncRef = React.useRef(cloudSync);
  const driveRestoreReadyRef = React.useRef(!needsInitialDriveRestore);
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
    accessToken?: string | null;
    fileId?: string | null;
    lastSyncedAt?: number | null;
    lastSavedDataAt?: number | null;
    userProfile?: CloudSyncState['userProfile'];
  } = {}) => {
    const hasOverride = (key: keyof typeof overrides) =>
      Object.prototype.hasOwnProperty.call(overrides, key);
    const accessToken = hasOverride('accessToken') ? overrides.accessToken : accessTokenRef.current;
    if (!accessToken) {
      clearCloudSession();
      return;
    }

    saveCloudSession({
      accessToken,
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
   * Mark a clip-watch as a completion event: bumps daily progress, the video's
   * lastWatchedAt, and (if applicable) the streak. Idempotent at the call site
   * — the player decides when to call this exactly once per clip per session.
   */
  const recordClipWatched = useCallback((videoId: string) => {
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
      const remaining = prev.folders.filter(f => f.id !== folderId);
      const fallbackId = remaining[0]?.id ?? null;
      return {
        ...prev,
        folders: remaining,
        videos: prev.videos.map(v =>
          v.folderId === folderId ? { ...v, folderId: fallbackId ?? undefined } : v
        ),
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
      progress: emptyProgress(),
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
      progress: emptyProgress(),
    };
    setData(emptyData);
    setDataUpdatedAt(Date.now());
  }, []);

  const refreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const newToken = await requestGoogleDriveToken(GOOGLE_CLIENT_ID, true);
      accessTokenRef.current = newToken;
      persistCloudSession({ accessToken: newToken });
      return newToken;
    } catch {
      accessTokenRef.current = null;
      syncFileIdRef.current = null;
      lastCloudSavedAtRef.current = null;
      driveRestoreReadyRef.current = true;
      clearCloudSession();
      clearLocalData();
      setCloudSync(prev => ({
        ...prev,
        isSignedIn: false,
        hasPendingChanges: false,
        requiresDriveRestore: false,
        status: 'error',
        message: 'Session expired. Please sign in again.',
        fileId: null,
        lastSyncedAt: null,
        userProfile: null,
      }));
      return null;
    }
  }, [persistCloudSession, clearLocalData]);

  const syncToGoogleDrive = useCallback(async () => {
    if (!driveRestoreReadyRef.current || cloudSyncRef.current.requiresDriveRestore) {
      setCloudSync(prev => ({
        ...prev,
        status: 'restoring',
        message: 'Loading Google Drive backup before saving local changes.',
      }));
      return;
    }

    let token = accessTokenRef.current;
    if (!token) {
      setCloudSync(prev => ({ ...prev, status: 'error', message: 'Sign in with Google before syncing.' }));
      return;
    }

    setCloudSync(prev => ({ ...prev, status: 'syncing', message: 'Saving to Google Drive...' }));

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        let fileId = syncFileIdRef.current;
        if (!fileId) {
          const existingFile = await findSyncFile(token);
          fileId = existingFile?.id ?? null;
          syncFileIdRef.current = fileId;
        }

        const payload = createDrivePayload(dataRef.current, dataUpdatedAtRef.current);
        const savedFile = await saveSyncPayload(token, payload, fileId);
        syncFileIdRef.current = savedFile.id;
        lastCloudSavedAtRef.current = payload.savedAt;
        const syncedAt = Date.now();
        persistCloudSession({
          accessToken: token,
          fileId: savedFile.id,
          lastSyncedAt: syncedAt,
          lastSavedDataAt: payload.savedAt,
        });
        setCloudSync(prev => ({
          ...prev,
          fileId: savedFile.id,
          hasPendingChanges: false,
          requiresDriveRestore: false,
          status: 'idle',
          message: 'Saved to Google Drive.',
          lastSyncedAt: syncedAt,
        }));
        return;
      } catch (error) {
        if (error instanceof TokenExpiredError && attempt === 0) {
          const newToken = await refreshToken();
          if (newToken) { token = newToken; continue; }
          return;
        }
        setCloudSync(prev => ({
          ...prev,
          status: 'error',
          message: error instanceof Error ? error.message : 'Google Drive sync failed.',
        }));
        return;
      }
    }
  }, [persistCloudSession, refreshToken]);

  const loadFromGoogleDrive = useCallback(async () => {
    let token = accessTokenRef.current;
    if (!token) {
      driveRestoreReadyRef.current = true;
      setCloudSync(prev => ({
        ...prev,
        requiresDriveRestore: false,
        status: 'error',
        message: 'Sign in with Google before loading from Drive.',
      }));
      return;
    }

    driveRestoreReadyRef.current = false;
    setCloudSync(prev => ({
      ...prev,
      hasPendingChanges: false,
      requiresDriveRestore: true,
      status: 'loading',
      message: 'Loading from Google Drive...',
    }));

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const file = syncFileIdRef.current
          ? { id: syncFileIdRef.current }
          : await findSyncFile(token);

        if (!file) {
          syncFileIdRef.current = null;
          lastCloudSavedAtRef.current = null;
          driveRestoreReadyRef.current = true;
          persistCloudSession({
            accessToken: token,
            fileId: null,
            lastSyncedAt: null,
            lastSavedDataAt: null,
          });
          setCloudSync(prev => ({
            ...prev,
            isSignedIn: true,
            hasPendingChanges: true,
            requiresDriveRestore: false,
            fileId: null,
            status: 'idle',
            message: 'No Drive backup found. Local data can create the first backup now.',
            lastSyncedAt: null,
          }));
          return;
        }

        const payload = await downloadSyncPayload(token, file.id);
        if (!payload) throw new Error('The Google Drive backup was not a valid ClipWise backup.');

        syncFileIdRef.current = file.id;
        lastCloudSavedAtRef.current = payload.savedAt;
        driveRestoreReadyRef.current = true;
        setData(migrateAppData(payload.data));
        setDataUpdatedAt(payload.savedAt);
        const syncedAt = Date.now();
        persistCloudSession({
          accessToken: token,
          fileId: file.id,
          lastSyncedAt: syncedAt,
          lastSavedDataAt: payload.savedAt,
        });
        setCloudSync(prev => ({
          ...prev,
          isSignedIn: true,
          hasPendingChanges: false,
          requiresDriveRestore: false,
          fileId: file.id,
          status: 'idle',
          message: 'Loaded settings and video details from Google Drive.',
          lastSyncedAt: syncedAt,
        }));
        return;
      } catch (error) {
        if (error instanceof TokenExpiredError && attempt === 0) {
          const newToken = await refreshToken();
          if (newToken) { token = newToken; continue; }
          return;
        }
        setCloudSync(prev => ({
          ...prev,
          requiresDriveRestore: true,
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not load from Google Drive.',
        }));
        return;
      }
    }
  }, [persistCloudSession, refreshToken]);

  const signInWithGoogle = useCallback(async () => {
    driveRestoreReadyRef.current = false;
    setCloudSync(prev => ({
      ...prev,
      hasPendingChanges: false,
      requiresDriveRestore: true,
      status: 'signing-in',
      message: 'Opening Google sign-in...',
    }));

    try {
      const token = await requestGoogleDriveToken(GOOGLE_CLIENT_ID);
      accessTokenRef.current = token;
      const profile = await fetchGoogleUserProfile(token);
      persistCloudSession({
        accessToken: token,
        userProfile: profile,
        fileId: syncFileIdRef.current,
      });
      setCloudSync(prev => ({
        ...prev,
        isSignedIn: true,
        userProfile: profile,
        hasPendingChanges: false,
        requiresDriveRestore: true,
        status: 'loading',
        message: 'Loading Google Drive backup before local edits...',
      }));

      const file = await findSyncFile(token);
      syncFileIdRef.current = file?.id ?? null;
      persistCloudSession({
        accessToken: token,
        userProfile: profile,
        fileId: file?.id ?? null,
      });

      if (file) {
        const payload = await downloadSyncPayload(token, file.id);
        if (!payload) throw new Error('The Google Drive backup was not a valid ClipWise backup.');

        lastCloudSavedAtRef.current = payload.savedAt;
        driveRestoreReadyRef.current = true;
        setData(migrateAppData(payload.data));
        setDataUpdatedAt(payload.savedAt);
        const syncedAt = Date.now();
        persistCloudSession({
          accessToken: token,
          userProfile: profile,
          fileId: file.id,
          lastSyncedAt: syncedAt,
          lastSavedDataAt: payload.savedAt,
        });
        setCloudSync(prev => ({
          ...prev,
          fileId: file.id,
          hasPendingChanges: false,
          requiresDriveRestore: false,
          status: 'idle',
          message: 'Loaded data from Google Drive.',
          lastSyncedAt: syncedAt,
        }));
        return;
      }

      lastCloudSavedAtRef.current = null;
      driveRestoreReadyRef.current = true;
      persistCloudSession({
        accessToken: token,
        userProfile: profile,
        fileId: null,
        lastSyncedAt: null,
        lastSavedDataAt: null,
      });
      setCloudSync(prev => ({
        ...prev,
        fileId: null,
        hasPendingChanges: true,
        requiresDriveRestore: false,
        status: 'idle',
        message: 'No Drive backup found. Local data can create the first backup now.',
        lastSyncedAt: null,
      }));
    } catch (error) {
      accessTokenRef.current = null;
      syncFileIdRef.current = null;
      lastCloudSavedAtRef.current = null;
      driveRestoreReadyRef.current = true;
      clearCloudSession();
      setCloudSync(prev => ({
        ...prev,
        isSignedIn: false,
        hasPendingChanges: false,
        requiresDriveRestore: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Google sign-in failed.',
        fileId: null,
        lastSyncedAt: null,
        userProfile: null,
      }));
    }
  }, [persistCloudSession]);

  const signOutGoogle = useCallback(async () => {
    accessTokenRef.current = null;
    syncFileIdRef.current = null;
    lastCloudSavedAtRef.current = null;
    driveRestoreReadyRef.current = true;
    clearCloudSession();
    clearLocalData();
    setCloudSync(prev => ({
      ...prev,
      isSignedIn: false,
      hasPendingChanges: false,
      requiresDriveRestore: false,
      status: 'idle',
      message: 'Signed out of Google Drive sync.',
      fileId: null,
      lastSyncedAt: null,
      userProfile: null,
    }));
  }, [clearLocalData]);

  // Auto-restore session from localStorage on page load.
  // We do NOT call requestGoogleDriveToken here — that would either open a
  // popup or fail silently depending on browser/GIS state.  Instead we just
  // trust the stored access token. If it turns out to be expired, the
  // refreshToken() helper (called on 401) will silently obtain a new one, and
  // only if *that* fails will the user be asked to sign in again interactively.
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    if (storedCloudSession?.accessToken) {
      if (autoRestoreStartedRef.current) return;
      autoRestoreStartedRef.current = true;
      accessTokenRef.current = storedCloudSession.accessToken;
      syncFileIdRef.current = storedCloudSession.fileId ?? null;
      setCloudSync(prev => ({
        ...prev,
        isSignedIn: true,
        hasPendingChanges: false,
        requiresDriveRestore: true,
        status: 'restoring',
        message: 'Loading Google Drive backup before local edits...',
        fileId: storedCloudSession.fileId ?? null,
        lastSyncedAt: storedCloudSession.lastSyncedAt ?? null,
        userProfile: storedCloudSession.userProfile ?? null,
      }));
      void loadFromGoogleDrive();
    }
    // No stored session → stay signed out, no network call needed
  }, [loadFromGoogleDrive, storedCloudSession]);

  useEffect(() => {
    if (cloudSync.requiresDriveRestore || !driveRestoreReadyRef.current) {
      setCloudSync(prev => (
        prev.hasPendingChanges ? { ...prev, hasPendingChanges: false } : prev
      ));
      return;
    }

    const hasPendingChanges = Boolean(
      cloudSync.isSignedIn
      && accessTokenRef.current
      && dataUpdatedAt !== lastCloudSavedAtRef.current
    );

    setCloudSync(prev => (
      prev.hasPendingChanges === hasPendingChanges
        ? prev
        : { ...prev, hasPendingChanges }
    ));
  }, [cloudSync.isSignedIn, cloudSync.requiresDriveRestore, dataUpdatedAt]);

  useEffect(() => {
    if (!cloudSync.isSignedIn || !accessTokenRef.current) return;
    if (cloudSync.requiresDriveRestore || !driveRestoreReadyRef.current) return;
    if (lastCloudSavedAtRef.current === dataUpdatedAt) return;

    if (autoSyncTimerRef.current) window.clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = window.setTimeout(() => {
      void syncToGoogleDrive();
    }, 1500);

    return () => {
      if (autoSyncTimerRef.current) {
        window.clearTimeout(autoSyncTimerRef.current);
        autoSyncTimerRef.current = null;
      }
    };
  }, [cloudSync.isSignedIn, cloudSync.requiresDriveRestore, dataUpdatedAt, syncToGoogleDrive]);

  const showDriveRestoreOverlay = cloudSync.requiresDriveRestore;

  return (
    <AppContext.Provider value={{
      videos: data.videos,
      instances: data.instances,
      folders: data.folders,
      remixes: data.remixes,
      featureRequests: data.featureRequests,
      feedLists: data.feedLists,
      progress: data.progress,
      cloudSync,
      addVideo, deleteVideo, updateVideo,
      addInstance, deleteInstance, updateClip,
      getInstancesForVideo, getInstance, getVideo,
      generateClips,
      addFolder, renameFolder, deleteFolder, moveVideoToFolder,
      addRemix, updateRemix, deleteRemix, getRemix,
      addFeatureRequest, toggleFeatureRequestComplete, deleteFeatureRequest,
      addFeedList, renameFeedList, deleteFeedList, setFeedListVideos,
      recordClipWatched, useStreakFreeze,
      resetProgress,
      signInWithGoogle,
      signOutGoogle,
      syncToGoogleDrive,
      loadFromGoogleDrive,
    }}>
      {children}
      {showDriveRestoreOverlay && (
        <div className="drive-restore-overlay" role="alertdialog" aria-modal="true" aria-live="assertive">
          <div className="drive-restore-card">
            <div className="drive-restore-spinner" aria-hidden="true" />
            <span className="drive-restore-kicker">Google Drive</span>
            <h2>Loading Drive backup</h2>
            <p>{cloudSync.message}</p>
            <p className="drive-restore-note">
              Local edits are locked until Drive data is restored.
            </p>
            {cloudSync.status === 'error' && (
              <div className="drive-restore-actions">
                <button className="btn-primary" onClick={() => void loadFromGoogleDrive()}>
                  Retry
                </button>
                <button className="btn-secondary" onClick={() => void signOutGoogle()}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppContext.Provider>
  );
}
