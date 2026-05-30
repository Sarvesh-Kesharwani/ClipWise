import type { TranscriptSegment } from '../types';

export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s?#]+)/,
    /youtube\.com\/shorts\/([^&\s?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export function extractPlaylistId(url: string): string | null {
  const match = url.match(/[?&]list=([^&\s#]+)/);
  return match ? match[1] : null;
}

export function isPlaylistUrl(url: string): boolean {
  return extractPlaylistId(url) !== null;
}

export async function fetchPlaylistVideoIds(playlistId: string): Promise<string[]> {
  await loadYouTubeAPI();

  return new Promise((resolve) => {
    // Create a hidden container for the playlist player
    const container = document.createElement('div');
    container.style.display = 'none';
    document.body.appendChild(container);

    const player = new window.YT.Player(container, {
      height: '1',
      width: '1',
      playerVars: {
        listType: 'playlist',
        list: playlistId,
      },
      events: {
        onReady: () => {
          // Small delay to let playlist data load
          setTimeout(() => {
            try {
              const playlist: string[] = player.getPlaylist?.() || [];
              player.destroy();
              container.remove();
              resolve(playlist);
            } catch {
              player.destroy();
              container.remove();
              resolve([]);
            }
          }, 2000);
        },
        onError: () => {
          player.destroy();
          container.remove();
          resolve([]);
        },
      },
    });

    // Safety timeout in case onReady never fires
    setTimeout(() => {
      try {
        player.destroy();
      } catch { /* ignore */ }
      container.remove();
      resolve([]);
    }, 15000);
  });
}

export function getYouTubeThumbnail(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
}

export async function getYouTubeTitle(url: string): Promise<string> {
  try {
    const response = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
    const data = await response.json();
    return data.title || 'YouTube Video';
  } catch {
    return 'YouTube Video';
  }
}

export async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptSegment[]> {
  const response = await fetch(`/api/youtube-transcript?videoId=${encodeURIComponent(videoId)}`);
  if (!response.ok) return [];

  const data = await response.json() as { transcript?: TranscriptSegment[] };
  return Array.isArray(data.transcript) ? data.transcript : [];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: (() => void) | undefined;
  }
}

let ytReadyPromise: Promise<void> | null = null;

export function loadYouTubeAPI(): Promise<void> {
  if (ytReadyPromise) return ytReadyPromise;

  ytReadyPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }

    const existingCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (existingCallback) existingCallback();
      resolve();
    };

    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
  });

  return ytReadyPromise;
}
