export interface Video {
  id: string;
  title: string;
  source: 'local' | 'youtube' | 'youlearn';
  youtubeId?: string;
  youtubeUrl?: string;
  externalUrl?: string;
  youlearnContentId?: string;
  youlearnSpaceUrl?: string;
  youlearnTranscript?: TranscriptSegment[];
  duration: number;
  thumbnail?: string;
  createdAt: number;
  folderId?: string;
  /** Timestamp (ms) of the most recent clip completion belonging to this video. */
  lastWatchedAt?: number;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
  parentId?: string;
}

export interface FeedSettings {
  lastListId: string | null;
  lastFolderId?: string | null;
  sourceFolderIds?: string[];
  clipSize: number;
  autoStart?: boolean;
  preferSound?: boolean;
  includeSubfolders?: boolean;
}

export interface FeatureRequest {
  id: string;
  description: string;
  completed: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface FeedList {
  id: string;
  name: string;
  videoIds: string[];
  createdAt: number;
  updatedAt: number;
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
  lifeRecommendations?: string[];
  lifeContextSnapshot?: string;
  lifeRecommendationsVersion?: number;
}

export interface RemixClipRef {
  id: string;
  videoId: string;
  instanceId: string;
  clipIndex: number;
}

export interface Remix {
  id: string;
  title: string;
  clipRefs: RemixClipRef[];
  createdAt: number;
}

export type ClipStatus = 'unwatched' | 'watched' | 'summarized' | 'rewatched-2' | 'rewatched-3plus';

/** Per-day clip completion counter, persisted forever. */
export interface DailyProgress {
  /** Local date string in YYYY-MM-DD form. */
  date: string;
  clipsCompleted: number;
  target: number;
  /** True if a streak freeze was consumed to keep the streak alive on this day. */
  freezeUsed?: boolean;
}

export interface ProgressState {
  /** Daily completion log, oldest -> newest. */
  daily: DailyProgress[];
  /** Daily target for *today*. Adapts based on history. */
  currentTarget: number;
  /** Consecutive days where the target was met (or freeze used). */
  currentStreak: number;
  /** All-time longest streak reached. */
  bestStreak: number;
  /** Streak freezes the user owns (Duolingo-style). */
  freezes: number;
  /** Cumulative clips completed *beyond* daily targets (drives freeze rewards). */
  extraClipsBank: number;
  /** Most recent date a clip was completed (YYYY-MM-DD), used for streak rollover. */
  lastActiveDate?: string;
}

export interface AppData {
  videos: Video[];
  instances: Instance[];
  folders: Folder[];
  remixes: Remix[];
  featureRequests: FeatureRequest[];
  feedLists: FeedList[];
  progress: ProgressState;
  feedSettings?: FeedSettings;
  userLifeContext?: string;
}

export interface PlayerRef {
  seek: (time: number) => void;
  play: () => void;
  pause: () => void;
  mute?: () => void;
  unMute?: () => void;
}

export interface TranscriptSegment {
  index: number;
  startTime: number;
  text: string;
}

export interface PlayerProps {
  onTimeUpdate: (time: number) => void;
  onPlay: () => void;
  onPause: () => void;
  onReady: (duration: number) => void;
  onEnded: () => void;
}
