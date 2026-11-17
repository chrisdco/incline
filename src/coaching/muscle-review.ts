import { reviewMuscleSets, type MuscleReview } from '@/contracts/coaching/muscle-review';
import type { MuscleDistribution, ProgressRange } from '@/db/types';

export { REVIEW_RULE_VERSION, type MuscleReview, type ReviewPoint, type ReviewTone } from '@/contracts/coaching/muscle-review';

const WEEKS: Record<Exclude<ProgressRange, 'all'>, number> = { '1w': 1, '30d': 30 / 7, '3m': 13, '1y': 52 };

/** App entry: maps the Progress range to weeks; the rules live in contracts/coaching. */
export function reviewMuscles(input: {
  range: ProgressRange;
  current: readonly MuscleDistribution[];
  previous: readonly MuscleDistribution[];
  /** Days since each muscle was last trained (all time). */
  exposureDays?: Record<string, number> | null;
}): MuscleReview | null {
  return reviewMuscleSets({
    weeks: input.range === 'all' ? null : WEEKS[input.range],
    current: input.current,
    previous: input.previous,
    exposureDays: input.exposureDays,
  });
}
