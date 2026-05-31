import type { TranscriptSegment } from '../types';

export function extractYouTubeId(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    const host = parsed.hostname.replace(/^www\./, '').toLowerCase();

    if (host === 'youtu.be') {
      return normalizeYouTubeId(parsed.pathname.split('/').filter(Boolean)[0]);
    }

    if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
      const directId = parsed.searchParams.get('v') || parsed.searchParams.get('vi');
      if (directId) return normalizeYouTubeId(directId);

      const parts = parsed.pathname.split('/').filter(Boolean);
      const markerIndex = parts.findIndex(part => ['embed', 'shorts', 'live', 'v', 'e'].includes(part));
      if (markerIndex >= 0) return normalizeYouTubeId(parts[markerIndex + 1]);

      const nestedUrl = parsed.searchParams.get('u') || parsed.searchParams.get('url') || parsed.searchParams.get('q');
      if (nestedUrl) {
        const nestedId = extractYouTubeId(decodeURIComponent(nestedUrl));
        if (nestedId) return nestedId;
      }
    }
  } catch {
    // Fall through to regex extraction for loose or embedded URLs.
  }

  const patterns = [
    /(?:youtube(?:-nocookie)?\.com\/(?:watch\?[^#\s]*v=|embed\/|shorts\/|live\/|v\/|e\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/,
    /(?:[?&](?:v|vi)=)([a-zA-Z0-9_-]{6,})/,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    const id = normalizeYouTubeId(match?.[1]);
    if (id) return id;
  }
  return null;
}

function normalizeYouTubeId(value: string | undefined | null): string | null {
  if (!value) return null;
  const [id] = value.split(/[?&#/]/);
  return /^[a-zA-Z0-9_-]{6,}$/.test(id) ? id : null;
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
