import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApp } from '../store/AppContext';
import LocalPlayer from '../components/LocalPlayer';
import YouTubePlayer from '../components/YouTubePlayer';
import ClipPanel from '../components/ClipPanel';
import SegmentedProgressBar from '../components/SegmentedProgressBar';
import SummaryModal from '../components/SummaryModal';
import type { PlayerRef } from '../types';
import { WatchTracker } from '../utils/watchTracker';
import { getVideoFile } from '../utils/videoDb';
import { formatTime } from '../utils/helpers';

export default function PlayerPage() {
  const { instanceId } = useParams<{ instanceId: string }>();
  const navigate = useNavigate();
  const { getInstance, getVideo, updateClip, generateClips, updateVideo } = useApp();

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

  const trackersRef = useRef(new Map<number, WatchTracker>());
  const countedRef = useRef(new Set<number>());
  const prevClipRef = useRef(-1);

  const clips = instance?.clips || [];

  // Load local video file from IndexedDB
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
    } else {
      setLoading(false);
    }
  }, [video?.id, video?.source]);

  // Generate clips when duration becomes available
  useEffect(() => {
    if (instance && duration > 0 && instance.clips.length === 0) {
      generateClips(instance.id, duration);
    }
  }, [instance?.id, instance?.clips.length, duration, generateClips]);

  // Update video duration if not yet known
  useEffect(() => {
    if (video && video.duration === 0 && duration > 0) {
      updateVideo({ ...video, duration });
    }
  }, [video, duration, updateVideo]);

  const getClipIndexForTime = useCallback((time: number): number => {
    if (!clips.length) return 0;
    for (let i = 0; i < clips.length; i++) {
      if (time >= clips[i].startTime && time < clips[i].endTime) {
        return i;
      }
    }
    return clips.length - 1;
  }, [clips]);

  const handleTimeUpdate = useCallback((time: number) => {
    setCurrentTime(time);

    if (!clips.length || !instance) return;

    const clipIdx = getClipIndexForTime(time);

    // Clip changed — reset tracker for new clip
    if (clipIdx !== prevClipRef.current) {
      if (prevClipRef.current >= 0) {
        trackersRef.current.delete(prevClipRef.current);
        countedRef.current.delete(prevClipRef.current);
      }
      prevClipRef.current = clipIdx;
      setActiveClipIndex(clipIdx);
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

    if (tracker.isComplete() && !countedRef.current.has(clipIdx)) {
      countedRef.current.add(clipIdx);
      updateClip(instance.id, clipIdx, { watchCount: clip.watchCount + 1 });
    }
  }, [clips, instance, getClipIndexForTime, updateClip]);

  function handleReady(dur: number) {
    setDuration(dur);
  }

  function seekToTime(time: number) {
    // Reset tracker state for the new position so tracking starts fresh
    const newClipIdx = getClipIndexForTime(time);
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

    playerRef.current?.seek(time);
    playerRef.current?.play();
  }

  function handleSeekToClip(index: number) {
    if (clips[index]) {
      seekToTime(clips[index].startTime);
    }
  }

  function handleSeek(time: number) {
    seekToTime(time);
  }

  function openSummary(clipIndex: number) {
    setSummaryClipIndex(clipIndex);
    setShowSummary(true);
  }

  function handleSaveSummary(text: string) {
    if (summaryClipIndex >= 0 && instance) {
      updateClip(instance.id, summaryClipIndex, { summary: text });
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

  return (
    <div className="player-page">
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
              {watchedCount}/{clips.length} watched · {summarizedCount}/{clips.length} noted
            </span>
          </div>
        )}
        <ClipPanel
          clips={clips}
          activeClipIndex={activeClipIndex}
          onClipClick={handleSeekToClip}
          onSummaryClick={openSummary}
        />
      </div>

      <div className="player-main">
        <div className="player-video-container">
          {video.source === 'local' ? (
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
              videoId={video.youtubeId!}
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
            onSeek={handleSeek}
          />
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
            <strong>Clip {activeClipIndex + 1} note:</strong> {clips[activeClipIndex].summary}
          </div>
        )}
      </div>

      {showSummary && clips[summaryClipIndex] && (
        <SummaryModal
          clip={clips[summaryClipIndex]}
          onSave={handleSaveSummary}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}
