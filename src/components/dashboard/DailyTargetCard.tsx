import ProgressRing from './ProgressRing';
import { IconFlame, IconArrowDown, IconClock, IconGauge } from './DashIcons';

interface Props {
  completed: number;
  goal: number;
  streakDays: number;
  bestWindow?: string;
  bonusDone: number;
  bonusMax: number;
}

export default function DailyTargetCard({
  completed,
  goal,
  streakDays,
  bestWindow,
  bonusDone,
  bonusMax,
}: Props) {
  const remaining = Math.max(0, goal - completed);

  return (
    <section className="cw-target" aria-label="Daily target">
      <div className="cw-target-head">
        <span className="cw-label">Daily target</span>
        <span className="cw-streak-pill" title={`${streakDays}-day streak`}>
          <IconFlame size={13} />
          {streakDays}-day streak
        </span>
      </div>

      <div className="cw-ring-row">
        <div className="cw-ring-wrap">
          <ProgressRing value={completed} max={goal} />
          <div className="cw-ring-overlay">
            <div className="cw-ring-num">
              {completed}<span className="denom">/{goal}</span>
            </div>
            <div className="cw-ring-cap">Clips today</div>
          </div>
        </div>

        <div className="cw-ring-stats">
          <div className="cw-ring-stat">
            <span className="cw-ring-stat-key">
              <IconArrowDown size={12} /> Remaining
            </span>
            <span className="cw-ring-stat-val lime">
              {remaining} {remaining === 1 ? 'clip' : 'clips'}
            </span>
          </div>
          <div className="cw-ring-stat">
            <span className="cw-ring-stat-key">
              <IconClock size={12} /> Best window
            </span>
            <span className="cw-ring-stat-val">{bestWindow ?? '—'}</span>
          </div>
          <div className="cw-ring-stat">
            <span className="cw-ring-stat-key">
              <IconGauge size={12} /> Bonus pool
            </span>
            <span className="cw-ring-stat-val amber">{bonusDone} / {bonusMax} extra</span>
          </div>
        </div>
      </div>
    </section>
  );
}
