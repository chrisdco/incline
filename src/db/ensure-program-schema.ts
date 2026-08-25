import type { SQLiteDatabase } from 'expo-sqlite';

import { hasColumn } from './migrations/helpers';

/**
 * Idempotent repair for program-builder columns/indexes.
 * SCHEMA_STATEMENTS must not create uuid indexes — CREATE TABLE IF NOT EXISTS
 * leaves upgraded DBs without uuid, and index creation would fail before migrations run.
 */
export async function ensureProgramBuilderSchema(db: SQLiteDatabase): Promise<void> {
  if (!(await hasColumn(db, 'programs', 'is_custom'))) {
    await db.execAsync(
      'ALTER TABLE programs ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0',
    );
  }
  if (!(await hasColumn(db, 'programs', 'uuid'))) {
    await db.execAsync('ALTER TABLE programs ADD COLUMN uuid TEXT');
  }
  if (!(await hasColumn(db, 'programs', 'deleted_at'))) {
    await db.execAsync('ALTER TABLE programs ADD COLUMN deleted_at INTEGER');
  }
  if (!(await hasColumn(db, 'program_workouts', 'uuid'))) {
    await db.execAsync('ALTER TABLE program_workouts ADD COLUMN uuid TEXT');
  }
  if (!(await hasColumn(db, 'program_workouts', 'deleted_at'))) {
    await db.execAsync('ALTER TABLE program_workouts ADD COLUMN deleted_at INTEGER');
  }
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

  await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_programs_uuid ON programs(uuid)');
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_program_workouts_uuid ON program_workouts(uuid)',
  );
}
