import type { Unit } from '@/db/types';
import type { CoachingReason } from './reason';

export const COACHING_RULE_VERSION = '1.3.0';

export type ReasonCode =
  | 'no_history'
  | 'hold_weight_add_reps'
  | 'hit_rep_range_increase_load'
  | 'partial_miss_hold'
  | 'all_sets_maxed'
  | 'high_rpe_hold'
  | 'readiness_hold';

export type InsightSeverity = 'info' | 'success' | 'warning';

export type CoachingInsightKind =
  | 'overload_ready'
  | 'recovery_gap'
  | 'muscle_balance'
  | 'volume_trend'
  | 'weekly_goal'
  | 'post_session'
  | 'deload'
  | 'fatigue'
  | 'program_plan';

export interface TrainingSuggestion {
  exerciseId: number;
  exerciseName: string;
  weight: number;
  reps: number;
  targetSets: number;
  reasonCode: ReasonCode;
  reasonText: string;
  ruleVersion: string;
  /** Structured "why" (rule, inputs, sentence). Explains `weight`/`reps`; never changes them. */
  reason?: CoachingReason;
}

export interface CoachingInsight {
  id: string;
  kind: CoachingInsightKind;
  severity: InsightSeverity;
  title: string;
  body: string;
  href?: string;
  ruleVersion: string;
}

export interface LastWorkingSet {
  weight: number;
  reps: number;
  /** Optional 1–10. Missing means coaching ignores RPE for this session. */
  rpe?: number | null;
}

export type ReadinessLevel = 'fresh' | 'ok' | 'tired';

export interface OverloadInput {
  exerciseId: number;
  exerciseName: string;
  lastWorkingSets: LastWorkingSet[];
  targetRepsMin: number;
  targetRepsMax: number;
  targetSets: number;
  unit: Unit;
  /** Optional daily check-in. Only `tired` softens load suggestions. */
  readiness?: ReadinessLevel | null;
}
