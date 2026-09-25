import type { FeaturePackV1 } from './feature-pack';

export interface CoachNarration {
  headline: string;
  paragraphs: string[];
  citedInsightIds: string[];
}

export const MAX_NARRATION_HEADLINE = 80;
export const MIN_NARRATION_PARAGRAPHS = 1;
export const MAX_NARRATION_PARAGRAPHS = 3;

const NUMBER_RE = /-?\d+(?:\.\d+)?/g;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeNumberToken(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return String(n);
}

export function extractNumberTokens(text: string): string[] {
  const out: string[] = [];
  for (const match of text.matchAll(NUMBER_RE)) {
    out.push(normalizeNumberToken(match[0]));
  }
  return out;
}

/** Numbers the model may repeat — titles/bodies, suggestion math, aggregates. */
export function collectAllowedNumbers(pack: FeaturePackV1): Set<string> {
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
  const agg = pack.aggregates;
  if (typeof agg.sessionsThisWeek === 'number') parts.push(String(agg.sessionsThisWeek));
  if (typeof agg.weeklyStreak === 'number') parts.push(String(agg.weeklyStreak));
  if (typeof agg.volumeDeltaPct === 'number') parts.push(String(agg.volumeDeltaPct));
  if (typeof agg.prCount === 'number') parts.push(String(agg.prCount));
  if (Array.isArray(agg.recentWeeks)) {
    for (const week of agg.recentWeeks) {
      parts.push(String(week.sessions), String(week.volume));
    }
  }
  return new Set(extractNumberTokens(parts.join(' ')));
}

export function validateNarrationResponse(
  raw: unknown,
  pack: FeaturePackV1,
): { ok: true; narration: CoachNarration } | { ok: false; error: string } {
  // Hard gate: the caller is expected to run `sanitizeNarrationResponse` first
  // (client + edge both do). Anything still invalid here is unrecoverable —
  // invented numbers, empty content — and must fail, never render.
  const sanitized = sanitizeNarrationResponse(raw, pack);
  return validateSanitizedNarration(sanitized, pack);
}

/**
 * Soft sanitizer (Amber `sanitizeIntents` pattern): trim/slice, drop empty
 * paragraphs, dedupe citations and drop unknown ids — return partial success
 * instead of failing on recoverable model padding. Never invents content:
 * headline/paragraphs come only from the model, ids only from the pack.
 * Callers still run the hard `validateNarrationResponse` gate afterwards.
 */
export function sanitizeNarrationResponse(raw: unknown, pack: FeaturePackV1): unknown {
  if (!isRecord(raw)) return raw;
  const allowedIds = new Set(pack.insights.map((i) => i.id));
  const out: Record<string, unknown> = { ...raw };
  if (typeof out.headline === 'string') {
    out.headline = out.headline.trim().slice(0, MAX_NARRATION_HEADLINE);
  }
  if (Array.isArray(out.paragraphs)) {
    const cleaned = out.paragraphs
      .filter((p): p is string => typeof p === 'string')
      .map((p) => p.trim())
      .filter(Boolean)
      .slice(0, MAX_NARRATION_PARAGRAPHS);
    out.paragraphs = cleaned;
  }
  if (Array.isArray(out.citedInsightIds)) {
    const seen = new Set<string>();
    const cited: string[] = [];
    for (const id of out.citedInsightIds) {
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
  if (headline.length > MAX_NARRATION_HEADLINE) {
    return { ok: false, error: `headline exceeds ${MAX_NARRATION_HEADLINE} characters` };
  }
  if (!Array.isArray(raw.paragraphs)) return { ok: false, error: 'paragraphs must be an array' };
  const paragraphs = raw.paragraphs
    .filter((p): p is string => typeof p === 'string')
    .map((p) => p.trim())
    .filter(Boolean);
  if (paragraphs.length < MIN_NARRATION_PARAGRAPHS || paragraphs.length > MAX_NARRATION_PARAGRAPHS) {
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
  const spoken = extractNumberTokens([headline, ...paragraphs].join(' '));
  for (const token of spoken) {
    if (!allowedNumbers.has(token)) {
      return { ok: false, error: `narration contains number not present in pack: ${token}` };
    }
  }

  return { ok: true, narration: { headline, paragraphs, citedInsightIds } };
}
