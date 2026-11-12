import type { ProgressStats, Unit } from '@/db/types';
import { kgToDisplay, weightLabel } from '@/lib/units';

export type AchievementId =
  | 'first_session'
  | 'sessions_10'
  | 'sessions_50'
  | 'sessions_100'
  | 'volume_10k'
  | 'volume_100k'
  | 'streak_4'
  | 'streak_12'
  | 'prs_5'
  | 'prs_25';

export interface AchievementDef {
  id: AchievementId;
  title: string;
  description: string;
  /**
   * Target for progress: sessions, weeks or PRs; volume targets are canonical
   * kg (§15), so an unlock never flips when the display unit changes.
   */
  target: number;
  metric: 'sessions' | 'volume' | 'streak' | 'prs';
}

export interface AchievementStatus extends AchievementDef {
  /** Progress value in the display unit (volume converted from kg). */
  current: number;
  unlocked: boolean;
  /** 0–1 progress toward unlock. */
  progress: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'first_session', title: 'First lift', description: 'Complete your first workout', target: 1, metric: 'sessions' },
  { id: 'sessions_10', title: 'Getting serious', description: 'Log 10 workouts', target: 10, metric: 'sessions' },
  { id: 'sessions_50', title: 'Habit former', description: 'Log 50 workouts', target: 50, metric: 'sessions' },
  { id: 'sessions_100', title: 'Century', description: 'Log 100 workouts', target: 100, metric: 'sessions' },
  { id: 'volume_10k', title: '10k club', description: 'Move 10,000 kg of total volume', target: 10_000, metric: 'volume' },
  { id: 'volume_100k', title: '100k club', description: 'Move 100,000 kg of total volume', target: 100_000, metric: 'volume' },
  { id: 'streak_4', title: 'Consistent month', description: 'Hold a 4-week streak', target: 4, metric: 'streak' },
  { id: 'streak_12', title: 'Quarter strong', description: 'Hold a 12-week streak', target: 12, metric: 'streak' },
  { id: 'prs_5', title: 'Record hunter', description: 'Set 5 exercise PRs', target: 5, metric: 'prs' },
  { id: 'prs_25', title: 'PR machine', description: 'Set 25 exercise PRs', target: 25, metric: 'prs' },
];

function currentFor(metric: AchievementDef['metric'], stats: ProgressStats): number {
  switch (metric) {
    case 'sessions':
      return stats.totalSessions;
    case 'volume':
      return stats.totalVolume;
    case 'streak':
      return stats.streak;
    case 'prs':
      return stats.prEventCount ?? stats.prs?.length ?? 0;
  }
}

/**
 * Volume badges show their kg target in the user's unit ("22,046 lb");
 * everything else is unit-free.
 */
function forDisplay(a: AchievementDef, unit: Unit): AchievementDef {
  if (a.metric !== 'volume') return a;
  const target = Math.round(kgToDisplay(a.target, unit));
  return { ...a, target, description: `Move ${target.toLocaleString('en-US')} ${weightLabel(unit)} of total volume` };
}

/**
 * Evaluate milestone badges from existing progress aggregates (no new tables).
 * Unlocks compare canonical values; `current` / `target` are in `unit`.
 */
export function evaluateAchievements(
  stats: ProgressStats | null | undefined,
  unit: Unit = 'metric',
): AchievementStatus[] {
  return ACHIEVEMENTS.map((a) => {
    const raw = stats ? currentFor(a.metric, stats) : 0;
    const shown = forDisplay(a, unit);
    const current = a.metric === 'volume' ? Math.floor(kgToDisplay(raw, unit)) : raw;
    return {
      ...shown,
      current,
      unlocked: raw >= a.target,
      progress: a.target <= 0 ? 0 : Math.min(1, raw / a.target),
    };
  });
}
