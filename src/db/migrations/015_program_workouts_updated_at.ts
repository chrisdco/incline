import type { SQLiteDatabase } from 'expo-sqlite';

import { hasColumn } from './helpers';
import type { Migration } from './types';

/** LWW timestamp on program slots so custom programs can round-trip. */
export const migration015: Migration = {
  version: 15,
  name: 'program_workouts_updated_at',
  async up(db: SQLiteDatabase) {
    if (!(await hasColumn(db, 'program_workouts', 'updated_at'))) {
      await db.execAsync('ALTER TABLE program_workouts ADD COLUMN updated_at INTEGER');
      await db.execAsync(
        `UPDATE program_workouts SET updated_at = (
           SELECT updated_at FROM programs WHERE programs.id = program_workouts.program_id
         ) WHERE updated_at IS NULL`,
      );
      await db.execAsync(
        `UPDATE program_workouts SET updated_at = ${Date.now()} WHERE updated_at IS NULL`,
      );
    }
  },
};
