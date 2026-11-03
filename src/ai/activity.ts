import { openDatabase } from '@/db/client';
import { mutate, type DbTable, type Tx } from '@/db/write';

/**
 * AI → data, the only way (AI-ARCHITECTURE §1b "Transparency"): an applied
 * proposal runs its write AND its `ai_activity` row in one `mutate()`, so the
 * log can never miss a change or list one that didn't commit. Reverts are
 * per-kind handlers that put `before` back; kinds without one are listed but
 * not revertible. Outcomes go to `ai_feedback` for personalisation.
 */

export type FeedbackOutcome = 'applied' | 'edited' | 'rejected' | 'regenerated';

export interface AiActivityRow {
  id: number;
  proposalId: string;
  task: string;
  kind: string;
  summary: string;
  before: unknown;
  after: unknown;
  status: 'applied' | 'reverted';
  createdAt: number;
  revertedAt: number | null;
}

export interface RevertHandler {
  /** Tables the revert writes (emitted as changed after COMMIT). */
  tables: readonly DbTable[];
  revert: (tx: Tx, before: unknown, after: unknown) => Promise<void>;
}

const revertHandlers = new Map<string, RevertHandler>();

export function registerRevertHandler(kind: string, handler: RevertHandler): void {
  revertHandlers.set(kind, handler);
}

export function canRevert(kind: string): boolean {
  return revertHandlers.has(kind);
}

export interface ApplyAiChangeInput<B, A> {
  proposalId: string;
  task: string;
  kind: string;
  /** One line for the activity log, e.g. "Swapped Back Squat → Leg Press in Legs A". */
  summary: string;
  tables: readonly DbTable[];
  /** Applies the change on `tx` and returns what it replaced and what it wrote. */
  apply: (tx: Tx) => Promise<{ before: B; after: A }>;
  /** `edited` when the user changed the proposal before applying. */
  outcome?: Extract<FeedbackOutcome, 'applied' | 'edited'>;
  editDiff?: unknown;
}

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
}

/** Apply an AI change atomically with its activity + feedback rows. Returns the activity id. */
export async function applyAiChange<B, A>(input: ApplyAiChangeInput<B, A>): Promise<number> {
  return mutate([...input.tables, 'ai_activity', 'ai_feedback'], async (tx) => {
    const { before, after } = await input.apply(tx);
    const now = Date.now();
    const res = await tx.runAsync(
      `INSERT INTO ai_activity (proposal_id, task, kind, summary, before_json, after_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'applied', ?)`,
      input.proposalId,
      input.task,
      input.kind,
      input.summary,
      toJson(before),
      toJson(after),
      now,
    );
    await insertFeedback(
      tx,
      { proposalId: input.proposalId, task: input.task, outcome: input.outcome ?? 'applied', editDiff: input.editDiff },
      now,
    );
    return res.lastInsertRowId;
  });
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
  const handler = revertHandlers.get(row.kind);
  if (!handler) return 'not_revertible';

  return mutate([...handler.tables, 'ai_activity'], async (tx) => {
    // Re-read inside the transaction: a double-tap must not revert twice.
    const fresh = await tx.getFirstAsync<{ status: string; before_json: string | null; after_json: string | null }>(
      'SELECT status, before_json, after_json FROM ai_activity WHERE id = ?',
      id,
    );
    if (!fresh || fresh.status === 'reverted') return 'already_reverted' as const;
    await handler.revert(tx, fromJson(fresh.before_json), fromJson(fresh.after_json));
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
    before: fromJson(r.before_json),
    after: fromJson(r.after_json),
    status: r.status,
    createdAt: r.created_at,
    revertedAt: r.reverted_at,
  }));
}
