import { useEffect, useRef, useState } from 'react';
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
  onActiveClipChange: (clipId: string) => void;
  onExit: () => void;
  onHome: () => void;
  onClipComplete: (videoId: string) => void;
}

export default function ClipPlayer({
  listName,
  clipSize,
  clips,
  activeClipId,
  onActiveClipChange,
  onExit,
  onHome,
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
        <button className="feed-icon-btn" onClick={onHome} aria-label="Dashboard">Home</button>
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
  const [localSrc, setLocalSrc] = useState('');
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(clip.startTime);

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
    if (clip.video.source !== 'local' || !preload) return;
    let revoked = false;
    getVideoFile(clip.video.id).then(file => {
      if (!file || revoked) return;
      const url = URL.createObjectURL(file);
      setLocalSrc(previous => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    });
    return () => {
      revoked = true;
      setLocalSrc(previous => {
        if (previous) URL.revokeObjectURL(previous);
        return '';
      });
    };
  }, [clip.video.id, clip.video.source, preload]);

  useEffect(() => {
    if (!active) {
      localVideoRef.current?.pause();
      youtubeRef.current?.pause();
      queueMicrotask(() => setPaused(true));
      return;
    }

    if (clip.video.source === 'local' && localVideoRef.current) {
      localVideoRef.current.currentTime = clip.startTime;
      void localVideoRef.current.play().then(() => setPaused(false)).catch(() => setPaused(true));
    } else if (clip.video.source === 'youtube') {
      youtubeRef.current?.seek(clip.startTime);
      youtubeRef.current?.play();
      queueMicrotask(() => setPaused(false));
    }
  }, [active, clip.startTime, clip.video.source]);

  function completeClip() {
    if (completedRef.current) return;
    completedRef.current = true;
    onClipComplete(clip.video.id);
  }

  function togglePlay() {
    if (clip.video.source === 'local') {
      const player = localVideoRef.current;
      if (!player) return;
      if (player.paused) {
        void player.play().then(() => setPaused(false));
      } else {
        player.pause();
        setPaused(true);
      }
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
        {clip.video.source === 'local' ? (
          preload && localSrc ? (
            <video
              ref={localVideoRef}
              className="feed-local-video"
              src={localSrc}
              preload={active ? 'auto' : 'metadata'}
              playsInline
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

        <div className="feed-gradient" />
        <div className="feed-progress-track">
          <div className="feed-progress-fill" style={{ width: `${progress}%` }} />
        </div>

        <div className="feed-overlay-copy">
          <span>{listName}</span>
          <h2>{clip.video.title}</h2>
          <p>Clip {clip.index + 1} · {formatTime(clip.startTime)} - {formatTime(clip.endTime)}</p>
        </div>

        <div className="feed-overlay-controls">
          <button className="feed-control-btn" onClick={onPrev} aria-label="Previous clip">Prev</button>
          <button className="feed-play-btn" onClick={togglePlay} aria-label={paused ? 'Play clip' : 'Pause clip'}>
            {paused ? 'Play' : 'Pause'}
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
