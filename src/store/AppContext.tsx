import React, { useState, useCallback, useEffect } from 'react';
import type { AppData, Video, Instance, Clip } from '../types';
import { AppContext } from './AppContextValue';
import type { CloudSyncState } from './AppContextValue';
import { loadStoredAppData, saveAppData } from '../utils/storage';
import { generateClipsForDuration } from '../utils/helpers';
import {
  createDrivePayload,
  downloadSyncPayload,
  findSyncFile,
  getGoogleClientId,
  requestGoogleDriveToken,
  revokeGoogleDriveToken,
  saveSyncPayload,
} from '../utils/googleDriveSync';
const GOOGLE_CLIENT_ID = getGoogleClientId();

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [storedData] = useState(() => loadStoredAppData());
  const [data, setData] = useState<AppData>(storedData.data);
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
      videos: prev.videos.filter(v => v.id !== videoId),
      instances: prev.instances.filter(i => i.videoId !== videoId),
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

  const syncToGoogleDrive = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) {
      setCloudSync(prev => ({ ...prev, status: 'error', message: 'Sign in with Google before syncing.' }));
      return;
    }

    setCloudSync(prev => ({ ...prev, status: 'syncing', message: 'Saving to Google Drive...' }));

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
    } catch (error) {
      setCloudSync(prev => ({
        ...prev,
        status: 'error',
        message: error instanceof Error ? error.message : 'Google Drive sync failed.',
      }));
    }
  }, []);

  const loadFromGoogleDrive = useCallback(async () => {
    const token = accessTokenRef.current;
    if (!token) {
      setCloudSync(prev => ({ ...prev, status: 'error', message: 'Sign in with Google before loading from Drive.' }));
      return;
    }

    setCloudSync(prev => ({ ...prev, status: 'loading', message: 'Loading from Google Drive...' }));

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
      setData(payload.data);
      setDataUpdatedAt(payload.savedAt);
      setCloudSync(prev => ({
        ...prev,
        isSignedIn: true,
        fileId: file.id,
        status: 'idle',
        message: 'Loaded settings and video details from Google Drive.',
        lastSyncedAt: Date.now(),
      }));
    } catch (error) {
      setCloudSync(prev => ({
        ...prev,
        status: 'error',
        message: error instanceof Error ? error.message : 'Could not load from Google Drive.',
      }));
    }
  }, []);

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
          setData(payload.data);
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
      cloudSync,
      addVideo, deleteVideo, updateVideo,
      addInstance, deleteInstance, updateClip,
      getInstancesForVideo, getInstance, getVideo,
      generateClips,
      signInWithGoogle,
      signOutGoogle,
      syncToGoogleDrive,
      loadFromGoogleDrive,
    }}>
      {children}
    </AppContext.Provider>
  );
}
