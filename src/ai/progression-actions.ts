import type { AiActor } from '@/contracts/ai/actor';
import {
  parseRemedyPlan,
  type DecisionSource,
  type DecisionStatus,
  type RemedyPlan,
} from '@/contracts/coaching/progression';
import { MAX_RATIONALE, planText } from '@/contracts/mcp/shape';
import type { Unit } from '@/contracts/mcp/tools';
import { insertDecisionTx, setDecisionStatusTx } from '@/db/queries/progression';
import {
  restoreTemplateSnapshot,
  snapshotTemplate,
  TEMPLATE_TABLES,
  writeTemplateState,
  type TemplateSnapshot,
  type TemplateStateRow,
} from '@/db/queries/templates';

import { registerAiAction } from './actions';
import type { ParseResult } from './types';

/**
 * Apply a plateau fix (PROGRESSION.md §3) as a registered action, so it is
 * logged with its actor, revertible, and switchable off like every AI write.
 *
 *   reset      decision only; the next session's suggestion uses the load
 *   add_set    target sets on every routine row for the lift
 *   rep_range  target reps on those rows
 *   swap       the substitute replaces the lift on those rows
 *
 * Deloads go through the deload screen (a new routine copy), not here.
 * Revert restores each routine snapshot and marks the decision reverted.
 */
export const PROGRESSION_APPLY = 'progression.apply';
export const PROGRESSION_TASK = 'progression';

export interface ProgressionApplyPayload {
  exerciseKey: string;
  exerciseName: string;
  exerciseId: number;
  plan: RemedyPlan;
  /** Local id of the swap target (resolved before applying). */
  substituteId: number | null;
  /** Routines to edit (routine-type fixes). */
  templateIds: number[];
  /** An existing proposal being accepted; null = a new decision. */
  decisionUuid: string | null;
  source: DecisionSource;
  rationale: string;
  unit: Unit;
}

interface Before {
  decisionUuid: string | null;
  prevStatus: DecisionStatus | null;
  routines: { templateId: number; snapshot: TemplateSnapshot }[];
}

interface After {
  decisionUuid: string;
  routines: { templateId: number; inserted: number[] }[];
}

const ROUTINE_REMEDIES = new Set(['add_set', 'rep_range', 'swap']);

function posInt(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v > 0;
}

export function parseProgressionApply(raw: unknown): ParseResult<ProgressionApplyPayload> {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'payload must be an object' };
  const p = raw as Record<string, unknown>;
  const plan = parseRemedyPlan(p.plan);
  if (!plan) return { ok: false, error: 'invalid plan' };
  if (plan.remedy === 'deload') return { ok: false, error: 'deloads apply from the deload screen' };
  if (typeof p.exerciseKey !== 'string' || !p.exerciseKey || p.exerciseKey.length > 200) return { ok: false, error: 'invalid exerciseKey' };
  if (typeof p.exerciseName !== 'string') return { ok: false, error: 'invalid exerciseName' };
  if (!posInt(p.exerciseId)) return { ok: false, error: 'invalid exerciseId' };
  const templateIds = Array.isArray(p.templateIds) ? p.templateIds.filter(posInt) : [];
  if (ROUTINE_REMEDIES.has(plan.remedy) && templateIds.length === 0) {
    return { ok: false, error: 'this lift is not in a routine' };
  }
  const substituteId = posInt(p.substituteId) ? p.substituteId : null;
  if (plan.remedy === 'swap' && (substituteId === null || substituteId === p.exerciseId)) {
    return { ok: false, error: 'pick an exercise to swap to' };
  }
  const source = typeof p.source === 'string' ? (p.source as DecisionSource) : 'user';
  if (!/^(coach|user|web|app_ai|mcp:[a-z0-9._-]{1,64})$/.test(source)) return { ok: false, error: 'invalid source' };
  return {
    ok: true,
    output: {
      exerciseKey: p.exerciseKey,
      exerciseName: p.exerciseName.slice(0, 120),
      exerciseId: p.exerciseId,
      plan,
      substituteId,
      templateIds: [...new Set(templateIds)].slice(0, 20),
      decisionUuid: typeof p.decisionUuid === 'string' && p.decisionUuid ? p.decisionUuid : null,
      source,
      rationale: typeof p.rationale === 'string' ? p.rationale.slice(0, MAX_RATIONALE) : '',
      unit: p.unit === 'imperial' ? 'imperial' : 'metric',
    },
  };
}

/** Who the activity log credits. The house rule (and the user acting on it) is the progression recipe. */
export function actorForSource(source: DecisionSource): AiActor {
  if (source === 'coach' || source === 'user') return 'recipe:progression';
  return source;
}

function nextRows(snapshot: TemplateSnapshot, p: ProgressionApplyPayload): TemplateStateRow[] {
  return snapshot.rows.map((r) => {
    const row: TemplateStateRow = {
      id: r.id,
      exerciseId: r.exercise_id,
      sets: r.target_sets,
      repsMin: r.target_reps_min,
      repsMax: r.target_reps_max,
    };
    if (r.exercise_id !== p.exerciseId) return row;
    switch (p.plan.remedy) {
      case 'add_set':
        return { ...row, sets: p.plan.sets };
      case 'rep_range':
        return { ...row, repsMin: p.plan.min, repsMax: p.plan.max };
      case 'swap':
        return { ...row, exerciseId: p.substituteId! };
      default:
        return row;
    }
  });
}

let registered = false;

/** Idempotent; called before any apply (fix screen, inbox, auto-apply). */
export function registerProgressionActions(): void {
  if (registered) return;
  registered = true;
  registerAiAction<ProgressionApplyPayload, Before, After>({
    type: PROGRESSION_APPLY,
    tables: [...TEMPLATE_TABLES, 'progression_decisions'],
    parse: parseProgressionApply,
    async apply(tx, p) {
      const routines: Before['routines'] = [];
      const written: After['routines'] = [];
      if (ROUTINE_REMEDIES.has(p.plan.remedy)) {
        for (const templateId of p.templateIds) {
          const snapshot = await snapshotTemplate(tx, templateId);
          if (!snapshot || !snapshot.rows.some((r) => r.exercise_id === p.exerciseId)) continue;
          const inserted = await writeTemplateState(tx, templateId, snapshot.name, nextRows(snapshot, p), snapshot.rows);
          routines.push({ templateId, snapshot });
          written.push({ templateId, inserted });
        }
        if (!routines.length) throw new Error('This lift is no longer in any routine.');
      }
      let prevStatus: DecisionStatus | null = null;
      let decisionUuid = p.decisionUuid;
      if (decisionUuid) {
        const cur = await tx.getFirstAsync<{ status: DecisionStatus }>(
          'SELECT status FROM progression_decisions WHERE uuid = ? AND deleted_at IS NULL',
          decisionUuid,
        );
        if (!cur) decisionUuid = null;
        else {
          prevStatus = cur.status;
          await setDecisionStatusTx(tx, decisionUuid, 'applied', { plan: p.plan, restartClock: true });
        }
      }
      if (!decisionUuid) {
        decisionUuid = await insertDecisionTx(tx, {
          exerciseKey: p.exerciseKey,
          exerciseName: p.exerciseName,
          remedy: p.plan.remedy,
          plan: p.plan,
          status: 'applied',
          source: p.source,
          rationale: p.rationale,
        });
      }
      const where = routines.length ? ` in ${routines.length === 1 ? routines[0]!.snapshot.name : `${routines.length} routines`}` : '';
      return {
        before: { decisionUuid: p.decisionUuid, prevStatus, routines },
        after: { decisionUuid, routines: written },
        summary: `${p.exerciseName}: ${planText(p.plan, p.unit) ?? p.plan.remedy}${where}`,
      };
    },
    async revert(tx, before, after) {
      for (const r of before.routines) {
        const inserted = after.routines.find((w) => w.templateId === r.templateId)?.inserted ?? [];
        await restoreTemplateSnapshot(tx, r.templateId, r.snapshot, inserted);
      }
      // An accepted proposal goes back to the inbox; a new decision is voided.
      if (before.decisionUuid && before.prevStatus === 'proposed') {
        await setDecisionStatusTx(tx, after.decisionUuid, 'proposed');
      } else {
        await setDecisionStatusTx(tx, after.decisionUuid, 'reverted');
      }
    },
  });
}
