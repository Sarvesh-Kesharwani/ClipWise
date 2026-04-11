import type { Clip, Remix } from '../types';
import { formatDuration } from '../utils/helpers';

interface Props {
  remix: Remix;
  getSourceClip: (instanceId: string, clipIndex: number) => Clip | undefined;
  getSourceTitle: (videoId: string) => string;
  onClick: () => void;
  onDelete: () => void;
}

export default function RemixCard({ remix, getSourceClip, getSourceTitle, onClick, onDelete }: Props) {
  const clips = remix.clipRefs
    .map(ref => getSourceClip(ref.instanceId, ref.clipIndex))
    .filter((clip): clip is Clip => Boolean(clip));
  const watchedClips = clips.filter(clip => clip.watchCount > 0).length;
  const summarizedClips = clips.filter(clip => clip.summary.trim()).length;
  const duration = clips.reduce((sum, clip) => sum + clip.duration, 0);
  const watchedPct = clips.length > 0 ? Math.round((watchedClips / clips.length) * 100) : 0;
  const sourceTitles = Array.from(new Set(remix.clipRefs.map(ref => getSourceTitle(ref.videoId)))).slice(0, 3);

  return (
    <div className="video-card remix-card" onClick={onClick}>
      <div className="card-thumbnail remix-thumbnail">
        <div className="remix-thumbnail-stack">
          <span>Mix</span>
          <strong>{remix.clipRefs.length}</strong>
          <span>clips</span>
        </div>
        <div className="source-badge remix-badge">Remix</div>
      </div>
      <div className="card-body">
        <div className="remix-card-title-row">
          <h3 className="card-title">{remix.title}</h3>
          <button
            className="remix-delete"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete remix"
          >
            &times;
          </button>
        </div>
        <div className="card-meta">
          <span>{duration > 0 ? formatDuration(duration) : 'Duration TBD'}</span>
          <span>{sourceTitles.join(', ') || 'No sources'}</span>
        </div>
        {clips.length > 0 && (
          <>
            <div className="card-progress-bar">
              <div className="card-progress-fill remix-progress-fill" style={{ width: `${watchedPct}%` }} />
            </div>
            <div className="card-stats">
              <span className="stat watched">{watchedClips}/{clips.length} watched</span>
              <span className="stat summarized">{summarizedClips}/{clips.length} summaries</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
