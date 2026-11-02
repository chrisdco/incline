/**
 * Structured "why this weight?" reasons.
 *
 * Numbers are computed elsewhere (`suggestNextLoad` in ./overload, plus the
 * RPE and readiness adjustments). This module only *explains* a finished
 * suggestion: it maps the rule that fired to a stable id, records the
 * inputs that rule saw, and renders a deterministic sentence from a
 * template. It never changes a weight or rep count.
 *
 * Plateau / return-after-break are advisory signals layered on top: they
 * add a sentence, never a different number. Program-level deload comes from
 * `detectDeload` (./deload) and is wrapped by {@link buildDeloadReason}.
 */
import { estimated1RM, formatWeight } from '@/db/calc';
import type { Unit } from '@/db/types';
import { smallestIncrement } from './plates';
import {
  ALREADY_DELOADED_RATIO,
  COOLDOWN_DAYS,
  deloadSentence,
  MIN_STREAK_WEEKS,
  type DeloadSuggestion,
} from './deload';
import type { LastWorkingSet, ReadinessLevel, ReasonCode, TrainingSuggestion } from './types';

export const REASON_SCHEMA_VERSION = 1;

/** Sessions in a row without a heavier/stronger top set before we call it a plateau. */
export const PLATEAU_SESSIONS = 4;
/** Minimum e1RM gain (fraction) that counts as an improvement, so rounding noise doesn't. */
export const PLATEAU_MIN_GAIN = 0.005;
/** Gap since the last session that earns a "coming back from a break" note. */
export const RETURN_AFTER_BREAK_DAYS = 21;
/** How many recent sessions callers should load per exercise for these checks. */
export const REASON_HISTORY_SESSIONS = PLATEAU_SESSIONS + 1;

const DAY_MS = 86_400_000;

export type CoachingRule =
  | 'first-time'
  | 'progress'
  | 'add-reps'
  | 'repeat'
  | 'match-top-set'
  | 'rpe-hold'
  | 'readiness'
  | 'deload';

export type CoachingSignalRule = 'plateau' | 'return-after-break';

export const RULE_LABEL: Record<CoachingRule | CoachingSignalRule, string> = {
  'first-time': 'First time',
  progress: 'Add weight',
  'add-reps': 'Add a rep',
  repeat: 'Repeat weight',
  'match-top-set': 'Match top set',
  'rpe-hold': 'Hard last set: hold',
  readiness: 'Tired check-in: lighter',
  deload: 'Deload',
  plateau: 'Plateau',
  'return-after-break': 'Back from a break',
};

/** One session's heaviest working set (newest first in arrays). */
export interface TopSetSample {
  startedAt: number;
  weight: number;
  reps: number;
}

export interface CoachingSignal {
  rule: CoachingSignalRule;
  sentence: string;
}

export interface CoachingReasonInputs {
  lastSets: LastWorkingSet[];
  lastSessionAt: number | null;
  daysSinceLast: number | null;
  targetRepsMin: number;
  targetRepsMax: number;
  targetSets: number;
  /** Sets last session at or above the top of the rep range. */
  setsAtTarget: number;
  /** Consecutive recent sessions whose top set reached the top of the range. */
  sessionsAtTarget: number;
  /** Plate step in the exercise's display unit (2.5 kg / 5 lb). */
  increment: number;
  incrementSource: 'plate-step';
  unit: Unit;
  unitSource: 'exercise' | 'global';
  readiness: ReadinessLevel | null;
  lastSetRpe: number | null;
}

export interface CoachingReason {
  version: typeof REASON_SCHEMA_VERSION;
  rule: CoachingRule;
  /** The overload reason code that produced the number. */
  sourceCode: ReasonCode | 'deload_week';
  ruleVersion: string;
  inputs: CoachingReasonInputs | null;
  output:
    | { kind: 'load'; weight: number; reps: number; sets: number }
    | { kind: 'volume'; scale: number; weeksTrained: number };
  sentence: string;
  signals: CoachingSignal[];
}

const RULE_BY_CODE: Record<ReasonCode, CoachingRule> = {
  no_history: 'first-time',
  hit_rep_range_increase_load: 'progress',
  all_sets_maxed: 'progress',
  hold_weight_add_reps: 'add-reps',
  partial_miss_hold: 'repeat',
  high_rpe_hold: 'rpe-hold',
  readiness_hold: 'readiness',
};

export function ruleForCode(code: ReasonCode, lastSets: LastWorkingSet[]): CoachingRule {
  if (code === 'partial_miss_hold' && !sameWeight(lastSets)) return 'match-top-set';
  return RULE_BY_CODE[code];
}

function sameWeight(sets: LastWorkingSet[]): boolean {
  if (sets.length === 0) return true;
  return sets.every((s) => Math.abs(s.weight - sets[0].weight) < 0.01);
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function whenPhrase(at: number | null, now: number): string {
  if (at == null) return 'last time';
  const days = Math.floor((startOfLocalDay(now) - startOfLocalDay(at)) / DAY_MS);
  if (days <= 0) return 'earlier today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `on ${WEEKDAYS[new Date(at).getDay()]}`;
  return `${days} days ago`;
}

function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** "3×8 at 80 kg", or "8, 8, 6 at 80 kg" when reps differ; mixed loads list each set. */
export function describeSets(sets: LastWorkingSet[], unit: Unit): string {
  if (sets.length === 0) return 'no working sets';
  if (!sameWeight(sets)) {
    return sets.map((s) => `${formatWeight(s.weight, unit)}×${s.reps}`).join(', ');
  }
  const w = formatWeight(sets[0].weight, unit);
  const reps = sets.map((s) => s.reps);
  if (reps.every((r) => r === reps[0])) return `${sets.length}×${reps[0]} at ${w}`;
  return `${reps.join(', ')} reps at ${w}`;
}

/** Deterministic sentence for a load suggestion. Only uses numbers in `inputs` / `output`. */
export function reasonSentence(
  rule: CoachingRule,
  inputs: CoachingReasonInputs,
  output: { weight: number; reps: number },
  now: number,
): string {
  const { unit } = inputs;
  const last = describeSets(inputs.lastSets, unit);
  const when = whenPhrase(inputs.lastSessionAt, now);
  const next = `${formatWeight(output.weight, unit)} × ${output.reps}`;
  const range = `${inputs.targetRepsMin}–${inputs.targetRepsMax}`;
  const topWeight = inputs.lastSets.reduce((m, s) => Math.max(m, s.weight), 0);
  const delta = output.weight - topWeight;
  switch (rule) {
    case 'first-time':
      return `No working sets logged yet, so start at your target of ${inputs.targetRepsMin} reps and pick a weight that feels solid.`;
    case 'progress':
      return `You did ${last} ${when}, reaching the top of your ${range} range, so add ${formatWeight(delta, unit)}: ${next}.`;
    case 'add-reps':
      return `You did ${last} ${when}, inside your ${range} range, so keep the weight and add a rep: ${next}.`;
    case 'repeat':
      return `You did ${last} ${when}; not every set reached ${inputs.targetRepsMin} reps, so repeat the weight: ${next}.`;
    case 'match-top-set':
      return `You used mixed loads ${when} (${last}), so match your heaviest working set: ${next}.`;
    case 'rpe-hold':
      return `You did ${last} ${when} and rated the last set RPE ${inputs.lastSetRpe}, so hold the weight: ${next}.`;
    case 'readiness':
      return `You did ${last} ${when}, but checked in tired today, so go a little lighter: ${next}.`;
    case 'deload':
      return `Lighter week suggested: ${next}.`;
  }
}

/**
 * Consecutive sessions (newest first) without beating the session before them.
 * `history` is newest first. Returns how many recent sessions failed to
 * improve on the best e1RM seen before them; 0 if the latest improved.
 */
export function sessionsWithoutImprovement(history: TopSetSample[]): number {
  let count = 0;
  for (let i = 0; i < history.length - 1; i++) {
    const cur = estimated1RM(history[i].weight, history[i].reps);
    const before = Math.max(...history.slice(i + 1).map((h) => estimated1RM(h.weight, h.reps)));
    if (cur > before * (1 + PLATEAU_MIN_GAIN)) break;
    count++;
  }
  return count;
}

/** Conservative plateau check: needs {@link REASON_HISTORY_SESSIONS} sessions of history. */
export function detectPlateau(history: TopSetSample[]): { sessions: number } | null {
  if (history.length < REASON_HISTORY_SESSIONS) return null;
  const n = sessionsWithoutImprovement(history.slice(0, REASON_HISTORY_SESSIONS));
  return n >= PLATEAU_SESSIONS ? { sessions: n } : null;
}

/** {@link detectPlateau} as a displayable signal (exercise detail, Progress "Stalled lifts"). */
export function plateauSignal(history: TopSetSample[]): CoachingSignal | null {
  const plateau = detectPlateau(history);
  if (!plateau) return null;
  return {
    rule: 'plateau',
    sentence: `Your top set hasn't improved in ${plateau.sessions} sessions. Consider a lighter week or a different rep range.`,
  };
}

export function sessionsAtTarget(history: TopSetSample[], targetRepsMax: number): number {
  let n = 0;
  for (const h of history) {
    if (h.reps < targetRepsMax) break;
    n++;
  }
  return n;
}

export interface ExplainContext {
  lastSets: LastWorkingSet[];
  /** Recent sessions' top sets, newest first. May be empty. */
  history: TopSetSample[];
  targetRepsMin: number;
  targetRepsMax: number;
  unit: Unit;
  unitSource: 'exercise' | 'global';
  readiness: ReadinessLevel | null | undefined;
  now: number;
}

/** Attach a reason to an already computed suggestion. Pure; does not touch weight/reps. */
export function explainSuggestion(s: TrainingSuggestion, ctx: ExplainContext): CoachingReason {
  const lastSets = ctx.lastSets.filter((x) => x.weight > 0 && x.reps > 0);
  const lastSessionAt = ctx.history[0]?.startedAt ?? null;
  const daysSinceLast =
    lastSessionAt == null ? null : Math.max(0, Math.floor((ctx.now - lastSessionAt) / DAY_MS));
  const lastRpe = lastSets.length > 0 ? lastSets[lastSets.length - 1].rpe ?? null : null;
  const inputs: CoachingReasonInputs = {
    lastSets,
    lastSessionAt,
    daysSinceLast,
    targetRepsMin: ctx.targetRepsMin,
    targetRepsMax: ctx.targetRepsMax,
    targetSets: s.targetSets,
    setsAtTarget: lastSets.filter((x) => x.reps >= ctx.targetRepsMax).length,
    sessionsAtTarget: sessionsAtTarget(ctx.history, ctx.targetRepsMax),
    increment: smallestIncrement(ctx.unit),
    incrementSource: 'plate-step',
    unit: ctx.unit,
    unitSource: ctx.unitSource,
    readiness: ctx.readiness ?? null,
    lastSetRpe: lastRpe,
  };
  const rule = ruleForCode(s.reasonCode, lastSets);
  const signals: CoachingSignal[] = [];
  if (daysSinceLast != null && daysSinceLast >= RETURN_AFTER_BREAK_DAYS) {
    signals.push({
      rule: 'return-after-break',
      sentence: `Your last session was ${daysSinceLast} days ago. The suggestion doesn't adjust for breaks, so start lighter if it feels heavy.`,
    });
  }
  const plateau = rule === 'progress' ? null : plateauSignal(ctx.history);
  if (plateau) signals.push(plateau);
  return {
    version: REASON_SCHEMA_VERSION,
    rule,
    sourceCode: s.reasonCode,
    ruleVersion: s.ruleVersion,
    inputs,
    output: { kind: 'load', weight: s.weight, reps: s.reps, sets: s.targetSets },
    sentence: reasonSentence(rule, inputs, s, ctx.now),
    signals,
  };
}

/** Program-level deload (from `detectDeload`) as a reason with rule `deload`. */
export function buildDeloadReason(d: DeloadSuggestion, ruleVersion: string): CoachingReason {
  return {
    version: REASON_SCHEMA_VERSION,
    rule: 'deload',
    sourceCode: 'deload_week',
    ruleVersion,
    inputs: null,
    output: { kind: 'volume', scale: d.volumeScale, weeksTrained: d.weeksTrained },
    sentence: deloadSentence(d),
    signals: [],
  };
}

/** One labelled input behind a reason, for "why?" lists. */
export interface ReasonInputRow {
  label: string;
  value: string;
}

export interface DeloadReasonDetail {
  reason: CoachingReason;
  inputs: ReasonInputRow[];
  /** Plain-language statement of the rule that fired. */
  rule: string;
}

/** Deload reason plus the inputs and rule it came from, for the deload screen. */
export function deloadReasonDetail(d: DeloadSuggestion, ruleVersion: string): DeloadReasonDetail {
  const reason = buildDeloadReason(d, ruleVersion);
  const pct = Math.round(d.volumeScale * 100);
  return {
    reason,
    inputs: [
      { label: 'Training weeks in a row', value: String(d.weeksTrained) },
      { label: 'Suggested from', value: `${MIN_STREAK_WEEKS} weeks` },
      { label: 'Working sets for one week', value: `About ${pct}%` },
    ],
    rule: `${RULE_LABEL.deload} (rules ${ruleVersion}): suggested after ${MIN_STREAK_WEEKS} or more training weeks in a row, unless last week was already at or under ${Math.round(ALREADY_DELOADED_RATIO * 100)}% of your recent volume or you applied a deload in the last ${COOLDOWN_DAYS} days.`,
  };
}
