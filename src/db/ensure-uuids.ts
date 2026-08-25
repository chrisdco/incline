import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { hasColumn } from './migrations/helpers';

const UUID_TABLES = [
  'exercises',
  'workout_templates',
  'template_exercises',
  'workout_logs',
  'set_entries',
  'user_profile',
  'bodyweight_entries',
  'body_measurements',
  'programs',
  'program_workouts',
  'workout_photos',
] as const;

/** Backfill missing UUIDs (fresh seed rows, legacy inserts). Safe to call repeatedly. */
export async function ensureSyncUuids(db: SQLiteDatabase): Promise<void> {
  for (const table of UUID_TABLES) {
    if (!(await hasColumn(db, table, 'uuid'))) continue;
    const rows = await db.getAllAsync<{ id: number }>(
      `SELECT id FROM ${table} WHERE uuid IS NULL`,
    );
    for (const row of rows) {
      await db.runAsync(`UPDATE ${table} SET uuid = ? WHERE id = ?`, Crypto.randomUUID(), row.id);
    }
  }
}
