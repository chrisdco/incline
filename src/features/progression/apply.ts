import { applyAiAction, revertAiActivity, type ApplyAiActionResult, type RevertResult } from '@/ai/activity';
import { actorForSource, PROGRESSION_APPLY, PROGRESSION_TASK, registerProgressionActions } from '@/ai/progression-actions';
import { autoApplies, type DecisionSource, type PlateauFinding, type ProgressionAutonomy, type RemedyPlan } from '@/contracts/coaching/progression';
import type { Unit } from '@/contracts/mcp/tools';
import { openDatabase } from '@/db/client';
import { exerciseIdForKey, routinesWithExercise, type ProgressionReview } from '@/db/queries/progression';
import { newUuid } from '@/lib/uuid';

/**
 * The one path that applies a plateau fix, from any surface's suggestion:
 * the coach's own fix, an Ask / Claude / web proposal, or auto-apply. It
 * resolves the lift and its routines on device, then runs the registered
 * action (logged, revertible, kill-switchable).
 */
export interface ApplyFixInput {
  exerciseKey: string;
  exerciseName: string;
  plan: RemedyPlan;
  source: DecisionSource;
  unit: Unit;
  rationale?: string;
  /** Accepting a pending proposal. */
  decisionUuid?: string | null;
  /** Swap target (local id); defaults to the plan's substituteKey. */
  substituteId?: number | null;
}

export type ApplyFixResult = ApplyAiActionResult | { status: 'rejected'; reason: 'not_found'; detail: string };

export async function applyFix(input: ApplyFixInput): Promise<ApplyFixResult> {
  registerProgressionActions();
  const exerciseId = await exerciseIdForKey(input.exerciseKey);
  if (!exerciseId) return { status: 'rejected', reason: 'not_found', detail: `${input.exerciseName} is not on this device yet.` };
  let substituteId = input.substituteId ?? null;
  if (input.plan.remedy === 'swap' && substituteId == null && input.plan.substituteKey) {
    substituteId = await exerciseIdForKey(input.plan.substituteKey);
  }
  const templateIds = (await routinesWithExercise(exerciseId)).map((r) => r.templateId);
  return applyAiAction({
    proposalId: input.decisionUuid ?? newUuid(),
    task: PROGRESSION_TASK,
    actor: actorForSource(input.source),
    action: {
      type: PROGRESSION_APPLY,
      payload: {
        exerciseKey: input.exerciseKey,
        exerciseName: input.exerciseName,
        exerciseId,
        plan: input.plan,
        substituteId,
        templateIds,
        decisionUuid: input.decisionUuid ?? null,
        source: input.source,
        rationale: input.rationale ?? '',
        unit: input.unit,
      },
    },
  });
}

/** The activity row that applied a decision (for Undo from the fix screen). */
export async function activityForDecision(decisionUuid: string): Promise<number | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ id: number }>(
    `SELECT id FROM ai_activity WHERE kind = ? AND status = 'applied' AND after_json LIKE ?
     ORDER BY id DESC LIMIT 1`,
    PROGRESSION_APPLY,
    `%"decisionUuid":"${decisionUuid.replace(/[^a-zA-Z0-9-]/g, '')}"%`,
  );
  return row?.id ?? null;
}

/** Undo an applied fix: routines back to their snapshot, decision reverted (or back to the inbox). */
export async function undoFix(decisionUuid: string): Promise<RevertResult> {
  registerProgressionActions();
  const id = await activityForDecision(decisionUuid);
  return id == null ? 'not_found' : revertAiActivity(id);
}

export interface AutoApplied {
  finding: PlateauFinding;
  decisionUuid: string;
}

/**
 * After a workout: apply the coach's low-risk fixes for lifts trained in it,
 * when the user chose "Auto-apply small fixes". AI proposals never auto-apply.
 */
export async function autoApplyAfterSession(
  review: ProgressionReview,
  autonomy: ProgressionAutonomy,
  sessionStartedAt: number,
): Promise<AutoApplied[]> {
  const out: AutoApplied[] = [];
  for (const f of review.findings) {
    if (f.status !== 'open' || f.lastAt < sessionStartedAt) continue;
    if (!autoApplies(autonomy, f.fix, 'coach')) continue;
    const res = await applyFix({
      exerciseKey: f.exerciseKey,
      exerciseName: f.name,
      plan: f.fix.plan,
      source: 'coach',
      unit: review.unit,
    });
    if (res.status === 'applied') {
      const after = res.after as { decisionUuid?: string } | undefined;
      if (after?.decisionUuid) out.push({ finding: f, decisionUuid: after.decisionUuid });
    }
  }
  return out;
}
