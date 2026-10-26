import * as Crypto from 'expo-crypto';

import { COACHING_RULE_VERSION, type CoachingInsight, type TrainingSuggestion } from './types';
import type { Unit } from '@/db/types';
import { kgToDisplay } from '@/lib/units';

export const FEATURE_PACK_VERSION = 'FeaturePackV1' as const;
export const COACH_NARRATE_PROMPT_VERSION = 'narrate-1.0.0';
export const MAX_FEATURE_PACK_INSIGHTS = 8;
export const MAX_FEATURE_PACK_SUGGESTIONS = 6;
export const MAX_FEATURE_PACK_BYTES = 12_000;
export const MAX_FEATURE_PACK_RECENT_WEEKS = 4;

export type NarrateSurface = 'post_session' | 'home';

export interface FeaturePackInsight {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
}

export interface FeaturePackSuggestion {
  exerciseName: string;
  weight: number;
  reps: number;
  targetSets: number;
  reasonCode: string;
  reasonText: string;
}

export interface FeaturePackAggregates {
  sessionsThisWeek?: number;
  weeklyStreak?: number;
  volumeDeltaPct?: number | null;
  prCount?: number;
  readiness?: 'fresh' | 'ok' | 'tired' | null;
  recentWeeks?: { sessions: number; volume: number }[];
  muscleGap?: { highMuscle: string; lowMuscle: string } | null;
}

export interface FeaturePackV1 {
  version: typeof FEATURE_PACK_VERSION;
  ruleVersion: string;
  unit: 'metric' | 'imperial';
  surface: NarrateSurface;
  insights: FeaturePackInsight[];
  suggestions: FeaturePackSuggestion[];
  aggregates: FeaturePackAggregates;
  generatedAt?: number;
}

export interface FeaturePackBuildInput {
  unit: 'metric' | 'imperial';
  surface: NarrateSurface;
  insights?: ReadonlyArray<CoachingInsight | FeaturePackInsight>;
  suggestions?: ReadonlyArray<TrainingSuggestion | FeaturePackSuggestion>;
  aggregates?: FeaturePackAggregates;
  generatedAt?: number;
  ruleVersion?: string;
}

function sortKeys(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(sortKeys);
  const rec = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(rec).sort()) {
    const next = rec[key];
    if (next === undefined) continue;
    sorted[key] = sortKeys(next);
  }
  return sorted;
}

/** Sorted-key JSON without `generatedAt` — hash input. */
export function canonicalizeFeaturePack(pack: FeaturePackV1): string {
  const { generatedAt: _generatedAt, ...rest } = pack;
  return JSON.stringify(sortKeys(rest));
}

export async function hashFeaturePack(pack: FeaturePackV1): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    canonicalizeFeaturePack(pack),
  );
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function featurePackByteLength(pack: FeaturePackV1): number {
  return utf8ByteLength(JSON.stringify(pack));
}

export function assertFeaturePackSize(pack: FeaturePackV1): void {
  const bytes = featurePackByteLength(pack);
  if (bytes > MAX_FEATURE_PACK_BYTES) {
    throw new Error(`FeaturePack exceeds ${MAX_FEATURE_PACK_BYTES} bytes (${bytes})`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
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
    exerciseName: item.exerciseName,
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

function validateInsight(item: unknown, index: number): string | null {
  if (!isRecord(item)) return `insights[${index}] must be an object`;
  if (!isString(item.id) || !item.id) return `insights[${index}].id is required`;
  if (!isString(item.kind) || !item.kind) return `insights[${index}].kind is required`;
  if (!isString(item.severity) || !item.severity) return `insights[${index}].severity is required`;
  if (!isString(item.title)) return `insights[${index}].title must be a string`;
  if (!isString(item.body)) return `insights[${index}].body must be a string`;
  if ('href' in item) return `insights[${index}] must not include href`;
  return null;
}

function validateSuggestion(item: unknown, index: number): string | null {
  if (!isRecord(item)) return `suggestions[${index}] must be an object`;
  if (!isString(item.exerciseName) || !item.exerciseName) {
    return `suggestions[${index}].exerciseName is required`;
  }
  if (!isFiniteNumber(item.weight)) return `suggestions[${index}].weight must be a number`;
  if (!isFiniteNumber(item.reps)) return `suggestions[${index}].reps must be a number`;
  if (!isFiniteNumber(item.targetSets)) return `suggestions[${index}].targetSets must be a number`;
  if (!isString(item.reasonCode) || !item.reasonCode) {
    return `suggestions[${index}].reasonCode is required`;
  }
  if (!isString(item.reasonText)) return `suggestions[${index}].reasonText must be a string`;
  if ('exerciseId' in item) return `suggestions[${index}] must not include exerciseId`;
  return null;
}

function validateAggregates(value: unknown): string | null {
  if (!isRecord(value)) return 'aggregates must be an object';
  if (value.sessionsThisWeek !== undefined && !isFiniteNumber(value.sessionsThisWeek)) {
    return 'aggregates.sessionsThisWeek must be a number';
  }
  if (value.weeklyStreak !== undefined && !isFiniteNumber(value.weeklyStreak)) {
    return 'aggregates.weeklyStreak must be a number';
  }
  if (
    value.volumeDeltaPct !== undefined &&
    value.volumeDeltaPct !== null &&
    !isFiniteNumber(value.volumeDeltaPct)
  ) {
    return 'aggregates.volumeDeltaPct must be a number or null';
  }
  if (value.prCount !== undefined && !isFiniteNumber(value.prCount)) {
    return 'aggregates.prCount must be a number';
  }
  if (
    value.readiness !== undefined &&
    value.readiness !== null &&
    value.readiness !== 'fresh' &&
    value.readiness !== 'ok' &&
    value.readiness !== 'tired'
  ) {
    return 'aggregates.readiness is invalid';
  }
  if (value.recentWeeks !== undefined) {
    if (!Array.isArray(value.recentWeeks)) return 'aggregates.recentWeeks must be an array';
    if (value.recentWeeks.length > MAX_FEATURE_PACK_RECENT_WEEKS) {
      return `aggregates.recentWeeks exceeds ${MAX_FEATURE_PACK_RECENT_WEEKS}`;
    }
  }
  if (value.muscleGap !== undefined && value.muscleGap !== null) {
    if (!isRecord(value.muscleGap)) return 'aggregates.muscleGap must be an object or null';
    if (!isString(value.muscleGap.highMuscle) || !isString(value.muscleGap.lowMuscle)) {
      return 'aggregates.muscleGap requires highMuscle and lowMuscle';
    }
  }
  if ('notes' in value || 'photos' in value) return 'aggregates must not include notes or photos';
  return null;
}

export function validateFeaturePack(
  pack: unknown,
): { ok: true; pack: FeaturePackV1 } | { ok: false; error: string } {
  if (!isRecord(pack)) return { ok: false, error: 'pack must be an object' };
  if (pack.version !== FEATURE_PACK_VERSION) {
    return { ok: false, error: `version must be ${FEATURE_PACK_VERSION}` };
  }
  if (!isString(pack.ruleVersion) || !pack.ruleVersion) {
    return { ok: false, error: 'ruleVersion is required' };
  }
  if (pack.unit !== 'metric' && pack.unit !== 'imperial') {
    return { ok: false, error: 'unit must be metric or imperial' };
  }
  if (pack.surface !== 'post_session' && pack.surface !== 'home') {
    return { ok: false, error: 'surface must be post_session or home' };
  }
  if (!Array.isArray(pack.insights)) return { ok: false, error: 'insights must be an array' };
  if (pack.insights.length > MAX_FEATURE_PACK_INSIGHTS) {
    return { ok: false, error: `insights exceed ${MAX_FEATURE_PACK_INSIGHTS}` };
  }
  for (let i = 0; i < pack.insights.length; i++) {
    const err = validateInsight(pack.insights[i], i);
    if (err) return { ok: false, error: err };
  }
  if (!Array.isArray(pack.suggestions)) return { ok: false, error: 'suggestions must be an array' };
  if (pack.suggestions.length > MAX_FEATURE_PACK_SUGGESTIONS) {
    return { ok: false, error: `suggestions exceed ${MAX_FEATURE_PACK_SUGGESTIONS}` };
  }
  for (let i = 0; i < pack.suggestions.length; i++) {
    const err = validateSuggestion(pack.suggestions[i], i);
    if (err) return { ok: false, error: err };
  }
  const aggErr = validateAggregates(pack.aggregates);
  if (aggErr) return { ok: false, error: aggErr };
  if (pack.generatedAt !== undefined && !isFiniteNumber(pack.generatedAt)) {
    return { ok: false, error: 'generatedAt must be a number' };
  }
  if ('notes' in pack || 'photos' in pack) {
    return { ok: false, error: 'pack must not include notes or photos' };
  }

  const typed = pack as unknown as FeaturePackV1;
  try {
    assertFeaturePackSize(typed);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'FeaturePack too large' };
  }
  return { ok: true, pack: typed };
}
