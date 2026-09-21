import { openDatabase } from '../client';

/**
 * Per-exercise notes inside a live session. Local-only for now (no outbox):
 * added after the sync-fidelity freeze, so it deliberately stays out of the
 * two-device matrix until proven separately.
 */

export async function getSessionExerciseNote(
  logId: number,
  exerciseId: number,
): Promise<string> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ notes: string }>(
    'SELECT notes FROM session_exercise_notes WHERE workout_log_id = ? AND exercise_id = ?',
    logId,
    exerciseId,
  );
  return row?.notes ?? '';
}

export async function saveSessionExerciseNote(
  logId: number,
  exerciseId: number,
  notes: string,
): Promise<void> {
  const db = await openDatabase();
  const trimmed = notes.trim();
  if (!trimmed) {
    await db.runAsync(
      'DELETE FROM session_exercise_notes WHERE workout_log_id = ? AND exercise_id = ?',
      logId,
      exerciseId,
    );
    return;
  }
  await db.runAsync(
    `INSERT INTO session_exercise_notes (workout_log_id, exercise_id, notes, updated_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(workout_log_id, exercise_id)
     DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at`,
    logId,
    exerciseId,
    trimmed,
    Date.now(),
  );
}
