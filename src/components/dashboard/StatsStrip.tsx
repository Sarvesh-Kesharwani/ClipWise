import type { ReactNode } from 'react';
import { IconStar, IconPlay, IconClock, IconMedal } from './DashIcons';

interface StatProps {
  label: string;
  iconTone: 'lime' | 'amber' | 'violet' | 'cyan';
  icon: ReactNode;
  value: ReactNode;
  foot: ReactNode;
}

function StatCard({ label, iconTone, icon, value, foot }: StatProps) {
  return (
    <div className="cw-stat">
      <div className="cw-stat-head">
        <span className="cw-stat-label">{label}</span>
        <span className={`cw-stat-icon ${iconTone}`}>{icon}</span>
      </div>
      <div className="cw-stat-value">{value}</div>
      <div className="cw-stat-foot">{foot}</div>
    </div>
  );
}

interface Props {
  level: number;
  levelName: string;
  xpToNext: number;
  clipsThisWeek: number;
  clipsTarget: number;
  weeklyBars: number[];
  focusHrs: number;
  focusDeltaPct: number;
  badgeName: string;
  badgeRemaining: number;
}

export default function StatsStrip({
  level,
  levelName,
  xpToNext,
  clipsThisWeek,
  clipsTarget,
  weeklyBars,
  focusHrs,
  focusDeltaPct,
  badgeName,
  badgeRemaining,
}: Props) {
  const fmtHrs = (h: number) => {
    const totalMin = Math.round(h * 60);
    const hh = Math.floor(totalMin / 60);
    const mm = String(totalMin % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  return (
    <div className="cw-stats">
      <StatCard
        label="Level"
        iconTone="violet"
        icon={<IconStar size={12} />}
        value={<>{String(level).padStart(2, '0')} <span className="unit">· {levelName}</span></>}
        foot={<span className="cw-xp-pill">+{xpToNext} XP to L{level + 1}</span>}
      />

      <StatCard
        label="Clips this week"
        iconTone="lime"
        icon={<IconPlay size={12} />}
        value={<>{clipsThisWeek} <span className="unit">/ {clipsTarget}</span></>}
        foot={
          <div className="cw-bars" aria-hidden>
            {weeklyBars.slice(0, 7).map((h, i) => {
              const isDim = h <= 0;
              return (
                <span
                  key={i}
                  className={`cw-bar ${isDim ? 'dim' : ''}`}
                  style={{ height: `${Math.max(0, Math.min(100, h))}%` }}
                />
              );
            })}
          </div>
        }
      />

      <StatCard
        label="Focus time"
        iconTone="cyan"
        icon={<IconClock size={12} />}
        value={<>{fmtHrs(focusHrs)} <span className="unit">hrs</span></>}
        foot={
          <span className="cw-stat-delta">
            <span className={focusDeltaPct >= 0 ? 'up' : 'down'}>
              {focusDeltaPct >= 0 ? '↑' : '↓'} {Math.abs(focusDeltaPct)}%
            </span>
            <span className="label">vs last week</span>
          </span>
        }
      />

      <StatCard
        label="Next badge"
        iconTone="amber"
        icon={<IconMedal size={12} />}
        value={<span className="cw-badge-name">{badgeName}</span>}
        foot={
          <span className="cw-badge-foot">
            <span className="num">{badgeRemaining}</span>{' '}
            <span className="label">long-form clips to unlock</span>
          </span>
        }
      />
    </div>
  );
}
