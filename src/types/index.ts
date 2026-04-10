export interface Video {
  id: string;
  title: string;
  source: 'local' | 'youtube';
  youtubeId?: string;
  youtubeUrl?: string;
  duration: number;
  thumbnail?: string;
  createdAt: number;
}

export interface Instance {
  id: string;
  videoId: string;
  name: string;
  clipSizeMinutes: number;
  clips: Clip[];
  createdAt: number;
}

export interface Clip {
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
  watchCount: number;
  summary: string;
}

export type ClipStatus = 'unwatched' | 'watched' | 'summarized' | 'rewatched-2' | 'rewatched-3plus';

export interface AppData {
  videos: Video[];
  instances: Instance[];
}

export interface PlayerRef {
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
}

export interface PlayerProps {
  onTimeUpdate: (time: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onReady: (duration: number) => void;
  onEnded: () => void;
}
