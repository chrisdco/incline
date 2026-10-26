import type { SQLiteDatabase } from 'expo-sqlite';

import { emitTablesChanged } from './changes';
import { openWriterDatabase } from './client';

/** Local tables a write can declare (see schema.ts). */
export type DbTable =
  | 'body_measurements'
  | 'bodyweight_entries'
  | 'exercise_aliases'
  | 'exercise_images'
  | 'exercise_instructions'
  | 'exercise_secondary_muscles'
  | 'exercises'
  | 'kv'
  | 'photo_blob_queue'
  | 'program_workouts'
  | 'programs'
  | 'session_exercise_notes'
  | 'set_entries'
  | 'sync_outbox'
  | 'template_exercises'
  | 'user_profile'
  | 'workout_logs'
  | 'workout_photos'
  | 'workout_templates';

/**
 * The handle a `mutate()` body runs every statement on. Helpers that take one
 * (enqueueSync, recomputeVolume, exerciseRefForId) join the caller's
 * transaction; called without one they fall back to the shared connection.
 */
export type Tx = Pick<SQLiteDatabase, 'execAsync' | 'runAsync' | 'getFirstAsync' | 'getAllAsync'>;

let queue: Promise<unknown> = Promise.resolve();

/**
 * Run one write — the row changes AND their outbox enqueues — as a single
 * unit of work: BEGIN IMMEDIATE on the writer connection, commit only if `fn`
 * resolves, roll everything back if any statement (an enqueue included)
 * throws, and rethrow so the caller can surface it.
 *
 * Calls are serialised in-process: the writer connection holds one
 * transaction at a time. Never call `mutate()` from inside a `mutate()` body
 * (it would wait on itself) — compose the inner write's `(tx) => …` part.
 *
 * `tables` are the tables `fn` writes; they are emitted as changed after
 * COMMIT (see changes.ts). `sync_outbox` is implied.
 */
export async function mutate<T>(
  tables: readonly DbTable[],
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  const run = queue.then(() => inTransaction(fn));
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  const result = await run;
  emitTablesChanged([...tables, 'sync_outbox']);
  return result;
}

async function inTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  const tx = await openWriterDatabase();
  await tx.execAsync('BEGIN IMMEDIATE');
  try {
    const result = await fn(tx);
    await tx.execAsync('COMMIT');
    return result;
  } catch (err) {
    try {
      await tx.execAsync('ROLLBACK');
    } catch {
      // SQLite may already have rolled back; keep the original error.
    }
    throw err;
  }
}
