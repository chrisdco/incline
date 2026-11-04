/**
 * App host for the FeaturePack contract (src/contracts/narrate): building a
 * pack from rule output in display units, and hashing with expo-crypto.
 */
import * as Crypto from 'expo-crypto';

import { COACHING_RULE_VERSION, type CoachingInsight, type TrainingSuggestion } from './types';
import type { Unit } from '@/db/types';
import { kgToDisplay } from '@/lib/units';

import {
  canonicalizeFeaturePack,
  MAX_FEATURE_PACK_INSIGHTS,
  MAX_FEATURE_PACK_RECENT_WEEKS,
  MAX_FEATURE_PACK_SUGGESTIONS,
  FEATURE_PACK_VERSION,
  sanitizeExerciseName,
  type FeaturePackAggregates,
  type FeaturePackInsight,
  type FeaturePackSuggestion,
  type FeaturePackV1,
  type NarrateSurface,
} from '@/contracts/narrate/feature-pack';

export * from '@/contracts/narrate/feature-pack';

export interface FeaturePackBuildInput {
  unit: 'metric' | 'imperial';
  surface: NarrateSurface;
  insights?: ReadonlyArray<CoachingInsight | FeaturePackInsight>;
  suggestions?: ReadonlyArray<TrainingSuggestion | FeaturePackSuggestion>;
  aggregates?: FeaturePackAggregates;
  generatedAt?: number;
  ruleVersion?: string;
}

export async function hashFeaturePack(pack: FeaturePackV1): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    canonicalizeFeaturePack(pack),
  );
}

function sanitizeInsight(item: CoachingInsight | FeaturePackInsight): FeaturePackInsight {
  return {
    id: item.id,
    kind: item.kind,
    severity: item.severity,
    title: item.title,
    body: item.body,
  };
}

/**
 * Pack numbers are in `pack.unit` (display), never canonical kg: the model
 * must quote the same numbers the user sees, and narrate-validate checks the
 * reply against these exact values.
 */
function displayRound(kg: number, unit: Unit, step: number): number {
  return Math.round(kgToDisplay(kg, unit) / step) * step;
}

function sanitizeSuggestion(
  item: TrainingSuggestion | FeaturePackSuggestion,
  unit: Unit,
): FeaturePackSuggestion {
  return {
    exerciseName: sanitizeExerciseName(item.exerciseName),
    weight: Math.round(displayRound(item.weight, unit, 0.1) * 10) / 10,
    reps: item.reps,
    targetSets: item.targetSets,
    reasonCode: item.reasonCode,
    reasonText: item.reasonText,
  };
}

function sanitizeAggregates(aggregates: FeaturePackAggregates | undefined, unit: Unit): FeaturePackAggregates {
  if (!aggregates) return {};
  const out: FeaturePackAggregates = {};
  if (aggregates.sessionsThisWeek !== undefined) out.sessionsThisWeek = aggregates.sessionsThisWeek;
  if (aggregates.weeklyStreak !== undefined) out.weeklyStreak = aggregates.weeklyStreak;
  if (aggregates.volumeDeltaPct !== undefined) out.volumeDeltaPct = aggregates.volumeDeltaPct;
  if (aggregates.prCount !== undefined) out.prCount = aggregates.prCount;
  if (aggregates.readiness !== undefined) out.readiness = aggregates.readiness;
  if (aggregates.recentWeeks !== undefined) {
    out.recentWeeks = aggregates.recentWeeks.slice(0, MAX_FEATURE_PACK_RECENT_WEEKS).map((week) => ({
      sessions: week.sessions,
      volume: displayRound(week.volume, unit, 1),
    }));
  }
  if (aggregates.muscleGap !== undefined) {
    out.muscleGap = aggregates.muscleGap
      ? {
          highMuscle: aggregates.muscleGap.highMuscle,
          lowMuscle: aggregates.muscleGap.lowMuscle,
        }
      : null;
  }
  return out;
}

/** Caps arrays, strips href/exerciseId, omits PII/notes/photos/raw sets. */
export function buildFeaturePackV1(input: FeaturePackBuildInput): FeaturePackV1 {
  const pack: FeaturePackV1 = {
    version: FEATURE_PACK_VERSION,
    ruleVersion: input.ruleVersion ?? COACHING_RULE_VERSION,
    unit: input.unit,
    surface: input.surface,
    insights: (input.insights ?? []).slice(0, MAX_FEATURE_PACK_INSIGHTS).map(sanitizeInsight),
    suggestions: (input.suggestions ?? [])
      .slice(0, MAX_FEATURE_PACK_SUGGESTIONS)
      .map((item) => sanitizeSuggestion(item, input.unit)),
    aggregates: sanitizeAggregates(input.aggregates, input.unit),
  };
  if (input.generatedAt != null) pack.generatedAt = input.generatedAt;
  return pack;
}
