import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../store/useApp';
import LocalPlayer from '../components/LocalPlayer';
import YouTubePlayer from '../components/YouTubePlayer';
import ClipPanel from '../components/ClipPanel';
import SegmentedProgressBar from '../components/SegmentedProgressBar';
import SummaryModal from '../components/SummaryModal';
import MobileNav from '../components/MobileNav';
import type { Clip, PlayerRef } from '../types';
import { WatchTracker } from '../utils/watchTracker';
import { getVideoFile } from '../utils/videoDb';
import { formatTime } from '../utils/helpers';
import { fetchYouLearnTranscript } from '../utils/youlearn';
import { extractYouTubeId, fetchYouTubeTranscript } from '../utils/youtube';
import { LIFE_RECOMMENDATIONS_VERSION } from '../utils/lifeRecommendations';

const CELEBRATION_DURATION_MS = 1600;
const SUMMARY_PROMPT_DELAY_MS = 900;

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
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryClipIndex, setSummaryClipIndex] = useState(-1);
  const [videoSrc, setVideoSrc] = useState('');
  const [loading, setLoading] = useState(true);
  const [clipWatchProgress, setClipWatchProgress] = useState(0);
  const [celebration, setCelebration] = useState<{ key: number; clipNumber: number } | null>(null);

  const trackersRef = useRef(new Map<number, WatchTracker>());
  const countedRef = useRef(new Set<number>());
  const prevClipRef = useRef(-1);
  const seekingRef = useRef(false);
  const celebrationTimerRef = useRef<number | null>(null);
  const summaryTimerRef = useRef<number | null>(null);

  const clips = useMemo(() => instance?.clips || [], [instance?.clips]);

  function needsSummary(clip: Clip | undefined): clip is Clip {
    return Boolean(clip && clip.watchCount > 0 && !clip.summary.trim());
  }

  function openSummary(clipIndex: number) {
    setSummaryClipIndex(clipIndex);
    setShowSummary(true);
  }

  function triggerCelebration(clipIndex: number) {
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
    }

    setCelebration({ key: Date.now(), clipNumber: clipIndex + 1 });
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
    };
  }, []);

  const getClipIndexForTime = useCallback((time: number): number => {
    if (!clips.length) return 0;
    for (let i = 0; i < clips.length; i++) {
      if (time >= clips[i].startTime && time < clips[i].endTime) {
        return i;
      }
    }
    return clips.length - 1;
  }, [clips]);

  function handleTimeUpdate(time: number) {
    // Skip stale time updates that arrive during a pending seek
    if (seekingRef.current) return;

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
  }

  function seekToTime(time: number) {
    // Reset tracker state for the new position so tracking starts fresh
    const newClipIdx = getClipIndexForTime(time);
    if (requireSummaryBeforeLeaving(activeClipIndex, newClipIdx)) return;

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
    setCurrentTime(time);

    playerRef.current?.seek(time);
    playerRef.current?.play();

    // Allow time updates again after seek settles
    setTimeout(() => { seekingRef.current = false; }, 500);
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
  const summaryClip = clips[summaryClipIndex];
  const currentTranscript = video?.youlearnTranscript?.length && currentClip
    ? video.youlearnTranscript.filter(segment =>
      segment.startTime >= currentClip.startTime && segment.startTime < currentClip.endTime
    )
    : [];
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
        <div className="player-video-container">
          {useFilePlayer ? (
            <LocalPlayer
              ref={playerRef}
              src={videoSrc}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onReady={handleReady}
              onEnded={() => setIsPlaying(false)}
            />
          ) : (
            <YouTubePlayer
              ref={playerRef}
              videoId={playerYouTubeId!}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onReady={handleReady}
              onEnded={() => setIsPlaying(false)}
            />
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

        {currentTranscript.length > 0 && (
          <div className="current-clip-transcript">
            <strong>Transcript:</strong>
            <p>{currentTranscript.map(segment => segment.text).join(' ')}</p>
          </div>
        )}
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
