import { formatVolume, startOfWeek } from '@/db/calc';
import type { ProgressStats, Unit } from '@/db/types';

/** Compact Home recap derived from existing progress aggregates. */
export function weekInsightFromStats(stats: ProgressStats | null | undefined, unit: Unit, now: number = Date.now()): {
  sessions: number;
  volumeLabel: string;
  volumeDeltaPct: number | null;
  prsThisWeek: number;
  line: string;
} | null {
  if (!stats) return null;
  const weeks = stats.weeklyVolume ?? [];
  const thisWeek = weeks[weeks.length - 1];
  const prevWeek = weeks.length > 1 ? weeks[weeks.length - 2] : null;
  if (!thisWeek && stats.totalSessions === 0) return null;

  const sessions = thisWeek?.sessions ?? 0;
  const volume = thisWeek?.volume ?? 0;
  const weekStart = startOfWeek(now);
  const prsThisWeek = (stats.prs ?? []).filter((p) => p.achievedAt >= weekStart).length;

  let volumeDeltaPct: number | null = null;
  if (prevWeek && prevWeek.volume > 0) {
    volumeDeltaPct = Math.round(((volume - prevWeek.volume) / prevWeek.volume) * 100);
    // A week in progress against a finished one always looks "down"
    // (Wednesday read -39%). Show the delta once it means something:
    // already ahead, or the week is over.
    const weekOver = now >= weekStart + 7 * 86_400_000;
    if (volumeDeltaPct < 0 && !weekOver) volumeDeltaPct = null;
  }

  const volumeLabel = formatVolume(volume, unit);
  const parts = [
    `${sessions} session${sessions === 1 ? '' : 's'}`,
    volumeLabel,
  ];
  if (volumeDeltaPct !== null) {
    parts.push(`${volumeDeltaPct > 0 ? '+' : ''}${volumeDeltaPct}% vol`);
  }
  if (prsThisWeek > 0) {
    parts.push(`${prsThisWeek} PR${prsThisWeek === 1 ? '' : 's'}`);
  }

  return {
    sessions,
    volumeLabel,
    volumeDeltaPct,
    prsThisWeek,
    line: `This week · ${parts.join(' · ')}`,
  };
}
