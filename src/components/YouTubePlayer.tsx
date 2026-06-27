import { forwardRef, useRef, useImperativeHandle, useEffect, useCallback } from 'react';
import type { PlayerRef, PlayerProps } from '../types';
import { loadYouTubeAPI } from '../utils/youtube';

interface Props extends PlayerProps {
  videoId: string;
  autoPlay?: boolean;
  muted?: boolean;
  nativeControls?: boolean;
}

const YouTubePlayer = forwardRef<PlayerRef, Props>(
  ({ videoId, autoPlay = false, muted = false, nativeControls = false, onTimeUpdate, onPlay, onPause, onReady, onEnded }, ref) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<number>(0);
    const mountedRef = useRef(true);
    const optionsRef = useRef({ autoPlay, muted });

    // Keep latest callbacks in refs so the YT player always uses current versions
    const callbacksRef = useRef({ onTimeUpdate, onPlay, onPause, onReady, onEnded });

    useEffect(() => {
      callbacksRef.current = { onTimeUpdate, onPlay, onPause, onReady, onEnded };
    }, [onTimeUpdate, onPlay, onPause, onReady, onEnded]);

    useEffect(() => {
      optionsRef.current = { autoPlay, muted };
      if (!playerRef.current) return;
      if (muted) playerRef.current.mute?.();
      else playerRef.current.unMute?.();
    }, [autoPlay, muted]);

    useImperativeHandle(ref, () => ({
      seek: (t: number) => {
        playerRef.current?.seekTo(t, true);
      },
      play: () => { playerRef.current?.playVideo(); },
      pause: () => { playerRef.current?.pauseVideo(); },
      mute: () => { playerRef.current?.mute?.(); },
      unMute: () => { playerRef.current?.unMute?.(); },
    }));

    const handleStateChange = useCallback((state: number) => {
      clearInterval(pollRef.current);

      if (state === window.YT.PlayerState.PLAYING) {
        callbacksRef.current.onPlay();
        pollRef.current = window.setInterval(() => {
          if (playerRef.current?.getCurrentTime) {
            callbacksRef.current.onTimeUpdate(playerRef.current.getCurrentTime());
          }
        }, 250);
      } else if (state === window.YT.PlayerState.PAUSED) {
        callbacksRef.current.onPause();
      } else if (state === window.YT.PlayerState.ENDED) {
        callbacksRef.current.onEnded();
      }
    }, []);

    useEffect(() => {
      mountedRef.current = true;
      const container = containerRef.current;
      if (!container) return;

      // Create the target div imperatively so React won't touch it during re-renders
      const targetDiv = document.createElement('div');
      container.appendChild(targetDiv);

      loadYouTubeAPI().then(() => {
        if (!mountedRef.current) return;

        playerRef.current = new window.YT.Player(targetDiv, {
          videoId,
          width: '100%',
          height: '100%',
          playerVars: {
            autoplay: optionsRef.current.autoPlay ? 1 : 0,
            controls: nativeControls ? 1 : 0,
            disablekb: nativeControls ? 0 : 1,
            modestbranding: 1,
            rel: 0,
            fs: nativeControls ? 1 : 0,
            playsinline: 1,
            mute: optionsRef.current.muted ? 1 : 0,
          },
          events: {
            onReady: (e: { target: { getDuration: () => number; mute?: () => void; playVideo?: () => void } }) => {
              if (mountedRef.current) {
                if (optionsRef.current.muted) e.target.mute?.();
                callbacksRef.current.onReady(e.target.getDuration());
                if (optionsRef.current.autoPlay) e.target.playVideo?.();
              }
            },
            onStateChange: (e: { data: number }) => {
              if (!mountedRef.current) return;
              handleStateChange(e.data);
            },
          },
        });
      });

      return () => {
        mountedRef.current = false;
        clearInterval(pollRef.current);
        if (playerRef.current?.destroy) {
          try { playerRef.current.destroy(); } catch { /* ignore */ }
        }
        // Clean up the imperatively created element
        if (targetDiv.parentNode) targetDiv.parentNode.removeChild(targetDiv);
      };
    }, [videoId, nativeControls, handleStateChange]);

    return <div ref={containerRef} className="youtube-wrapper" />;
  }
);

YouTubePlayer.displayName = 'YouTubePlayer';
export default YouTubePlayer;
