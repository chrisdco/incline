const COACHING_RULE_VERSION = '1.3.0';

type CoachingInsight = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string;
};
type TrainingSuggestion = {
  exerciseName: string;
  weight: number;
  reps: number;
  targetSets: number;
  reasonCode: string;
  reasonText: string;
};

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
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalizeFeaturePack(pack)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

function sanitizeSuggestion(
  item: TrainingSuggestion | FeaturePackSuggestion,
): FeaturePackSuggestion {
  return {
    exerciseName: item.exerciseName,
    weight: item.weight,
    reps: item.reps,
    targetSets: item.targetSets,
    reasonCode: item.reasonCode,
    reasonText: item.reasonText,
  };
}

function sanitizeAggregates(aggregates: FeaturePackAggregates | undefined): FeaturePackAggregates {
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
      volume: week.volume,
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
      .map(sanitizeSuggestion),
    aggregates: sanitizeAggregates(input.aggregates),
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

export interface CoachNarration {
  headline: string;
  paragraphs: string[];
  citedInsightIds: string[];
}

const NUMBER_RE = /-?\d+(?:\.\d+)?/g;

function normalizeNumberToken(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(n);
}

function extractNumberTokens(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(NUMBER_RE)) {
    out.push(normalizeNumberToken(match[0]));
  }
  return out;
}

function collectAllowedNumbers(pack: FeaturePackV1): Set<string> {
  const parts: string[] = [];
  for (const insight of pack.insights) {
    parts.push(insight.title, insight.body);
  }
  for (const suggestion of pack.suggestions) {
    parts.push(
      suggestion.reasonText,
      String(suggestion.weight),
      String(suggestion.reps),
      String(suggestion.targetSets),
    );
  }
  const agg = pack.aggregates as Record<string, unknown>;
  if (typeof agg.sessionsThisWeek === 'number') parts.push(String(agg.sessionsThisWeek));
  if (typeof agg.weeklyStreak === 'number') parts.push(String(agg.weeklyStreak));
  if (typeof agg.volumeDeltaPct === 'number') parts.push(String(agg.volumeDeltaPct));
  if (typeof agg.prCount === 'number') parts.push(String(agg.prCount));
  // Parity with src/coaching/narrate-validate.ts: recent-week numbers are
  // speakable. A shared package would be better than this comment (Batch G).
  if (Array.isArray(agg.recentWeeks)) {
    for (const week of agg.recentWeeks as { sessions: unknown; volume: unknown }[]) {
      if (typeof week.sessions === 'number') parts.push(String(week.sessions));
      if (typeof week.volume === 'number') parts.push(String(week.volume));
    }
  }
  return new Set(extractNumberTokens(parts.join(' ')));
}

export function validateNarrationResponse(
  raw: unknown,
  pack: FeaturePackV1,
): { ok: true; narration: CoachNarration } | { ok: false; error: string } {
  // Hard gate: sanitize first (client mirrors this). Anything still invalid —
  // invented numbers, empty content — must fail, never render.
  const sanitized = sanitizeNarrationResponse(raw, pack);
  return validateSanitizedNarration(sanitized, pack);
}

/**
 * Soft sanitizer (Amber `sanitizeIntents` pattern): trim/slice, drop empty
 * paragraphs, dedupe citations and drop unknown ids — return partial success
 * instead of a 502 on recoverable model padding. Never invents content.
 * NOTE: keep in sync with `src/coaching/narrate-validate.ts`.
 */
export function sanitizeNarrationResponse(raw: unknown, pack: FeaturePackV1): unknown {
  if (!isRecord(raw)) return raw;
  const allowedIds = new Set(pack.insights.map((i) => i.id));
  const out: Record<string, unknown> = { ...(raw as Record<string, unknown>) };
  if (typeof out.headline === 'string') {
    out.headline = out.headline.trim().slice(0, 80);
  }
  if (Array.isArray(out.paragraphs)) {
    const cleaned = (out.paragraphs as unknown[])
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, 3);
    out.paragraphs = cleaned;
  }
  if (Array.isArray(out.citedInsightIds)) {
    const seen = new Set<string>();
    const cited: string[] = [];
    for (const id of out.citedInsightIds as unknown[]) {
      if (typeof id !== 'string' || !id) continue;
      if (!allowedIds.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      cited.push(id);
    }
    out.citedInsightIds = cited;
  }
  return out;
}

function validateSanitizedNarration(
  raw: unknown,
  pack: FeaturePackV1,
): { ok: true; narration: CoachNarration } | { ok: false; error: string } {
  if (!isRecord(raw)) return { ok: false, error: 'narration must be an object' };
  if (typeof raw.headline !== 'string') return { ok: false, error: 'headline must be a string' };
  const headline = raw.headline.trim();
  if (!headline) return { ok: false, error: 'headline is required' };
  if (headline.length > 80) return { ok: false, error: 'headline exceeds 80 characters' };
  if (!Array.isArray(raw.paragraphs)) return { ok: false, error: 'paragraphs must be an array' };
  const paragraphs = raw.paragraphs
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length < 1 || paragraphs.length > 3) {
    return { ok: false, error: 'paragraphs must contain 1–3 non-empty strings' };
  }
  if (paragraphs.length !== raw.paragraphs.length) {
    return { ok: false, error: 'paragraphs must be non-empty strings' };
  }
  if (!Array.isArray(raw.citedInsightIds)) {
    return { ok: false, error: 'citedInsightIds must be an array' };
  }
  const allowedIds = new Set(pack.insights.map((i) => i.id));
  const citedInsightIds: string[] = [];
  for (const id of raw.citedInsightIds) {
    if (typeof id !== 'string' || !id) return { ok: false, error: 'citedInsightIds must be strings' };
    if (!allowedIds.has(id)) return { ok: false, error: `citedInsightIds contains unknown id ${id}` };
    if (!citedInsightIds.includes(id)) citedInsightIds.push(id);
  }
  const allowedNumbers = collectAllowedNumbers(pack);
  for (const token of extractNumberTokens([headline, ...paragraphs].join(' '))) {
    if (!allowedNumbers.has(token)) {
      return { ok: false, error: `narration contains number not present in pack: ${token}` };
    }
  }
  return { ok: true, narration: { headline, paragraphs, citedInsightIds } };
}

export function stubNarration(pack: FeaturePackV1): CoachNarration {
  const ids = pack.insights.slice(0, 3).map((i) => i.id);
  const headline = (pack.insights[0]?.title || 'Coach recap').slice(0, 80);
  const body =
    pack.insights[0]?.body ||
    'Stub narration for smoke tests. Rule numbers in the pack are unchanged.';
  return { headline, paragraphs: [body], citedInsightIds: ids };
}
