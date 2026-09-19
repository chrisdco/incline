import type { Unit } from '@/db/types';
import { formatWeight } from '@/db/calc';
import { COACHING_RULE_VERSION, type CoachingInsight } from './types';
import { decreaseLoad } from './plates';

const REPS_DROP_THRESHOLD = 3;

export type FatigueKind = 'reps_drop' | 'load_drop';

export interface FatigueSet {
  weight: number;
  reps: number;
  completed: boolean;
  setType?: string | null;
}

export interface FatigueCue {
  kind: FatigueKind;
  title: string;
  body: string;
  suggestedWeight: number;
  suggestedReps: number;
}

function workingSets(sets: FatigueSet[]): { weight: number; reps: number }[] {
  return sets
    .filter((s) => s.completed && (s.setType ?? 'working') === 'working' && s.weight > 0 && s.reps > 0)
    .map((s) => ({ weight: s.weight, reps: s.reps }));
}

/**
 * In-session fatigue: working-set performance dropped vs the first working set.
 * Suggestions only — never blocks logging.
 */
export function detectSetFatigue(sets: FatigueSet[], unit: Unit): FatigueCue | null {
  const working = workingSets(sets);
  if (working.length < 2) return null;
  const first = working[0];
  const last = working[working.length - 1];

  if (last.weight + 0.01 < first.weight) {
    return {
      kind: 'load_drop',
      title: 'Load dropped',
      body: `You left ${formatWeight(first.weight, unit)} — consider wrapping this exercise instead of grinding lighter junk volume.`,
      suggestedWeight: last.weight,
      suggestedReps: last.reps,
    };
  }

  const repsLost = first.reps - last.reps;
  if (Math.abs(last.weight - first.weight) < 0.01 && repsLost >= REPS_DROP_THRESHOLD) {
    const lighter = decreaseLoad(first.weight, unit);
    return {
      kind: 'reps_drop',
      title: 'Reps falling off',
      body: `Down ${repsLost} reps from your first working set. Drop to ${formatWeight(lighter, unit)} or end this exercise.`,
      suggestedWeight: lighter,
      suggestedReps: Math.max(1, last.reps),
    };
  }

  return null;
}

export function fatigueInsight(cue: FatigueCue, exerciseName: string): CoachingInsight {
  return {
    id: `fatigue-${cue.kind}`,
    kind: 'fatigue',
    severity: 'warning',
    title: cue.title,
    body: `${exerciseName}: ${cue.body}`,
    ruleVersion: COACHING_RULE_VERSION,
  };
}
