import type { Video, Instance } from '../types';
import { formatDuration } from '../utils/helpers';

interface Props {
  video: Video;
  instances: Instance[];
  onClick: () => void;
}

export default function VideoCard({ video, instances, onClick }: Props) {
  const totalClips = instances.reduce((sum, inst) => sum + inst.clips.length, 0);
  const watchedClips = instances.reduce(
    (sum, inst) => sum + inst.clips.filter(c => c.watchCount > 0).length, 0
  );
  const summarizedClips = instances.reduce(
    (sum, inst) => sum + inst.clips.filter(c => c.summary).length, 0
  );
  const watchedPct = totalClips > 0 ? Math.round((watchedClips / totalClips) * 100) : 0;
  const sourceLabel = getSourceLabel(video.source);

  return (
    <div className="video-card" onClick={onClick}>
      <div className="card-thumbnail">
        {video.thumbnail ? (
          <img src={video.thumbnail} alt={video.title} />
        ) : (
          <div className="thumbnail-placeholder">
            <span>{video.source === 'local' ? 'FILE' : 'PLAY'}</span>
          </div>
        )}
        <div className="source-badge">
          {sourceLabel}
        </div>
      </div>
      <div className="card-body">
        <h3 className="card-title">{video.title}</h3>
        <div className="card-meta">
          <span>{video.duration > 0 ? formatDuration(video.duration) : 'Duration TBD'}</span>
          <span>{instances.length} instance{instances.length !== 1 ? 's' : ''}</span>
        </div>
        <div className="card-watch-meta">
          {video.lastWatchedAt ? `Watched ${formatWatchDate(video.lastWatchedAt)}` : 'Not watched yet'}
        </div>
        {totalClips > 0 && (
          <>
            <div className="card-progress-bar">
              <div className="card-progress-fill" style={{ width: `${watchedPct}%` }} />
            </div>
            <div className="card-stats">
              <span className="stat watched">{watchedClips}/{totalClips} watched</span>
              <span className="stat summarized">{summarizedClips}/{totalClips} summaries</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function getSourceLabel(source: Video['source']): string {
  if (source === 'youtube') return 'YouTube';
  if (source === 'youlearn') return 'YouLearn';
  return 'Local';
}

function formatWatchDate(ms: number): string {
  const date = new Date(ms);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'today';
  if (date.toDateString() === yesterday.toDateString()) return 'yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
