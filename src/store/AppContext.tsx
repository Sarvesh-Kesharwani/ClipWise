import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Video, Instance, Clip, AppData } from '../types';
import { loadAppData, saveAppData } from '../utils/storage';
import { generateClipsForDuration } from '../utils/helpers';

interface AppContextType {
  videos: Video[];
  instances: Instance[];
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
}

const AppContext = createContext<AppContextType | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadAppData());

  useEffect(() => {
    saveAppData(data);
  }, [data]);

  const addVideo = useCallback((video: Video) => {
    setData(prev => ({ ...prev, videos: [...prev.videos, video] }));
  }, []);

  const deleteVideo = useCallback((videoId: string) => {
    setData(prev => ({
      videos: prev.videos.filter(v => v.id !== videoId),
      instances: prev.instances.filter(i => i.videoId !== videoId),
    }));
  }, []);

  const updateVideo = useCallback((video: Video) => {
    setData(prev => ({
      ...prev,
      videos: prev.videos.map(v => v.id === video.id ? video : v),
    }));
  }, []);

  const addInstance = useCallback((instance: Instance) => {
    setData(prev => ({ ...prev, instances: [...prev.instances, instance] }));
  }, []);

  const deleteInstance = useCallback((instanceId: string) => {
    setData(prev => ({
      ...prev,
      instances: prev.instances.filter(i => i.id !== instanceId),
    }));
  }, []);

  const updateClip = useCallback((instanceId: string, clipIndex: number, updates: Partial<Clip>) => {
    setData(prev => ({
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
  }, []);

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
    setData(prev => ({
      ...prev,
      instances: prev.instances.map(inst => {
        if (inst.id !== instanceId || inst.clips.length > 0) return inst;
        return { ...inst, clips: generateClipsForDuration(duration, inst.clipSizeMinutes) };
      }),
    }));
  }, []);

  return (
    <AppContext.Provider value={{
      videos: data.videos,
      instances: data.instances,
      addVideo, deleteVideo, updateVideo,
      addInstance, deleteInstance, updateClip,
      getInstancesForVideo, getInstance, getVideo,
      generateClips,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextType {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
