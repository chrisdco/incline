import type { Unit } from '@/db/types';
import { decreaseLoad } from './plates';
import type { ReadinessLevel, TrainingSuggestion } from './types';

export const READINESS_OPTIONS: { level: ReadinessLevel; label: string; hint: string }[] = [
  { level: 'fresh', label: 'Fresh', hint: 'Normal progression' },
  { level: 'ok', label: 'OK', hint: 'Hold the line' },
  { level: 'tired', label: 'Tired', hint: 'Softer loads today' },
];

/**
 * Soften overload when the user checked in tired.
 * Missing / fresh / OK readiness = no change (RPE still applies separately).
 */
export function applyReadinessToSuggestion(
  suggestion: TrainingSuggestion,
  readiness: ReadinessLevel | null | undefined,
  unit: Unit,
  lastWorkingWeight?: number,
  /** Gym plate step in the display unit (#243); omitted = standard. */
  increment?: number,
): TrainingSuggestion {
  if (!readiness || readiness === 'fresh' || readiness === 'ok') return suggestion;

  const base =
    lastWorkingWeight != null && lastWorkingWeight > 0 ? lastWorkingWeight : suggestion.weight;
  if (base <= 0) return suggestion;

  if (
    suggestion.reasonCode === 'hit_rep_range_increase_load' ||
    suggestion.reasonCode === 'all_sets_maxed' ||
    suggestion.reasonCode === 'hold_weight_add_reps'
  ) {
    const soft = decreaseLoad(base, unit, increment);
    return {
      ...suggestion,
      weight: soft > 0 ? soft : base,
      reps: suggestion.reps,
      reasonCode: 'readiness_hold',
      reasonText: 'Checked in tired — keep today lighter and recover.',
    };
  }

  if (suggestion.weight > base) {
    return {
      ...suggestion,
      weight: base,
      reasonCode: 'readiness_hold',
      reasonText: 'Checked in tired — hold last working weight.',
    };
  }
  return suggestion;
}
