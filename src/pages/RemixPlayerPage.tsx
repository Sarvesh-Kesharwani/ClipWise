import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '../store/useApp';
import LocalPlayer from '../components/LocalPlayer';
import YouTubePlayer from '../components/YouTubePlayer';
import SummaryModal from '../components/SummaryModal';
import type { Clip, PlayerRef, RemixClipRef, Video, Instance } from '../types';
import { formatTime } from '../utils/helpers';
import { getVideoFile } from '../utils/videoDb';
import { WatchTracker } from '../utils/watchTracker';

interface RemixItem {
  ref: RemixClipRef;
  video: Video;
  instance: Instance;
  clip: Clip;
}

export default function RemixPlayerPage() {
  const { remixId } = useParams<{ remixId: string }>();
  const navigate = useNavigate();
  const { getRemix, getVideo, getInstance, updateClip } = useApp();
  const remix = remixId ? getRemix(remixId) : undefined;
  const playerRef = useRef<PlayerRef>(null);
  const trackerRef = useRef<WatchTracker | null>(null);
  const completedRef = useRef(new Set<string>());

  const [currentIndex, setCurrentIndex] = useState(0);
  const [videoSrc, setVideoSrc] = useState('');
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [clipProgress, setClipProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryItem, setSummaryItem] = useState<RemixItem | null>(null);
  const [celebration, setCelebration] = useState<{ key: number; label: string } | null>(null);

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
  const watchedCount = items.filter(item => item.clip.watchCount > 0).length;
  const overallPct = items.length > 0 ? Math.round((watchedCount / items.length) * 100) : 0;
  const clipProgressPct = Math.round(Math.min(1, Math.max(0, clipProgress)) * 100);

  useEffect(() => {
    if (!currentItem) return;

    let objectUrl = '';
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
      setCurrentTime(currentItem.clip.startTime);
      setClipProgress(0);
    });
    trackerRef.current = new WatchTracker(currentItem.clip.duration);

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
  }, [currentItem]);

  function showClipCelebration(item: RemixItem) {
    setCelebration({ key: Date.now(), label: `${item.video.title} clip ${item.clip.index + 1}` });
    window.setTimeout(() => setCelebration(null), 1300);
  }

  function completeCurrentClip(item: RemixItem) {
    const completionKey = item.ref.id;
    if (completedRef.current.has(completionKey)) return;

    completedRef.current.add(completionKey);
    updateClip(item.instance.id, item.clip.index, { watchCount: item.clip.watchCount + 1 });
    setClipProgress(1);
    showClipCelebration(item);

    if (!item.clip.summary.trim()) {
      playerRef.current?.pause();
      setSummaryItem({ ...item, clip: { ...item.clip, watchCount: item.clip.watchCount + 1 } });
      window.setTimeout(() => setShowSummary(true), 650);
      return;
    }

    window.setTimeout(() => goToNextClip(), 850);
  }

  function goToNextClip() {
    setShowSummary(false);
    setSummaryItem(null);
    setIsPlaying(false);
    setCurrentIndex(prev => Math.min(prev + 1, Math.max(items.length - 1, 0)));
  }

  function goToPreviousClip() {
    setShowSummary(false);
    setSummaryItem(null);
    setIsPlaying(false);
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  }

  function handleReady() {
    if (!currentItem) return;
    setCurrentTime(currentItem.clip.startTime);
    playerRef.current?.seek(currentItem.clip.startTime);
    window.setTimeout(() => playerRef.current?.play(), 120);
  }

  function handleTimeUpdate(time: number) {
    if (!currentItem) return;

    if (time < currentItem.clip.startTime - 0.5) {
      playerRef.current?.seek(currentItem.clip.startTime);
      return;
    }

    setCurrentTime(time);
    const timeInClip = Math.max(0, Math.min(currentItem.clip.duration, time - currentItem.clip.startTime));
    trackerRef.current?.update(timeInClip);
    setClipProgress(trackerRef.current?.getProgress() ?? 0);

    if (trackerRef.current?.isComplete()) {
      completeCurrentClip(currentItem);
      return;
    }

    if (time >= currentItem.clip.endTime - 0.2) {
      playerRef.current?.seek(Math.max(currentItem.clip.startTime, currentItem.clip.endTime - 0.25));
      playerRef.current?.pause();
    }
  }

  function handleSaveSummary(text: string) {
    if (summaryItem) {
      updateClip(summaryItem.instance.id, summaryItem.clip.index, { summary: text });
    }
    setShowSummary(false);
    setSummaryItem(null);
    goToNextClip();
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

  return (
    <div className="player-page remix-player-page">
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
            <div className="overall-fill watched-fill" style={{ width: `${overallPct}%` }} />
          </div>
          <span className="overall-text">{watchedCount}/{items.length} source clips watched</span>
        </div>
        <div className="remix-queue">
          {items.map((item, index) => (
            <button
              key={item.ref.id}
              className={`remix-queue-item ${index === currentIndex ? 'active' : ''}`}
              onClick={() => setCurrentIndex(index)}
            >
              <span>#{index + 1}</span>
              <strong>{item.video.title}</strong>
              <small>{formatTime(item.clip.startTime)} - {formatTime(item.clip.endTime)}</small>
            </button>
          ))}
        </div>
      </aside>

      <main className="player-main">
        <div className="remix-now-playing">
          <span>Now playing</span>
          <strong>{currentItem.video.title}</strong>
          <small>{currentItem.instance.name} - Clip {currentItem.clip.index + 1}</small>
        </div>

        <div className="player-video-container">
          {currentItem.video.source === 'local' ? (
            <LocalPlayer
              key={currentItem.ref.id}
              ref={playerRef}
              src={videoSrc}
              onTimeUpdate={handleTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onReady={handleReady}
              onEnded={() => completeCurrentClip(currentItem)}
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
              onEnded={() => completeCurrentClip(currentItem)}
            />
          )}
        </div>

        <div className="clip-progress-panel" aria-label={`Current remix clip progress ${clipProgressPct}%`}>
          <div className="clip-progress-row">
            <span>Remix clip progress</span>
            <span>{clipProgressPct}%</span>
          </div>
          <div className="clip-progress-track">
            <div className="clip-progress-fill remix-progress-fill" style={{ width: `${clipProgressPct}%` }} />
          </div>
          <div className="clip-progress-meta">
            {formatTime(currentTime)} / {formatTime(currentItem.clip.endTime)}
          </div>
        </div>

        <div className="player-controls-row">
          <button className="btn-secondary" onClick={goToPreviousClip} disabled={currentIndex === 0}>
            Previous
          </button>
          <div className="clip-indicator">
            Clip {currentIndex + 1} of {items.length}
            {isPlaying && <span className="playing-badge">Playing</span>}
          </div>
          <button
            className="btn-primary"
            onClick={goToNextClip}
            disabled={currentIndex >= items.length - 1}
          >
            Next
          </button>
        </div>
      </main>

      {showSummary && summaryItem && (
        <SummaryModal
          clip={summaryItem.clip}
          onSave={handleSaveSummary}
          onClose={() => {
            setShowSummary(false);
            setSummaryItem(null);
          }}
        />
      )}

      {celebration && (
        <div key={celebration.key} className="clip-celebration" aria-live="polite">
          <div className="celebration-burst" />
          <div className="celebration-card">
            <span className="celebration-kicker">Remix clip complete</span>
            <strong>Nice work!</strong>
            <span>{celebration.label}</span>
          </div>
        </div>
      )}
    </div>
  );
}
