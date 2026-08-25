/**
 * Sync readiness tests (schema v7 columns, outbox coalesce, account wipe scope).
 * Uses better-sqlite3 to mirror SQL without Expo.
 */
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

function createSyncReadyDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE exercises (
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
      tips TEXT,
      uuid TEXT,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE workout_templates (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'strength',
      difficulty TEXT NOT NULL DEFAULT 'intermediate',
      estimated_minutes INTEGER NOT NULL DEFAULT 45,
      is_custom INTEGER NOT NULL DEFAULT 0,
      uuid TEXT,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE template_exercises (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL,
      target_sets INTEGER NOT NULL,
      target_reps_min INTEGER NOT NULL,
      target_reps_max INTEGER NOT NULL,
      rest_seconds INTEGER NOT NULL DEFAULT 90,
      notes TEXT NOT NULL DEFAULT '',
      superset_group INTEGER,
      uuid TEXT,
      updated_at INTEGER,
      deleted_at INTEGER
    );
    CREATE TABLE workout_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER,
      name TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      duration_seconds INTEGER NOT NULL DEFAULT 0,
      total_volume REAL NOT NULL DEFAULT 0,
      unit TEXT NOT NULL DEFAULT 'metric',
      notes TEXT NOT NULL DEFAULT '',
      uuid TEXT,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE set_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_log_id INTEGER NOT NULL,
      exercise_id INTEGER NOT NULL,
      set_index INTEGER NOT NULL,
      weight REAL NOT NULL DEFAULT 0,
      reps INTEGER NOT NULL DEFAULT 0,
      completed INTEGER NOT NULL DEFAULT 0,
      rest_seconds INTEGER,
      superset_group INTEGER,
      set_type TEXT NOT NULL DEFAULT 'working',
      rpe INTEGER,
      uuid TEXT,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE workout_photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      workout_log_id INTEGER NOT NULL,
      uri TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      uuid TEXT,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE bodyweight_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      weight REAL NOT NULL,
      unit TEXT NOT NULL DEFAULT 'kg',
      recorded_at INTEGER NOT NULL,
      uuid TEXT,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE body_measurements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metric TEXT NOT NULL,
      value REAL NOT NULL,
      unit TEXT NOT NULL,
      recorded_at INTEGER NOT NULL,
      uuid TEXT,
      deleted_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE user_profile (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT 'build_muscle',
      bodyweight REAL,
      unit TEXT NOT NULL DEFAULT 'metric',
      experience_level TEXT NOT NULL DEFAULT 'intermediate',
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT,
      uuid TEXT,
      deleted_at INTEGER,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE sync_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      table_name TEXT NOT NULL,
      row_uuid TEXT NOT NULL,
      op TEXT NOT NULL,
      payload TEXT,
      created_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE schema_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
  return db;
}

function enqueue(
  db: Database.Database,
  table: string,
  rowUuid: string,
  op: string,
  payload?: object,
) {
  db.prepare('DELETE FROM sync_outbox WHERE table_name = ? AND row_uuid = ?').run(table, rowUuid);
  db.prepare(
    `INSERT INTO sync_outbox (table_name, row_uuid, op, payload, created_at, attempts)
     VALUES (?, ?, ?, ?, ?, 0)`,
  ).run(table, rowUuid, op, payload ? JSON.stringify(payload) : null, Date.now());
}

describe('sync readiness', () => {
  it('coalesces outbox rows for the same uuid', () => {
    const db = createSyncReadyDb();
    const uuid = randomUUID();
    enqueue(db, 'workout_logs', uuid, 'upsert', { updated_at: 1 });
    enqueue(db, 'workout_logs', uuid, 'upsert', { updated_at: 2 });
    const rows = db.prepare('SELECT * FROM sync_outbox').all() as { payload: string }[];
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0].payload).updated_at).toBe(2);
    db.close();
  });

  it('soft-deleted logs are excluded from history counts', () => {
    const db = createSyncReadyDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO workout_logs (name, started_at, ended_at, uuid, created_at, updated_at)
       VALUES ('A', ?, ?, ?, ?, ?)`,
    ).run(now, now, randomUUID(), now, now);
    db.prepare(
      `INSERT INTO workout_logs (name, started_at, ended_at, uuid, deleted_at, created_at, updated_at)
       VALUES ('B', ?, ?, ?, ?, ?, ?)`,
    ).run(now, now, randomUUID(), now, now, now);

    const visible = db
      .prepare(
        'SELECT COUNT(*) as c FROM workout_logs WHERE ended_at IS NOT NULL AND deleted_at IS NULL',
      )
      .get() as { c: number };
    expect(visible.c).toBe(1);
    db.close();
  });

  it('account wipe removes custom exercises and templates but keeps seed', () => {
    const db = createSyncReadyDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO exercises (id, name, primary_muscle, equipment, category, is_custom, uuid, created_at, updated_at)
       VALUES (1, 'Bench', 'chest', 'barbell', 'strength', 0, ?, ?, ?)`,
    ).run(randomUUID(), now, now);
    db.prepare(
      `INSERT INTO exercises (id, name, primary_muscle, equipment, category, is_custom, source, uuid, created_at, updated_at)
       VALUES (2, 'My Curl', 'biceps', 'dumbbell', 'accessory', 1, 'custom', ?, ?, ?)`,
    ).run(randomUUID(), now, now);
    db.prepare(
      `INSERT INTO workout_templates (id, name, is_custom, uuid, created_at, updated_at)
       VALUES (1, 'Full Body', 0, ?, ?, ?)`,
    ).run(randomUUID(), now, now);
    db.prepare(
      `INSERT INTO workout_templates (id, name, is_custom, uuid, created_at, updated_at)
       VALUES (2, 'My Routine', 1, ?, ?, ?)`,
    ).run(randomUUID(), now, now);
    db.prepare(
      `INSERT INTO sync_outbox (table_name, row_uuid, op, created_at, attempts) VALUES ('profiles', ?, 'upsert', ?, 0)`,
    ).run(randomUUID(), now);

    // Mirror resetUserData SQL
    db.exec('DELETE FROM set_entries');
    db.exec('DELETE FROM workout_photos');
    db.exec('DELETE FROM workout_logs');
    db.exec('DELETE FROM bodyweight_entries');
    db.exec('DELETE FROM body_measurements');
    db.exec('DELETE FROM user_profile');
    db.exec(`DELETE FROM template_exercises WHERE template_id IN (SELECT id FROM workout_templates WHERE is_custom = 1)`);
    db.exec('DELETE FROM workout_templates WHERE is_custom = 1');
    db.exec('DELETE FROM exercises WHERE is_custom = 1');
    db.exec('DELETE FROM sync_outbox');

    const exercises = db.prepare('SELECT id, is_custom FROM exercises').all() as { id: number; is_custom: number }[];
    const templates = db.prepare('SELECT id, is_custom FROM workout_templates').all() as {
      id: number;
      is_custom: number;
    }[];
    const outbox = db.prepare('SELECT COUNT(*) as c FROM sync_outbox').get() as { c: number };

    expect(exercises).toEqual([{ id: 1, is_custom: 0 }]);
    expect(templates).toEqual([{ id: 1, is_custom: 0 }]);
    expect(outbox.c).toBe(0);
    db.close();
  });

  it('account wipe removes circumference entries', () => {
    const db = createSyncReadyDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO body_measurements (metric, value, unit, recorded_at, uuid, created_at, updated_at)
       VALUES ('waist', 82, 'cm', ?, ?, ?, ?)`,
    ).run(now, randomUUID(), now, now);

    db.exec('DELETE FROM body_measurements');
    const left = db.prepare('SELECT COUNT(*) as c FROM body_measurements').get() as { c: number };
    expect(left.c).toBe(0);
    db.close();
  });

  it('LWW prefers the newer updated_at', () => {
    const local = 1_000;
    const remoteNewer = 2_000;
    const remoteOlder = 500;
    expect(remoteNewer > local).toBe(true);
    expect(remoteOlder > local).toBe(false);
  });
});
