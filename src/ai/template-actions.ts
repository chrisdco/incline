import {
  restoreTemplateSnapshot,
  snapshotTemplate,
  TEMPLATE_TABLES,
  writeTemplateState,
  type TemplateSnapshot,
  type TemplateStateRow,
} from '@/db/queries/templates';
import { MAX_TEMPLATE_NAME, REPS_RANGE, SETS_RANGE } from '@/contracts/templates/template-edit';

import { registerAiAction } from './actions';
import type { ParseResult } from './types';

/** Whole-routine target the user approved (the AI diff, resolved to catalog ids). */
export interface TemplateApplyPayload {
  templateId: number;
  name: string;
  rows: TemplateStateRow[];
  summary: string;
}

interface Before {
  templateId: number;
  snapshot: TemplateSnapshot;
}

interface After {
  templateId: number;
  inserted: number[];
}

export const TEMPLATE_APPLY_DIFF = 'template.apply_diff';
const MAX_ROWS = 40;

function int(value: unknown, [lo, hi]: readonly [number, number]): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= lo && value <= hi;
}

export function parseTemplateApplyPayload(raw: unknown): ParseResult<TemplateApplyPayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'payload must be an object' };
  const p = raw as Record<string, unknown>;
  if (!int(p.templateId, [1, Number.MAX_SAFE_INTEGER])) return { ok: false, error: 'invalid templateId' };
  if (typeof p.name !== 'string' || !p.name.trim() || p.name.length > MAX_TEMPLATE_NAME) {
    return { ok: false, error: 'invalid name' };
  }
  if (typeof p.summary !== 'string') return { ok: false, error: 'invalid summary' };
  if (!Array.isArray(p.rows) || p.rows.length === 0 || p.rows.length > MAX_ROWS) {
    return { ok: false, error: 'invalid rows' };
  }
  const rows: TemplateStateRow[] = [];
  const seen = new Set<number>();
  for (const r of p.rows as Record<string, unknown>[]) {
    if (!r || typeof r !== 'object') return { ok: false, error: 'invalid row' };
    const okId = r.id === undefined || (int(r.id, [1, Number.MAX_SAFE_INTEGER]) && !seen.has(r.id));
    if (
      !okId ||
      !int(r.exerciseId, [1, Number.MAX_SAFE_INTEGER]) ||
      !int(r.sets, SETS_RANGE) ||
      !int(r.repsMin, REPS_RANGE) ||
      !int(r.repsMax, REPS_RANGE) ||
      r.repsMin > r.repsMax
    ) {
      return { ok: false, error: 'invalid row' };
    }
    if (typeof r.id === 'number') seen.add(r.id);
    rows.push({
      ...(typeof r.id === 'number' ? { id: r.id } : {}),
      exerciseId: r.exerciseId,
      sets: r.sets,
      repsMin: r.repsMin,
      repsMax: r.repsMax,
    });
  }
  return { ok: true, output: { templateId: p.templateId, name: p.name.trim(), rows, summary: p.summary.slice(0, 160) } };
}

let registered = false;

/** Idempotent: the routine screen calls it before applying. */
export function registerTemplateActions(): void {
  if (registered) return;
  registered = true;
  registerAiAction<TemplateApplyPayload, Before, After>({
    type: TEMPLATE_APPLY_DIFF,
    tables: TEMPLATE_TABLES,
    parse: parseTemplateApplyPayload,
    async apply(tx, payload) {
      const snapshot = await snapshotTemplate(tx, payload.templateId);
      if (!snapshot) throw new Error('template not found');
      const inserted = await writeTemplateState(tx, payload.templateId, payload.name, payload.rows, snapshot.rows);
      return {
        before: { templateId: payload.templateId, snapshot },
        after: { templateId: payload.templateId, inserted },
        summary: payload.summary || `Edited ${payload.name}`,
      };
    },
    async revert(tx, before, after) {
      await restoreTemplateSnapshot(tx, before.templateId, before.snapshot, after.inserted);
    },
  });
}
