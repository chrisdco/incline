/**
 * Tool output shapers shared by every implementation of the read tools: the
 * MCP server (Supabase rows) and in-app chat (device SQLite). Each source
 * normalizes its rows to `NormSet` / `NormWorkout`; the numbers and field
 * names a model sees then come from one place, so an answer in Claude and an
 * answer in Ask can't drift (AI-CHAT §3A.3).
 */
import { argText, estimate1rm, KG_PER_LB, rankExercises, toUnit, unitLabel, weeklyMuscleSets, type ExerciseCandidate, type Unit } from './tools';
import { reviewMuscleSets } from '../coaching/muscle-review';
import {
  assessProposal,
  findPlateaus,
  REMEDIES,
  type Assessment,
  type Remedy,
  formatLoad,
  latestDecisions,
  PROGRESSION_HISTORY,
  PROGRESSION_RULE_VERSION,
  type LiftHistory,
  type LiftSession,
  type PlateauFinding,
  type ProgressionDecision,
  type RemedyPlan,
} from '../coaching/progression';
import type { PlanExperience } from '../plans/rules';

/** One completed set, source-agnostic. Weights in kg. */
export interface NormSet {
  logId: string;
  /** ISO timestamp of the workout start. */
  startedAt: string;
  /** Stable exercise key within one source. */
  exerciseKey: string;
  exercise: string;
  weightKg: number;
  reps: number;
  primaryMuscle: string | null;
  secondaryMuscles: readonly string[];
  /** Logged RPE, when the source has it. */
  rpe?: number | null;
  /** `working` / `warmup` / …; missing = working. */
  setType?: string | null;
}

export interface NormWorkout {
  id: string;
  name: string;
  startedAt: string;
  durationSeconds: number;
  volumeKg: number;
  completedSets: number;
}

export const PR_NOTE = 'Estimated 1RM uses the Epley formula on sets of 12 reps or fewer.';

export function shapePersonalRecords(sets: readonly NormSet[], unit: Unit, limit: number) {
  const best = new Map<string, { name: string; e1rm: number; e1rmDate: string; heaviest: number; heaviestReps: number; heaviestDate: string }>();
  for (const s of sets) {
    if (!(s.weightKg > 0)) continue;
    const e = estimate1rm(s.weightKg, s.reps) ?? 0;
    const cur = best.get(s.exerciseKey) ?? { name: s.exercise, e1rm: 0, e1rmDate: s.startedAt, heaviest: 0, heaviestReps: 0, heaviestDate: s.startedAt };
    if (e > cur.e1rm) Object.assign(cur, { e1rm: e, e1rmDate: s.startedAt });
    if (s.weightKg > cur.heaviest) Object.assign(cur, { heaviest: s.weightKg, heaviestReps: s.reps, heaviestDate: s.startedAt });
    best.set(s.exerciseKey, cur);
  }
  const list = [...best.values()].sort((a, b) => b.e1rm - a.e1rm).slice(0, limit);
  return {
    unit: unitLabel(unit),
    records: list.map((r) => ({
      exercise: r.name,
      estimated_1rm: r.e1rm ? toUnit(r.e1rm, unit) : null,
      estimated_1rm_date: r.e1rm ? r.e1rmDate : null,
      heaviest_set: `${toUnit(r.heaviest, unit)} x ${r.heaviestReps}`,
      heaviest_date: r.heaviestDate,
    })),
    note: PR_NOTE,
  };
}

/** `sets` already filtered to one exercise. */
export function shapeExerciseHistory(exercise: string, sets: readonly NormSet[], unit: Unit, limit: number) {
  const byLog = new Map<string, { date: string; best: { weight: number; reps: number }; e1rm: number | null; sets: number }>();
  for (const s of sets) {
    const cur = byLog.get(s.logId) ?? { date: s.startedAt, best: { weight: 0, reps: 0 }, e1rm: null, sets: 0 };
    cur.sets++;
    const e = estimate1rm(s.weightKg, s.reps);
    if (e !== null && (cur.e1rm === null || e > cur.e1rm)) cur.e1rm = e;
    if (s.weightKg > cur.best.weight || (s.weightKg === cur.best.weight && s.reps > cur.best.reps)) cur.best = { weight: s.weightKg, reps: s.reps };
    byLog.set(s.logId, cur);
  }
  const sessions = [...byLog.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
  return {
    exercise,
    unit: unitLabel(unit),
    sessions: sessions.map((s) => ({
      date: s.date,
      sets: s.sets,
      best_set: `${toUnit(s.best.weight, unit)} x ${s.best.reps}`,
      estimated_1rm: s.e1rm === null ? null : toUnit(s.e1rm, unit),
    })),
  };
}

export function shapeTrainingSummary(sets: readonly NormSet[], weeks: number, now: number) {
  const sessionWeeks = Array.from({ length: weeks }, () => new Set<string>());
  for (const s of sets) {
    const w = Math.floor((now - Date.parse(s.startedAt)) / (7 * 86_400_000));
    if (w >= 0 && w < weeks) sessionWeeks[w]!.add(s.logId);
  }
  const perMuscle = weeklyMuscleSets(
    sets.map((s) => ({ startedAt: s.startedAt, primaryMuscle: s.primaryMuscle, secondaryMuscles: [...s.secondaryMuscles] })),
    weeks,
    now,
  );
  const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
  return {
    weeks,
    week_order: 'index 0 = the last 7 days, 1 = the 7 days before, …',
    sessions_per_week: sessionWeeks.map((s) => s.size),
    sets_per_muscle_per_week: Object.fromEntries(
      Object.entries(perMuscle)
        .sort((a, b) => avg(b[1]) - avg(a[1]))
        .map(([m, xs]) => [m, { weekly: xs.map((x) => Math.round(x * 10) / 10), average: avg(xs) }]),
    ),
    // Same rules as the app's Muscle distribution review (contracts/coaching).
    review: reviewMuscleSets({
      weeks,
      current: Object.entries(perMuscle).map(([muscle, xs]) => ({ muscle, sets: xs.reduce((t, x) => t + x, 0) })),
      previous: [],
    }),
    note: 'Completed sets only. Primary muscle counts 1, each secondary 0.5. review: deterministic coaching points (act > watch > good).',
  };
}

export function shapeWorkoutList(workouts: readonly NormWorkout[], unit: Unit) {
  return {
    unit: unitLabel(unit),
    workouts: workouts.map((l) => ({
      id: l.id,
      name: l.name,
      date: l.startedAt,
      minutes: Math.round(l.durationSeconds / 60),
      completed_sets: l.completedSets,
      volume: toUnit(l.volumeKg, unit),
    })),
  };
}

export function clampWeeks(raw: unknown): number {
  return Math.min(12, Math.max(1, Math.round(Number(raw ?? 4)) || 4));
}

// ---------- progression (PROGRESSION.md) ----------

/** Early builds synced bundled exercises as `seed_N`; current ones as `seed:N`. */
export function normalizeRefKey(key: string): string {
  return key.replace(/^catalog:seed_(\d+)$/, 'catalog:seed:$1');
}

/** One history per lift: each session's heaviest working set, newest first. */
export function liftHistories(sets: readonly NormSet[], perLift = PROGRESSION_HISTORY): LiftHistory[] {
  type Acc = { name: string; muscle: string | null; logs: Map<string, LiftSession> };
  const lifts = new Map<string, Acc>();
  for (const s of sets) {
    if (s.setType && s.setType !== 'working') continue;
    if (!(s.weightKg > 0) || !(s.reps > 0)) continue;
    const key = normalizeRefKey(s.exerciseKey);
    const acc = lifts.get(key) ?? { name: s.exercise, muscle: s.primaryMuscle, logs: new Map() };
    const at = Date.parse(s.startedAt);
    const cur = acc.logs.get(s.logId);
    if (!cur) acc.logs.set(s.logId, { at, weightKg: s.weightKg, reps: s.reps, rpe: s.rpe ?? null, sets: 1 });
    else {
      cur.sets = (cur.sets ?? 0) + 1;
      if (s.weightKg > cur.weightKg || (s.weightKg === cur.weightKg && s.reps > cur.reps)) {
        Object.assign(cur, { weightKg: s.weightKg, reps: s.reps, rpe: s.rpe ?? null });
      }
    }
    lifts.set(key, acc);
  }
  return [...lifts.entries()].map(([key, a]) => ({
    key,
    name: a.name,
    muscle: a.muscle,
    sessions: [...a.logs.values()].sort((x, y) => y.at - x.at).slice(0, perLift),
  }));
}

/** Weeks in a row (ending this week or last) with at least one workout. */
export function trainingStreakWeeks(sets: readonly NormSet[], now: number): number {
  const weeks = new Set<number>();
  for (const s of sets) weeks.add(Math.floor((now - Date.parse(s.startedAt)) / (7 * 86_400_000)));
  let w = weeks.has(0) ? 0 : 1;
  let n = 0;
  while (weeks.has(w)) {
    n++;
    w++;
  }
  return n;
}

/** Average weekly fractional sets per muscle over the last `weeks` weeks (working sets). */
export function averageMuscleSets(sets: readonly NormSet[], weeks: number, now: number): Record<string, number> {
  const per = weeklyMuscleSets(
    sets
      .filter((s) => !s.setType || s.setType === 'working')
      .map((s) => ({ startedAt: s.startedAt, primaryMuscle: s.primaryMuscle, secondaryMuscles: [...s.secondaryMuscles] })),
    weeks,
    now,
  );
  return Object.fromEntries(Object.entries(per).map(([m, xs]) => [m, xs.reduce((a, b) => a + b, 0) / weeks]));
}

export interface ProgressionInputs {
  unit: Unit;
  experience: PlanExperience;
  decisions: readonly ProgressionDecision[];
  now: number;
  /** Device-only deload record (the app's deload screen); decisions cover the rest. */
  lastDeloadAt?: number | null;
}

/** Findings from normalized sets: the one entry point every surface uses. */
export function progressionFindings(sets: readonly NormSet[], inp: ProgressionInputs): PlateauFinding[] {
  const decisions = inp.decisions.map((d) => ({ ...d, exerciseKey: normalizeRefKey(d.exerciseKey) }));
  const deloads = decisions.filter((d) => d.remedy === 'deload' && (d.status === 'applied' || d.status === 'done')).map((d) => d.createdAt);
  const lastDeloadAt = Math.max(inp.lastDeloadAt ?? 0, ...deloads, 0) || null;
  return findPlateaus(liftHistories(sets), {
    now: inp.now,
    unit: inp.unit,
    experience: inp.experience,
    weeklyMuscleSets: averageMuscleSets(sets, 4, inp.now),
    trainingStreakWeeks: trainingStreakWeeks(sets, inp.now),
    lastDeloadAt,
    decisions,
  });
}

/** One-line change text ("3 → 4 sets"), display unit. */
export function planText(plan: RemedyPlan | null, unit: Unit): string | null {
  if (!plan) return null;
  switch (plan.remedy) {
    case 'reset':
      return `reset to ${formatLoad(plan.weightKg, unit)} (from ${formatLoad(plan.fromKg, unit)})`;
    case 'add_set':
      return `${plan.fromSets} → ${plan.sets} sets`;
    case 'rep_range':
      return `${plan.fromMin}–${plan.fromMax} → ${plan.min}–${plan.max} reps`;
    case 'swap':
      return plan.substituteName ? `swap to ${plan.substituteName}` : 'swap to a close variation';
    case 'deload':
      return `deload week at ${Math.round(plan.scale * 100)}% of sets`;
  }
}

/** Tool output (MCP get_progression_review, Ask): findings + recent decisions, display unit. */
export function shapeProgressionReview(sets: readonly NormSet[], inp: ProgressionInputs & { autonomy?: string }) {
  const findings = progressionFindings(sets, inp);
  const u = inp.unit;
  const decided = [...latestDecisions(inp.decisions).values()]
    .filter((d) => inp.now - d.createdAt < 60 * 86_400_000)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 10);
  const fixOut = (o: PlateauFinding['fix']) => ({
    remedy: o.plan.remedy,
    plan: o.plan,
    summary: o.sentence,
    evidence: `${o.evidence.grade}: ${o.evidence.basis} (${o.evidence.source})`,
    low_risk: o.lowRisk,
  });
  return {
    unit: unitLabel(u),
    rule_version: PROGRESSION_RULE_VERSION,
    stalled: findings.map((f) => ({
      exercise: f.name,
      exercise_ref: f.exerciseKey,
      sessions_without_progress: f.sessions,
      best_set: `${toUnit(f.best.weightKg, u)} x ${f.best.reps}`,
      last_trained: new Date(f.lastAt).toISOString(),
      status: f.status,
      cause: f.cause,
      why: f.causeText,
      incline_fix: fixOut(f.fix),
      alternatives: f.alternatives.map(fixOut),
    })),
    decisions: decided.map((d) => ({
      exercise_ref: d.exerciseKey,
      remedy: d.remedy,
      change: planText(d.params, u),
      status: d.status,
      by: d.source,
      date: new Date(d.createdAt).toISOString(),
      rationale: d.rationale || undefined,
    })),
    autonomy: inp.autonomy,
    note:
      "Plateau = 4 sessions in a row without beating the best estimated 1RM before them. incline_fix is Incline's evidence-graded default, not a mandate: you may suggest a different fix (propose_progression_change); the user chooses. Don't re-suggest a lift whose status is proposed or applied.",
  };
}

// ---------- proposals (MCP propose_progression_change, Ask) ----------

export interface ProgressionProposalArgs {
  exercise: string;
  remedy: Remedy;
  weight: number | null;
  sets: number | null;
  repsMin: number | null;
  repsMax: number | null;
  substitute: string | null;
  rationale: string;
}

export const MAX_RATIONALE = 300;

export function parseProgressionProposal(args: Record<string, unknown>): { ok: true; value: ProgressionProposalArgs } | { ok: false; error: string } {
  const exercise = argText(args, 'exercise', 80);
  if (!exercise) return { ok: false, error: 'exercise is required' };
  const remedy = args.remedy;
  if (typeof remedy !== 'string' || !(REMEDIES as readonly string[]).includes(remedy)) {
    return { ok: false, error: `remedy must be one of ${REMEDIES.join(', ')}` };
  }
  const rationale = argText(args, 'rationale', MAX_RATIONALE);
  if (!rationale) return { ok: false, error: 'rationale is required (why, in a sentence or two)' };
  const num = (k: string) => (typeof args[k] === 'number' && Number.isFinite(args[k]) ? (args[k] as number) : null);
  return {
    ok: true,
    value: {
      exercise,
      remedy: remedy as Remedy,
      weight: num('weight'),
      sets: num('sets'),
      repsMin: num('reps_min'),
      repsMax: num('reps_max'),
      substitute: argText(args, 'substitute', 80) ?? null,
      rationale,
    },
  };
}

/** The logged lift a proposal names (best name match among recent lifts). */
export function matchLift(name: string, lifts: readonly LiftHistory[]): LiftHistory | null {
  const cands: ExerciseCandidate[] = lifts.map((l) => ({
    ref: { refType: 'catalog', externalId: l.key },
    name: l.name,
    aliases: [],
    primaryMuscle: l.muscle ?? '',
    secondaryMuscles: [],
    equipment: '',
  }));
  const hit = rankExercises(name, cands, 1)[0];
  return hit ? (lifts.find((l) => l.key === (hit.ref as { externalId: string }).externalId) ?? null) : null;
}

/**
 * Turn proposal args into a plan for one lift and assess it against the
 * house rule. `substitute` is the host's resolution of `args.substitute`.
 */
export function buildProposal(
  args: ProgressionProposalArgs,
  lift: LiftHistory,
  finding: PlateauFinding | null,
  unit: Unit,
  substitute: { key: string; name: string } | null,
): { ok: true; plan: RemedyPlan; assessment: Assessment } | { ok: false; error: string } {
  const last = lift.sessions[0];
  if (!last) return { ok: false, error: `No logged sets for ${lift.name}` };
  const current = { topKg: last.weightKg, sets: last.sets ?? null };
  const house = finding ? [finding.fix, ...finding.alternatives].find((o) => o.plan.remedy === args.remedy)?.plan : undefined;
  let plan: RemedyPlan;
  switch (args.remedy) {
    case 'reset': {
      const kg = args.weight != null ? (unit === 'imperial' ? args.weight * KG_PER_LB : args.weight) : house?.remedy === 'reset' ? house.weightKg : null;
      if (kg == null) return { ok: false, error: 'reset needs weight (the new top load)' };
      plan = { remedy: 'reset', weightKg: Math.round(kg * 1000) / 1000, fromKg: current.topKg };
      break;
    }
    case 'add_set': {
      const from = current.sets ?? 3;
      plan = { remedy: 'add_set', sets: args.sets ?? from + 1, fromSets: from };
      break;
    }
    case 'rep_range': {
      const fromMin = house?.remedy === 'rep_range' ? house.fromMin : last.reps;
      const fromMax = house?.remedy === 'rep_range' ? house.fromMax : last.reps;
      if (args.repsMin == null || args.repsMax == null) {
        if (house?.remedy !== 'rep_range') return { ok: false, error: 'rep_range needs reps_min and reps_max' };
        plan = house;
      } else plan = { remedy: 'rep_range', min: args.repsMin, max: args.repsMax, fromMin, fromMax };
      break;
    }
    case 'swap':
      if (args.substitute && !substitute) return { ok: false, error: `No exercise matches "${args.substitute}"; check with search_exercises` };
      plan = { remedy: 'swap', substituteKey: substitute?.key ?? null, substituteName: substitute?.name ?? null };
      break;
    case 'deload':
      plan = { remedy: 'deload', scale: 0.6 };
      break;
  }
  return { ok: true, plan, assessment: assessProposal(plan, finding, current, unit) };
}

/** Tool reply after a proposal is queued (or refused). */
export function shapeProposalResult(lift: LiftHistory, plan: RemedyPlan, a: Assessment, unit: Unit) {
  const house = a.house ? { summary: a.house.sentence, evidence: `${a.house.evidence.grade}: ${a.house.evidence.source}` } : null;
  if (a.verdict === 'unsafe') {
    return {
      queued: false,
      exercise: lift.name,
      verdict: a.verdict,
      problems: a.problems,
      incline_fix: house,
      note: 'Outside the safety bounds, so it was not sent. The user can still make any change by hand.',
    };
  }
  return {
    queued: true,
    exercise: lift.name,
    change: planText(plan, unit),
    verdict: a.verdict,
    incline_fix: house,
    note:
      a.verdict === 'matches'
        ? "Matches Incline's own fix. The user sees it on their phone and applies it there."
        : "Differs from Incline's fix; the user sees both side by side and picks. Nothing changes until they apply it.",
  };
}
