import type { Clip, ClipStatus } from '../types';

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

export function currentTimestamp(): number {
  return Date.now();
}

export function formatTime(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return 'Unknown';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 && h === 0) parts.push(`${s}s`);
  return parts.join(' ') || '0s';
}

export function getClipStatus(clip: Clip): ClipStatus {
  if (clip.watchCount === 0) return 'unwatched';
  if (clip.watchCount >= 3) return 'rewatched-3plus';
  if (clip.watchCount >= 2) return 'rewatched-2';
  if (clip.summary) return 'summarized';
  return 'watched';
}

export function getClipStatusColor(status: ClipStatus): string {
  switch (status) {
    case 'unwatched': return '#FF4B4B';
    case 'watched': return '#FFC800';
    case 'summarized': return '#58CC02';
    case 'rewatched-2': return '#1CB0F6';
    case 'rewatched-3plus': return '#CE82FF';
  }
}

export function getClipStatusLabel(status: ClipStatus): string {
  switch (status) {
    case 'unwatched': return 'Not watched';
    case 'watched': return 'Watched';
    case 'summarized': return 'Summary';
    case 'rewatched-2': return 'Watched 2x';
    case 'rewatched-3plus': return 'Watched 3x+';
  }
}

export function generateClipsForDuration(duration: number, clipSizeMinutes: number): Clip[] {
  const clipSizeSeconds = clipSizeMinutes * 60;
  const numClips = Math.ceil(duration / clipSizeSeconds);
  const clips: Clip[] = [];
  for (let i = 0; i < numClips; i++) {
    const startTime = i * clipSizeSeconds;
    const endTime = Math.min((i + 1) * clipSizeSeconds, duration);
    clips.push({
      index: i,
      startTime,
      endTime,
      duration: endTime - startTime,
      watchCount: 0,
      summary: '',
    });
  }
  return clips;
}
