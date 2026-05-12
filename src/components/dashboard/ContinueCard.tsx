import { IconPlay, IconArrowRight } from './DashIcons';
import { formatTime } from '../../utils/helpers';

export interface LastClip {
  videoTitle: string;
  folderName?: string;
  currentSec: number;
  durationSec: number;
  xpOnFinish?: number;
}

interface Props {
  lastClip: LastClip | null;
  onResume: () => void;
  onStartFeed: () => void;
}

export default function ContinueCard({ lastClip, onResume, onStartFeed }: Props) {
  const hasClip = !!lastClip && lastClip.durationSec > 0;
  const pct = hasClip ? Math.round((lastClip!.currentSec / lastClip!.durationSec) * 100) : 0;
  const remainingSec = hasClip ? Math.max(0, lastClip!.durationSec - lastClip!.currentSec) : 0;
  const remainingMin = Math.max(1, Math.ceil(remainingSec / 60));
  const folderLabel = (lastClip?.folderName || 'UNCATEGORIZED').toUpperCase();

  return (
    <section className="cw-continue" aria-labelledby="cw-continue-title">
      <span className="cw-eyebrow">
        <span className="cw-pulse-dot" aria-hidden />
        {hasClip ? `Continue · ${pct}% complete` : 'Get Started'}
      </span>

      <h2 id="cw-continue-title" className="cw-headline">
        {hasClip ? (
          <>Pick up where you <span className="italic">left off</span> — {remainingMin} {remainingMin === 1 ? 'minute' : 'minutes'} to your next clip.</>
        ) : (
          <>Watch <span className="italic">smarter</span> — start your first clip today.</>
        )}
      </h2>

      <p className="cw-subcopy">
        {hasClip
          ? `You paused mid-summary on "${lastClip!.videoTitle}." Finishing this clip keeps the rest of today's target and keeps your streak alive.`
          : 'Add a video, slice it into bite-sized clips, and build a daily streak as you go.'}
      </p>

      {hasClip && (
        <div className="cw-meta-row">
          <span>{folderLabel}</span>
          <span className="cw-meta-dot" />
          <span>{formatTime(lastClip!.currentSec)} / {formatTime(lastClip!.durationSec)}</span>
          {lastClip!.xpOnFinish ? (
            <>
              <span className="cw-meta-dot" />
              <span>+{lastClip!.xpOnFinish} XP on finish</span>
            </>
          ) : null}
        </div>
      )}

      <div className="cw-cta-row">
        <button className="cw-btn cw-btn-primary" onClick={onResume} disabled={!hasClip}>
          {hasClip ? 'Resume clip' : 'Add a video'}
          <IconPlay size={14} />
          <span className="cw-kbd">↵</span>
        </button>
        <button className="cw-btn cw-btn-secondary" onClick={onStartFeed}>
          Start a new feed
          <IconArrowRight size={14} />
          <span className="cw-kbd">F</span>
        </button>
      </div>
    </section>
  );
}
