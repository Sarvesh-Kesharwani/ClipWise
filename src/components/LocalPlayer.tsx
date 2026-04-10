import { forwardRef, useRef, useImperativeHandle, useEffect } from 'react';
import type { PlayerRef, PlayerProps } from '../types';

interface Props extends PlayerProps {
  src: string;
}

const LocalPlayer = forwardRef<PlayerRef, Props>(({ src, onTimeUpdate, onPlay, onPause, onReady, onEnded }, ref) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useImperativeHandle(ref, () => ({
    seek: (t: number) => {
      if (videoRef.current) videoRef.current.currentTime = t;
    },
    play: () => { videoRef.current?.play(); },
    pause: () => { videoRef.current?.pause(); },
  }));

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    video.src = src;
    video.load();
  }, [src]);

  function handleLoadedMetadata() {
    if (videoRef.current) {
      onReady(videoRef.current.duration);
    }
  }

  function handleTimeUpdate() {
    if (videoRef.current) {
      onTimeUpdate(videoRef.current.currentTime);
    }
  }

  return (
    <video
      ref={videoRef}
      className="local-video"
      onLoadedMetadata={handleLoadedMetadata}
      onTimeUpdate={handleTimeUpdate}
      onPlay={onPlay}
      onPause={onPause}
      onEnded={onEnded}
      controls
      playsInline
    />
  );
});

LocalPlayer.displayName = 'LocalPlayer';
export default LocalPlayer;
