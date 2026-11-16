import type { PeriodStats, ProgressRange } from '@/db/types';
import { MUSCLE_LABELS } from '@/lib/labels';

const SPAN: Record<ProgressRange, string> = {
  '1w': 'this week',
  '30d': 'in the last 30 days',
  '3m': 'in the last 3 months',
  '1y': 'this year',
  all: 'so far',
};

/**
 * One plain sentence on the selected period for the top of Progress:
 * sessions, records, the volume trend and where most work went. Facts only,
 * from the same stats the page shows.
 */
export function periodHeadline(stats: PeriodStats, range: ProgressRange): string {
  if (stats.sessions === 0) return range === 'all' ? 'Log a workout to start your history.' : `No workouts ${SPAN[range]} yet.`;
  const parts = [`${stats.sessions} session${stats.sessions === 1 ? '' : 's'} ${SPAN[range]}`];
  if (stats.prs.length) parts.push(`${stats.prs.length} record${stats.prs.length === 1 ? '' : 's'}`);
  const delta = stats.trend ? Math.round(stats.trend.volumeDelta) : 0;
  // The trend compares the latest week (short ranges) or 30 days (long ranges) with the one before.
  const unit = range === '1y' || range === 'all' ? 'month' : 'week';
  if (Math.abs(delta) >= 5) parts.push(`this ${unit}'s volume ${delta > 0 ? 'up' : 'down'} ${Math.abs(delta)}% on last ${unit}`);
  const top = [...stats.muscleDistribution].sort((a, b) => b.sets - a.sets)[0];
  const lead = parts.join(', ') + '.';
  return top ? `${lead} Most work went to ${MUSCLE_LABELS[top.muscle].toLowerCase()}.` : lead;
}
