import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../store/useApp';
import LocalPlayer from '../components/LocalPlayer';
import YouTubePlayer from '../components/YouTubePlayer';
import ClipPanel from '../components/ClipPanel';
import SummaryModal from '../components/SummaryModal';
import MobileNav from '../components/MobileNav';
import type { Clip, Instance, PlayerRef, RemixClipRef, Video } from '../types';
import { formatTime } from '../utils/helpers';
import { getVideoFile } from '../utils/videoDb';
import { WatchTracker } from '../utils/watchTracker';
import { fetchYouTubeTranscript } from '../utils/youtube';
import { LIFE_RECOMMENDATIONS_VERSION } from '../utils/lifeRecommendations';

const CELEBRATION_DURATION_MS = 1600;
const SUMMARY_PROMPT_DELAY_MS = 900;

interface RemixItem {
  ref: RemixClipRef;
  video: Video;
  instance: Instance;
  clip: Clip;
}

export default function RemixPlayerPage() {
  const { remixId } = useParams<{ remixId: string }>();
  const navigate = useNavigate();
  const {
    getRemix,
    getVideo,
    getInstance,
    updateClip,
    updateVideo,
    recordClipWatched,
    recordClipSummarized,
    userLifeContext,
  } = useApp();
  const remix = remixId ? getRemix(remixId) : undefined;

  const playerRef = useRef<PlayerRef>(null);
  const trackerRef = useRef<WatchTracker | null>(null);
  const countedRef = useRef(new Set<string>());
  const celebrationTimerRef = useRef<number | null>(null);
  const summaryTimerRef = useRef<number | null>(null);
  const seekingRef = useRef(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [videoSrc, setVideoSrc] = useState('');
  const [loading, setLoading] = useState(true);
  const [clipProgress, setClipProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryClipIndex, setSummaryClipIndex] = useState(-1);
  const [celebration, setCelebration] = useState<{ key: number; clipNumber: number } | null>(null);

  const items = useMemo<RemixItem[]>(() => {
    if (!remix) return [];
    return remix.clipRefs
      .map(ref => {
        const video = getVideo(ref.videoId);
        const instance = getInstance(ref.instanceId);
        const clip = instance?.clips.find(sourceClip => sourceClip.index === ref.clipIndex);
        return video && instance && clip ? { ref, video, instance, clip } : null;
      })
      .filter((item): item is RemixItem => Boolean(item));
  }, [remix, getVideo, getInstance]);

  const currentItem = items[currentIndex];
  const currentRefId = currentItem?.ref.id;
  const remixClips = useMemo<Clip[]>(
    () => items.map((item, index) => ({ ...item.clip, index })),
    [items],
  );

  function needsSummary(clip: Clip | undefined): clip is Clip {
    return Boolean(clip && clip.watchCount > 0 && !clip.summary.trim());
  }

  function openSummary(index: number) {
    setSummaryClipIndex(index);
    setShowSummary(true);
  }

  function triggerCelebration(index: number) {
    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current);
    }

    setCelebration({ key: Date.now(), clipNumber: index + 1 });
    celebrationTimerRef.current = window.setTimeout(() => {
      setCelebration(null);
      celebrationTimerRef.current = null;
    }, CELEBRATION_DURATION_MS);
  }

  function openSummaryAfterCelebration(index: number) {
    if (summaryTimerRef.current !== null) {
      window.clearTimeout(summaryTimerRef.current);
    }

    summaryTimerRef.current = window.setTimeout(() => {
      openSummary(index);
      summaryTimerRef.current = null;
    }, SUMMARY_PROMPT_DELAY_MS);
  }

  function requireSummaryBeforeLeaving(fromIndex: number, toIndex: number): boolean {
    if (fromIndex === toIndex) return false;

    const fromClip = remixClips[fromIndex];
    if (!needsSummary(fromClip)) return false;

    playerRef.current?.pause();
    openSummary(fromIndex);
    return true;
  }

  function seekToRemixIndex(index: number) {
    const nextItem = items[index];
    if (!nextItem) return;
    if (requireSummaryBeforeLeaving(currentIndex, index)) return;

    seekingRef.current = true;
    setCurrentIndex(index);
    setClipProgress(0);
    setIsPlaying(false);

    window.setTimeout(() => {
      seekingRef.current = false;
    }, 250);
  }

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

  useEffect(() => {
    if (!currentItem) return;

    let objectUrl = '';
    let cancelled = false;
    countedRef.current.delete(currentItem.ref.id);
    trackerRef.current = new WatchTracker(currentItem.clip.duration);

    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setClipProgress(0);
      setShowSummary(false);
      setSummaryClipIndex(-1);
    });

    if (currentItem.video.source === 'local') {
      getVideoFile(currentItem.video.id).then(file => {
        if (cancelled) return;
        if (file) {
          objectUrl = URL.createObjectURL(file);
          setVideoSrc(objectUrl);
        } else {
          setVideoSrc('');
        }
        setLoading(false);
      });
    } else if (currentItem.video.source === 'youlearn') {
      queueMicrotask(() => {
        if (!cancelled) {
          setVideoSrc(currentItem.video.externalUrl ?? '');
          setLoading(false);
        }
      });
    } else {
      queueMicrotask(() => {
        if (!cancelled) {
          setVideoSrc('');
          setLoading(false);
        }
      });
    }

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [currentRefId, currentItem]);

  useEffect(() => {
    if (!currentItem?.video.youtubeId || currentItem.video.source !== 'youtube' || currentItem.video.youlearnTranscript?.length) return;
    let cancelled = false;

    fetchYouTubeTranscript(currentItem.video.youtubeId).then(transcript => {
      if (cancelled || transcript.length === 0) return;
      updateVideo({ ...currentItem.video, youlearnTranscript: transcript });
    });

    return () => {
      cancelled = true;
    };
  }, [currentItem, updateVideo]);

  function completeCurrentClip(item: RemixItem, index: number) {
    if (countedRef.current.has(item.ref.id)) return;

    countedRef.current.add(item.ref.id);
    updateClip(item.instance.id, item.clip.index, { watchCount: item.clip.watchCount + 1 });
    recordClipWatched(item.video.id);
    setClipProgress(1);
    triggerCelebration(index);

    if (!item.clip.summary.trim()) {
      playerRef.current?.pause();
      openSummaryAfterCelebration(index);
      return;
    }

    if (index < items.length - 1) {
      window.setTimeout(() => {
        seekToRemixIndex(index + 1);
      }, 850);
    }
  }

  function handleReady() {
    if (!currentItem) return;
    playerRef.current?.seek(currentItem.clip.startTime);
    window.setTimeout(() => playerRef.current?.play(), 120);
  }

  function handleTimeUpdate(time: number) {
    if (!currentItem || seekingRef.current) return;

    if (time < currentItem.clip.startTime - 0.5) {
      playerRef.current?.seek(currentItem.clip.startTime);
      return;
    }

    const timeInClip = Math.max(0, Math.min(currentItem.clip.duration, time - currentItem.clip.startTime));
    trackerRef.current?.update(timeInClip);
    setClipProgress(trackerRef.current?.getProgress() ?? 0);

    if (trackerRef.current?.isComplete()) {
      completeCurrentClip(currentItem, currentIndex);
      return;
    }

    if (time >= currentItem.clip.endTime - 0.2) {
      playerRef.current?.seek(Math.max(currentItem.clip.startTime, currentItem.clip.endTime - 0.25));
      playerRef.current?.pause();
    }
  }

  function handleSaveSummary(text: string, lifeRecommendations: string[], lifeContextSnapshot: string) {
    const summaryItem = items[summaryClipIndex];
    if (!summaryItem) return;
    const wasUnsummarized = !summaryItem.clip.summary.trim();
    updateClip(summaryItem.instance.id, summaryItem.clip.index, {
      summary: text,
      lifeRecommendations,
      lifeContextSnapshot,
      lifeRecommendationsVersion: LIFE_RECOMMENDATIONS_VERSION,
    });
    if (wasUnsummarized) {
      recordClipSummarized(summaryItem.video.id);
    }
    setShowSummary(false);
  }

  if (!remix) {
    return (
      <div className="player-error">
        <h2>Remix not found</h2>
        <button className="btn-primary" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    );
  }

  if (items.length === 0 || !currentItem) {
    return (
      <div className="player-error">
        <h2>This remix has no playable clips</h2>
        <button className="btn-primary" onClick={() => navigate('/')}>Back to Dashboard</button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="player-loading">
        <div className="spinner" />
        <p>Loading remix...</p>
      </div>
    );
  }

  const watchedCount = remixClips.filter(clip => clip.watchCount > 0).length;
  const summarizedCount = remixClips.filter(clip => clip.summary.trim()).length;
  const summaryRequiredClip = remixClips[currentIndex];
  const summaryRequiredClipIndex = needsSummary(summaryRequiredClip) ? summaryRequiredClip.index : null;
  const currentClip = remixClips[currentIndex];
  const summaryItem = items[summaryClipIndex];
  const summaryClipText = summaryItem?.video.youlearnTranscript?.length
    ? summaryItem.video.youlearnTranscript
      .filter(segment =>
        segment.startTime >= summaryItem.clip.startTime && segment.startTime < summaryItem.clip.endTime
      )
      .map(segment => segment.text)
      .join(' ')
    : '';
  const clipProgressPct = Math.round(Math.min(1, Math.max(0, clipProgress)) * 100);

  return (
    <div className="cw-page player-page remix-player-page">
      <aside className="player-sidebar remix-sidebar">
        <button className="back-btn" onClick={() => navigate('/')}>
          Back to Dashboard
        </button>
        <div className="sidebar-title">
          <h2>{remix.title}</h2>
          <span className="sidebar-meta">{items.length} mixed clips</span>
        </div>
        <div className="sidebar-overall">
          <div className="overall-bar">
            <div className="overall-fill watched-fill" style={{ width: `${(watchedCount / items.length) * 100}%` }} />
          </div>
          <span className="overall-text">
            {watchedCount}/{items.length} watched · {summarizedCount}/{items.length} summaries
          </span>
        </div>
        <ClipPanel
          clips={remixClips}
          activeClipIndex={currentIndex}
          lockedClipIndex={summaryRequiredClipIndex}
          onClipClick={seekToRemixIndex}
          onSummaryClick={openSummary}
        />
      </aside>

      <main className="player-main">
        <div className="remix-now-playing">
          <span>Now playing</span>
          <strong>{currentItem.video.title}</strong>
          <small>{currentItem.instance.name} · Clip {currentItem.clip.index + 1}</small>
        </div>

        <div className="player-video-container">
          {currentItem.video.source === 'local' || currentItem.video.source === 'youlearn' ? (
            <LocalPlayer
              key={currentItem.ref.id}
              ref={playerRef}
              src={videoSrc}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onReady={handleReady}
              onEnded={() => completeCurrentClip(currentItem, currentIndex)}
            />
          ) : (
            <YouTubePlayer
              key={currentItem.ref.id}
              ref={playerRef}
              videoId={currentItem.video.youtubeId!}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onReady={handleReady}
              onEnded={() => completeCurrentClip(currentItem, currentIndex)}
            />
          )}
        </div>

        {currentClip && (
          <div className="clip-progress-panel" aria-label={`Current remix clip progress ${clipProgressPct}%`}>
            <div className="clip-progress-row">
              <span>Remix clip progress</span>
              <span>{clipProgressPct}%</span>
            </div>
            <div className="clip-progress-track">
              <div className="clip-progress-fill remix-progress-fill" style={{ width: `${clipProgressPct}%` }} />
            </div>
            <div className="clip-progress-meta">
              Mix clip {currentIndex + 1}: {formatTime(currentClip.startTime)} - {formatTime(currentClip.endTime)}
            </div>
          </div>
        )}

        <div className="player-controls-row">
          <button className="btn-secondary" onClick={() => seekToRemixIndex(currentIndex - 1)} disabled={currentIndex === 0}>
            Previous
          </button>
          <div className="clip-indicator">
            Clip {currentIndex + 1} of {items.length}
            {isPlaying && <span className="playing-badge">Playing</span>}
          </div>
          <button
            className="btn-primary"
            onClick={() => seekToRemixIndex(currentIndex + 1)}
            disabled={currentIndex >= items.length - 1}
          >
            Next
          </button>
        </div>

        {currentItem.clip.summary && (
          <div className="current-clip-summary">
            <strong>Clip {currentIndex + 1} summary:</strong> {currentItem.clip.summary}
            {currentItem.clip.lifeRecommendations?.length ? (
              <div className="current-life-recommendations">
                {currentItem.clip.lifeRecommendations.map((recommendation, index) => (
                  <p key={recommendation}><strong>{index + 1}.</strong> {recommendation}</p>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </main>

      {showSummary && remixClips[summaryClipIndex] && (
        <SummaryModal
          clip={remixClips[summaryClipIndex]}
          videoTitle={summaryItem?.video.title}
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
            <span className="celebration-kicker">Remix clip {celebration.clipNumber} complete</span>
            <strong>Nice work!</strong>
            <span>Keep the streak going.</span>
          </div>
        </div>
      )}
      <MobileNav />
    </div>
  );
}
