import { useState, useEffect, useRef, useMemo, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import LocalPlayer from '../components/LocalPlayer';
import YouTubePlayer from '../components/YouTubePlayer';
import ClipPanel from '../components/ClipPanel';
import SegmentedProgressBar from '../components/SegmentedProgressBar';
import SummaryModal from '../components/SummaryModal';
import MobileNav from '../components/MobileNav';
import type { Clip, ClipNote, PlayerRef } from '../types';
import { WatchTracker } from '../utils/watchTracker';
import { getVideoFile } from '../utils/videoDb';
import { currentTimestamp, formatTime, generateId } from '../utils/helpers';
import { fetchYouLearnTranscript } from '../utils/youlearn';
import { extractYouTubeId, fetchYouTubeTranscript } from '../utils/youtube';
import { LIFE_RECOMMENDATIONS_VERSION } from '../utils/lifeRecommendations';

const CELEBRATION_DURATION_MS = 1600;
const SUMMARY_PROMPT_DELAY_MS = 900;
const MIN_PLAYBACK_RATE = 0.25;
const MAX_PLAYBACK_RATE = 4;
const PLAYBACK_RATE_STEP = 0.25;

interface TimeRange {
  start: number;
  end: number;
}

interface NoteDraftWindow extends TimeRange {
  clipIndex: number;
  noteId?: string;
}

interface ShortcutHandlers {
  showSummary: boolean;
  noteWindowOpen: boolean;
  toggleFullscreen: () => void;
  seekBy: (seconds: number) => void;
  togglePlayback: () => void;
  openInlineNote: () => void;
  setDirectPlaybackRate: (rate: number) => void;
}

function clampTime(value: number, duration: number) {
  return Math.max(0, Math.min(duration || 0, value));
}

function clampPlaybackRate(value: number) {
  return Math.max(MIN_PLAYBACK_RATE, Math.min(MAX_PLAYBACK_RATE, Math.round(value * 4) / 4));
}

function normalizeRanges(ranges: TimeRange[], duration: number): TimeRange[] {
  const sorted = ranges
    .map(range => ({
      start: clampTime(Math.min(range.start, range.end), duration),
      end: clampTime(Math.max(range.start, range.end), duration),
    }))
    .filter(range => range.end - range.start > 0.1)
    .sort((a, b) => a.start - b.start);

  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end + 0.25) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

function getRemainingRanges(duration: number, watchedRanges: TimeRange[]): TimeRange[] {
  if (duration <= 0) return [];

  const remaining: TimeRange[] = [];
  let cursor = 0;
  for (const watched of watchedRanges) {
    if (watched.start > cursor) {
      remaining.push({ start: cursor, end: watched.start });
    }
    cursor = Math.max(cursor, watched.end);
  }
  if (cursor < duration) {
    remaining.push({ start: cursor, end: duration });
  }
  return remaining.filter(range => range.end - range.start > 0.1);
}

function sumRanges(ranges: TimeRange[]) {
  return ranges.reduce((total, range) => total + Math.max(0, range.end - range.start), 0);
}

function timeToRemainingOffset(time: number, ranges: TimeRange[]) {
  let offset = 0;
  for (const range of ranges) {
    if (time <= range.start) return offset;
    if (time <= range.end) return offset + (time - range.start);
    offset += range.end - range.start;
  }
  return offset;
}

export default function PlayerPage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const {
    getInstance,
    getVideo,
    updateClip,
    generateClips,
    updateVideo,
    recordClipWatched,
    recordClipSummarized,
    userLifeContext,
  } = useApp();

  const instance = getInstance(instanceId!);
  const video = instance ? getVideo(instance.videoId) : null;

  const playerRef = useRef<PlayerRef>(null);
  const fullscreenHostRef = useRef<HTMLDivElement>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
  const noteSegmentStartRef = useRef<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [noteCoverageStart, setNoteCoverageStart] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryClipIndex, setSummaryClipIndex] = useState(-1);
  const [noteWindow, setNoteWindow] = useState<NoteDraftWindow | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [videoSrc, setVideoSrc] = useState('');
  const [loading, setLoading] = useState(true);
  const [clipWatchProgress, setClipWatchProgress] = useState(0);
  const [celebration, setCelebration] = useState<{ key: number; clipNumber: number } | null>(null);
  const [showWatchedRanges, setShowWatchedRanges] = useState(true);
  const [skipNotedRanges, setSkipNotedRanges] = useState(true);
  const [showNativeYoutubeControls, setShowNativeYoutubeControls] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const trackersRef = useRef(new Map<number, WatchTracker>());
  const countedRef = useRef(new Set<number>());
  const prevClipRef = useRef(-1);
  const seekingRef = useRef(false);
  const playbackRateRef = useRef(1);
  const playIntentRef = useRef(false);
  const noteReviewRangeRef = useRef<TimeRange | null>(null);
  const pendingSkipTargetRef = useRef<number | null>(null);
  const skipResumeTimerRef = useRef<number | null>(null);
  const celebrationTimerRef = useRef<number | null>(null);
  const summaryTimerRef = useRef<number | null>(null);
  const celebrationKeyRef = useRef(0);
  const shortcutsRef = useRef<ShortcutHandlers>({
    showSummary: false,
    noteWindowOpen: false,
    toggleFullscreen: () => {},
    seekBy: () => {},
    togglePlayback: () => {},
    openInlineNote: () => {},
    setDirectPlaybackRate: () => {},
  });

  const clips = useMemo(() => instance?.clips || [], [instance?.clips]);
  const watchedNoteRanges = useMemo(
    () => normalizeRanges(
      clips.flatMap(clip => (clip.notes ?? []).map(note => ({ start: note.startTime, end: note.endTime }))),
      duration,
    ),
    [clips, duration],
  );
  const remainingRanges = useMemo(
    () => getRemainingRanges(duration, watchedNoteRanges),
    [duration, watchedNoteRanges],
  );
  const remainingDuration = useMemo(() => sumRanges(remainingRanges), [remainingRanges]);
  const remainingPlayheadPct = showWatchedRanges
    ? (duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0)
    : (remainingDuration > 0
      ? Math.max(0, Math.min(100, (timeToRemainingOffset(currentTime, remainingRanges) / remainingDuration) * 100))
      : 100);
  const noteCoverageRange = noteCoverageStart !== null && !noteWindow?.noteId
    ? {
        start: clampTime(Math.min(noteCoverageStart, currentTime), duration),
        end: clampTime(Math.max(noteCoverageStart, currentTime), duration),
      }
    : null;
  const noteCoverageLeftPct = noteCoverageRange
    ? (showWatchedRanges
        ? (duration > 0 ? (noteCoverageRange.start / duration) * 100 : 0)
        : (remainingDuration > 0
            ? (timeToRemainingOffset(noteCoverageRange.start, remainingRanges) / remainingDuration) * 100
            : 0))
    : 0;
  const noteCoverageWidthPct = noteCoverageRange
    ? (showWatchedRanges
        ? (duration > 0 ? ((noteCoverageRange.end - noteCoverageRange.start) / duration) * 100 : 0)
        : (remainingDuration > 0
            ? ((timeToRemainingOffset(noteCoverageRange.end, remainingRanges)
                - timeToRemainingOffset(noteCoverageRange.start, remainingRanges)) / remainingDuration) * 100
            : 0))
    : 0;

  function needsSummary(clip: Clip | undefined): clip is Clip {
    return Boolean(clip && clip.watchCount > 0 && !clip.summary.trim());
  }

  function getClipIndexForTime(time: number): number {
    if (!clips.length) return 0;
    for (let i = 0; i < clips.length; i++) {
      if (time >= clips[i].startTime && time < clips[i].endTime) {
        return i;
      }
    }
    return clips.length - 1;
  }

  function openSummary(clipIndex: number) {
    setSummaryClipIndex(clipIndex);
    setShowSummary(true);
  }

  function setNoteCoverageFrom(time: number) {
    const start = clampTime(time, duration);
    noteSegmentStartRef.current = start;
    setNoteCoverageStart(start);
  }

  function restartNoteCoverage() {
    setNoteCoverageFrom(currentTime);
  }

  function createNoteId() {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : generateId();
  }

  function handlePlayerPlay() {
    if (noteSegmentStartRef.current === null) {
      setNoteCoverageFrom(currentTime);
    }
    playIntentRef.current = true;
    setIsPlaying(true);
  }

  function handlePlayerPause() {
    playIntentRef.current = false;
    setIsPlaying(false);
  }

  function handlePlayerEnded() {
    playIntentRef.current = false;
    setIsPlaying(false);
  }

  function togglePlayback() {
    if (isPlaying) {
      playIntentRef.current = false;
      playerRef.current?.pause();
      return;
    }

    if (noteSegmentStartRef.current === null) {
      setNoteCoverageFrom(currentTime);
    }
    playIntentRef.current = true;
    playerRef.current?.play();
  }

  function setDirectPlaybackRate(rate: number) {
    const nextRate = clampPlaybackRate(rate);
    playbackRateRef.current = nextRate;
    setPlaybackRate(nextRate);
    playerRef.current?.setPlaybackRate?.(nextRate);
  }

  function jumpToPlayableTime(time: number) {
    const playableTime = getPlayableSeekTime(time);
    if (playableTime === null) return false;

    pendingSkipTargetRef.current = playableTime;
    seekingRef.current = true;
    setNoteCoverageFrom(playableTime);
    setCurrentTime(playableTime);
    playerRef.current?.seek(playableTime);
    playerRef.current?.play();
    if (skipResumeTimerRef.current !== null) {
      window.clearTimeout(skipResumeTimerRef.current);
    }
    skipResumeTimerRef.current = window.setTimeout(() => {
      skipResumeTimerRef.current = null;
      if (playIntentRef.current && pendingSkipTargetRef.current !== null) {
        playerRef.current?.play();
      }
    }, 350);
    window.setTimeout(() => { seekingRef.current = false; }, 500);
    return true;
  }

  function toggleFullscreen() {
    const fullscreenElement = document.fullscreenElement;
    if (fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    void fullscreenHostRef.current?.requestFullscreen();
  }

  function handleVideoShellClick(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('.custom-video-controls, .fullscreen-note-overlay')) return;
    event.currentTarget.focus();
    togglePlayback();
  }

  function openInlineNote() {
    if (!instance || noteWindow) return;

    const endTime = clampTime(currentTime, duration);
    const startTime = clampTime(noteSegmentStartRef.current ?? endTime, duration);
    const clipIndex = getClipIndexForTime(endTime);

    playerRef.current?.pause();
    setNoteWindow({ start: startTime, end: endTime, clipIndex });
    setNoteDraft('');
  }

  function openEditInlineNote(clipIndex: number, note: ClipNote) {
    if (!instance || noteWindow) return;

    playerRef.current?.pause();
    setNoteWindow({
      start: note.startTime,
      end: note.endTime,
      clipIndex,
      noteId: note.id,
    });
    setNoteDraft(note.text);
  }

  function closeInlineNote() {
    setNoteWindow(null);
    setNoteDraft('');
  }

  function handleSaveInlineNote() {
    if (!instance || !noteWindow) return;
    const noteText = noteDraft.trim();
    if (!noteText) return;

    const clip = clips[noteWindow.clipIndex];
    if (!clip) return;

    const start = clampTime(Math.min(noteWindow.start, noteWindow.end), duration);
    const end = clampTime(Math.max(noteWindow.start, noteWindow.end), duration);
    const endTime = end > start ? end : Math.min(duration, start + 0.5);

    if (noteWindow.noteId) {
      updateClip(instance.id, clip.index, {
        notes: (clip.notes ?? []).map(note =>
          note.id === noteWindow.noteId
            ? { ...note, startTime: start, endTime, text: noteText }
            : note
        ),
      });
      setNoteCoverageFrom(endTime);
      closeInlineNote();
      return;
    }

    const note: ClipNote = {
      id: createNoteId(),
      startTime: start,
      endTime,
      text: noteText,
      createdAt: currentTimestamp(),
    };

    updateClip(instance.id, clip.index, {
      notes: [...(clip.notes ?? []), note],
    });
    recordClipWatched(instance.videoId);
    setNoteCoverageFrom(note.endTime);
    closeInlineNote();
  }

  function handleInlineNoteKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey || event.shiftKey) && event.key === 'Enter') {
      event.preventDefault();
      handleSaveInlineNote();
    }
  }

  function handleDeleteInlineNote(clipIndex: number, noteId: string) {
    if (!instance) return;

    const clip = clips[clipIndex];
    if (!clip) return;

    updateClip(instance.id, clip.index, {
      notes: (clip.notes ?? []).filter(note => note.id !== noteId),
    });

    if (noteWindow?.noteId === noteId) closeInlineNote();
  }

  function handleRemainingProgressClick(event: ReactMouseEvent<HTMLDivElement>, range: TimeRange) {
    const rect = event.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    seekToTime(range.start + pct * (range.end - range.start));
  }

  function handleWatchedProgressClick(event: ReactMouseEvent<HTMLDivElement>, range: TimeRange) {
    if (skipNotedRanges) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    pendingSkipTargetRef.current = null;
    noteReviewRangeRef.current = { start: range.start, end: range.end };
    seekToResolvedTime(range.start + pct * (range.end - range.start));
  }

  function triggerCelebration(clipIndex: number) {
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
    }

    celebrationKeyRef.current += 1;
    setCelebration({ key: celebrationKeyRef.current, clipNumber: clipIndex + 1 });
    celebrationTimerRef.current = window.setTimeout(() => {
      setCelebration(null);
      celebrationTimerRef.current = null;
    }, CELEBRATION_DURATION_MS);
  }

  function openSummaryAfterCelebration(clipIndex: number) {
    if (summaryTimerRef.current !== null) {
      window.clearTimeout(summaryTimerRef.current);
    }

    summaryTimerRef.current = window.setTimeout(() => {
      openSummary(clipIndex);
      summaryTimerRef.current = null;
    }, SUMMARY_PROMPT_DELAY_MS);
  }

  function requireSummaryBeforeLeaving(fromClipIndex: number, toClipIndex: number): boolean {
    if (fromClipIndex === toClipIndex) return false;

    const fromClip = clips[fromClipIndex];
    if (!needsSummary(fromClip)) return false;

    playerRef.current?.pause();
    openSummary(fromClip.index);
    return true;
  }

  function keepPlayerInClip(clip: Clip) {
    const lockedTime = Math.max(clip.startTime, clip.endTime - 0.25);

    seekingRef.current = true;
    setCurrentTime(lockedTime);
    playerRef.current?.seek(lockedTime);
    playerRef.current?.pause();

    setTimeout(() => { seekingRef.current = false; }, 500);
  }

  // Load file-backed or external video source.
  useEffect(() => {
    if (!video) return;

    if (video.source === 'local') {
      getVideoFile(video.id).then(file => {
        if (file) {
          const url = URL.createObjectURL(file);
          setVideoSrc(url);
          setLoading(false);
          return () => URL.revokeObjectURL(url);
        } else {
          setLoading(false);
        }
      });
    } else if (video.source === 'youlearn') {
      queueMicrotask(() => {
        setVideoSrc(video.externalUrl ?? '');
        setLoading(false);
      });
    } else {
      queueMicrotask(() => setLoading(false));
    }
  }, [video]);

  // Generate clips when duration becomes available
  useEffect(() => {
    if (instance && duration > 0 && instance.clips.length === 0) {
      generateClips(instance.id, duration);
    }
  }, [instance, duration, generateClips]);

  // Update video duration if not yet known
  useEffect(() => {
    if (video && video.duration === 0 && duration > 0) {
      updateVideo({ ...video, duration });
    }
  }, [video, duration, updateVideo]);

  useEffect(() => {
    if (!video || !video.youlearnContentId || video.youlearnTranscript?.length) return;
    let cancelled = false;

    fetchYouLearnTranscript(video.youlearnContentId).then(transcript => {
      if (cancelled || transcript.length === 0) return;
      updateVideo({ ...video, youlearnTranscript: transcript });
    });

    return () => {
      cancelled = true;
    };
  }, [video, updateVideo]);

  useEffect(() => {
    if (!video || video.source !== 'youtube' || video.youlearnContentId || !video.youtubeId || video.youlearnTranscript?.length) return;
    let cancelled = false;

    fetchYouTubeTranscript(video.youtubeId).then(transcript => {
      if (cancelled || transcript.length === 0) return;
      updateVideo({ ...video, youlearnTranscript: transcript });
    });

    return () => {
      cancelled = true;
    };
  }, [video, updateVideo]);

  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current !== null) {
        window.clearTimeout(celebrationTimerRef.current);
      }
      if (summaryTimerRef.current !== null) {
        window.clearTimeout(summaryTimerRef.current);
      }
      if (skipResumeTimerRef.current !== null) {
        window.clearTimeout(skipResumeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function handleFullscreenChange() {
      setIsFullscreen(document.fullscreenElement === fullscreenHostRef.current);
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!noteWindow) return;
    window.setTimeout(() => noteTextareaRef.current?.focus(), 0);
  }, [noteWindow]);

  function handleTimeUpdate(time: number) {
    // Skip stale time updates that arrive during a pending seek
    if (seekingRef.current) return;

    const pendingSkipTarget = pendingSkipTargetRef.current;
    const isCompletingSkip = pendingSkipTarget !== null && time < pendingSkipTarget;
    if (pendingSkipTarget !== null && !isCompletingSkip) {
      pendingSkipTargetRef.current = null;
    }

    const noteReviewRange = noteReviewRangeRef.current;
    const isReviewingNote = Boolean(
      noteReviewRange && time >= noteReviewRange.start && time < noteReviewRange.end,
    );
    if (noteReviewRange && (time < noteReviewRange.start - 0.25 || time >= noteReviewRange.end)) {
      noteReviewRangeRef.current = null;
    }

    if (!isCompletingSkip && !isReviewingNote && skipNotedRanges && duration > 0 && watchedNoteRanges.length > 0 && remainingRanges.length > 0) {
      const watchedRange = watchedNoteRanges.find(range => time >= range.start && time < range.end);
      if (watchedRange) {
        jumpToPlayableTime(watchedRange.end);
        return;
      }
    }

    if (!clips.length || !instance) {
      setCurrentTime(time);
      setClipWatchProgress(0);
      return;
    }

    const clipIdx = getClipIndexForTime(time);
    const previousClipIdx = prevClipRef.current;

    if (previousClipIdx >= 0 && requireSummaryBeforeLeaving(previousClipIdx, clipIdx)) {
      const previousClip = clips[previousClipIdx];
      if (previousClip) keepPlayerInClip(previousClip);
      return;
    }

    setCurrentTime(time);

    // Clip changed — reset tracker for new clip
    if (clipIdx !== prevClipRef.current) {
      if (prevClipRef.current >= 0) {
        trackersRef.current.delete(prevClipRef.current);
        countedRef.current.delete(prevClipRef.current);
      }
      prevClipRef.current = clipIdx;
      setActiveClipIndex(clipIdx);
      setClipWatchProgress(0);
    }

    const clip = clips[clipIdx];
    if (!clip) return;

    let tracker = trackersRef.current.get(clipIdx);
    if (!tracker) {
      tracker = new WatchTracker(clip.duration);
      trackersRef.current.set(clipIdx, tracker);
    }

    const timeInClip = time - clip.startTime;
    tracker.update(timeInClip);
    setClipWatchProgress(tracker.getProgress());

    if (tracker.isComplete() && !countedRef.current.has(clipIdx)) {
      countedRef.current.add(clipIdx);
      updateClip(instance.id, clipIdx, { watchCount: clip.watchCount + 1 });
      recordClipWatched(instance.videoId);
      triggerCelebration(clipIdx);
      if (!clip.summary.trim()) {
        playerRef.current?.pause();
        openSummaryAfterCelebration(clipIdx);
      }
    }
  }

  function handleReady(dur: number) {
    setDuration(dur);
    playerRef.current?.setPlaybackRate?.(playbackRateRef.current);
  }

  function getPlayableSeekTime(time: number): number | null {
    const clampedTime = clampTime(time, duration);
    const currentRange = remainingRanges.find(range => clampedTime >= range.start && clampedTime < range.end);
    if (currentRange) return clampedTime;

    const nextRange = remainingRanges.find(range => range.start > clampedTime);
    return nextRange?.start ?? null;
  }

  function seekToTime(time: number) {
    const playableTime = getPlayableSeekTime(time);
    if (playableTime === null) return;

    pendingSkipTargetRef.current = null;
    noteReviewRangeRef.current = null;
    seekToResolvedTime(playableTime);
  }

  function seekBy(seconds: number) {
    seekToTime(currentTime + seconds);
  }

  function seekToResolvedTime(time: number) {
    const seekTime = clampTime(time, duration);
    const newClipIdx = getClipIndexForTime(seekTime);
    if (requireSummaryBeforeLeaving(activeClipIndex, newClipIdx)) return false;

    if (newClipIdx !== prevClipRef.current) {
      if (prevClipRef.current >= 0) {
        trackersRef.current.delete(prevClipRef.current);
        countedRef.current.delete(prevClipRef.current);
      }
      prevClipRef.current = newClipIdx;
      setActiveClipIndex(newClipIdx);
    }
    // Reset the new clip's tracker so it starts fresh from this seek
    trackersRef.current.delete(newClipIdx);
    countedRef.current.delete(newClipIdx);
    setClipWatchProgress(0);

    // Suppress stale time updates while seeking
    seekingRef.current = true;
    setNoteCoverageFrom(seekTime);
    setCurrentTime(seekTime);

    playerRef.current?.seek(seekTime);
    playerRef.current?.play();

    // Allow time updates again after seek settles
    setTimeout(() => { seekingRef.current = false; }, 500);
    return true;
  }

  useEffect(() => {
    shortcutsRef.current = {
      showSummary,
      noteWindowOpen: Boolean(noteWindow),
      toggleFullscreen,
      seekBy,
      togglePlayback,
      openInlineNote,
      setDirectPlaybackRate,
    };
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target;
      const isTyping = target instanceof HTMLInputElement
        || target instanceof HTMLTextAreaElement
        || target instanceof HTMLSelectElement
        || (target instanceof HTMLElement && target.isContentEditable);

      const shortcuts = shortcutsRef.current;
      if (isTyping || shortcuts.showSummary || shortcuts.noteWindowOpen) return;
      const key = event.key.toLowerCase();
      if (key === 'escape' && document.fullscreenElement === fullscreenHostRef.current) {
        event.preventDefault();
        void document.exitFullscreen();
        return;
      }
      if (key === 'f') {
        event.preventDefault();
        if (!event.repeat) shortcuts.toggleFullscreen();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        if (!event.repeat) shortcuts.seekBy(-10);
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        if (!event.repeat) shortcuts.seekBy(10);
        return;
      }
      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        if (!event.repeat) shortcuts.togglePlayback();
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && (key === 'a' || key === 's' || key === 'd')) {
        event.preventDefault();
        if (event.repeat) return;
        if (key === 'a') shortcuts.setDirectPlaybackRate(playbackRateRef.current - PLAYBACK_RATE_STEP);
        if (key === 's') shortcuts.setDirectPlaybackRate(1);
        if (key === 'd') shortcuts.setDirectPlaybackRate(playbackRateRef.current + PLAYBACK_RATE_STEP);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && key === 'n') {
        event.preventDefault();
        if (!event.repeat) shortcuts.openInlineNote();
        return;
      }
      if (key === 'n') {
        event.preventDefault();
        shortcuts.openInlineNote();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  function handleSeekToNote(note: ClipNote) {
    const start = clampTime(note.startTime, duration);
    const end = clampTime(Math.max(note.startTime, note.endTime), duration);
    const noteEnd = end > start ? end : Math.min(duration, start + 0.5);

    pendingSkipTargetRef.current = null;
    const noteRange = { start, end: noteEnd };
    noteReviewRangeRef.current = seekToResolvedTime(start) ? noteRange : null;
  }

  function handleSeekToClip(index: number) {
    if (clips[index]) {
      seekToTime(clips[index].startTime);
    }
  }

  function handleSeek(time: number) {
    seekToTime(time);
  }

  function handleSaveSummary(text: string, lifeRecommendations: string[], lifeContextSnapshot: string) {
    if (summaryClipIndex >= 0 && instance) {
      const previous = clips[summaryClipIndex];
      const wasUnsummarized = !previous?.summary?.trim();
      updateClip(instance.id, summaryClipIndex, {
        summary: text,
        lifeRecommendations,
        lifeContextSnapshot,
        lifeRecommendationsVersion: LIFE_RECOMMENDATIONS_VERSION,
      });
      if (wasUnsummarized) {
        recordClipSummarized(instance.videoId);
      }
    }
    setShowSummary(false);
  }

  if (!instance || !video) {
    return (
      <div className="player-error">
        <h2>Instance not found</h2>
        <button className="btn-primary" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="player-loading">
        <div className="spinner" />
        <p>Loading video...</p>
      </div>
    );
  }

  const watchedCount = clips.filter(c => c.watchCount > 0).length;
  const summarizedCount = clips.filter(c => c.summary).length;
  const summaryRequiredClip = clips[activeClipIndex];
  const summaryRequiredClipIndex = needsSummary(summaryRequiredClip) ? summaryRequiredClip.index : null;
  const currentClip = clips[activeClipIndex];
  const clipsWithNotes = clips
    .map((clip, arrayIndex) => ({ clip, arrayIndex }))
    .filter(({ clip }) => clip.notes?.length);
  const summaryClip = clips[summaryClipIndex];
  const summaryClipText = video?.youlearnTranscript?.length && summaryClip
    ? video.youlearnTranscript
      .filter(segment =>
        segment.startTime >= summaryClip.startTime && segment.startTime < summaryClip.endTime
      )
      .map(segment => segment.text)
      .join(' ')
    : '';
  const clipProgressPct = Math.round(Math.min(1, Math.max(0, clipWatchProgress)) * 100);
  const youLearnYouTubeId = video.source === 'youlearn'
    ? video.youtubeId ?? extractYouTubeId(video.externalUrl ?? '')
    : null;
  const playerYouTubeId = video.source === 'youtube' ? video.youtubeId : youLearnYouTubeId;
  const useFilePlayer = video.source === 'local' || (video.source === 'youlearn' && !playerYouTubeId);

  return (
    <div className="cw-page player-page">
      <div className="player-sidebar">
        <button className="back-btn" onClick={() => navigate('/')}>
          ← Dashboard
        </button>
        <div className="sidebar-title">
          <h2>{video.title}</h2>
          <span className="sidebar-meta">{instance.name} · {instance.clipSizeMinutes}min clips</span>
        </div>
        {clips.length > 0 && (
          <div className="sidebar-overall">
            <div className="overall-bar">
              <div
                className="overall-fill watched-fill"
                style={{ width: `${(watchedCount / clips.length) * 100}%` }}
              />
            </div>
            <span className="overall-text">
              {watchedCount}/{clips.length} watched · {summarizedCount}/{clips.length} summaries
            </span>
          </div>
        )}
        <ClipPanel
          clips={clips}
          activeClipIndex={activeClipIndex}
          lockedClipIndex={summaryRequiredClipIndex}
          onClipClick={handleSeekToClip}
          onSummaryClick={openSummary}
        />
      </div>

      <div className="player-main">
        <div
          ref={fullscreenHostRef}
          className={`custom-video-shell ${isFullscreen ? 'is-fullscreen' : ''} ${showNativeYoutubeControls ? 'native-youtube-controls' : ''}`}
        >
          <div className="player-video-container" onClick={handleVideoShellClick} tabIndex={-1}>
            {useFilePlayer ? (
              <LocalPlayer
                ref={playerRef}
                src={videoSrc}
                onTimeUpdate={handleTimeUpdate}
                onPlay={handlePlayerPlay}
                onPause={handlePlayerPause}
                onReady={handleReady}
                onEnded={handlePlayerEnded}
              />
            ) : (
              <YouTubePlayer
                ref={playerRef}
                videoId={playerYouTubeId!}
                nativeControls={showNativeYoutubeControls}
                onTimeUpdate={handleTimeUpdate}
                onPlay={handlePlayerPlay}
                onPause={handlePlayerPause}
                onReady={handleReady}
                onEnded={handlePlayerEnded}
              />
            )}
          </div>

          <div className="custom-video-controls" aria-label="Video controls">
            <div className="custom-video-controls-row">
              <button
                type="button"
                className="custom-video-btn"
                onClick={togglePlayback}
                aria-label={isPlaying ? 'Pause video' : 'Play video'}
              >
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                type="button"
                className="custom-video-btn"
                onClick={() => seekBy(-10)}
                aria-label="Go back 10 seconds"
              >
                -10s
              </button>
              <button
                type="button"
                className="custom-video-btn"
                onClick={() => seekBy(10)}
                aria-label="Go forward 10 seconds"
              >
                +10s
              </button>
              <button
                type="button"
                className="custom-video-btn note-shortcut-btn"
                onClick={openInlineNote}
                aria-label="Add note at current timestamp"
              >
                N Note
              </button>
              <button
                type="button"
                className="custom-video-btn"
                onClick={restartNoteCoverage}
                aria-label="Restart note coverage from current timestamp"
              >
                Restart coverage
              </button>
              <span className="custom-video-time">
                {formatTime(currentTime)} / {formatTime(duration)}
                <span>{formatTime(remainingDuration)} left · {playbackRate.toFixed(2).replace(/\.00$/, '')}x</span>
              </span>
              <button
                type="button"
                className="custom-video-btn"
                onClick={() => setShowWatchedRanges(value => !value)}
                aria-pressed={showWatchedRanges}
                aria-label={showWatchedRanges ? 'Hide watched clips in progress bar' : 'Show watched clips in progress bar'}
              >
                {showWatchedRanges ? 'Hide watched' : 'Show watched'}
              </button>
              <button
                type="button"
                className={`custom-video-btn ${skipNotedRanges ? 'primary' : ''}`}
                onClick={() => setSkipNotedRanges(value => !value)}
                aria-pressed={skipNotedRanges}
                aria-label={skipNotedRanges ? 'Disable jumping over noted ranges' : 'Enable jumping over noted ranges'}
              >
                {skipNotedRanges ? 'Jumping on' : 'Jump notes'}
              </button>
              {playerYouTubeId && (
                <button
                  type="button"
                  className={`custom-video-btn ${showNativeYoutubeControls ? 'primary' : ''}`}
                  onClick={() => setShowNativeYoutubeControls(value => !value)}
                  aria-pressed={showNativeYoutubeControls}
                  aria-label={showNativeYoutubeControls ? 'Use custom player controls' : 'Show YouTube native controls'}
                >
                  {showNativeYoutubeControls ? 'Custom controls' : 'YouTube controls'}
                </button>
              )}
              <button
                type="button"
                className="custom-video-btn"
                onClick={toggleFullscreen}
                aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              >
                {isFullscreen ? 'Exit' : 'Fullscreen'}
              </button>
            </div>

            <div className="remaining-progress-rail" aria-label="Remaining video progress">
              <div
                className={`remaining-progress-track ${remainingDuration <= 0 ? 'empty' : ''}`}
                role="group"
                aria-label={`Playable progress bar with ${formatTime(remainingDuration)} unwatched`}
              >
                {showWatchedRanges && watchedNoteRanges.map(range => (
                  <div
                    key={`watched-${range.start}-${range.end}`}
                    className={`remaining-progress-segment watched ${skipNotedRanges ? '' : 'rewatchable'}`}
                    style={{
                      left: `${duration > 0 ? (range.start / duration) * 100 : 0}%`,
                      width: `${duration > 0 ? ((range.end - range.start) / duration) * 100 : 0}%`,
                    }}
                    title={`Watched ${formatTime(range.start)} - ${formatTime(range.end)}`}
                    role={skipNotedRanges ? undefined : 'button'}
                    tabIndex={skipNotedRanges ? undefined : 0}
                    aria-label={skipNotedRanges ? undefined : `Replay watched range from ${formatTime(range.start)} to ${formatTime(range.end)}`}
                    aria-hidden={skipNotedRanges ? 'true' : undefined}
                    onClick={event => handleWatchedProgressClick(event, range)}
                    onKeyDown={event => {
                      if (!skipNotedRanges && (event.key === 'Enter' || event.key === ' ')) {
                        event.preventDefault();
                        pendingSkipTargetRef.current = null;
                        noteReviewRangeRef.current = { start: range.start, end: range.end };
                        seekToResolvedTime(range.start);
                      }
                    }}
                  />
                ))}
                {remainingRanges.map(range => (
                  <div
                    key={`remaining-${range.start}-${range.end}`}
                    className="remaining-progress-segment"
                    style={{
                      left: `${showWatchedRanges
                        ? (duration > 0 ? (range.start / duration) * 100 : 0)
                        : (remainingDuration > 0 ? (timeToRemainingOffset(range.start, remainingRanges) / remainingDuration) * 100 : 0)}%`,
                      width: `${showWatchedRanges
                        ? (duration > 0 ? ((range.end - range.start) / duration) * 100 : 0)
                        : (remainingDuration > 0 ? ((range.end - range.start) / remainingDuration) * 100 : 0)}%`,
                    }}
                    role="button"
                    tabIndex={0}
                    aria-label={`Play unwatched range from ${formatTime(range.start)} to ${formatTime(range.end)}`}
                    onClick={event => handleRemainingProgressClick(event, range)}
                    onKeyDown={event => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        seekToTime(range.start);
                      }
                    }}
                  />
                ))}
                {noteCoverageRange && noteCoverageWidthPct > 0.05 && (
                  <div
                    className="remaining-progress-note-coverage"
                    style={{ left: `${noteCoverageLeftPct}%`, width: `${noteCoverageWidthPct}%` }}
                    title={`Current note ${formatTime(noteCoverageRange.start)} - ${formatTime(noteCoverageRange.end)}`}
                    aria-hidden="true"
                  />
                )}
                <div className="remaining-progress-playhead" style={{ left: `${remainingPlayheadPct}%` }} />
              </div>
            </div>
          </div>

          {noteWindow && (
            <div className="fullscreen-note-overlay" role="dialog" aria-modal="true" aria-label="Save timestamp note">
              <div className="fullscreen-note-dialog">
                <div className="fullscreen-note-header">
                  <strong>{noteWindow.noteId ? 'Edit note' : 'Note'}</strong>
                  <span>{formatTime(Math.min(noteWindow.start, noteWindow.end))} - {formatTime(Math.max(noteWindow.start, noteWindow.end))}</span>
                </div>
                <textarea
                  ref={noteTextareaRef}
                  value={noteDraft}
                  onChange={event => setNoteDraft(event.target.value)}
                  onKeyDown={handleInlineNoteKeyDown}
                  placeholder="Type note..."
                  rows={5}
                />
                <div className="fullscreen-note-actions">
                  <button type="button" className="custom-video-btn" onClick={closeInlineNote}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="custom-video-btn primary"
                    onClick={handleSaveInlineNote}
                    disabled={!noteDraft.trim()}
                  >
                    {noteWindow.noteId ? 'Save changes' : 'Save note'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {clips.length > 0 && (
          <SegmentedProgressBar
            clips={clips}
            currentTime={currentTime}
            duration={duration}
            lockedClipIndex={summaryRequiredClipIndex}
            onSeek={handleSeek}
          />
        )}

        {currentClip && (
          <div className="clip-progress-panel" aria-label={`Current clip progress ${clipProgressPct}%`}>
            <div className="clip-progress-row">
              <span>Clip progress</span>
              <span>{clipProgressPct}%</span>
            </div>
            <div className="clip-progress-track">
              <div
                className="clip-progress-fill"
                style={{ width: `${clipProgressPct}%` }}
              />
            </div>
            <div className="clip-progress-meta">
              Clip {activeClipIndex + 1}: {formatTime(currentClip.startTime)} - {formatTime(currentClip.endTime)}
            </div>
          </div>
        )}

        <div className="player-controls-row">
          <div className="time-display">
            {formatTime(currentTime)} / {formatTime(duration)}
          </div>
          <div className="clip-indicator">
            {clips.length > 0 && (
              <>
                Clip {activeClipIndex + 1} of {clips.length}
                {isPlaying && <span className="playing-badge">Playing</span>}
              </>
            )}
          </div>
        </div>

        {clips[activeClipIndex] && clips[activeClipIndex].summary && (
          <div className="current-clip-summary">
            <strong>Clip {activeClipIndex + 1} summary:</strong> {clips[activeClipIndex].summary}
            {clips[activeClipIndex].lifeRecommendations?.length ? (
              <div className="current-life-recommendations">
                {clips[activeClipIndex].lifeRecommendations?.map((recommendation, index) => (
                  <p key={recommendation}><strong>{index + 1}.</strong> {recommendation}</p>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {clipsWithNotes.length ? (
          <div className="current-clip-summary current-clip-notes">
            <strong>Clip notes:</strong>
            {clipsWithNotes.map(({ clip, arrayIndex }) => (
              <div className="current-clip-note-group" key={clip.index}>
                <span className="current-clip-note-label">Clip {clip.index + 1}</span>
                {clip.notes?.map(note => (
                  <div className="current-clip-note-item" key={note.id}>
                    <button
                      type="button"
                      className="current-clip-note-jump"
                      onClick={() => handleSeekToNote(note)}
                      aria-label={`Play note from ${formatTime(note.startTime)}`}
                    >
                      <span className="current-clip-note-time">{formatTime(note.startTime)} - {formatTime(note.endTime)}</span>
                      <p>{note.text}</p>
                    </button>
                    <div className="current-clip-note-actions">
                      <button
                        type="button"
                        className="current-clip-note-edit"
                        onClick={() => openEditInlineNote(arrayIndex, note)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="current-clip-note-delete"
                        onClick={() => handleDeleteInlineNote(arrayIndex, note.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}

      </div>

      {showSummary && clips[summaryClipIndex] && (
        <SummaryModal
          clip={clips[summaryClipIndex]}
          videoTitle={video.title}
          clipText={summaryClipText}
          lifeContext={userLifeContext}
          onSave={handleSaveSummary}
          onClose={() => setShowSummary(false)}
        />
      )}

      {celebration && (
        <div key={celebration.key} className="clip-celebration" aria-live="polite">
          <div className="celebration-burst" />
          <div className="celebration-card">
            <span className="celebration-kicker">Clip {celebration.clipNumber} complete</span>
            <strong>Nice work!</strong>
            <span>Keep the streak going.</span>
          </div>
        </div>
      )}
      <MobileNav />
    </div>
  );
}
