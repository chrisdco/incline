/**
 * Template edit contract (AI-ARCHITECTURE §2.1): the model reads the routine
 * as numbered rows and answers with a small op list, never a whole routine.
 * One copy for app, edge and evals. Exercises come back as names; the app
 * resolves them to catalog ids, so the model never sees or invents ids.
 *
 * Bump TEMPLATE_EDIT_PROMPT_VERSION when the prompt or this shape changes.
 * 1.1.0: an empty routine is built from scratch (add ops + rename).
 * 1.2.0: a short list of the user's exercise names + the current time estimate.
 */
import { sanitizeExerciseName } from '../narrate/feature-pack';

export const TEMPLATE_EDIT_PROMPT_VERSION = 'template-edit-1.2.0';

export const MAX_TEMPLATE_ROWS = 30;
export const MAX_INTENT_CHARS = 300;
export const MAX_DIFF_OPS = 20;
export const MAX_EXERCISE_NAME = 60;
export const MAX_TEMPLATE_NAME = 60;
export const MAX_MEMORY_ITEMS = 10;
export const MAX_CATALOG_NAMES = 150;
export const SETS_RANGE = [1, 10] as const;
export const REPS_RANGE = [1, 100] as const;
export const NOTHING_TO_CHANGE = 'No changes needed for that.';

/** One existing routine row as the model sees it. `ref` is e1, e2, … in order. */
export interface TemplateRowSnapshot {
  ref: string;
  name: string;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
}

export interface TemplateEditInput {
  templateName: string;
  rows: TemplateRowSnapshot[];
  intent: string;
  /** Known user facts (coach memory), e.g. "avoids: back squat (knee)". */
  memory?: string[];
  /** Exercise names in the user's list, so the model can use names that resolve. */
  catalog?: string[];
}

export interface Targets {
  sets?: number;
  repsMin?: number;
  repsMax?: number;
}

export type TemplateDiffOp =
  | ({ op: 'add'; exercise: string; after?: string } & Targets)
  | { op: 'remove'; ref: string }
  | ({ op: 'replace'; ref: string; exercise: string } & Targets)
  | ({ op: 'setTargets'; ref: string } & Targets)
  | { op: 'reorder'; order: string[] }
  | { op: 'rename'; name: string };

export type TemplateDiff =
  | { decline: string }
  | { summary: string; ops: TemplateDiffOp[] };

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // Models like U+2011 in "Push-Up"; catalog names use ASCII hyphens.
  const text = value.replace(/[‐-―−]/g, '-').replace(/\s+/g, ' ').trim().slice(0, max);
  return text || null;
}

function clampInt(value: unknown, [lo, hi]: readonly [number, number]): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

function cleanTargets(rec: Record<string, unknown>): Targets {
  const out: Targets = {};
  const sets = clampInt(rec.sets, SETS_RANGE);
  let repsMin = clampInt(rec.repsMin, REPS_RANGE);
  let repsMax = clampInt(rec.repsMax, REPS_RANGE);
  if (repsMin !== undefined && repsMax !== undefined && repsMin > repsMax) {
    [repsMin, repsMax] = [repsMax, repsMin];
  }
  if (sets !== undefined) out.sets = sets;
  if (repsMin !== undefined) out.repsMin = repsMin;
  if (repsMax !== undefined) out.repsMax = repsMax;
  return out;
}

export function parseTemplateEditInput(raw: unknown): Parsed<TemplateEditInput> {
  if (!isRecord(raw)) return { ok: false, error: 'input must be an object' };
  const templateName = cleanText(raw.templateName, MAX_TEMPLATE_NAME);
  if (!templateName) return { ok: false, error: 'invalid_template_name' };
  const intent = cleanText(raw.intent, MAX_INTENT_CHARS);
  if (!intent) return { ok: false, error: 'invalid_intent' };
  if (!Array.isArray(raw.rows) || raw.rows.length > MAX_TEMPLATE_ROWS) {
    return { ok: false, error: 'invalid_rows' };
  }
  const rows: TemplateRowSnapshot[] = [];
  for (const [i, row] of raw.rows.entries()) {
    if (!isRecord(row)) return { ok: false, error: 'invalid_rows' };
    const name = cleanText(row.name, MAX_EXERCISE_NAME * 2);
    const sets = clampInt(row.sets, [0, 50]);
    if (!name || sets === undefined || row.ref !== `e${i + 1}`) return { ok: false, error: 'invalid_rows' };
    rows.push({
      ref: row.ref,
      name,
      sets,
      repsMin: clampInt(row.repsMin, [0, 1000]) ?? null,
      repsMax: clampInt(row.repsMax, [0, 1000]) ?? null,
    });
  }
  const memory = Array.isArray(raw.memory)
    ? raw.memory
        .map((m) => cleanText(m, 120))
        .filter((m): m is string => m !== null)
        .slice(0, MAX_MEMORY_ITEMS)
    : undefined;
  const catalog = Array.isArray(raw.catalog)
    ? raw.catalog
        .map((m) => cleanText(m, MAX_EXERCISE_NAME * 2))
        // Custom names are user text: drop any that aren't plain names (same rule as narrate).
        .filter((m): m is string => m !== null && sanitizeExerciseName(m) === m)
        .slice(0, MAX_CATALOG_NAMES)
    : undefined;
  return {
    ok: true,
    value: {
      templateName,
      rows,
      intent,
      ...(memory?.length ? { memory } : {}),
      ...(catalog?.length ? { catalog } : {}),
    },
  };
}

/**
 * Soft sanitizer + hard gate in one: unknown refs and malformed ops are
 * dropped, numbers are clamped to the guardrails, and a reply with nothing
 * usable fails. A decline passes through so the UI can say why.
 */
export function parseTemplateDiff(raw: unknown, input: TemplateEditInput): Parsed<TemplateDiff> {
  if (!isRecord(raw)) return { ok: false, error: 'diff must be an object' };
  const decline = cleanText(raw.decline, 200);
  if (decline) return { ok: true, value: { decline } };
  if (!Array.isArray(raw.ops)) return { ok: false, error: 'missing_ops' };
  // "Nothing to change" sometimes arrives as an empty op list. Its summary can
  // claim a change that never happened ("All exercises removed"), so say it plainly.
  if (raw.ops.length === 0 && cleanText(raw.summary, 200)) {
    return { ok: true, value: { decline: NOTHING_TO_CHANGE } };
  }

  const refs = new Set(input.rows.map((r) => r.ref));
  const touched = new Set<string>();
  const ops: TemplateDiffOp[] = [];
  for (const item of raw.ops.slice(0, MAX_DIFF_OPS)) {
    if (!isRecord(item)) continue;
    const ref = typeof item.ref === 'string' && refs.has(item.ref) ? item.ref : null;
    switch (item.op) {
      case 'add': {
        const exercise = cleanText(item.exercise, MAX_EXERCISE_NAME);
        if (!exercise) break;
        const after = typeof item.after === 'string' && refs.has(item.after) ? item.after : undefined;
        ops.push({ op: 'add', exercise, ...(after ? { after } : {}), ...cleanTargets(item) });
        break;
      }
      case 'remove':
        if (ref && !touched.has(ref)) {
          touched.add(ref);
          ops.push({ op: 'remove', ref });
        }
        break;
      case 'replace': {
        const exercise = cleanText(item.exercise, MAX_EXERCISE_NAME);
        if (ref && exercise && !touched.has(ref)) {
          touched.add(ref);
          ops.push({ op: 'replace', ref, exercise, ...cleanTargets(item) });
        } else if (ref && !exercise) {
          // "replace" with only new targets is a setTargets the model mislabelled.
          const targets = cleanTargets(item);
          if (Object.keys(targets).length > 0) ops.push({ op: 'setTargets', ref, ...targets });
        }
        break;
      }
      case 'setTargets': {
        const targets = cleanTargets(item);
        if (ref && Object.keys(targets).length > 0) ops.push({ op: 'setTargets', ref, ...targets });
        break;
      }
      case 'reorder': {
        if (!Array.isArray(item.order)) break;
        const order = [...new Set(item.order.filter((r): r is string => typeof r === 'string' && refs.has(r)))];
        if (order.length >= 2) ops.push({ op: 'reorder', order });
        break;
      }
      case 'rename': {
        const name = cleanText(item.name, MAX_TEMPLATE_NAME);
        if (name && name !== input.templateName) ops.push({ op: 'rename', name });
        break;
      }
      default:
        break;
    }
  }
  if (ops.length === 0) return { ok: false, error: 'no_usable_ops' };
  const summary = cleanText(raw.summary, 160) ?? 'Suggested changes';
  return { ok: true, value: { summary, ops } };
}

export type DraftRowStatus = 'kept' | 'changed' | 'replaced' | 'added';

/** A row of the proposed routine. `ref` points at the original row it came from. */
export interface DraftRow {
  ref?: string;
  name: string;
  sets: number;
  repsMin: number | null;
  repsMax: number | null;
  status: DraftRowStatus;
  /** Name the row had before a replace. */
  replacedName?: string;
}

export interface TemplateDraft {
  name: string;
  rows: DraftRow[];
  removed: TemplateRowSnapshot[];
}

function withTargets(row: DraftRow, t: Targets): DraftRow {
  return {
    ...row,
    sets: t.sets ?? row.sets,
    repsMin: t.repsMin ?? row.repsMin,
    repsMax: t.repsMax ?? row.repsMax,
  };
}

/**
 * Applies ops to the snapshot, pure. Order: reorder, then replace/targets/
 * remove in place, then adds (after their anchor, else at the end). The
 * preview and the write both use this, so what you see is what is saved.
 */
export function applyDiffToRows(input: TemplateEditInput, ops: TemplateDiffOp[]): TemplateDraft {
  let name = input.templateName;
  let order = input.rows.map((r) => r.ref);
  for (const op of ops) {
    if (op.op === 'reorder') {
      const listed = op.order.filter((r) => order.includes(r));
      order = [...listed, ...order.filter((r) => !listed.includes(r))];
    }
    if (op.op === 'rename') name = op.name;
  }

  const byRef = new Map(input.rows.map((r) => [r.ref, r]));
  const rows: DraftRow[] = [];
  const removed: TemplateRowSnapshot[] = [];
  for (const ref of order) {
    const base = byRef.get(ref)!;
    let row: DraftRow | null = {
      ref,
      name: base.name,
      sets: base.sets,
      repsMin: base.repsMin,
      repsMax: base.repsMax,
      status: 'kept',
    };
    for (const op of ops) {
      if (!row || !('ref' in op) || op.ref !== ref) continue;
      if (op.op === 'remove') row = null;
      else if (op.op === 'replace') {
        row = withTargets({ ...row, name: op.exercise, status: 'replaced', replacedName: base.name }, op);
      } else if (op.op === 'setTargets') {
        const next = withTargets(row, op);
        const changed: boolean = next.sets !== row.sets || next.repsMin !== row.repsMin || next.repsMax !== row.repsMax;
        row = changed && row.status === 'kept' ? { ...next, status: 'changed' } : next;
      }
    }
    if (row) rows.push(row);
    else removed.push(base);
  }

  for (const op of ops) {
    if (op.op !== 'add') continue;
    const row: DraftRow = {
      name: op.exercise,
      sets: op.sets ?? 3,
      repsMin: op.repsMin ?? 8,
      repsMax: op.repsMax ?? op.repsMin ?? 12,
      status: 'added',
    };
    const at = op.after ? rows.findIndex((r) => r.ref === op.after) : -1;
    if (at >= 0) {
      let i = at + 1;
      while (i < rows.length && rows[i]!.status === 'added') i++;
      rows.splice(i, 0, row);
    } else rows.push(row);
  }
  return { name, rows, removed };
}

/** ~2.5 min per working set (work + rest) plus a 5 min warm-up. */
export function estimateMinutes(rows: { sets: number }[]): number {
  const sets = rows.reduce((n, r) => n + r.sets, 0);
  return sets === 0 ? 0 : Math.round(5 + sets * 2.5);
}
