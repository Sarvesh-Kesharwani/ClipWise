import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import YouTubePlayer from '../YouTubePlayer';
import type { PlayerRef, Video } from '../../types';
import { formatTime } from '../../utils/helpers';
import { getVideoFile } from '../../utils/videoDb';
import type { FeedClip } from './feedClips';

interface Props {
  listName: string;
  clipSize: number;
  clips: FeedClip[];
  activeClipId: string;
  preferSound?: boolean;
  onActiveClipChange: (clipId: string) => void;
  onExit: () => void;
  onHome: () => void;
  onSettings?: () => void;
  onClipComplete: (videoId: string) => void;
}

export default function ClipPlayer({
  listName,
  clipSize,
  clips,
  activeClipId,
  preferSound = false,
  onActiveClipChange,
  onExit,
  onHome,
  onSettings,
  onClipComplete,
}: Props) {
  const effectiveActiveClipId = activeClipId || clips[0]?.id || '';

  function scrollToClip(offset: number) {
    const activeIndex = clips.findIndex(clip => clip.id === effectiveActiveClipId);
    const nextClip = clips[activeIndex + offset];
    if (!nextClip) return;
    document.getElementById(nextClip.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    onActiveClipChange(nextClip.id);
  }

  return (
    <div className="feed-reels-page">
      <div className="feed-reels-topbar">
        <button className="feed-icon-btn" onClick={onExit} aria-label="Exit feed">Back</button>
        <div>
          <strong>{listName}</strong>
          <span>{clipSize}s clips</span>
        </div>
        <div className="feed-reels-topbar-actions">
          {onSettings && (
            <button className="feed-icon-btn" onClick={onSettings} aria-label="Feed settings" title="Feed settings">
              &#9881;
            </button>
          )}
          <button className="feed-icon-btn" onClick={onHome} aria-label="Dashboard">Home</button>
        </div>
      </div>

      <div className="feed-reels-scroll" aria-label={`${listName} feed`}>
        {clips.map((clip, index) => (
          <FeedClipCard
            key={clip.id}
            clip={clip}
            listName={listName}
            clipNumber={index + 1}
            totalClips={clips.length}
            active={effectiveActiveClipId === clip.id}
            preferSound={preferSound}
            preload={effectiveActiveClipId === clip.id || clips[index - 1]?.id === effectiveActiveClipId || clips[index + 1]?.id === effectiveActiveClipId}
            onActive={() => onActiveClipChange(clip.id)}
            onPrev={() => scrollToClip(-1)}
            onNext={() => scrollToClip(1)}
            onClipComplete={onClipComplete}
          />
        ))}
      </div>
    </div>
  );
}

function FeedClipCard({
  clip,
  listName,
  clipNumber,
  totalClips,
  active,
  preferSound,
  preload,
  onActive,
  onPrev,
  onNext,
  onClipComplete,
}: {
  clip: FeedClip;
  listName: string;
  clipNumber: number;
  totalClips: number;
  active: boolean;
  preferSound: boolean;
  preload: boolean;
  onActive: () => void;
  onPrev: () => void;
  onNext: () => void;
  onClipComplete: (videoId: string) => void;
}) {
  const cardRef = useRef<HTMLElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const youtubeRef = useRef<PlayerRef>(null);
  const completedRef = useRef(false);
  const progressRef = useRef<HTMLDivElement>(null);
  const defaultMuted = !preferSound;
  const mutedRef = useRef(defaultMuted);
  const [mediaSrc, setMediaSrc] = useState('');
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(defaultMuted);
  const [currentTime, setCurrentTime] = useState(clip.startTime);
  const [scrubbing, setScrubbing] = useState(false);

  const setMutedState = useCallback((value: boolean) => {
    mutedRef.current = value;
    setMuted(value);
  }, []);

  useEffect(() => {
    completedRef.current = false;
    queueMicrotask(() => setCurrentTime(clip.startTime));
  }, [clip.id, clip.startTime]);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && entry.intersectionRatio >= 0.65) onActive();
    }, { threshold: [0.65] });
    observer.observe(card);
    return () => observer.disconnect();
  }, [onActive]);

  useEffect(() => {
    if (!preload) return;

    if (clip.video.source === 'youlearn') {
      queueMicrotask(() => setMediaSrc(clip.video.externalUrl ?? ''));
      return () => setMediaSrc('');
    }

    if (clip.video.source !== 'local') return;

    let revoked = false;
    getVideoFile(clip.video.id).then(file => {
      if (!file || revoked) return;
      const url = URL.createObjectURL(file);
      setMediaSrc(previous => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    });
    return () => {
      revoked = true;
      setMediaSrc(previous => {
        if (previous) URL.revokeObjectURL(previous);
        return '';
      });
    };
  }, [clip.video.externalUrl, clip.video.id, clip.video.source, preload]);

  useEffect(() => {
    if (!active) {
      localVideoRef.current?.pause();
      youtubeRef.current?.pause();
      if (localVideoRef.current) localVideoRef.current.muted = true;
      youtubeRef.current?.mute?.();
      mutedRef.current = defaultMuted;
      queueMicrotask(() => {
        setMuted(defaultMuted);
        setPaused(true);
      });
      return;
    }

    if ((clip.video.source === 'local' || clip.video.source === 'youlearn') && localVideoRef.current && mediaSrc) {
      localVideoRef.current.currentTime = clip.startTime;
      localVideoRef.current.muted = mutedRef.current;
      void localVideoRef.current.play()
        .then(() => setPaused(false))
        .catch(() => {
          if (!localVideoRef.current || localVideoRef.current.muted) {
            setPaused(true);
            return;
          }
          localVideoRef.current.muted = true;
          setMutedState(true);
          void localVideoRef.current.play().then(() => setPaused(false)).catch(() => setPaused(true));
        });
    } else if (clip.video.source === 'youtube') {
      if (mutedRef.current) youtubeRef.current?.mute?.();
      else youtubeRef.current?.unMute?.();
      youtubeRef.current?.seek(clip.startTime);
      youtubeRef.current?.play();
      queueMicrotask(() => setPaused(false));
    }
  }, [active, clip.startTime, clip.video.source, mediaSrc, defaultMuted, setMutedState]);

  function completeClip() {
    if (completedRef.current) return;
    completedRef.current = true;
    onClipComplete(clip.video.id);
  }

  function playMedia() {
    if (clip.video.source === 'local' || clip.video.source === 'youlearn') {
      const player = localVideoRef.current;
      if (!player) return;
      void player.play().then(() => setPaused(false)).catch(() => setPaused(true));
      return;
    }

    youtubeRef.current?.play();
    setPaused(false);
  }

  function pauseMedia() {
    localVideoRef.current?.pause();
    youtubeRef.current?.pause();
    setPaused(true);
  }

  function seekTo(time: number) {
    const nextTime = Math.max(clip.startTime, Math.min(clip.endTime - 0.05, time));
    setCurrentTime(nextTime);
    if (clip.video.source === 'local' || clip.video.source === 'youlearn') {
      if (localVideoRef.current) localVideoRef.current.currentTime = nextTime;
    } else {
      youtubeRef.current?.seek(nextTime);
    }
  }

  function seekFromClientX(clientX: number) {
    const track = progressRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
    seekTo(clip.startTime + pct * clip.duration);
  }

  function handleMediaTap() {
    if (!active) return;
    if (paused) playMedia();
    else pauseMedia();
  }

  function handleProgressPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!active) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubbing(true);
    seekFromClientX(event.clientX);
  }

  function handleProgressPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!scrubbing) return;
    event.preventDefault();
    event.stopPropagation();
    seekFromClientX(event.clientX);
  }

  function handleProgressPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!scrubbing) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setScrubbing(false);
    seekFromClientX(event.clientX);
  }

  function togglePlay() {
    if (clip.video.source === 'local' || clip.video.source === 'youlearn') {
      const player = localVideoRef.current;
      if (!player) return;
      if (player.muted) {
        player.muted = false;
        setMutedState(false);
        if (player.paused) {
          void player.play().then(() => setPaused(false)).catch(() => setPaused(true));
        } else {
          setPaused(false);
        }
        return;
      }
      if (player.paused) {
        void player.play().then(() => setPaused(false)).catch(() => setPaused(true));
      } else {
        player.pause();
        setPaused(true);
      }
      return;
    }

    if (muted) {
      youtubeRef.current?.unMute?.();
      youtubeRef.current?.play();
      setMutedState(false);
      setPaused(false);
      return;
    }

    if (paused) {
      youtubeRef.current?.play();
      setPaused(false);
    } else {
      youtubeRef.current?.pause();
      setPaused(true);
    }
  }

  function handleTimeUpdate(time: number) {
    setCurrentTime(time);
    if (time >= clip.endTime - 0.1) {
      completeClip();
      localVideoRef.current?.pause();
      youtubeRef.current?.pause();
      setPaused(true);
    }
  }

  const progress = Math.max(0, Math.min(100, ((currentTime - clip.startTime) / Math.max(1, clip.duration)) * 100));

  return (
    <section ref={cardRef} id={clip.id} className="feed-clip-card">
      <div className="feed-media-frame">
        {clip.video.source === 'local' || clip.video.source === 'youlearn' ? (
          preload && mediaSrc ? (
            <video
              ref={localVideoRef}
              className="feed-local-video"
              src={mediaSrc}
              preload={active ? 'auto' : 'metadata'}
              autoPlay={active}
              muted={muted}
              playsInline
              onLoadedMetadata={event => {
                const player = event.currentTarget;
                player.currentTime = clip.startTime;
                player.muted = muted;
                if (active) {
                  void player.play()
                    .then(() => setPaused(false))
                    .catch(() => {
                      if (player.muted) {
                        setPaused(true);
                        return;
                      }
                      player.muted = true;
                      setMutedState(true);
                      void player.play().then(() => setPaused(false)).catch(() => setPaused(true));
                    });
                }
              }}
              onTimeUpdate={event => handleTimeUpdate(event.currentTarget.currentTime)}
              onPlay={() => setPaused(false)}
              onPause={() => setPaused(true)}
            />
          ) : (
            <FeedPoster video={clip.video} />
          )
        ) : preload ? (
          <YouTubePlayer
            ref={youtubeRef}
            videoId={clip.video.youtubeId!}
            autoPlay={active}
            muted={muted}
            onTimeUpdate={handleTimeUpdate}
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
            onReady={() => {
              if (active) {
                youtubeRef.current?.seek(clip.startTime);
                youtubeRef.current?.play();
              }
            }}
            onEnded={completeClip}
          />
        ) : (
          <FeedPoster video={clip.video} />
        )}

        <button className="feed-tap-zone" type="button" aria-label={paused ? 'Play clip' : 'Pause clip'} onClick={handleMediaTap} />
        <div className="feed-gradient" />
        <div
          ref={progressRef}
          className={`feed-progress-track ${scrubbing ? 'scrubbing' : ''}`}
          role="slider"
          aria-label="Clip progress"
          aria-valuemin={0}
          aria-valuemax={Math.round(clip.duration)}
          aria-valuenow={Math.round(Math.max(0, currentTime - clip.startTime))}
          tabIndex={0}
          onPointerDown={handleProgressPointerDown}
          onPointerMove={handleProgressPointerMove}
          onPointerUp={handleProgressPointerUp}
          onPointerCancel={handleProgressPointerUp}
        >
          <div className="feed-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="feed-overlay-copy">
          <span>{listName}</span>
          <h2>{clip.video.title}</h2>
          <p>Clip {clip.index + 1} · {formatTime(clip.startTime)} - {formatTime(clip.endTime)}</p>
        </div>

        <div className="feed-overlay-controls">
          <button className="feed-control-btn" onClick={onPrev} aria-label="Previous clip">Prev</button>
          <button className="feed-play-btn" onClick={togglePlay} aria-label={muted ? 'Turn sound on' : paused ? 'Play clip' : 'Pause clip'}>
            {muted ? 'Sound' : paused ? 'Play' : 'Pause'}
          </button>
          <button className="feed-control-btn" onClick={onNext} aria-label="Next clip">Next</button>
        </div>

        <div className="feed-clip-count">{clipNumber}/{totalClips}</div>
      </div>
    </section>
  );
}

function FeedPoster({ video }: { video: Video }) {
  return (
    <div className="feed-poster">
      {video.thumbnail ? <img src={video.thumbnail} alt="" /> : <span>{video.source === 'youtube' ? 'YouTube' : 'Local video'}</span>}
    </div>
  );
}
