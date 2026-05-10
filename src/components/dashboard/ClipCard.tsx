import type { Video, Instance } from '../../types';
import { IconPlay } from './DashIcons';
import { formatTime } from '../../utils/helpers';

interface Props {
  video: Video;
  instances: Instance[];
  index?: number;
  onClick: () => void;
}

function moodFor(id: string, fallback: number): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) + fallback) % 8) + 1;
}

function sourceMeta(v: Video): { label: string; tone: 'yt' | 'web' | 'ud' | 'local'; name: string } {
  if (v.source === 'youtube') return { label: 'YOUTUBE', tone: 'yt', name: 'YouTube' };
  if (v.source === 'youlearn') return { label: 'COURSE', tone: 'ud', name: 'YouLearn' };
  return { label: 'LOCAL', tone: 'local', name: 'Local file' };
}

export default function ClipCard({ video, instances, index = 0, onClick }: Props) {
  const totalClips = instances.reduce((s, i) => s + i.clips.length, 0);
  const watchedClips = instances.reduce(
    (s, i) => s + i.clips.filter(c => c.watchCount > 0).length, 0,
  );
  const progressPct = totalClips > 0 ? (watchedClips / totalClips) * 100 : 0;
  const summarized = instances.reduce(
    (s, i) => s + i.clips.filter(c => c.summary).length, 0,
  );
  const xp = Math.max(5, summarized * 5);
  const meta = sourceMeta(video);
  const mood = moodFor(video.id, index);

  return (
    <article
      className="cw-clip-card"
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      role="button"
      tabIndex={0}
      aria-label={video.title}
    >
      <div className={`cw-clip-thumb cw-mood-${mood}`}>
        {video.thumbnail ? (
          <img src={video.thumbnail} alt="" />
        ) : (
          <div className="cw-clip-thumb-bg" aria-hidden />
        )}
        <span className="cw-clip-source-label">{meta.label}</span>
        <span className="cw-clip-play" aria-hidden>
          <IconPlay size={16} />
        </span>
        <span className="cw-clip-duration">
          {video.duration > 0 ? formatTime(video.duration) : '—'}
        </span>
        <div className="cw-clip-progress-strip" aria-hidden>
          <div className="cw-clip-progress-strip-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <div className="cw-clip-body">
        <h3 className="cw-clip-title">{video.title}</h3>
        <div className="cw-clip-foot">
          <span className="cw-clip-source">
            <span className={`cw-source-dot ${meta.tone}`} />
            {meta.name}
          </span>
          <span className="cw-xp-pill">+{xp} XP</span>
        </div>
      </div>
    </article>
  );
}
