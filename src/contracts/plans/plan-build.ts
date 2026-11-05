/**
 * Plan builder contract: "make me a 6-week plan, 4 days, dumbbells at home".
 * Code owns the structure: split, slots, sets and reps, deloads and the effort
 * ramp, all from ./rules (docs/decisions/PROGRAMMING.md). The model only
 * fills the slots with exercise names, names the plan, and may add a couple
 * of extras for a focus the user asked for. One copy for app, edge and evals.
 *
 * Bump PLAN_BUILD_PROMPT_VERSION when the prompt or these shapes change.
 */
import {
  FOCUS_LABEL,
  MAJOR_MUSCLES,
  MAX_DIRECT_SETS_PER_SESSION,
  MAX_SETS_PER_ROW,
  MIN_SLOTS_PER_DAY,
  REPS_BY_GOAL,
  SETS_BY_ROLE,
  SPLITS,
  TRAINING_WEEKDAYS,
  WEEKLY_SETS,
  setBudget,
  weekPlan,
  type PlanExperience,
  type PlanGoal,
  type SlotFocus,
  type SlotRole,
  type WeekPlan,
} from './rules';

export const PLAN_BUILD_PROMPT_VERSION = 'plan-build-1.0.0';

export const MAX_PLAN_INTENT = 300;
export const MAX_PLAN_NAME = 40;
export const MAX_EXTRAS_PER_DAY = 2;
export const MAX_SKIPS_PER_DAY = 2;
export const WEEKS_RANGE = [1, 16] as const;
export const DAYS_RANGE = [2, 6] as const;
export const MINUTES_RANGE = [20, 120] as const;
export const BEGINNER_MAX_DAYS = 4;
const EQUIPMENT = ['barbell', 'dumbbell', 'machine', 'cable', 'kettlebell', 'bodyweight', 'band'] as const;
export type PlanEquipment = (typeof EQUIPMENT)[number];

export interface PlanBuildInput {
  intent: string;
  weeks: number;
  daysPerWeek: number;
  goal: PlanGoal;
  experience: PlanExperience;
  minutes: number;
  /** Absent = a full gym. */
  equipment?: PlanEquipment[];
  memory?: string[];
  catalog?: string[];
  /** "Try another": 1–9 asks for different picks (and misses the cache). */
  variant?: number;
}

export interface Slot {
  id: string;
  focus: SlotFocus;
  role: SlotRole;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
}

export interface SkeletonDay {
  key: string;
  title: string;
  slots: Slot[];
}

export interface PlanSkeleton {
  /** Unique workouts, in first-use order. */
  days: SkeletonDay[];
  /** Workout key per training day in a week, Monday first. */
  week: { weekday: number; key: string }[];
  weeks: WeekPlan[];
}

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/[‐-―−]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  return t || null;
}

function int(v: unknown, [lo, hi]: readonly [number, number]): number | null {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function oneOf<T extends string>(v: unknown, options: readonly T[], dflt: T): T {
  return typeof v === 'string' && (options as readonly string[]).includes(v) ? (v as T) : dflt;
}

function strings(v: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((s) => text(s, maxLen)).filter((s): s is string => s !== null).slice(0, maxItems);
  return out.length ? out : undefined;
}

export function parsePlanBuildInput(raw: unknown): Parsed<PlanBuildInput> {
  if (!isRecord(raw)) return { ok: false, error: 'input must be an object' };
  const intent = text(raw.intent, MAX_PLAN_INTENT) ?? '';
  const weeks = int(raw.weeks, WEEKS_RANGE);
  const daysPerWeek = int(raw.daysPerWeek, DAYS_RANGE);
  const minutes = int(raw.minutes, MINUTES_RANGE);
  if (weeks === null || daysPerWeek === null || minutes === null) return { ok: false, error: 'weeks, daysPerWeek and minutes are required' };
  const experience = oneOf(raw.experience, ['beginner', 'intermediate', 'advanced'] as const, 'intermediate');
  const equipment = Array.isArray(raw.equipment)
    ? [...new Set(raw.equipment.filter((e): e is PlanEquipment => (EQUIPMENT as readonly unknown[]).includes(e)))]
    : undefined;
  const memory = strings(raw.memory, 10, 120);
  const catalog = strings(raw.catalog, 200, 60);
  const variant = int(raw.variant, [0, 9]);
  return {
    ok: true,
    value: {
      intent,
      weeks,
      // Novices: 2–4 days (ACSM 2009: 2–3; more days only spreads volume they don't need yet).
      daysPerWeek: experience === 'beginner' ? Math.min(daysPerWeek, BEGINNER_MAX_DAYS) : daysPerWeek,
      goal: oneOf(raw.goal, ['hypertrophy', 'strength', 'general'] as const, 'hypertrophy'),
      experience,
      minutes,
      ...(equipment?.length ? { equipment } : {}),
      ...(memory ? { memory } : {}),
      ...(catalog ? { catalog } : {}),
      ...(variant ? { variant } : {}),
    },
  };
}

/** Trim a day to the time budget: drop accessories from the end, then shave sets. */
function fitToBudget(slots: Slot[], budget: number): Slot[] {
  const out = slots.map((s) => ({ ...s }));
  const total = () => out.reduce((n, s) => n + s.sets, 0);
  while (total() > budget && out.length > MIN_SLOTS_PER_DAY) {
    const idx = out.map((s) => s.role).lastIndexOf('accessory');
    out.splice(idx >= 0 ? idx : out.length - 1, 1);
  }
  for (const role of ['accessory', 'secondary', 'main'] as SlotRole[]) {
    for (let i = out.length - 1; i >= 0 && total() > budget; i--) {
      if (out[i]!.role === role && out[i]!.sets > 2) out[i]!.sets--;
    }
  }
  return out;
}

export function planSkeleton(input: PlanBuildInput): PlanSkeleton {
  const split = SPLITS[input.daysPerWeek] ?? SPLITS[3]!;
  const weekdays = TRAINING_WEEKDAYS[input.daysPerWeek] ?? TRAINING_WEEKDAYS[3]!;
  const budget = setBudget(input.minutes);
  const days: SkeletonDay[] = [];
  for (const day of split) {
    if (days.some((d) => d.key === day.key)) continue;
    const slots = day.slots.map(([focus, role], i): Slot => {
      const [repsMin, repsMax, restSeconds] = REPS_BY_GOAL[input.goal][role];
      return { id: `${day.key}${i + 1}`, focus, role, sets: SETS_BY_ROLE[input.experience][role], repsMin, repsMax, restSeconds };
    });
    days.push({ key: day.key, title: day.title, slots: fitToBudget(slots, budget) });
  }
  return {
    days,
    week: split.map((d, i) => ({ weekday: weekdays[i]!, key: d.key })),
    weeks: weekPlan(input.weeks, input.experience),
  };
}

// ---------- model output ----------

export interface DraftExtra {
  exercise: string;
  sets: number;
  repsMin: number;
  repsMax: number;
}

export interface DraftDay {
  key: string;
  name: string;
  /** slot id → exercise name; null = skipped (injury or no equipment). */
  fills: Record<string, string | null>;
  extras: DraftExtra[];
}

export type PlanDraft = { decline: string } | { name: string; summary: string; days: DraftDay[] };

function fromParsedDay(d: Record<string, unknown>): Record<string, unknown> {
  const fills = isRecord(d.fills) ? d.fills : {};
  return {
    key: d.key,
    name: d.name,
    exercises: Object.entries(fills).map(([slot, exercise]) => (typeof exercise === 'string' ? { slot, exercise } : { slot, skip: true })),
    extra: d.extras,
  };
}

export function parsePlanDraft(raw: unknown, input: PlanBuildInput): Parsed<PlanDraft> {
  if (!isRecord(raw)) return { ok: false, error: 'output must be an object' };
  const decline = text(raw.decline, 200);
  if (decline) return { ok: true, value: { decline } };
  const skeleton = planSkeleton(input);
  const name = text(raw.name, MAX_PLAN_NAME);
  if (!name) return { ok: false, error: 'name is required' };
  // The gateway returns the parsed shape (`days`); the app re-checks it, so read both.
  const workouts = Array.isArray(raw.workouts) ? raw.workouts : Array.isArray(raw.days) ? raw.days.filter(isRecord).map(fromParsedDay) : null;
  if (!workouts) return { ok: false, error: 'workouts must be an array' };
  const byKey = new Map(workouts.filter(isRecord).map((w) => [String(w.key ?? ''), w]));
  const days: DraftDay[] = [];
  for (const sk of skeleton.days) {
    const w = byKey.get(sk.key);
    if (!w) return { ok: false, error: `workout ${sk.key} is missing` };
    const given = new Map(
      (Array.isArray(w.exercises) ? w.exercises : []).filter(isRecord).map((e) => [String(e.slot ?? ''), e]),
    );
    const fills: Record<string, string | null> = {};
    const used = new Set<string>();
    let skips = 0;
    for (const slot of sk.slots) {
      const e = given.get(slot.id);
      // A missing slot, `skip: true` or a repeat of an exercise already in the day all leave the slot empty.
      const exercise = e && e.skip !== true ? text(e.exercise, 60) : null;
      if (!exercise || used.has(exercise.toLowerCase())) {
        fills[slot.id] = null;
        skips++;
        continue;
      }
      used.add(exercise.toLowerCase());
      fills[slot.id] = exercise;
    }
    if (skips > MAX_SKIPS_PER_DAY) return { ok: false, error: `workout ${sk.key} skips too many slots` };
    const extras: DraftExtra[] = [];
    for (const x of (Array.isArray(w.extra) ? w.extra : []).filter(isRecord)) {
      if (extras.length >= MAX_EXTRAS_PER_DAY) break;
      const exercise = text(x.exercise, 60);
      const sets = int(x.sets, [1, 4]);
      let repsMin = int(x.repsMin, [1, 30]);
      let repsMax = int(x.repsMax, [1, 30]) ?? repsMin;
      if (!exercise || sets === null || repsMin === null || repsMax === null || used.has(exercise.toLowerCase())) continue;
      if (repsMin > repsMax) [repsMin, repsMax] = [repsMax, repsMin];
      used.add(exercise.toLowerCase());
      extras.push({ exercise, sets, repsMin, repsMax });
    }
    days.push({ key: sk.key, name: text(w.name, MAX_PLAN_NAME) ?? sk.title, fills, extras });
  }
  return { ok: true, value: { name, summary: text(raw.summary, 160) ?? '', days } };
}

// ---------- assembly (pure; the app adds muscles after resolving names) ----------

export interface PlanRow {
  exercise: string;
  sets: number;
  repsMin: number;
  repsMax: number;
  restSeconds: number;
  role: SlotRole | 'extra';
  focus: SlotFocus | null;
  /** Set by the app after resolving the name; drives the volume check. */
  muscles?: MuscleInfo | null;
}

export interface PlanDay {
  key: string;
  name: string;
  rows: PlanRow[];
}

export interface AssembledPlan {
  name: string;
  summary: string;
  days: PlanDay[];
  skeleton: PlanSkeleton;
  /** Extras dropped because the session was already at its time budget. */
  droppedExtras: string[];
}

export function assemblePlan(input: PlanBuildInput, draft: Exclude<PlanDraft, { decline: string }>): AssembledPlan {
  const skeleton = planSkeleton(input);
  const budget = setBudget(input.minutes);
  const droppedExtras: string[] = [];
  const days = skeleton.days.map((sk): PlanDay => {
    const d = draft.days.find((x) => x.key === sk.key)!;
    const rows: PlanRow[] = sk.slots.flatMap((s) => {
      const exercise = d.fills[s.id];
      return exercise
        ? [{ exercise, sets: s.sets, repsMin: s.repsMin, repsMax: s.repsMax, restSeconds: s.restSeconds, role: s.role, focus: s.focus }]
        : [];
    });
    let used = rows.reduce((n, r) => n + r.sets, 0);
    for (const x of d.extras) {
      const sets = Math.min(x.sets, 3);
      if (used + sets > budget) {
        droppedExtras.push(x.exercise);
        continue;
      }
      used += sets;
      rows.push({ exercise: x.exercise, sets, repsMin: x.repsMin, repsMax: x.repsMax, restSeconds: 90, role: 'extra', focus: null });
    }
    return { key: sk.key, name: d.name, rows };
  });
  return { name: draft.name, summary: draft.summary, days, skeleton, droppedExtras };
}

export interface MuscleInfo {
  primary: string | null;
  secondary: string[];
}

/** How many times each workout runs in a normal week. */
export function timesPerWeek(skeleton: PlanSkeleton): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of skeleton.week) out.set(d.key, (out.get(d.key) ?? 0) + 1);
  return out;
}

/** Weekly fractional sets per muscle (primary 1, secondary 0.5) for a build week. */
export function weeklySets(days: PlanDay[], perWeek: Map<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of days) {
    const times = perWeek.get(d.key) ?? 0;
    for (const r of d.rows) {
      const m = r.muscles;
      if (!m) continue;
      if (m.primary && m.primary !== 'other' && m.primary !== 'full_body') out[m.primary] = (out[m.primary] ?? 0) + r.sets * times;
      for (const s of m.secondary) if (s !== m.primary && s !== 'other') out[s] = (out[s] ?? 0) + r.sets * times * 0.5;
    }
  }
  return out;
}

export interface BalanceResult {
  days: PlanDay[];
  weekly: Record<string, number>;
  /** Major muscles still outside the band after balancing, e.g. "hamstrings 3 of 6". */
  warnings: string[];
  /** Accessory rows removed to get a muscle under its cap. */
  removed: string[];
}

const TRIM_ORDER = ['extra', 'accessory', 'secondary', 'main'] as const;

/**
 * Pull every major muscle into its weekly band (WEEKLY_SETS), using the
 * muscles on each row:
 * - under the floor: add a set to a row that trains it directly, else one
 *   that trains it as a secondary;
 * - over the cap: take sets from accessories first, then drop an accessory.
 * Rows stay within 2–5 sets (1 only for a deload), a session keeps at most 10
 * direct sets per muscle, and a day keeps at least 4 exercises.
 */
export function balanceVolume(plan: { days: PlanDay[]; skeleton: PlanSkeleton }, experience: PlanExperience): BalanceResult {
  const days = plan.days.map((d) => ({ ...d, rows: d.rows.map((r) => ({ ...r })) }));
  const perWeek = timesPerWeek(plan.skeleton);
  const [floor, cap] = WEEKLY_SETS[experience];
  const removed: string[] = [];
  const level = (m: string) => weeklySets(days, perWeek)[m] ?? 0;
  const direct = (day: PlanDay, m: string) => day.rows.reduce((n, r) => n + (r.muscles?.primary === m ? r.sets : 0), 0);
  const bump = (m: string, asPrimary: boolean): boolean => {
    for (const d of days) {
      if ((perWeek.get(d.key) ?? 0) === 0 || direct(d, m) >= MAX_DIRECT_SETS_PER_SESSION) continue;
      const r = d.rows.find((x) => x.sets < MAX_SETS_PER_ROW && (asPrimary ? x.muscles?.primary === m : x.muscles?.secondary.includes(m)));
      if (r) {
        r.sets++;
        return true;
      }
    }
    return false;
  };
  const trim = (m: string): boolean => {
    for (const role of TRIM_ORDER) {
      for (const d of days) {
        const r = d.rows.find((x) => x.role === role && x.muscles?.primary === m && x.sets > 2);
        if (r) {
          r.sets--;
          return true;
        }
      }
    }
    for (const d of days) {
      if (d.rows.length <= MIN_SLOTS_PER_DAY) continue;
      const i = d.rows.findIndex((x) => (x.role === 'extra' || x.role === 'accessory') && x.muscles?.primary === m);
      if (i >= 0) {
        removed.push(d.rows[i]!.exercise);
        d.rows.splice(i, 1);
        return true;
      }
    }
    return false;
  };

  for (const m of MAJOR_MUSCLES) {
    for (let guard = 0; guard < 60 && level(m) < floor; guard++) if (!bump(m, true) && !bump(m, false)) break;
    for (let guard = 0; guard < 60 && level(m) > cap; guard++) if (!trim(m)) break;
  }
  const weekly = weeklySets(days, perWeek);
  const warnings = MAJOR_MUSCLES.flatMap((m) => {
    const v = Math.round((weekly[m] ?? 0) * 10) / 10;
    if (v < floor) return [`${m} ${v} of ${floor}`];
    if (v > cap) return [`${m} ${v} over ${cap}`];
    return [];
  });
  return { days, weekly, warnings, removed };
}

/** A deload version of a day: same exercises, about half the sets. */
export function deloadDay(day: PlanDay): PlanDay {
  return { ...day, name: `${day.name} (Deload)`, rows: day.rows.map((r) => ({ ...r, sets: Math.max(1, Math.ceil(r.sets / 2)) })) };
}

const GOAL_LINE: Record<PlanGoal, string> = {
  hypertrophy: 'Muscle focus',
  strength: 'Strength focus',
  general: 'General fitness',
};

/** The program description: how hard each week should feel, in plain words. */
export function planDescription(input: PlanBuildInput, skeleton: PlanSkeleton, summary: string): string {
  const weeks = skeleton.weeks
    .map((w) => (w.kind === 'deload' ? `Wk ${w.week}: deload, about half the sets, stop 3+ reps short` : `Wk ${w.week}: stop ~${w.rir} rep${w.rir === 1 ? '' : 's'} short`))
    .join('. ');
  const head = `${GOAL_LINE[input.goal]}, ${input.daysPerWeek} days a week, about ${input.minutes} min.`;
  const progress = 'Hit the top of the rep range, then add the smallest weight step next time.';
  return [summary, head, `${weeks}.`, progress].filter(Boolean).join(' ').slice(0, 600);
}

/** A bundled exercise per focus: the gateway's stub mode and the tests. */
const STUB_EXERCISE: Record<SlotFocus, string[]> = {
  squat: ['Barbell Back Squat', 'Front Squat'],
  hinge: ['Romanian Deadlift', 'Conventional Deadlift'],
  horizontal_push: ['Barbell Bench Press', 'Incline Dumbbell Press'],
  horizontal_pull: ['Barbell Bent-Over Row', 'Seated Cable Row'],
  vertical_push: ['Standing Overhead Press', 'Dumbbell Shoulder Press'],
  vertical_pull: ['Lat Pulldown', 'Pull-Up'],
  single_leg: ['Bulgarian Split Squat', 'Walking Lunges'],
  quads: ['Leg Extension'],
  hamstrings: ['Lying Leg Curl'],
  glutes: ['Hip Thrust'],
  chest: ['Cable Crossover', 'Dumbbell Fly'],
  back: ['Dumbbell Row (Single Arm)'],
  side_delts: ['Dumbbell Lateral Raise'],
  rear_delts: ['Reverse Fly', 'Cable Face Pull'],
  biceps: ['Dumbbell Bicep Curl', 'Hammer Curl'],
  triceps: ['Triceps Cable Pushdown', 'Skull Crushers'],
  calves: ['Calf Raise (Standing)'],
  core: ['Hanging Leg Raise', 'Plank'],
};

export function stubPlanDraft(input: PlanBuildInput): { name: string; summary: string; workouts: unknown[] } {
  const sk = planSkeleton(input);
  return {
    name: 'Stub plan',
    summary: 'Stub: bundled exercises for every slot.',
    workouts: sk.days.map((d) => {
      const used = new Set<string>();
      return {
        key: d.key,
        name: d.title,
        exercises: d.slots.map((s) => {
          const pick = STUB_EXERCISE[s.focus].find((n) => !used.has(n)) ?? STUB_EXERCISE[s.focus][0]!;
          used.add(pick);
          return { slot: s.id, exercise: pick };
        }),
      };
    }),
  };
}

export { FOCUS_LABEL };
