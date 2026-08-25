import type { SQLiteDatabase } from 'expo-sqlite';

import { hasColumn, hasTable } from './migrations/helpers';

const UUID_TABLES = [
  'exercises',
  'workout_templates',
  'template_exercises',
  'workout_logs',
  'set_entries',
  'user_profile',
  'bodyweight_entries',
  'body_measurements',
  'workout_photos',
] as const;

/**
 * Idempotent repair for sync columns/indexes.
 * Safe to run on every open — covers upgrades where SCHEMA_STATEMENTS used
 * CREATE IF NOT EXISTS (so old tables kept) or version was stamped ahead of columns.
 */
export async function ensureSyncSchema(db: SQLiteDatabase): Promise<void> {
  for (const table of UUID_TABLES) {
    if (!(await hasTable(db, table))) continue;
    if (!(await hasColumn(db, table, 'uuid'))) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN uuid TEXT`);
    }
    if (!(await hasColumn(db, table, 'deleted_at'))) {
      await db.execAsync(`ALTER TABLE ${table} ADD COLUMN deleted_at INTEGER`);
    }
  }

  if (!(await hasColumn(db, 'set_entries', 'updated_at'))) {
    await db.execAsync('ALTER TABLE set_entries ADD COLUMN updated_at INTEGER');
    await db.execAsync('UPDATE set_entries SET updated_at = created_at WHERE updated_at IS NULL');
  }
  if (!(await hasColumn(db, 'bodyweight_entries', 'updated_at'))) {
    await db.execAsync('ALTER TABLE bodyweight_entries ADD COLUMN updated_at INTEGER');
    await db.execAsync(
      'UPDATE bodyweight_entries SET updated_at = created_at WHERE updated_at IS NULL',
    );
  }
  if (
    (await hasTable(db, 'body_measurements')) &&
    !(await hasColumn(db, 'body_measurements', 'updated_at'))
  ) {
    await db.execAsync('ALTER TABLE body_measurements ADD COLUMN updated_at INTEGER');
    await db.execAsync(
      'UPDATE body_measurements SET updated_at = created_at WHERE updated_at IS NULL',
    );
  }
  if (!(await hasColumn(db, 'template_exercises', 'updated_at'))) {
    await db.execAsync('ALTER TABLE template_exercises ADD COLUMN updated_at INTEGER');
    await db.execAsync(
      `UPDATE template_exercises SET updated_at = (
         SELECT updated_at FROM workout_templates WHERE workout_templates.id = template_exercises.template_id
       ) WHERE updated_at IS NULL`,
    );
    await db.execAsync(
      `UPDATE template_exercises SET updated_at = ${Date.now()} WHERE updated_at IS NULL`,
    );
  }

  if (!(await hasColumn(db, 'workout_templates', 'is_custom'))) {
    await db.execAsync(
      'ALTER TABLE workout_templates ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0',
    );
  }

  if (!(await hasTable(db, 'sync_outbox'))) {
    await db.execAsync(`CREATE TABLE sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      row_uuid TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT,
      created_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    )`);
    await db.execAsync('CREATE INDEX IF NOT EXISTS idx_sync_outbox_order ON sync_outbox(id)');
  }

  // Indexes only after columns exist
  await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_exercises_uuid ON exercises(uuid)');
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_templates_uuid ON workout_templates(uuid)',
  );
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_template_exercises_uuid ON template_exercises(uuid)',
  );
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_logs_uuid ON workout_logs(uuid)',
  );
  await db.execAsync('CREATE UNIQUE INDEX IF NOT EXISTS idx_set_entries_uuid ON set_entries(uuid)');
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profile_uuid ON user_profile(uuid)',
  );
  await db.execAsync(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_bodyweight_uuid ON bodyweight_entries(uuid)',
  );
  if (await hasTable(db, 'body_measurements')) {
    await db.execAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_body_measurements_uuid ON body_measurements(uuid)',
    );
  }
  if (await hasTable(db, 'workout_photos')) {
    await db.execAsync(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_photos_uuid ON workout_photos(uuid)',
    );
  }
}
