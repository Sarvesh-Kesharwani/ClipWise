import type { Video } from '../../types';

export interface FeedClip {
  id: string;
  video: Video;
  index: number;
  startTime: number;
  endTime: number;
  duration: number;
}

export function createFeedClips(videos: Video[], clipSize: number): FeedClip[] {
  return videos.flatMap(video => {
    const duration = Math.max(video.duration || 0, clipSize);
    const count = Math.max(1, Math.ceil(duration / clipSize));
    return Array.from({ length: count }, (_, index) => {
      const startTime = index * clipSize;
      const endTime = Math.min((index + 1) * clipSize, duration);
      return {
        id: `feed-${video.id}-${clipSize}-${index}`,
        video,
        index,
        startTime,
        endTime,
        duration: endTime - startTime,
      };
    });
  });
}
