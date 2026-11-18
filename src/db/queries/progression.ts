import {
  DECLINE_RESUME_SESSIONS,
  PROGRESSION_RULE_VERSION,
  type DecisionSource,
  type DecisionStatus,
  type Remedy,
  type RemedyPlan,
} from '@/contracts/coaching/progression';
import { mutate, type Tx } from '@/db/write';
import { newUuid } from '@/lib/uuid';
import { enqueueSync } from '@/sync/outbox';

export * from './progression-read';

/** Progression decision writes (synced via the outbox). Reads: ./progression-read.ts. */

interface DecisionRowFull {
  exercise_ref: string;
  exercise_name: string;
  remedy: string;
  params: string | null;
  status: string;
  source: string;
  rationale: string;
  rule_version: string;
  resume_after_sessions: number | null;
  created_at: number;
  resolved_at: number | null;
  updated_at: number;
  deleted_at: number | null;
}

async function enqueueDecision(tx: Tx, uuid: string): Promise<void> {
  const r = await tx.getFirstAsync<DecisionRowFull>(
    'SELECT * FROM progression_decisions WHERE uuid = ?',
    uuid,
  );
  if (!r) return;
  await enqueueSync(
    'progression_decisions',
    uuid,
    'upsert',
    {
      exercise_ref: r.exercise_ref,
      exercise_name: r.exercise_name,
      remedy: r.remedy,
      params: r.params,
      status: r.status,
      source: r.source,
      rationale: r.rationale,
      rule_version: r.rule_version,
      resume_after_sessions: r.resume_after_sessions,
      resolved_at: r.resolved_at,
      created_at: r.created_at,
      updated_at: r.updated_at,
      deleted_at: r.deleted_at,
    },
    tx,
  );
}

export interface NewDecision {
  exerciseKey: string;
  exerciseName: string;
  remedy: Remedy | 'keep_going';
  plan: RemedyPlan | null;
  status: DecisionStatus;
  source: DecisionSource;
  rationale?: string;
  resumeAfterSessions?: number | null;
}

/** Insert a decision inside `tx` (and queue its sync). Returns the uuid. */
export async function insertDecisionTx(tx: Tx, d: NewDecision): Promise<string> {
  const uuid = newUuid();
  const now = Date.now();
  const resolved = d.status === 'proposed' ? null : now;
  await tx.runAsync(
    `INSERT INTO progression_decisions (uuid, exercise_ref, exercise_name, remedy, params, status, source, rationale,
       rule_version, resume_after_sessions, created_at, resolved_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    uuid,
    d.exerciseKey,
    d.exerciseName.slice(0, 120),
    d.remedy,
    d.plan ? JSON.stringify(d.plan) : null,
    d.status,
    d.source,
    (d.rationale ?? '').slice(0, 600),
    PROGRESSION_RULE_VERSION,
    d.resumeAfterSessions ?? null,
    now,
    resolved,
    now,
  );
  await enqueueDecision(tx, uuid);
  return uuid;
}

/**
 * Move a decision to `status` inside `tx`. `createdAt` restarts on apply so
 * "sessions since the fix" counts from when it actually changed the plan.
 */
export async function setDecisionStatusTx(
  tx: Tx,
  uuid: string,
  status: DecisionStatus,
  opts: { plan?: RemedyPlan | null; restartClock?: boolean; resumeAfterSessions?: number | null } = {},
): Promise<void> {
  const now = Date.now();
  const sets = ['status = ?', 'resolved_at = ?', 'updated_at = ?'];
  const args: (string | number | null)[] = [status, status === 'proposed' ? null : now, now];
  if (opts.plan !== undefined) {
    sets.push('params = ?');
    args.push(opts.plan ? JSON.stringify(opts.plan) : null);
  }
  if (opts.restartClock) {
    sets.push('created_at = ?');
    args.push(now);
  }
  if (opts.resumeAfterSessions !== undefined) {
    sets.push('resume_after_sessions = ?');
    args.push(opts.resumeAfterSessions);
  }
  await tx.runAsync(`UPDATE progression_decisions SET ${sets.join(', ')} WHERE uuid = ?`, ...args, uuid);
  await enqueueDecision(tx, uuid);
}

/** "Not now": the lift goes quiet for a few sessions, then comes back if still stuck. */
export async function declineFix(input: {
  exerciseKey: string;
  exerciseName: string;
  remedy: Remedy;
  plan: RemedyPlan | null;
  /** A pending proposal being turned down (AI / web / MCP), if any. */
  decisionUuid?: string | null;
}): Promise<void> {
  await mutate(['progression_decisions'], async (tx) => {
    if (input.decisionUuid) {
      await setDecisionStatusTx(tx, input.decisionUuid, 'declined', {
        restartClock: true,
        resumeAfterSessions: DECLINE_RESUME_SESSIONS,
      });
      return;
    }
    await insertDecisionTx(tx, {
      exerciseKey: input.exerciseKey,
      exerciseName: input.exerciseName,
      remedy: input.remedy,
      plan: input.plan,
      status: 'declined',
      source: 'user',
      resumeAfterSessions: DECLINE_RESUME_SESSIONS,
    });
  });
}

/** Record a deload week the user created (deload screen), so every surface sees it. */
export async function recordDeloadDecision(): Promise<void> {
  await mutate(['progression_decisions'], (tx) =>
    insertDecisionTx(tx, {
      exerciseKey: 'program',
      exerciseName: 'Whole program',
      remedy: 'deload',
      plan: { remedy: 'deload', scale: 0.6 },
      status: 'applied',
      source: 'user',
    }).then(() => undefined),
  );
}

