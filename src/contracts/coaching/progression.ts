/**
 * Plateau findings and their fixes (docs/decisions/PROGRESSION.md). Pure and
 * shared: the app, incline-mcp, the web app and Ask all run this, so every
 * surface names the same stalled lifts, the same cause and the same fix.
 *
 * Weights are canonical kg. Histories are one row per session (that
 * session's heaviest working set), newest first.
 */
import { KG_PER_LB, type Unit } from '../mcp/tools';
import { MAJOR_MUSCLES, MAX_DIRECT_SETS_PER_SESSION, MAX_SETS_PER_ROW, WEEKLY_SETS, type PlanExperience } from '../plans/rules';

export const PROGRESSION_RULE_VERSION = 'progression-1';

/** Sessions in a row without beating the best before them. */
export const PLATEAU_SESSIONS = 4;
/** e1RM gain (fraction) that counts as progress, so rounding noise doesn't. */
export const PLATEAU_MIN_GAIN = 0.005;
/** History needed for the check: the stalled run plus the session it failed to beat. */
export const PLATEAU_HISTORY = PLATEAU_SESSIONS + 1;
/** A stall this long is "long": a variation is worth trying. */
export const LONG_STALL_SESSIONS = 8;
/** How many sessions per lift hosts should load. */
export const PROGRESSION_HISTORY = LONG_STALL_SESSIONS + 1;
/** Lifts not trained this recently are paused, not stalled. */
export const STALLED_RECENT_DAYS = 42;

/** Reset: the new top load as a fraction of the stalled one. */
export const RESET_FRACTION = 0.9;
/** RPE that counts as "very hard" for the fatigue check. */
export const FATIGUE_RPE = 9;
/** This many lifts stalled at once, after this many straight weeks, reads as program-wide fatigue. */
export const FATIGUE_LIFTS = 3;
export const FATIGUE_STREAK_WEEKS = 4;
/** No second deload this soon after one. */
export const DELOAD_COOLDOWN_DAYS = 21;
/** A declined fix stays quiet for this many more sessions of the lift. */
export const DECLINE_RESUME_SESSIONS = 3;

/** Safety bounds for any proposal, house or AI (PROGRAMMING §2). Not opinions. */
export const BOUNDS = {
  loadCutMax: 0.3,
  loadRaiseMax: 0.1,
  sets: [1, MAX_DIRECT_SETS_PER_SESSION] as const,
  reps: [1, 30] as const,
};

const DAY_MS = 86_400_000;

export type Remedy = 'reset' | 'add_set' | 'rep_range' | 'swap' | 'deload';
export const REMEDIES: readonly Remedy[] = ['reset', 'add_set', 'rep_range', 'swap', 'deload'];

export type Cause = 'fatigue_program' | 'fatigue_lift' | 'low_volume' | 'long_stall' | 'stuck';

export type EvidenceGrade = 'A' | 'B' | 'C';
export interface Evidence {
  grade: EvidenceGrade;
  /** One line: what the evidence says. */
  basis: string;
  source: string;
}

export type RemedyPlan =
  | { remedy: 'reset'; weightKg: number; fromKg: number }
  | { remedy: 'add_set'; sets: number; fromSets: number }
  | { remedy: 'rep_range'; min: number; max: number; fromMin: number; fromMax: number }
  /** `substituteKey` null = the host picks a close variation. */
  | { remedy: 'swap'; substituteKey: string | null; substituteName: string | null }
  | { remedy: 'deload'; scale: number };

export interface FixOption {
  plan: RemedyPlan;
  /** Deterministic sentence, display unit applied. */
  sentence: string;
  evidence: Evidence;
  /** Auto-apply eligible under "Auto-apply small fixes". */
  lowRisk: boolean;
}

export interface LiftSession {
  at: number;
  /** Heaviest working set of the session. */
  weightKg: number;
  reps: number;
  /** RPE of that set, when logged. */
  rpe?: number | null;
  /** Working sets of this lift in the session. */
  sets?: number | null;
}

export interface LiftHistory {
  /** Synced exercise ref key (`catalog:…` / `custom:…`). */
  key: string;
  name: string;
  muscle: string | null;
  /** Newest first. */
  sessions: readonly LiftSession[];
  /** The routine's rep range for this lift, when the host knows it. */
  repRange?: { min: number; max: number } | null;
}

export type DecisionStatus = 'proposed' | 'applied' | 'declined' | 'done' | 'reverted';
export type DecisionSource = 'coach' | 'user' | 'web' | 'app_ai' | `mcp:${string}`;

/** A row of `progression_decisions`, as every surface reads it. */
export interface ProgressionDecision {
  id: string;
  exerciseKey: string;
  remedy: Remedy | 'keep_going';
  params: RemedyPlan | null;
  status: DecisionStatus;
  source: DecisionSource;
  rationale: string;
  ruleVersion: string;
  resumeAfterSessions: number | null;
  createdAt: number;
  resolvedAt: number | null;
}

export interface ProgressionContext {
  now: number;
  unit: Unit;
  /** Load step in the display unit (gym plates); default 2.5 kg / 5 lb. */
  incrementDisplay?: number;
  experience: PlanExperience;
  /** Average weekly fractional sets per primary muscle (recent weeks). */
  weeklyMuscleSets: Readonly<Record<string, number>>;
  /** Consecutive weeks with at least one workout, ending this week. */
  trainingStreakWeeks: number;
  /** When the last deload week was applied, if any. */
  lastDeloadAt?: number | null;
  decisions?: readonly ProgressionDecision[];
}

export type FindingStatus = 'open' | 'proposed' | 'applied';

export interface PlateauFinding {
  exerciseKey: string;
  name: string;
  muscle: string | null;
  /** Sessions in a row without progress. */
  sessions: number;
  /** The best the stalled sessions failed to beat. */
  best: { weightKg: number; reps: number; e1rmKg: number; at: number };
  lastAt: number;
  cause: Cause;
  causeText: string;
  fix: FixOption;
  /** Other reasonable fixes, best first. */
  alternatives: FixOption[];
  status: FindingStatus;
  /** The open decision behind `status` (proposed / applied), if any. */
  decision: ProgressionDecision | null;
  ruleVersion: string;
}

// ---------- detection ----------

/** Epley, same as the app's `estimated1RM` (rounded to 0.01). */
export function e1rm(weightKg: number, reps: number): number {
  if (!(reps > 0) || !(weightKg > 0)) return 0;
  if (reps === 1) return Math.round(weightKg * 100) / 100;
  return Math.round(weightKg * (1 + reps / 30) * 100) / 100;
}

/** Sessions in a row (newest first) that didn't beat the best before them. */
export function sessionsWithoutImprovement(history: readonly LiftSession[]): number {
  let count = 0;
  for (let i = 0; i < history.length - 1; i++) {
    const cur = e1rm(history[i]!.weightKg, history[i]!.reps);
    let before = 0;
    for (let j = i + 1; j < history.length; j++) before = Math.max(before, e1rm(history[j]!.weightKg, history[j]!.reps));
    if (cur > before * (1 + PLATEAU_MIN_GAIN)) break;
    count++;
  }
  return count;
}

/** Plateau over the most recent {@link PLATEAU_HISTORY} sessions; the run length looks further back. */
export function detectPlateau(history: readonly LiftSession[]): { sessions: number } | null {
  if (history.length < PLATEAU_HISTORY) return null;
  if (sessionsWithoutImprovement(history.slice(0, PLATEAU_HISTORY)) < PLATEAU_SESSIONS) return null;
  return { sessions: sessionsWithoutImprovement(history) };
}

/** The app's one-line plateau note (exercise detail, "Why this weight?"). */
export function plateauSentence(sessions: number): string {
  return `Your top set hasn't improved in ${sessions} sessions. Consider a lighter week or a different rep range.`;
}

// ---------- formatting ----------

function stepDisplay(unit: Unit, increment?: number): number {
  return increment != null && increment > 0 ? increment : unit === 'imperial' ? 5 : 2.5;
}

function toDisplay(kg: number, unit: Unit): number {
  return unit === 'imperial' ? kg / KG_PER_LB : kg;
}

function fromDisplay(v: number, unit: Unit): number {
  return unit === 'imperial' ? v * KG_PER_LB : v;
}

/** Round a kg load to the nearest plate step in the display unit. */
export function roundLoadKg(kg: number, unit: Unit, increment?: number): number {
  const step = stepDisplay(unit, increment);
  const shown = Math.round(toDisplay(kg, unit) / step) * step;
  return Math.round(fromDisplay(shown, unit) * 1000) / 1000;
}

export function formatLoad(kg: number, unit: Unit): string {
  const v = Math.round(toDisplay(kg, unit) * 10) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} ${unit === 'imperial' ? 'lb' : 'kg'}`;
}

// ---------- evidence ----------

export const EVIDENCE: Record<Remedy, Evidence> = {
  reset: {
    grade: 'C',
    basis: 'Dropping the load and building back up is the standard fix when a single lift stalls.',
    source: 'Coaching convention (PROGRAMMING.md §3)',
  },
  add_set: {
    grade: 'A',
    basis: 'More weekly hard sets means more growth and strength, up to a point.',
    source: 'Pelland et al. 2024, dose-response meta-regression',
  },
  rep_range: {
    grade: 'A',
    basis: 'Light and heavy loads build similar muscle when sets are hard; a new range changes the stimulus.',
    source: 'Schoenfeld et al. 2017, J Strength Cond Res',
  },
  swap: {
    grade: 'C',
    basis: 'Some exercise variation can help; constant change does not.',
    source: 'Kassiano et al. 2022, systematic review',
  },
  deload: {
    grade: 'C',
    basis: 'A lighter week sheds fatigue; a reduced week beats a week off.',
    source: 'Bell et al. 2023 (Delphi consensus); Coleman et al. 2024',
  },
};

// ---------- fixes ----------

interface LiftNow {
  topKg: number;
  topReps: number;
  sets: number | null;
  range: { min: number; max: number };
}

function liftNow(lift: LiftHistory): LiftNow {
  const last = lift.sessions[0]!;
  const range = lift.repRange ?? (last.reps >= 8 ? { min: 8, max: 12 } : { min: 4, max: 6 });
  return { topKg: last.weightKg, topReps: last.reps, sets: last.sets ?? null, range };
}

function shiftedRange(range: { min: number; max: number }): { min: number; max: number } {
  return range.max >= 8 ? { min: 5, max: 8 } : { min: 8, max: 12 };
}

function option(plan: RemedyPlan, lift: LiftHistory, ctx: ProgressionContext): FixOption {
  const u = ctx.unit;
  let sentence: string;
  switch (plan.remedy) {
    case 'reset':
      sentence = `Drop ${lift.name} to ${formatLoad(plan.weightKg, u)} next time (about ${Math.round((1 - plan.weightKg / plan.fromKg) * 100)}% lighter) and build back up a rep at a time.`;
      break;
    case 'add_set':
      sentence = `Add a set: ${plan.fromSets} → ${plan.sets} sets of ${lift.name} each session.`;
      break;
    case 'rep_range':
      sentence = `Switch ${lift.name} to ${plan.min}–${plan.max} reps for the next block${plan.max < plan.fromMin ? ', heavier' : ', lighter'}.`;
      break;
    case 'swap':
      sentence = plan.substituteName
        ? `Swap ${lift.name} for ${plan.substituteName} for a block, then come back to it.`
        : `Swap ${lift.name} for a close variation for a block, then come back to it.`;
      break;
    case 'deload':
      sentence = `Take a lighter week: same exercises, about ${Math.round(plan.scale * 100)}% of the sets, stop with 3+ reps left.`;
      break;
  }
  return { plan, sentence, evidence: EVIDENCE[plan.remedy], lowRisk: isLowRisk(plan) };
}

/** What "Auto-apply small fixes" may apply without asking. */
export function isLowRisk(plan: RemedyPlan): boolean {
  switch (plan.remedy) {
    case 'reset':
      return plan.fromKg > 0 && plan.weightKg >= plan.fromKg * RESET_FRACTION - 1e-6 && plan.weightKg < plan.fromKg;
    case 'add_set':
      return plan.sets - plan.fromSets === 1;
    case 'rep_range':
      return true;
    default:
      return false;
  }
}

/** Every fix that makes sense for this lift, keyed by remedy (null when not applicable). */
function candidates(lift: LiftHistory, ctx: ProgressionContext): Record<Remedy, RemedyPlan | null> {
  const now = liftNow(lift);
  const resetKg = roundLoadKg(now.topKg * RESET_FRACTION, ctx.unit, ctx.incrementDisplay);
  const range = shiftedRange(now.range);
  const deloadOk = ctx.lastDeloadAt == null || ctx.now - ctx.lastDeloadAt >= DELOAD_COOLDOWN_DAYS * DAY_MS;
  return {
    reset: resetKg > 0 && resetKg < now.topKg ? { remedy: 'reset', weightKg: resetKg, fromKg: now.topKg } : null,
    add_set:
      now.sets != null && now.sets < MAX_SETS_PER_ROW
        ? { remedy: 'add_set', sets: now.sets + 1, fromSets: now.sets }
        : null,
    rep_range: { remedy: 'rep_range', min: range.min, max: range.max, fromMin: now.range.min, fromMax: now.range.max },
    swap: { remedy: 'swap', substituteKey: null, substituteName: null },
    deload: deloadOk ? { remedy: 'deload', scale: 0.6 } : null,
  };
}

const CAUSE_TEXT: Record<Cause, string> = {
  fatigue_program: 'Several lifts stalled together after weeks of straight training: that usually means fatigue, not this lift.',
  fatigue_lift: 'Your recent top sets were very hard (RPE 9+), so the load has run ahead of recovery.',
  low_volume: 'This muscle gets fewer weekly sets than your level needs to keep progressing.',
  long_stall: 'It has been stuck a long time; the same stimulus has stopped working.',
  stuck: 'Same load, same reps for a while: a step back usually gets it moving.',
};

/** Order of fallbacks after the cause's own fix. */
const ALT_ORDER: Record<Cause, Remedy[]> = {
  fatigue_program: ['deload', 'reset', 'rep_range'],
  fatigue_lift: ['reset', 'deload', 'rep_range'],
  low_volume: ['add_set', 'reset', 'rep_range'],
  long_stall: ['swap', 'rep_range', 'reset'],
  stuck: ['reset', 'rep_range', 'add_set', 'swap'],
};

function isFatigued(lift: LiftHistory): boolean {
  const recent = lift.sessions.slice(0, 3).filter((s) => s.rpe != null);
  return recent.filter((s) => (s.rpe ?? 0) >= FATIGUE_RPE).length >= 2;
}

function belowFloor(lift: LiftHistory, ctx: ProgressionContext): boolean {
  if (!lift.muscle || !(MAJOR_MUSCLES as readonly string[]).includes(lift.muscle)) return false;
  return (ctx.weeklyMuscleSets[lift.muscle] ?? 0) < WEEKLY_SETS[ctx.experience][0];
}

// ---------- decisions ----------

/** Latest decision per lift that still counts (reverted ones don't). */
export function latestDecisions(decisions: readonly ProgressionDecision[] = []): Map<string, ProgressionDecision> {
  const out = new Map<string, ProgressionDecision>();
  for (const d of decisions) {
    if (d.status === 'reverted') continue;
    const cur = out.get(d.exerciseKey);
    if (!cur || d.createdAt > cur.createdAt) out.set(d.exerciseKey, d);
  }
  return out;
}

function sessionsSince(lift: LiftHistory, at: number): number {
  return lift.sessions.filter((s) => s.at > at).length;
}

// ---------- findings ----------

interface Stalled {
  lift: LiftHistory;
  sessions: number;
  /** Sessions the check ran on (after an applied fix: only those since). */
  window: readonly LiftSession[];
  decision: ProgressionDecision | null;
}

function stalledLift(lift: LiftHistory, ctx: ProgressionContext, decision: ProgressionDecision | undefined): Stalled | null {
  const last = lift.sessions[0];
  if (!last || ctx.now - last.at > STALLED_RECENT_DAYS * DAY_MS) return null;
  let window = lift.sessions;
  if (decision) {
    if (decision.status === 'proposed') {
      const p = detectPlateau(window);
      return p ? { lift, sessions: p.sessions, window, decision } : null;
    }
    if (decision.status === 'declined' || decision.remedy === 'keep_going') {
      const resume = decision.resumeAfterSessions ?? DECLINE_RESUME_SESSIONS;
      if (sessionsSince(lift, decision.createdAt) < resume) return null;
    } else if (decision.status === 'applied' && sessionsSince(lift, decision.createdAt) === 0) {
      // Fix applied, not trained since: report it as applied.
      const p = detectPlateau(window);
      return p ? { lift, sessions: p.sessions, window, decision } : null;
    } else if (decision.status === 'applied' || decision.status === 'done') {
      // Judge only what happened after the fix (a reset is meant to dip).
      window = lift.sessions.filter((s) => s.at > decision.createdAt);
    }
  }
  const p = detectPlateau(window);
  return p ? { lift, sessions: p.sessions, window, decision: null } : null;
}

/**
 * Every stalled lift with its cause, house fix and alternatives. Most
 * sessions stalled first, then most recently trained.
 */
export function findPlateaus(lifts: readonly LiftHistory[], ctx: ProgressionContext): PlateauFinding[] {
  const decisions = latestDecisions(ctx.decisions);
  const stalled = lifts
    .map((l) => stalledLift(l, ctx, decisions.get(l.key)))
    .filter((s): s is Stalled => s !== null);
  const programFatigue =
    stalled.filter((s) => s.decision?.status !== 'applied').length >= FATIGUE_LIFTS &&
    ctx.trainingStreakWeeks >= FATIGUE_STREAK_WEEKS;

  const out = stalled.map((s): PlateauFinding => {
    const c = candidates(s.lift, ctx);
    let cause: Cause = 'stuck';
    if (programFatigue && c.deload) cause = 'fatigue_program';
    else if (isFatigued(s.lift) && c.reset) cause = 'fatigue_lift';
    else if (belowFloor(s.lift, ctx) && c.add_set) cause = 'low_volume';
    else if (s.sessions >= LONG_STALL_SESSIONS) cause = 'long_stall';
    const order = ALT_ORDER[cause].filter((r) => c[r] !== null);
    const [first, ...rest] = order.map((r) => option(c[r]!, s.lift, ctx));
    const bestRow = s.window.slice(s.sessions).reduce<LiftSession | null>(
      (b, r) => (b === null || e1rm(r.weightKg, r.reps) > e1rm(b.weightKg, b.reps) ? r : b),
      null,
    ) ?? s.window[0]!;
    const status: FindingStatus = s.decision?.status === 'proposed' ? 'proposed' : s.decision?.status === 'applied' ? 'applied' : 'open';
    return {
      exerciseKey: s.lift.key,
      name: s.lift.name,
      muscle: s.lift.muscle,
      sessions: s.sessions,
      best: { weightKg: bestRow.weightKg, reps: bestRow.reps, e1rmKg: e1rm(bestRow.weightKg, bestRow.reps), at: bestRow.at },
      lastAt: s.lift.sessions[0]!.at,
      cause,
      causeText: CAUSE_TEXT[cause],
      fix: first!,
      alternatives: rest,
      status,
      decision: s.decision,
      ruleVersion: PROGRESSION_RULE_VERSION,
    };
  });
  out.sort((a, b) => b.sessions - a.sessions || b.lastAt - a.lastAt);
  return out;
}

/** The fix for one remedy on a finding, if that remedy applies (house params). */
export function fixFor(finding: PlateauFinding, remedy: Remedy): FixOption | null {
  return [finding.fix, ...finding.alternatives].find((o) => o.plan.remedy === remedy) ?? null;
}

// ---------- proposals from anyone else ----------

export type Assessment =
  | { verdict: 'matches'; house: FixOption }
  | { verdict: 'differs'; house: FixOption | null }
  | { verdict: 'unsafe'; problems: string[]; house: FixOption | null };

/** Bounds check for any plan. `current` is the lift's last top set and sets. */
export function boundProblems(plan: RemedyPlan, current: { topKg: number; sets: number | null }): string[] {
  const problems: string[] = [];
  const [smin, smax] = BOUNDS.sets;
  const [rmin, rmax] = BOUNDS.reps;
  switch (plan.remedy) {
    case 'reset': {
      if (!(plan.weightKg > 0)) problems.push('the new load must be above zero');
      else if (current.topKg > 0) {
        const change = plan.weightKg / current.topKg - 1;
        if (change < -BOUNDS.loadCutMax) problems.push(`a ${Math.round(-change * 100)}% cut is more than the ${BOUNDS.loadCutMax * 100}% limit`);
        if (change > BOUNDS.loadRaiseMax) problems.push(`a ${Math.round(change * 100)}% jump is more than the ${BOUNDS.loadRaiseMax * 100}% limit`);
      }
      break;
    }
    case 'add_set':
      if (!Number.isInteger(plan.sets) || plan.sets < smin || plan.sets > smax) problems.push(`sets must be ${smin}–${smax} per session`);
      break;
    case 'rep_range':
      if (!Number.isInteger(plan.min) || !Number.isInteger(plan.max) || plan.min < rmin || plan.max > rmax || plan.min > plan.max) {
        problems.push(`reps must be ${rmin}–${rmax}, low end first`);
      }
      break;
    case 'swap':
      if (plan.substituteKey !== null && !/^(catalog|custom):.{1,128}$/.test(plan.substituteKey)) problems.push('the substitute must be a known exercise');
      break;
    case 'deload':
      if (!(plan.scale >= 0.3 && plan.scale <= 0.9)) problems.push('a deload keeps 30–90% of the sets');
      break;
  }
  return problems;
}

function samePlan(a: RemedyPlan, b: RemedyPlan, unit: Unit): boolean {
  if (a.remedy !== b.remedy) return false;
  switch (a.remedy) {
    case 'reset':
      return Math.abs(toDisplay(a.weightKg, unit) - toDisplay((b as typeof a).weightKg, unit)) < stepDisplay(unit) + 1e-6;
    case 'add_set':
      return a.sets === (b as typeof a).sets;
    case 'rep_range':
      return a.min === (b as typeof a).min && a.max === (b as typeof a).max;
    case 'swap': {
      const s = (b as typeof a).substituteKey;
      return a.substituteKey === null || s === null || a.substituteKey === s;
    }
    case 'deload':
      return true;
  }
}

/**
 * How a proposal (an AI's, a coach's, the web's) compares with the house
 * rule. Disagreeing is fine; only the safety bounds stop a one-tap apply.
 */
export function assessProposal(plan: RemedyPlan, finding: PlateauFinding | null, current: { topKg: number; sets: number | null }, unit: Unit): Assessment {
  const house = finding ? fixFor(finding, plan.remedy) ?? finding.fix : null;
  const problems = boundProblems(plan, current);
  if (problems.length) return { verdict: 'unsafe', problems, house };
  if (finding && samePlan(plan, finding.fix.plan, unit)) return { verdict: 'matches', house: finding.fix };
  return { verdict: 'differs', house };
}

/** Parse an untrusted plan (MCP args, AI JSON, a synced row). */
export function parseRemedyPlan(raw: unknown): RemedyPlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);
  switch (p.remedy) {
    case 'reset': {
      const w = num(p.weightKg);
      const f = num(p.fromKg);
      return w !== null && f !== null ? { remedy: 'reset', weightKg: w, fromKg: f } : null;
    }
    case 'add_set': {
      const s = int(p.sets);
      const f = int(p.fromSets);
      return s !== null && f !== null ? { remedy: 'add_set', sets: s, fromSets: f } : null;
    }
    case 'rep_range': {
      const [a, b, c, d] = [int(p.min), int(p.max), int(p.fromMin), int(p.fromMax)];
      return a !== null && b !== null && c !== null && d !== null ? { remedy: 'rep_range', min: a, max: b, fromMin: c, fromMax: d } : null;
    }
    case 'swap': {
      const key = typeof p.substituteKey === 'string' ? p.substituteKey.slice(0, 160) : null;
      const name = typeof p.substituteName === 'string' ? p.substituteName.slice(0, 80) : null;
      return { remedy: 'swap', substituteKey: key, substituteName: name };
    }
    case 'deload': {
      const s = num(p.scale);
      return s !== null ? { remedy: 'deload', scale: s } : null;
    }
    default:
      return null;
  }
}

// ---------- autonomy ----------

export type ProgressionAutonomy = 'ask' | 'auto_safe' | 'off';
export const PROGRESSION_AUTONOMY: readonly ProgressionAutonomy[] = ['ask', 'auto_safe', 'off'];
export const DEFAULT_PROGRESSION_AUTONOMY: ProgressionAutonomy = 'ask';

export function isProgressionAutonomy(v: unknown): v is ProgressionAutonomy {
  return typeof v === 'string' && (PROGRESSION_AUTONOMY as readonly string[]).includes(v);
}

/**
 * Whether a fix applies without asking. Only the house rule's low-risk
 * fixes, only in auto mode; AI and MCP proposals always ask (per-actor
 * grants come later, PROGRESSION §6).
 */
export function autoApplies(mode: ProgressionAutonomy, fix: FixOption, source: DecisionSource): boolean {
  return mode === 'auto_safe' && source === 'coach' && fix.lowRisk;
}

/** Copy for the autonomy setting, shared by app and web. */
export const AUTONOMY_COPY: Record<ProgressionAutonomy, { label: string; detail: string }> = {
  ask: { label: 'Ask first', detail: 'Every fix is a suggestion. Nothing changes until you apply it.' },
  auto_safe: {
    label: 'Auto-apply small fixes',
    detail: 'Resets of up to 10%, one extra set and rep-range changes apply after a workout, with Undo. Deloads, swaps and AI suggestions still ask.',
  },
  off: { label: 'Off', detail: 'No fix suggestions. Stalled lifts still show on Progress.' },
};

// ---------- display copy (app and web) ----------

export const REMEDY_LABEL: Record<Remedy | 'keep_going', string> = {
  reset: 'Reset the load',
  add_set: 'Add a set',
  rep_range: 'New rep range',
  swap: 'Swap the exercise',
  deload: 'Deload week',
  keep_going: 'Keep going',
};

export const DECISION_STATUS_LABEL: Record<DecisionStatus, string> = {
  proposed: 'Suggested',
  applied: 'Applied',
  declined: 'Not now',
  done: 'Done',
  reverted: 'Undone',
};

/** Who suggested a change, for "From Claude" style labels. */
export function decisionSourceLabel(source: string): string {
  if (source === 'coach') return 'Incline';
  if (source === 'user') return 'You';
  if (source === 'web') return 'Incline web';
  if (source === 'app_ai') return 'Ask';
  if (source.startsWith('mcp:')) {
    const name = source.slice(4).replace(/[-_.]+/g, ' ').trim();
    return name ? name.replace(/\b[a-z]/g, (c) => c.toUpperCase()) : 'AI client';
  }
  return source;
}
