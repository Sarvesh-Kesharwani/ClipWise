import { forwardRef, useRef, useImperativeHandle, useEffect, useCallback } from 'react';
import type { PlayerRef, PlayerProps } from '../types';
import { loadYouTubeAPI } from '../utils/youtube';

interface Props extends PlayerProps {
  videoId: string;
}

const YouTubePlayer = forwardRef<PlayerRef, Props>(
  ({ videoId, onTimeUpdate, onPlay, onPause, onReady, onEnded }, ref) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<number>(0);
    const mountedRef = useRef(true);

    // Keep latest callbacks in refs so the YT player always uses current versions
    const callbacksRef = useRef({ onTimeUpdate, onPlay, onPause, onReady, onEnded });

    useEffect(() => {
      callbacksRef.current = { onTimeUpdate, onPlay, onPause, onReady, onEnded };
    }, [onTimeUpdate, onPlay, onPause, onReady, onEnded]);

    useImperativeHandle(ref, () => ({
      seek: (t: number) => {
        playerRef.current?.seekTo(t, true);
      },
      play: () => { playerRef.current?.playVideo(); },
      pause: () => { playerRef.current?.pauseVideo(); },
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
            autoplay: 0,
            controls: 1,
            modestbranding: 1,
            rel: 0,
            fs: 1,
            playsinline: 1,
          },
          events: {
            onReady: (e: { target: { getDuration: () => number } }) => {
              if (mountedRef.current) {
                callbacksRef.current.onReady(e.target.getDuration());
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
    }, [videoId, handleStateChange]);

    return <div ref={containerRef} className="youtube-wrapper" />;
  }
);

YouTubePlayer.displayName = 'YouTubePlayer';
export default YouTubePlayer;
