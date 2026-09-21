import type { SQLiteDatabase } from 'expo-sqlite';

import { hasTable } from './helpers';
import type { Migration } from './types';

/** Per-exercise notes inside a live session (Hevy parity). Local-only for now. */
export const migration017: Migration = {
  version: 17,
  name: 'session_exercise_notes',
  async up(db: SQLiteDatabase) {
    if (!(await hasTable(db, 'session_exercise_notes'))) {
      await db.execAsync(`
        CREATE TABLE session_exercise_notes (
          workout_log_id INTEGER NOT NULL,
          exercise_id INTEGER NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (workout_log_id, exercise_id)
        )
      `);
      await db.execAsync(
        'CREATE INDEX IF NOT EXISTS idx_session_exercise_notes_log ON session_exercise_notes(workout_log_id)',
      );
    }
  },
};
