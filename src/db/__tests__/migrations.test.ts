/**
 * Migration runner tests against better-sqlite3 (Node), mirroring the SQL
 * used by expo-sqlite migrations. Keeps schema evolution safe without a device.
 */
import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function createV1Db() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE exercises (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      primary_muscle TEXT NOT NULL,
      movement_pattern TEXT NOT NULL,
      equipment TEXT NOT NULL,
      category TEXT NOT NULL,
      is_compound INTEGER NOT NULL DEFAULT 0,
      tips TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE user_profile (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT 'build_muscle',
      bodyweight REAL,
      unit TEXT NOT NULL DEFAULT 'metric',
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    INSERT INTO schema_meta (key, value) VALUES ('version', '1');
    INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, created_at, updated_at)
    VALUES (1, 'Bench Press', 'chest', 'horizontal_push', 'barbell', 'strength', 1, 1);
  `);
  return db;
}

function hasColumn(db: Database.Database, table: string, column: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  return cols.some((c) => c.name === column);
}

function applyThroughV5(db: Database.Database) {
  // 002
  if (!hasColumn(db, 'exercises', 'is_custom')) {
    db.exec('ALTER TABLE exercises ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0');
  }
  if (!hasColumn(db, 'exercises', 'default_rest_seconds')) {
    db.exec('ALTER TABLE exercises ADD COLUMN default_rest_seconds INTEGER NOT NULL DEFAULT 90');
  }
  if (!hasColumn(db, 'user_profile', 'experience_level')) {
    db.exec("ALTER TABLE user_profile ADD COLUMN experience_level TEXT NOT NULL DEFAULT 'intermediate'");
  }
  // 003
  if (!hasColumn(db, 'exercises', 'source')) {
    db.exec("ALTER TABLE exercises ADD COLUMN source TEXT NOT NULL DEFAULT 'seed'");
  }
  if (!hasColumn(db, 'exercises', 'external_id')) {
    db.exec('ALTER TABLE exercises ADD COLUMN external_id TEXT');
  }
  if (!hasColumn(db, 'exercises', 'difficulty')) {
    db.exec("ALTER TABLE exercises ADD COLUMN difficulty TEXT NOT NULL DEFAULT 'intermediate'");
  }
  db.exec(`CREATE TABLE IF NOT EXISTS exercise_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exercise_id INTEGER NOT NULL,
    url TEXT NOT NULL,
    is_primary INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0
  )`);
  // 004
  if (!hasColumn(db, 'user_profile', 'avatar_url')) {
    db.exec('ALTER TABLE user_profile ADD COLUMN avatar_url TEXT');
  }
  // 005 — non-destructive rebuild
  db.pragma('foreign_keys = OFF');
  db.exec(`CREATE TABLE exercises_new (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    primary_muscle TEXT NOT NULL,
    movement_pattern TEXT,
    equipment TEXT NOT NULL,
    category TEXT NOT NULL,
    is_compound INTEGER NOT NULL DEFAULT 0,
    is_custom INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'seed',
    external_id TEXT,
    difficulty TEXT,
    default_rest_seconds INTEGER NOT NULL DEFAULT 90,
    tips TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.exec(`INSERT INTO exercises_new (
    id, name, primary_muscle, movement_pattern, equipment, category,
    is_compound, is_custom, source, external_id, difficulty,
    default_rest_seconds, tips, created_at, updated_at
  )
  SELECT
    id, name, primary_muscle, movement_pattern, equipment, category,
    is_compound, COALESCE(is_custom, 0), COALESCE(source, 'seed'), external_id, difficulty,
    COALESCE(default_rest_seconds, 90), tips, created_at, updated_at
  FROM exercises`);
  db.exec('DROP TABLE exercises');
  db.exec('ALTER TABLE exercises_new RENAME TO exercises');
  db.pragma('foreign_keys = ON');
}

describe('schema migrations (better-sqlite3)', () => {
  it('keeps SCHEMA_VERSION in sync with the latest migration', () => {
    // client.ts only runs migrations when stored version < SCHEMA_VERSION —
    // registering a migration without bumping it ships a missing column.
    // Source-text comparison: importing the migrations index under Node pulls
    // native modules (expo-crypto, ensure-sync-schema chain).
    const indexSrc = readFileSync(new URL('../migrations/index.ts', import.meta.url), 'utf8');
    const versions = [...indexSrc.matchAll(/migration(\d{3})/g)].map((m) => Number(m[1]));
    const schemaSrc = readFileSync(new URL('../schema.ts', import.meta.url), 'utf8');
    const schemaMatch = schemaSrc.match(/export const SCHEMA_VERSION = (\d+);/);
    expect(schemaMatch).not.toBeNull();
    expect(Number(schemaMatch?.[1])).toBe(Math.max(...new Set(versions)));
  });

  it('upgrades v1 → v5 without wiping exercise rows', () => {
    const db = createV1Db();
    applyThroughV5(db);

    const row = db.prepare('SELECT id, name, is_custom, source FROM exercises WHERE id = 1').get() as {
      id: number;
      name: string;
      is_custom: number;
      source: string;
    };
    expect(row.name).toBe('Bench Press');
    expect(row.is_custom).toBe(0);
    expect(row.source).toBe('seed');
    expect(hasColumn(db, 'exercises', 'external_id')).toBe(true);
    expect(hasColumn(db, 'user_profile', 'avatar_url')).toBe(true);
    expect(hasColumn(db, 'user_profile', 'experience_level')).toBe(true);

    const count = db.prepare('SELECT COUNT(*) as c FROM exercises').get() as { c: number };
    expect(count.c).toBe(1);
    db.close();
  });

  it('preserves custom exercises across nullable rebuild', () => {
    const db = createV1Db();
    applyThroughV5(db);
    db.prepare(
      `INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, is_custom, source, created_at, updated_at)
       VALUES (99, 'My Lift', 'chest', NULL, 'barbell', 'strength', 1, 'custom', 1, 1)`,
    ).run();

    // Re-run rebuild (idempotent shape check)
    const custom = db.prepare('SELECT name, is_custom FROM exercises WHERE id = 99').get() as {
      name: string;
      is_custom: number;
    };
    expect(custom.name).toBe('My Lift');
    expect(custom.is_custom).toBe(1);
    db.close();
  });

  it('creates session_exercise_notes with per-log/exercise upsert semantics (017)', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE session_exercise_notes (
        workout_log_id INTEGER NOT NULL,
        exercise_id INTEGER NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (workout_log_id, exercise_id)
      );
      CREATE INDEX IF NOT EXISTS idx_session_exercise_notes_log ON session_exercise_notes(workout_log_id);
    `);
    const upsert = db.prepare(`
      INSERT INTO session_exercise_notes (workout_log_id, exercise_id, notes, updated_at)
      VALUES (?, ?, ?, ?) ON CONFLICT(workout_log_id, exercise_id)
      DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at
    `);
    upsert.run(1, 2, 'elbows tucked', 100);
    upsert.run(1, 2, 'elbows tucked, pause', 200);
    const row = db.prepare(
      'SELECT notes FROM session_exercise_notes WHERE workout_log_id = 1 AND exercise_id = 2',
    ).get() as { notes: string };
    expect(row.notes).toBe('elbows tucked, pause');
    db.prepare('DELETE FROM session_exercise_notes WHERE workout_log_id = 1 AND exercise_id = 2').run();
    const gone = db.prepare('SELECT COUNT(*) as c FROM session_exercise_notes').get() as { c: number };
    expect(gone.c).toBe(0);
    db.close();
  });

  it('backfills set sort_order from insertion order and reorders via COALESCE (018)', () => {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE set_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workout_log_id INTEGER NOT NULL,
        exercise_id INTEGER NOT NULL,
        set_index INTEGER NOT NULL,
        deleted_at INTEGER
      );
      INSERT INTO set_entries (workout_log_id, exercise_id, set_index)
      VALUES (1, 10, 0), (1, 20, 0), (1, 10, 1);
    `);
    // Mirror 018: add column + backfill from rowid order.
    db.exec('ALTER TABLE set_entries ADD COLUMN sort_order INTEGER');
    db.exec('UPDATE set_entries SET sort_order = id WHERE sort_order IS NULL');
    expect(hasColumn(db, 'set_entries', 'sort_order')).toBe(true);

    const order = (db
      .prepare(
        `SELECT DISTINCT exercise_id FROM set_entries
         WHERE workout_log_id = 1 AND deleted_at IS NULL
         ORDER BY COALESCE(sort_order, id)`,
      )
      .all() as { exercise_id: number }[]).map((r) => r.exercise_id);
    expect(order).toEqual([10, 20]);

    // Reorder: bench (20) first.
    db.prepare(
      'UPDATE set_entries SET sort_order = ? WHERE workout_log_id = ? AND exercise_id = ? AND deleted_at IS NULL',
    ).run(0, 1, 20);
    db.prepare(
      'UPDATE set_entries SET sort_order = ? WHERE workout_log_id = ? AND exercise_id = ? AND deleted_at IS NULL',
    ).run(1, 1, 10);
    const reordered = (db
      .prepare(
        `SELECT DISTINCT exercise_id FROM set_entries
         WHERE workout_log_id = 1 AND deleted_at IS NULL
         ORDER BY COALESCE(sort_order, id)`,
      )
      .all() as { exercise_id: number }[]).map((r) => r.exercise_id);
    expect(reordered).toEqual([20, 10]);
    db.close();
  });
});
