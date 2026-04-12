import React, { useState, useCallback, useEffect } from 'react';
import type { AppData, Video, Instance, Clip, Folder, Remix } from '../types';
import { AppContext } from './AppContextValue';
import type { CloudSyncState } from './AppContextValue';
import { loadStoredAppData, saveAppData } from '../utils/storage';
import { generateClipsForDuration, generateId } from '../utils/helpers';
import {
  createDrivePayload,
  downloadSyncPayload,
  findSyncFile,
  getGoogleClientId,
  requestGoogleDriveToken,
  revokeGoogleDriveToken,
  saveSyncPayload,
  TokenExpiredError,
} from '../utils/googleDriveSync';
const GOOGLE_CLIENT_ID = getGoogleClientId();

function migrateAppData(data: AppData): AppData {
  let migrated: AppData = {
    ...data,
    folders: Array.isArray(data.folders) ? data.folders : [],
    remixes: Array.isArray(data.remixes) ? data.remixes : [],
  };

  // Migrate old data that has no folders array
  if (!data.folders || !Array.isArray(data.folders)) {
    const defaultFolder: Folder = {
      id: generateId(),
      name: 'Uncategorized',
      createdAt: Date.now(),
    };
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
  const [data, setData] = useState<AppData>(() => migrateAppData(storedData.data));
  const [dataUpdatedAt, setDataUpdatedAt] = useState(storedData.updatedAt);
  const [cloudSync, setCloudSync] = useState<CloudSyncState>({
    isConfigured: Boolean(GOOGLE_CLIENT_ID),
    isSignedIn: false,
    status: 'idle',
    message: GOOGLE_CLIENT_ID
      ? 'Google Drive sync is ready.'
      : 'Add VITE_GOOGLE_CLIENT_ID to enable Google Drive sync.',
    lastSyncedAt: null,
    fileId: null,
  });
  const accessTokenRef = React.useRef<string | null>(null);
  const syncFileIdRef = React.useRef<string | null>(null);
  const lastCloudSavedAtRef = React.useRef<number | null>(null);
  const autoSyncTimerRef = React.useRef<number | null>(null);
  const dataRef = React.useRef(data);
  const dataUpdatedAtRef = React.useRef(dataUpdatedAt);

  useEffect(() => {
    dataRef.current = data;
    dataUpdatedAtRef.current = dataUpdatedAt;
  }, [data, dataUpdatedAt]);

  useEffect(() => {
    saveAppData(data, dataUpdatedAt);
  }, [data, dataUpdatedAt]);

  const setDataWithLocalChange = useCallback((updater: (prev: AppData) => AppData) => {
    const updatedAt = Date.now();
    setData(prev => updater(prev));
    setDataUpdatedAt(updatedAt);
  }, []);

  const addVideo = useCallback((video: Video) => {
    setDataWithLocalChange(prev => ({ ...prev, videos: [...prev.videos, video] }));
  }, [setDataWithLocalChange]);

  const deleteVideo = useCallback((videoId: string) => {
    setDataWithLocalChange(prev => ({
      ...prev,
      videos: prev.videos.filter(v => v.id !== videoId),
      instances: prev.instances.filter(i => i.videoId !== videoId),
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
      // Move videos from deleted folder to first remaining folder, or remove folderId
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

  const refreshToken = useCallback(async (): Promise<string | null> => {
    try {
      const newToken = await requestGoogleDriveToken(GOOGLE_CLIENT_ID);
      accessTokenRef.current = newToken;
      return newToken;
    } catch {
      accessTokenRef.current = null;
      setCloudSync(prev => ({
        ...prev,
        isSignedIn: false,
        status: 'error',
        message: 'Session expired. Please sign in again.',
      }));
      return null;
    }
  }, []);

  const syncToGoogleDrive = useCallback(async () => {
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
        setCloudSync(prev => ({
          ...prev,
          fileId: savedFile.id,
          status: 'idle',
          message: 'Saved to Google Drive.',
          lastSyncedAt: Date.now(),
        }));
        return;
      } catch (error) {
        if (error instanceof TokenExpiredError && attempt === 0) {
          const newToken = await refreshToken();
          if (newToken) { token = newToken; continue; }
        }
        setCloudSync(prev => ({
          ...prev,
          status: 'error',
          message: error instanceof Error ? error.message : 'Google Drive sync failed.',
        }));
        return;
      }
    }
  }, [refreshToken]);

  const loadFromGoogleDrive = useCallback(async () => {
    let token = accessTokenRef.current;
    if (!token) {
      setCloudSync(prev => ({ ...prev, status: 'error', message: 'Sign in with Google before loading from Drive.' }));
      return;
    }

    setCloudSync(prev => ({ ...prev, status: 'loading', message: 'Loading from Google Drive...' }));

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const file = syncFileIdRef.current
          ? { id: syncFileIdRef.current }
          : await findSyncFile(token);

        if (!file) {
          setCloudSync(prev => ({
            ...prev,
            status: 'idle',
            message: 'No ClipWise cloud backup found yet.',
            lastSyncedAt: null,
          }));
          return;
        }

        const payload = await downloadSyncPayload(token, file.id);
        if (!payload) throw new Error('The Google Drive backup was not a valid ClipWise backup.');

        syncFileIdRef.current = file.id;
        lastCloudSavedAtRef.current = payload.savedAt;
        setData(migrateAppData(payload.data));
        setDataUpdatedAt(payload.savedAt);
        setCloudSync(prev => ({
          ...prev,
          isSignedIn: true,
          fileId: file.id,
          status: 'idle',
          message: 'Loaded settings and video details from Google Drive.',
          lastSyncedAt: Date.now(),
        }));
        return;
      } catch (error) {
        if (error instanceof TokenExpiredError && attempt === 0) {
          const newToken = await refreshToken();
          if (newToken) { token = newToken; continue; }
        }
        setCloudSync(prev => ({
          ...prev,
          status: 'error',
          message: error instanceof Error ? error.message : 'Could not load from Google Drive.',
        }));
        return;
      }
    }
  }, [refreshToken]);

  const signInWithGoogle = useCallback(async () => {
    setCloudSync(prev => ({ ...prev, status: 'signing-in', message: 'Opening Google sign-in...' }));

    try {
      const token = await requestGoogleDriveToken(GOOGLE_CLIENT_ID);
      accessTokenRef.current = token;
      setCloudSync(prev => ({ ...prev, isSignedIn: true, status: 'syncing', message: 'Checking Google Drive...' }));

      const file = await findSyncFile(token);
      syncFileIdRef.current = file?.id ?? null;

      if (file) {
        const payload = await downloadSyncPayload(token, file.id);
        if (payload && payload.savedAt > dataUpdatedAtRef.current) {
          lastCloudSavedAtRef.current = payload.savedAt;
          setData(migrateAppData(payload.data));
          setDataUpdatedAt(payload.savedAt);
          setCloudSync(prev => ({
            ...prev,
            fileId: file.id,
            status: 'idle',
            message: 'Loaded newer settings and video details from Google Drive.',
            lastSyncedAt: Date.now(),
          }));
          return;
        }
      }

      await syncToGoogleDrive();
    } catch (error) {
      accessTokenRef.current = null;
      setCloudSync(prev => ({
        ...prev,
        isSignedIn: false,
        status: 'error',
        message: error instanceof Error ? error.message : 'Google sign-in failed.',
      }));
    }
  }, [syncToGoogleDrive]);

  const signOutGoogle = useCallback(async () => {
    const token = accessTokenRef.current;
    accessTokenRef.current = null;
    syncFileIdRef.current = null;
    lastCloudSavedAtRef.current = null;
    if (token) await revokeGoogleDriveToken(token);
    setCloudSync(prev => ({
      ...prev,
      isSignedIn: false,
      status: 'idle',
      message: 'Signed out of Google Drive sync.',
      fileId: null,
      lastSyncedAt: null,
    }));
  }, []);

  // Auto-login: try silent token request on page load
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID || accessTokenRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const token = await requestGoogleDriveToken(GOOGLE_CLIENT_ID, true);
        if (cancelled) return;
        accessTokenRef.current = token;
        setCloudSync(prev => ({ ...prev, isSignedIn: true, status: 'syncing', message: 'Auto-syncing with Google Drive...' }));

        const file = await findSyncFile(token);
        if (cancelled) return;
        syncFileIdRef.current = file?.id ?? null;

        if (file) {
          const payload = await downloadSyncPayload(token, file.id);
          if (cancelled) return;
          if (payload && payload.savedAt > dataUpdatedAtRef.current) {
            lastCloudSavedAtRef.current = payload.savedAt;
            setData(migrateAppData(payload.data));
            setDataUpdatedAt(payload.savedAt);
            setCloudSync(prev => ({
              ...prev,
              fileId: file.id,
              status: 'idle',
              message: 'Loaded latest data from Google Drive.',
              lastSyncedAt: Date.now(),
            }));
            return;
          }
        }

        setCloudSync(prev => ({
          ...prev,
          status: 'idle',
          message: 'Signed in to Google Drive.',
          lastSyncedAt: prev.lastSyncedAt,
        }));
      } catch {
        // Silent login failed (user not previously authorized or popup blocked) — that's fine, stay signed out
        if (!cancelled) {
          setCloudSync(prev => ({
            ...prev,
            isSignedIn: false,
            status: 'idle',
            message: 'Google Drive sync is ready.',
          }));
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!cloudSync.isSignedIn || !accessTokenRef.current) return;
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
  }, [cloudSync.isSignedIn, dataUpdatedAt, syncToGoogleDrive]);

  return (
    <AppContext.Provider value={{
      videos: data.videos,
      instances: data.instances,
      folders: data.folders,
      remixes: data.remixes,
      cloudSync,
      addVideo, deleteVideo, updateVideo,
      addInstance, deleteInstance, updateClip,
      getInstancesForVideo, getInstance, getVideo,
      generateClips,
      addFolder, renameFolder, deleteFolder, moveVideoToFolder,
      addRemix, updateRemix, deleteRemix, getRemix,
      signInWithGoogle,
      signOutGoogle,
      syncToGoogleDrive,
      loadFromGoogleDrive,
    }}>
      {children}
    </AppContext.Provider>
  );
}
