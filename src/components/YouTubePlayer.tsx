import { forwardRef, useRef, useImperativeHandle, useEffect } from 'react';
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
    const divId = useRef(`yt-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`);

    useImperativeHandle(ref, () => ({
      seek: (t: number) => {
        playerRef.current?.seekTo(t, true);
      },
      play: () => { playerRef.current?.playVideo(); },
      pause: () => { playerRef.current?.pauseVideo(); },
    }));

    useEffect(() => {
      mountedRef.current = true;

      loadYouTubeAPI().then(() => {
        if (!mountedRef.current || !containerRef.current) return;

        playerRef.current = new window.YT.Player(divId.current, {
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
                onReady(e.target.getDuration());
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
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoId]);

    function handleStateChange(state: number) {
      clearInterval(pollRef.current);

      if (state === window.YT.PlayerState.PLAYING) {
        onPlay();
        pollRef.current = window.setInterval(() => {
          if (playerRef.current?.getCurrentTime) {
            onTimeUpdate(playerRef.current.getCurrentTime());
          }
        }, 250);
      } else if (state === window.YT.PlayerState.PAUSED) {
        onPause();
      } else if (state === window.YT.PlayerState.ENDED) {
        onEnded();
      }
    }

    return (
      <div ref={containerRef} className="youtube-wrapper">
        <div id={divId.current} />
      </div>
    );
  }
);

YouTubePlayer.displayName = 'YouTubePlayer';
export default YouTubePlayer;
