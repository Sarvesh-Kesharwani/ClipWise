import type { DailyProgress, ProgressState } from '../types';

export const DEFAULT_DAILY_TARGET = 5;
export const FREEZE_REWARD_THRESHOLD = 50;
export const TARGET_INCREMENT_ON_SUCCESS = 1;
export const TARGET_INCREMENT_ON_MISS = 1;
export const MAX_DAILY_TARGET = 50;

export function todayKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function dayKey(ms: number): string {
  return todayKey(new Date(ms));
}

function dateFromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function daysBetween(aKey: string, bKey: string): number {
  const ms = dateFromKey(bKey).getTime() - dateFromKey(aKey).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

export function emptyProgress(): ProgressState {
  return {
    daily: [],
    currentTarget: DEFAULT_DAILY_TARGET,
    currentStreak: 0,
    bestStreak: 0,
    freezes: 0,
    extraClipsBank: 0,
  };
}

export function ensureProgress(progress: ProgressState | undefined): ProgressState {
  if (!progress) return emptyProgress();
  return {
    daily: Array.isArray(progress.daily) ? progress.daily : [],
    currentTarget: progress.currentTarget && progress.currentTarget > 0
      ? progress.currentTarget
      : DEFAULT_DAILY_TARGET,
    currentStreak: progress.currentStreak ?? 0,
    bestStreak: progress.bestStreak ?? 0,
    freezes: progress.freezes ?? 0,
    extraClipsBank: progress.extraClipsBank ?? 0,
    lastActiveDate: progress.lastActiveDate,
  };
}

/** Find or create the daily entry for `date`, applying carry-over logic for missed days. */
function rolloverIfNeeded(progress: ProgressState, today: string): ProgressState {
  const last = progress.lastActiveDate;
  if (!last || last === today) return progress;

  const gap = daysBetween(last, today);
  if (gap <= 0) return progress;

  // Look up yesterday's daily entry (the day "last" points to).
  const lastDaily = progress.daily.find(d => d.date === last);
  const next: ProgressState = { ...progress, daily: [...progress.daily] };

  // For each missed day BEFORE today, decide success / freeze / break.
  // We treat the original "lastActiveDate" day as already evaluated if it has an entry.
  const targetWasMet = lastDaily ? lastDaily.clipsCompleted >= lastDaily.target : false;

  if (gap === 1) {
    // No skipped days — just decide tomorrow's target based on yesterday.
    if (lastDaily) {
      next.currentTarget = adjustTarget(lastDaily.target, targetWasMet);
    }
    if (!targetWasMet && lastDaily) {
      // Streak ended unless yesterday already used a freeze.
      if (!lastDaily.freezeUsed) {
        next.currentStreak = 0;
      }
    }
  } else {
    // We skipped one or more whole days. Try to consume freezes per missed day.
    const missedDays = gap - 1;
    let freezesAvailable = next.freezes;
    let streakAlive = targetWasMet || Boolean(lastDaily?.freezeUsed);

    for (let i = 1; i <= missedDays && streakAlive; i++) {
      if (freezesAvailable > 0) {
        freezesAvailable -= 1;
        const missedDate = addDays(last, i);
        next.daily = upsertDaily(next.daily, {
          date: missedDate,
          clipsCompleted: 0,
          target: next.currentTarget,
          freezeUsed: true,
        });
      } else {
        streakAlive = false;
      }
    }

    next.freezes = freezesAvailable;
    if (!streakAlive) next.currentStreak = 0;

    if (lastDaily) {
      next.currentTarget = adjustTarget(lastDaily.target, targetWasMet);
    }
  }

  return next;
}

function addDays(key: string, days: number): string {
  const d = dateFromKey(key);
  d.setDate(d.getDate() + days);
  return todayKey(d);
}

function upsertDaily(list: DailyProgress[], entry: DailyProgress): DailyProgress[] {
  const idx = list.findIndex(d => d.date === entry.date);
  if (idx === -1) return [...list, entry].sort((a, b) => a.date.localeCompare(b.date));
  const next = [...list];
  next[idx] = entry;
  return next;
}

function adjustTarget(previousTarget: number, met: boolean): number {
  const inc = met ? TARGET_INCREMENT_ON_SUCCESS : TARGET_INCREMENT_ON_MISS;
  return Math.min(MAX_DAILY_TARGET, Math.max(1, previousTarget + inc));
}

/**
 * Record a single clip completion event and return the new progress state.
 * Handles target adjustment, streak counting, and freeze reward.
 */
export function recordClipCompletion(
  progress: ProgressState,
  now: Date = new Date(),
): ProgressState {
  const today = todayKey(now);
  const rolled = rolloverIfNeeded(ensureProgress(progress), today);

  const existingIdx = rolled.daily.findIndex(d => d.date === today);
  const existing = existingIdx >= 0 ? rolled.daily[existingIdx] : null;
  const target = existing?.target ?? rolled.currentTarget;
  const previousCount = existing?.clipsCompleted ?? 0;
  const nextCount = previousCount + 1;

  const updatedEntry: DailyProgress = {
    date: today,
    clipsCompleted: nextCount,
    target,
    freezeUsed: existing?.freezeUsed,
  };

  const daily = upsertDaily(rolled.daily, updatedEntry);

  // Streak: if we just crossed the target boundary today, bump streak.
  let currentStreak = rolled.currentStreak;
  let bestStreak = rolled.bestStreak;
  const justMetTarget = previousCount < target && nextCount >= target;
  if (justMetTarget) {
    currentStreak = currentStreak + 1;
    if (currentStreak > bestStreak) bestStreak = currentStreak;
  }

  // Bank an extra clip if user is over target. Reward a freeze every threshold.
  let extraClipsBank = rolled.extraClipsBank;
  let freezes = rolled.freezes;
  if (nextCount > target) {
    extraClipsBank += 1;
    while (extraClipsBank >= FREEZE_REWARD_THRESHOLD) {
      extraClipsBank -= FREEZE_REWARD_THRESHOLD;
      freezes += 1;
    }
  }

  return {
    ...rolled,
    daily,
    currentTarget: target,
    currentStreak,
    bestStreak,
    freezes,
    extraClipsBank,
    lastActiveDate: today,
  };
}

/** Compute the live snapshot for today, applying rollover (read-only). */
export function getTodaySnapshot(progress: ProgressState, now: Date = new Date()) {
  const today = todayKey(now);
  const rolled = rolloverIfNeeded(ensureProgress(progress), today);
  const todayEntry = rolled.daily.find(d => d.date === today);
  const target = todayEntry?.target ?? rolled.currentTarget;
  const clipsCompleted = todayEntry?.clipsCompleted ?? 0;
  return {
    today,
    target,
    clipsCompleted,
    progress: target > 0 ? Math.min(1, clipsCompleted / target) : 0,
    metToday: clipsCompleted >= target,
    currentStreak: rolled.currentStreak,
    bestStreak: rolled.bestStreak,
    freezes: rolled.freezes,
    extraClipsBank: rolled.extraClipsBank,
    rolled,
  };
}

export function computeAverageDailyClips(progress: ProgressState): number {
  const days = progress.daily.length;
  if (days === 0) return 0;
  const total = progress.daily.reduce((sum, d) => sum + d.clipsCompleted, 0);
  return total / days;
}
