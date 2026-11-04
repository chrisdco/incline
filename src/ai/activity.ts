import type { AiActionRef } from '@/contracts/ai/action';
import { DEFAULT_AI_ACTOR, isAiActor, type AiActor } from '@/contracts/ai/actor';
import { openDatabase } from '@/db/client';
import { mutate, type Tx } from '@/db/write';
import { getDeviceId } from '@/lib/device-id';

import { getAiAction } from './actions';
import { isAiActorEnabled, isAiTaskEnabled } from './flags';

/**
 * AI → data, the only way (AI-ARCHITECTURE §1b, AI-PLATFORM §0): an applied
 * proposal is a registered action (./actions) whose write AND `ai_activity`
 * row run in one `mutate()`, so the log can never miss a change or list one
 * that didn't commit. Every row records its actor and device. Reverts use the
 * action's own `revert`; actions without one are listed but not revertible.
 * Outcomes go to `ai_feedback` for personalisation.
 */

export type FeedbackOutcome = 'applied' | 'edited' | 'rejected' | 'regenerated';

export interface AiActivityRow {
  id: number;
  proposalId: string;
  task: string;
  kind: string;
  summary: string;
  actor: AiActor;
  deviceId: string | null;
  before: unknown;
  after: unknown;
  status: 'applied' | 'reverted';
  createdAt: number;
  revertedAt: number | null;
}

export interface ApplyAiActionInput {
  proposalId: string;
  task: string;
  action: AiActionRef;
  /** Defaults to the in-app AI. */
  actor?: AiActor;
  /** `edited` when the user changed the proposal before applying. */
  outcome?: Extract<FeedbackOutcome, 'applied' | 'edited'>;
  editDiff?: unknown;
}

export type ApplyAiActionResult =
  | { status: 'applied'; activityId: number }
  | {
      status: 'rejected';
      reason: 'unknown_action' | 'invalid_payload' | 'invalid_actor' | 'disabled';
      detail?: string;
    };

function toJson(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value);
}

function fromJson(text: string | null): unknown {
  if (text == null) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** Keep the local log bounded: the newest rows are the useful ones. */
export const AI_ACTIVITY_KEEP = 500;
export const AI_FEEDBACK_KEEP = 2000;

async function prune(tx: Tx, table: 'ai_activity' | 'ai_feedback', keep: number): Promise<void> {
  await tx.runAsync(`DELETE FROM ${table} WHERE id <= (SELECT id FROM ${table} ORDER BY id DESC LIMIT 1 OFFSET ?)`, keep);
}

async function insertFeedback(
  tx: Tx,
  input: { proposalId: string; task: string; outcome: FeedbackOutcome; reason?: string; editDiff?: unknown },
  now: number,
): Promise<void> {
  await tx.runAsync(
    `INSERT INTO ai_feedback (proposal_id, task, outcome, reason, edit_diff_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    input.proposalId,
    input.task,
    input.outcome,
    input.reason ?? null,
    toJson(input.editDiff),
    now,
  );
  await prune(tx, 'ai_feedback', AI_FEEDBACK_KEEP);
}

/**
 * Apply an AI action atomically with its activity + feedback rows. Rejects
 * (writes nothing) for unknown types, bad payloads, bad actors, and anything
 * switched off remotely. A failing write throws and rolls everything back.
 */
export async function applyAiAction(input: ApplyAiActionInput): Promise<ApplyAiActionResult> {
  const actor = input.actor ?? DEFAULT_AI_ACTOR;
  if (!isAiActor(actor)) return { status: 'rejected', reason: 'invalid_actor' };
  const def = getAiAction(input.action.type);
  if (!def) return { status: 'rejected', reason: 'unknown_action', detail: input.action.type };
  const parsed = def.parse(input.action.payload);
  if (!parsed.ok) return { status: 'rejected', reason: 'invalid_payload', detail: parsed.error };
  if (!(await isAiTaskEnabled(input.task)) || !(await isAiActorEnabled(actor))) {
    return { status: 'rejected', reason: 'disabled' };
  }
  // Read before the transaction: kv uses the same connection.
  const deviceId = await getDeviceId().catch(() => null);

  const activityId = await mutate([...def.tables, 'ai_activity', 'ai_feedback'], async (tx) => {
    const { before, after, summary } = await def.apply(tx, parsed.output);
    const now = Date.now();
    const res = await tx.runAsync(
      `INSERT INTO ai_activity (proposal_id, task, kind, summary, before_json, after_json, status, actor, device_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'applied', ?, ?, ?)`,
      input.proposalId,
      input.task,
      def.type,
      summary,
      toJson(before),
      toJson(after),
      actor,
      deviceId,
      now,
    );
    await prune(tx, 'ai_activity', AI_ACTIVITY_KEEP);
    await insertFeedback(
      tx,
      { proposalId: input.proposalId, task: input.task, outcome: input.outcome ?? 'applied', editDiff: input.editDiff },
      now,
    );
    return res.lastInsertRowId;
  });
  return { status: 'applied', activityId };
}

export type RevertResult = 'reverted' | 'already_reverted' | 'not_revertible' | 'not_found';

/** Undo / "Revert" from the activity log. */
export async function revertAiActivity(id: number): Promise<RevertResult> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ kind: string; status: string }>(
    'SELECT kind, status FROM ai_activity WHERE id = ?',
    id,
  );
  if (!row) return 'not_found';
  if (row.status === 'reverted') return 'already_reverted';
  const def = getAiAction(row.kind);
  const revert = def?.revert;
  if (!def || !revert) return 'not_revertible';

  return mutate([...def.tables, 'ai_activity'], async (tx) => {
    // Re-read inside the transaction: a double-tap must not revert twice.
    const fresh = await tx.getFirstAsync<{ status: string; before_json: string | null; after_json: string | null }>(
      'SELECT status, before_json, after_json FROM ai_activity WHERE id = ?',
      id,
    );
    if (!fresh || fresh.status === 'reverted') return 'already_reverted' as const;
    await revert(tx, fromJson(fresh.before_json), fromJson(fresh.after_json));
    await tx.runAsync("UPDATE ai_activity SET status = 'reverted', reverted_at = ? WHERE id = ?", Date.now(), id);
    return 'reverted' as const;
  });
}

/** Rejected / regenerated proposals (nothing was written, so no activity row). */
export async function recordAiFeedback(input: {
  proposalId: string;
  task: string;
  outcome: Extract<FeedbackOutcome, 'rejected' | 'regenerated'>;
  reason?: string;
}): Promise<void> {
  await mutate(['ai_feedback'], (tx) => insertFeedback(tx, input, Date.now()));
}

interface ActivityDbRow {
  id: number;
  proposal_id: string;
  task: string;
  kind: string;
  summary: string;
  actor: string;
  device_id: string | null;
  before_json: string | null;
  after_json: string | null;
  status: 'applied' | 'reverted';
  created_at: number;
  reverted_at: number | null;
}

/** Newest first, for Profile → AI activity. */
export async function listAiActivity(limit = 100): Promise<AiActivityRow[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<ActivityDbRow>(
    'SELECT * FROM ai_activity ORDER BY created_at DESC, id DESC LIMIT ?',
    limit,
  );
  return rows.map((r) => ({
    id: r.id,
    proposalId: r.proposal_id,
    task: r.task,
    kind: r.kind,
    summary: r.summary,
    actor: isAiActor(r.actor) ? r.actor : DEFAULT_AI_ACTOR,
    deviceId: r.device_id,
    before: fromJson(r.before_json),
    after: fromJson(r.after_json),
    status: r.status,
    createdAt: r.created_at,
    revertedAt: r.reverted_at,
  }));
}
