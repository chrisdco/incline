import { CHAT_PROPOSE_TOOLS, MAX_PROPOSAL_CHANGE } from '@/contracts/ai/chat-tools';
import type { ChatPart, Json, ProposalPart } from '@/contracts/ai/chat';
import { PROGRESSION_RULE_VERSION } from '@/contracts/coaching/progression';
import {
  buildProposal,
  liftHistories,
  matchLift,
  normalizeRefKey,
  parseProgressionProposal,
  progressionFindings,
  shapeProposalResult,
} from '@/contracts/mcp/shape';
import { matchExercise, type ExerciseCandidate } from '@/contracts/mcp/tools';
import { openDatabase } from '@/db/client';
import { insertDecisionTx, loadProgressionInputs } from '@/db/queries/progression';
import { mutate } from '@/db/write';
import { newUuid } from '@/lib/uuid';
import { exerciseRefKeyFromRow } from '@/sync/exercise-ref';

import type { DeviceTool } from './read-tools';

/**
 * Device propose tools (AI-CHAT Phase 2). They never write: each checks its
 * target on SQLite and returns a proposal the app shows as a card. Applying
 * goes through the routine's own Ask flow (validated diff, action registry,
 * undo), so the model can only ever suggest.
 */

/** The action a routine-change card hands to the routine screen. */
export const ROUTINE_CHANGE_ACTION = 'template.edit_intent';

export interface RoutineChangePayload {
  templateId: number;
  routineName: string;
  change: string;
}

type Db = Awaited<ReturnType<typeof openDatabase>>;

function clean(text: unknown, max: number): string | null {
  if (typeof text !== 'string') return null;
  const t = text.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : null;
}

/** Stored or streamed payload → a valid routine change, or null. */
export function parseRoutineChange(raw: Json | undefined): RoutineChangePayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, Json>;
  const change = clean(p.change, MAX_PROPOSAL_CHANGE);
  const routineName = clean(p.routineName, 80);
  const id = p.templateId;
  if (!change || !routineName || typeof id !== 'number' || !Number.isInteger(id) || id < 1) return null;
  return { templateId: id, routineName, change };
}

async function proposeRoutineChange(db: Db, args: Record<string, Json>): Promise<Json> {
  const id = typeof args.routine_id === 'string' && /^\d{1,12}$/.test(args.routine_id) ? Number(args.routine_id) : NaN;
  if (!Number.isFinite(id)) throw new Error('routine_id is required (an id from list_routines)');
  const change = clean(args.change, MAX_PROPOSAL_CHANGE);
  if (!change) throw new Error('change is required');
  const row = await db.getFirstAsync<{ id: number; name: string }>(
    'SELECT id, name FROM workout_templates WHERE id = ? AND deleted_at IS NULL AND is_custom = 1',
    id,
  );
  if (!row) throw new Error('routine not found; only their own routines (list_routines) can be changed');
  return {
    status: 'proposed',
    proposal_id: newUuid(),
    routine: row.name,
    routine_id: String(row.id),
    change,
    note: 'Shown to the user as a card. Nothing has changed; they review the exact edit and apply it themselves.',
  };
}

function routineChangePart(result: Json): ChatPart | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const r = result as Record<string, Json>;
  const payload = parseRoutineChange({ templateId: Number(r.routine_id), routineName: r.routine ?? null, change: r.change ?? null });
  if (!payload || typeof r.proposal_id !== 'string') return null;
  const part: ProposalPart = {
    type: 'proposal',
    action: ROUTINE_CHANGE_ACTION,
    proposalId: r.proposal_id,
    summary: payload.change,
    payload: { ...payload },
    status: 'pending',
  };
  return part;
}

/** The card a progression proposal renders as; Review opens the fix screen. */
export const PROGRESSION_REVIEW_ACTION = 'progression.review';

export interface ProgressionCardPayload {
  exerciseKey: string;
  exerciseName: string;
  change: string;
  verdict: 'matches' | 'differs';
}

export function parseProgressionCard(raw: Json | undefined): ProgressionCardPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const p = raw as Record<string, Json>;
  const key = typeof p.exerciseKey === 'string' && /^(catalog|custom):.{1,180}$/.test(p.exerciseKey) ? p.exerciseKey : null;
  const name = clean(p.exerciseName, 80);
  const change = clean(p.change, MAX_PROPOSAL_CHANGE);
  const verdict = p.verdict === 'matches' || p.verdict === 'differs' ? p.verdict : null;
  return key && name && change && verdict ? { exerciseKey: key, exerciseName: name, change, verdict } : null;
}

/** Swap targets: every live exercise as a candidate keyed by its ref key (one query, swap only). */
async function exerciseCandidates(db: Db): Promise<ExerciseCandidate[]> {
  const rows = await db.getAllAsync<{ id: number; name: string; primary_muscle: string; equipment: string; is_custom: number; uuid: string | null; external_id: string | null }>(
    'SELECT id, name, primary_muscle, equipment, is_custom, uuid, external_id FROM exercises WHERE deleted_at IS NULL',
  );
  return rows.flatMap((r) => {
    const key = exerciseRefKeyFromRow(r.id, r);
    return key
      ? [{ ref: { refType: 'catalog' as const, externalId: normalizeRefKey(key) }, name: r.name, aliases: [], primaryMuscle: r.primary_muscle, secondaryMuscles: [], equipment: r.equipment }]
      : [];
  });
}

/**
 * Ask's plateau proposal: same parse, bounds and assessment as the MCP tool
 * (contracts/mcp/shape.ts). A safe one is queued as a `proposed` decision
 * (it also shows in the inbox); nothing in the plan changes until the user
 * applies it on the fix screen.
 */
async function proposeProgressionChange(db: Db, args: Record<string, Json>): Promise<Json> {
  const parsed = parseProgressionProposal(args as Record<string, unknown>);
  if (!parsed.ok) throw new Error(parsed.error);
  const p = parsed.value;
  const inp = await loadProgressionInputs(db);
  const lift = matchLift(p.exercise, liftHistories(inp.sets));
  if (!lift) throw new Error(`No recent sets of "${p.exercise}". Use a name from get_progression_review.`);
  const now = Date.now();
  const finding =
    progressionFindings(inp.sets, { unit: inp.unit, experience: inp.experience, decisions: inp.decisions, now, lastDeloadAt: inp.lastDeloadAt }).find(
      (f) => f.exerciseKey === lift.key,
    ) ?? null;
  let substitute: { key: string; name: string } | null = null;
  if (p.remedy === 'swap' && p.substitute) {
    const hit = matchExercise(p.substitute, await exerciseCandidates(db));
    if (hit && hit.ref.refType === 'catalog') substitute = { key: hit.ref.externalId, name: hit.name };
  }
  const built = buildProposal(p, lift, finding, inp.unit, substitute);
  if (!built.ok) throw new Error(built.error);
  const out = shapeProposalResult(lift, built.plan, built.assessment, inp.unit);
  if (!out.queued) return JSON.parse(JSON.stringify(out)) as Json;
  const uuid = await mutate(['progression_decisions'], (tx) =>
    insertDecisionTx(tx, {
      exerciseKey: lift.key,
      exerciseName: lift.name,
      remedy: built.plan.remedy,
      plan: built.plan,
      status: 'proposed',
      source: 'app_ai',
      rationale: p.rationale,
    }),
  );
  return JSON.parse(
    JSON.stringify({ ...out, proposal_id: uuid, exercise_ref: lift.key, rule_version: PROGRESSION_RULE_VERSION }),
  ) as Json;
}

function progressionPart(result: Json): ChatPart | null {
  if (!result || typeof result !== 'object' || Array.isArray(result)) return null;
  const r = result as Record<string, Json>;
  if (r.queued !== true || typeof r.proposal_id !== 'string') return null;
  const payload = parseProgressionCard({ exerciseKey: r.exercise_ref ?? null, exerciseName: r.exercise ?? null, change: r.change ?? null, verdict: r.verdict ?? null });
  if (!payload) return null;
  const part: ProposalPart = {
    type: 'proposal',
    action: PROGRESSION_REVIEW_ACTION,
    proposalId: r.proposal_id,
    summary: payload.change,
    payload: { ...payload },
    status: 'pending',
  };
  return part;
}

const HANDLERS: Record<string, { run: (db: Db, args: Record<string, Json>) => Promise<Json>; toPart: (result: Json) => ChatPart | null }> = {
  propose_routine_change: { run: proposeRoutineChange, toPart: routineChangePart },
  propose_progression_change: { run: proposeProgressionChange, toPart: progressionPart },
};

export function deviceProposeTools(open: () => Promise<Db> = openDatabase): DeviceTool[] {
  return CHAT_PROPOSE_TOOLS.filter((spec) => HANDLERS[spec.name]).map((spec) => {
    const h = HANDLERS[spec.name]!;
    return {
      spec,
      async run(args) {
        const a = args && typeof args === 'object' && !Array.isArray(args) ? (args as Record<string, Json>) : {};
        return h.run(await open(), a);
      },
      toPart: h.toPart,
    };
  });
}
