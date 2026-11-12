import type { SQLiteDatabase } from 'expo-sqlite';

import { hasColumn, hasTable } from './helpers';
import type { Migration } from './types';

/**
 * Gym profiles (#243): named places with their own bar and plate inventory,
 * and a gym tag on each workout. Workouts reference the gym by uuid (like the
 * outbox payloads reference templates), so sync needs no id remapping.
 * Fresh installs build the table from here too (schema.ts spreads GYMS_DDL);
 * `workout_logs.gym_uuid` is in schema.ts's CREATE TABLE for them.
 */
export const GYMS_DDL = [
  `CREATE TABLE IF NOT EXISTS gyms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT,
    name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'metric',
    bar_weight REAL NOT NULL,
    plates TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    deleted_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_gyms_uuid ON gyms(uuid)`,
];

/** Runs after the column exists (fresh: schema.ts; upgrade: below). */
export const WORKOUT_LOGS_GYM_INDEX =
  'CREATE INDEX IF NOT EXISTS idx_workout_logs_gym ON workout_logs(gym_uuid)';

export const migration022: Migration = {
  version: 22,
  name: 'gyms',
  async up(db: SQLiteDatabase) {
    if (!(await hasTable(db, 'gyms'))) {
      for (const stmt of GYMS_DDL) await db.execAsync(stmt);
    }
    if ((await hasTable(db, 'workout_logs')) && !(await hasColumn(db, 'workout_logs', 'gym_uuid'))) {
      await db.execAsync('ALTER TABLE workout_logs ADD COLUMN gym_uuid TEXT');
    }
    if (await hasTable(db, 'workout_logs')) await db.execAsync(WORKOUT_LOGS_GYM_INDEX);
  },
};
