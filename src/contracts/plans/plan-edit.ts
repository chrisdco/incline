/**
 * Plan edit contract: "change this plan by asking". The model reads the plan
 * as routines r1…rN plus a weekly schedule and answers with a short op list;
 * the app turns that into the whole target plan (applyPlanEdit), shows it,
 * and saves it in one undoable step. One copy for app, edge and evals.
 *
 * Bump PLAN_EDIT_PROMPT_VERSION when the prompt or this shape changes.
 */
import { sanitizeExerciseName } from '../narrate/feature-pack';

export const PLAN_EDIT_PROMPT_VERSION = 'plan-edit-1.0.0';

export const MAX_PLAN_WEEKS = 16;
export const MAX_PLAN_ROUTINES = 12;
export const MAX_ROUTINE_EXERCISES = 20;
export const MAX_PLAN_SLOTS = MAX_PLAN_WEEKS * 7 * 2;
export const MAX_EDIT_OPS = 12;
export const MAX_EDIT_INTENT = 300;
export const MAX_PLAN_NAME = 60;
const MAX_NAME = 120;
const MAX_MEMORY = 10;
const MAX_CATALOG = 150;

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export interface PlanRoutine {
  /** r1, r2, … in order. */
  ref: string;
  name: string;
  exercises: string[];
}

export interface PlanSlot {
  week: number;
  /** 1 = Monday. */
  day: number;
  routine: string;
}

export interface PlanEditInput {
  planName: string;
  weeks: number;
  routines: PlanRoutine[];
  schedule: PlanSlot[];
  intent: string;
  memory?: string[];
  catalog?: string[];
}

export type PlanEditOp =
  | { op: 'moveDay'; from: number; to: number; weeks?: number[] }
  | { op: 'removeDay'; day: number; weeks?: number[] }
  | { op: 'addDay'; day: number; routine: string; weeks?: number[] }
  | { op: 'setWeeks'; count: number }
  | { op: 'swapExercise'; from: string; to: string; routine?: string }
  | { op: 'rename'; name: string };

export type PlanEdit = { decline: string } | { summary: string; ops: PlanEditOp[] };

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function text(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim().slice(0, max);
  return t || null;
}

function int(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  const r = Math.round(n);
  return r >= lo && r <= hi ? r : null;
}

/** 1–7, or a weekday name ("wed", "Wednesday"). */
export function parseDay(v: unknown): number | null {
  if (typeof v === 'string') {
    const i = WEEKDAYS.findIndex((d) => v.trim().toLowerCase().startsWith(d.toLowerCase()));
    if (i >= 0) return i + 1;
  }
  return int(v, 1, 7);
}

function strings(v: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map((s) => text(s, maxLen)).filter((s): s is string => s !== null).slice(0, maxItems);
  return out.length ? out : undefined;
}

export function parsePlanEditInput(raw: unknown): Parsed<PlanEditInput> {
  if (!isRecord(raw)) return { ok: false, error: 'input must be an object' };
  const planName = text(raw.planName, MAX_PLAN_NAME);
  if (!planName) return { ok: false, error: 'invalid_plan_name' };
  const intent = text(raw.intent, MAX_EDIT_INTENT);
  if (!intent) return { ok: false, error: 'invalid_intent' };
  const weeks = int(raw.weeks, 1, MAX_PLAN_WEEKS);
  if (weeks === null) return { ok: false, error: 'invalid_weeks' };
  if (!Array.isArray(raw.routines) || raw.routines.length === 0 || raw.routines.length > MAX_PLAN_ROUTINES) {
    return { ok: false, error: 'invalid_routines' };
  }
  const routines: PlanRoutine[] = [];
  for (const [i, r] of raw.routines.entries()) {
    if (!isRecord(r) || r.ref !== `r${i + 1}`) return { ok: false, error: 'invalid_routines' };
    const name = text(r.name, MAX_NAME);
    if (!name || !Array.isArray(r.exercises) || r.exercises.length > MAX_ROUTINE_EXERCISES) {
      return { ok: false, error: 'invalid_routines' };
    }
    routines.push({ ref: r.ref, name, exercises: strings(r.exercises, MAX_ROUTINE_EXERCISES, MAX_NAME) ?? [] });
  }
  const refs = new Set(routines.map((r) => r.ref));
  if (!Array.isArray(raw.schedule) || raw.schedule.length > MAX_PLAN_SLOTS) return { ok: false, error: 'invalid_schedule' };
  const schedule: PlanSlot[] = [];
  for (const s of raw.schedule) {
    if (!isRecord(s)) return { ok: false, error: 'invalid_schedule' };
    const week = int(s.week, 1, weeks);
    const day = int(s.day, 1, 7);
    if (week === null || day === null || typeof s.routine !== 'string' || !refs.has(s.routine)) {
      return { ok: false, error: 'invalid_schedule' };
    }
    schedule.push({ week, day, routine: s.routine });
  }
  const memory = strings(raw.memory, MAX_MEMORY, 120);
  // Custom names are user text: keep only plain names (same rule as narrate).
  const catalog = strings(raw.catalog, MAX_CATALOG, MAX_NAME)?.filter((n) => sanitizeExerciseName(n) === n);
  return {
    ok: true,
    value: {
      planName,
      weeks,
      routines,
      schedule,
      intent,
      ...(memory ? { memory } : {}),
      ...(catalog?.length ? { catalog } : {}),
    },
  };
}

function weekList(v: unknown): number[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = [...new Set(v.map((w) => int(w, 1, MAX_PLAN_WEEKS)).filter((w): w is number => w !== null))].sort((a, b) => a - b);
  return out.length ? out : undefined;
}

function scope(weeks: number[] | undefined): { weeks?: number[] } {
  return weeks ? { weeks } : {};
}

/**
 * Soft sanitizer + hard gate: unknown refs, unknown exercises and malformed
 * ops are dropped; a reply with nothing usable fails. Declines pass through.
 */
export function parsePlanEdit(raw: unknown, input: PlanEditInput): Parsed<PlanEdit> {
  if (!isRecord(raw)) return { ok: false, error: 'edit must be an object' };
  const decline = text(raw.decline, 200);
  if (decline) return { ok: true, value: { decline } };
  if (!Array.isArray(raw.ops)) return { ok: false, error: 'missing_ops' };
  if (raw.ops.length === 0 && text(raw.summary, 200)) return { ok: true, value: { decline: 'No changes needed for that.' } };

  const refs = new Set(input.routines.map((r) => r.ref));
  const exerciseNames = new Map<string, string>();
  for (const r of input.routines) for (const e of r.exercises) exerciseNames.set(e.toLowerCase(), e);

  const ops: PlanEditOp[] = [];
  for (const item of raw.ops.slice(0, MAX_EDIT_OPS)) {
    if (!isRecord(item)) continue;
    const weeks = weekList(item.weeks);
    switch (item.op) {
      case 'moveDay': {
        const from = parseDay(item.from);
        const to = parseDay(item.to);
        if (from !== null && to !== null && from !== to) ops.push({ op: 'moveDay', from, to, ...scope(weeks) });
        break;
      }
      case 'removeDay': {
        const day = parseDay(item.day);
        if (day !== null) ops.push({ op: 'removeDay', day, ...scope(weeks) });
        break;
      }
      case 'addDay': {
        const day = parseDay(item.day);
        const routine = typeof item.routine === 'string' && refs.has(item.routine) ? item.routine : null;
        if (day !== null && routine) ops.push({ op: 'addDay', day, routine, ...scope(weeks) });
        break;
      }
      case 'setWeeks': {
        const n = int(item.count ?? item.weeks, 1, MAX_PLAN_WEEKS);
        if (n !== null && n !== input.weeks) ops.push({ op: 'setWeeks', count: n });
        break;
      }
      case 'swapExercise': {
        const from = exerciseNames.get(text(item.from, MAX_NAME)?.toLowerCase() ?? '');
        const to = text(item.to, 60);
        const routine = typeof item.routine === 'string' && refs.has(item.routine) ? item.routine : undefined;
        const inRoutine = !routine || input.routines.find((r) => r.ref === routine)?.exercises.includes(from ?? '');
        if (from && to && to.toLowerCase() !== from.toLowerCase() && inRoutine) {
          ops.push({ op: 'swapExercise', from, to, ...(routine ? { routine } : {}) });
        }
        break;
      }
      case 'rename': {
        const name = text(item.name, MAX_PLAN_NAME);
        if (name && name !== input.planName) ops.push({ op: 'rename', name });
        break;
      }
      default:
        break;
    }
  }
  if (ops.length === 0) return { ok: false, error: 'no_usable_ops' };
  return { ok: true, value: { summary: text(raw.summary, 160) ?? 'Suggested changes', ops } };
}

export interface PlanSwap {
  /** Routine refs the swap applies to. */
  routines: string[];
  from: string;
  to: string;
}

export interface PlanEditDraft {
  name: string;
  weeks: number;
  /** Sorted by week, day. */
  schedule: PlanSlot[];
  swaps: PlanSwap[];
}

function slotKey(s: PlanSlot): string {
  return `${s.week}:${s.day}:${s.routine}`;
}

function sortSlots(slots: PlanSlot[]): PlanSlot[] {
  const seen = new Set<string>();
  return slots
    .filter((s) => (seen.has(slotKey(s)) ? false : (seen.add(slotKey(s)), true)))
    .sort((a, b) => a.week - b.week || a.day - b.day || a.routine.localeCompare(b.routine));
}

/**
 * Applies ops in order, pure. The preview and the write both use this, so
 * what the user sees is what is saved. Extending a plan repeats its weeks in
 * order (week 5 of a 4-week plan is week 1 again); shortening drops the tail.
 */
export function applyPlanEdit(input: PlanEditInput, ops: PlanEditOp[]): PlanEditDraft {
  let name = input.planName;
  let weeks = input.weeks;
  let slots = input.schedule.map((s) => ({ ...s }));
  const swaps = new Map<string, PlanSwap>();
  const inScope = (s: PlanSlot, w?: number[]) => !w || w.includes(s.week);

  for (const op of ops) {
    switch (op.op) {
      case 'moveDay':
        slots = slots.map((s) => {
          if (!inScope(s, op.weeks)) return s;
          if (s.day === op.from) return { ...s, day: op.to };
          if (s.day === op.to) return { ...s, day: op.from };
          return s;
        });
        break;
      case 'removeDay':
        slots = slots.filter((s) => !(s.day === op.day && inScope(s, op.weeks)));
        break;
      case 'addDay': {
        const targets = op.weeks?.filter((w) => w <= weeks) ?? Array.from({ length: weeks }, (_, i) => i + 1);
        slots = slots.filter((s) => !(s.day === op.day && targets.includes(s.week)));
        for (const week of targets) slots.push({ week, day: op.day, routine: op.routine });
        break;
      }
      case 'setWeeks': {
        const old = weeks;
        weeks = op.count;
        if (weeks < old) slots = slots.filter((s) => s.week <= weeks);
        else {
          for (let w = old + 1; w <= weeks; w++) {
            const src = ((w - 1) % old) + 1;
            for (const s of slots.filter((x) => x.week === src)) slots.push({ ...s, week: w });
          }
        }
        break;
      }
      case 'swapExercise': {
        const routines = input.routines
          .filter((r) => (op.routine ? r.ref === op.routine : true) && r.exercises.includes(op.from))
          .map((r) => r.ref);
        if (routines.length) swaps.set(`${op.from}|${op.routine ?? ''}`, { routines, from: op.from, to: op.to });
        break;
      }
      case 'rename':
        name = op.name;
        break;
    }
  }
  return { name, weeks, schedule: sortSlots(slots), swaps: [...swaps.values()] };
}

export interface WeekGroup {
  from: number;
  to: number;
  slots: { day: number; routine: string }[];
}

/** Consecutive weeks with the same days and routines, as one group. */
export function groupWeeks(schedule: PlanSlot[], weeks: number): WeekGroup[] {
  const groups: WeekGroup[] = [];
  for (let w = 1; w <= weeks; w++) {
    const slots = sortSlots(schedule.filter((s) => s.week === w)).map(({ day, routine }) => ({ day, routine }));
    const last = groups[groups.length - 1];
    if (last && last.to === w - 1 && JSON.stringify(last.slots) === JSON.stringify(slots)) last.to = w;
    else groups.push({ from: w, to: w, slots });
  }
  return groups;
}

export function weekRange(g: { from: number; to: number }): string {
  return g.from === g.to ? `Week ${g.from}` : `Weeks ${g.from}–${g.to}`;
}

export function samePlan(input: PlanEditInput, draft: PlanEditDraft): boolean {
  return (
    draft.swaps.length === 0 &&
    draft.name === input.planName &&
    draft.weeks === input.weeks &&
    JSON.stringify(sortSlots(input.schedule)) === JSON.stringify(draft.schedule)
  );
}

/** Stub mode: a real, harmless edit (one more week) so apply/undo can be exercised. */
export function stubPlanEdit(input: PlanEditInput): PlanEdit {
  return input.weeks < MAX_PLAN_WEEKS
    ? { summary: 'Stub: one more week', ops: [{ op: 'setWeeks', count: input.weeks + 1 }] }
    : { summary: 'Stub: one less week', ops: [{ op: 'setWeeks', count: input.weeks - 1 }] };
}
