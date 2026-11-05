import { insertPlan, PLAN_TABLES, softDeletePlan, type PlanInsertInput } from '@/db/queries/programs';

import { registerAiAction } from './actions';
import type { ParseResult } from './types';

export const PROGRAM_CREATE_PLAN = 'program.create_plan';

export interface PlanCreateResult {
  programId: number;
  templateIds: number[];
}

const MAX_TEMPLATES = 12;
const MAX_ROWS = 20;
const MAX_SLOTS = 16 * 7;
const LEVELS = ['beginner', 'intermediate', 'advanced'] as const;

function int(value: unknown, lo: number, hi: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= lo && value <= hi;
}

function str(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}

/** Re-checks the approved plan before it touches the database. */
export function parsePlanInsertPayload(raw: unknown): ParseResult<PlanInsertInput> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'payload must be an object' };
  const p = raw as Record<string, unknown>;
  if (!str(p.name, 60) || !p.name.trim()) return { ok: false, error: 'invalid name' };
  if (!str(p.description, 600)) return { ok: false, error: 'invalid description' };
  if (!int(p.weeks, 1, 16)) return { ok: false, error: 'invalid weeks' };
  if (!LEVELS.includes(p.difficulty as (typeof LEVELS)[number])) return { ok: false, error: 'invalid difficulty' };
  if (!Array.isArray(p.templates) || p.templates.length === 0 || p.templates.length > MAX_TEMPLATES) {
    return { ok: false, error: 'invalid templates' };
  }
  const templates: PlanInsertInput['templates'] = [];
  for (const t of p.templates as Record<string, unknown>[]) {
    if (!t || typeof t !== 'object' || !str(t.name, 60) || !t.name.trim() || !int(t.estimatedMinutes, 0, 240)) {
      return { ok: false, error: 'invalid template' };
    }
    if (!Array.isArray(t.rows) || t.rows.length === 0 || t.rows.length > MAX_ROWS) return { ok: false, error: 'invalid rows' };
    const rows: PlanInsertInput['templates'][number]['rows'] = [];
    for (const r of t.rows as Record<string, unknown>[]) {
      if (
        !r ||
        typeof r !== 'object' ||
        !int(r.exerciseId, 1, Number.MAX_SAFE_INTEGER) ||
        !int(r.sets, 1, 10) ||
        !int(r.repsMin, 1, 50) ||
        !int(r.repsMax, 1, 50) ||
        r.repsMin > r.repsMax ||
        !int(r.restSeconds, 0, 600) ||
        !str(r.notes, 200)
      ) {
        return { ok: false, error: 'invalid row' };
      }
      rows.push({ exerciseId: r.exerciseId, sets: r.sets, repsMin: r.repsMin, repsMax: r.repsMax, restSeconds: r.restSeconds, notes: r.notes });
    }
    templates.push({ name: t.name.trim(), estimatedMinutes: t.estimatedMinutes, rows });
  }
  if (!Array.isArray(p.schedule) || p.schedule.length === 0 || p.schedule.length > MAX_SLOTS) {
    return { ok: false, error: 'invalid schedule' };
  }
  const schedule: PlanInsertInput['schedule'] = [];
  const seen = new Set<string>();
  for (const s of p.schedule as Record<string, unknown>[]) {
    if (!s || !int(s.week, 1, p.weeks) || !int(s.day, 1, 7) || !int(s.template, 0, templates.length - 1)) {
      return { ok: false, error: 'invalid slot' };
    }
    const key = `${s.week}:${s.day}`;
    if (seen.has(key)) return { ok: false, error: 'duplicate slot' };
    seen.add(key);
    schedule.push({ week: s.week, day: s.day, template: s.template });
  }
  return {
    ok: true,
    output: {
      name: p.name.trim(),
      description: p.description,
      weeks: p.weeks,
      difficulty: p.difficulty as PlanInsertInput['difficulty'],
      templates,
      schedule,
    },
  };
}

let registered = false;

/** Idempotent: the plan builder calls it before saving. */
export function registerPlanActions(): void {
  if (registered) return;
  registered = true;
  registerAiAction<PlanInsertInput, null, PlanCreateResult>({
    type: PROGRAM_CREATE_PLAN,
    tables: PLAN_TABLES,
    parse: parsePlanInsertPayload,
    async apply(tx, payload) {
      const after = await insertPlan(tx, payload);
      return { before: null, after, summary: `Created ${payload.name}` };
    },
    async revert(tx, _before, after) {
      await softDeletePlan(tx, after.programId, after.templateIds);
    },
  });
}
