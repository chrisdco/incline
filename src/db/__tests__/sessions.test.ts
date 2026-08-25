/**
 * Query-layer fixtures against better-sqlite3, mirroring the SQL used by
 * session volume recompute and workout list helpers.
 */
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

function createSessionDb() {
  const db = new Database(':memory:');
  db.exec(`
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
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

function recomputeVolume(db: Database.Database, logId: number) {
  const row = db
    .prepare(
      'SELECT COALESCE(SUM(weight * reps), 0) as v FROM set_entries WHERE workout_log_id = ? AND completed = 1',
    )
    .get(logId) as { v: number };
  db.prepare('UPDATE workout_logs SET total_volume = ?, updated_at = ? WHERE id = ?').run(
    row.v,
    Date.now(),
    logId,
  );
  return row.v;
}

describe('session query SQL', () => {
  it('recomputes volume from completed sets only', () => {
    const db = createSessionDb();
    const now = Date.now();
    const info = db
      .prepare(
        `INSERT INTO workout_logs (name, started_at, created_at, updated_at) VALUES ('Push', ?, ?, ?)`,
      )
      .run(now, now, now);
    const logId = Number(info.lastInsertRowid);

    db.prepare(
      `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, created_at)
       VALUES (?, 1, 0, 100, 5, 1, ?), (?, 1, 1, 100, 5, 0, ?)`,
    ).run(logId, now, logId, now);

    const volume = recomputeVolume(db, logId);
    expect(volume).toBe(500);

    const stored = db.prepare('SELECT total_volume FROM workout_logs WHERE id = ?').get(logId) as {
      total_volume: number;
    };
    expect(stored.total_volume).toBe(500);
    db.close();
  });

  it('finds active workout where ended_at IS NULL', () => {
    const db = createSessionDb();
    const now = Date.now();
    db.prepare(
      `INSERT INTO workout_logs (name, started_at, ended_at, created_at, updated_at) VALUES ('Done', ?, ?, ?, ?)`,
    ).run(now - 1000, now, now, now);
    db.prepare(
      `INSERT INTO workout_logs (name, started_at, ended_at, created_at, updated_at) VALUES ('Active', ?, NULL, ?, ?)`,
    ).run(now, now, now);

    const active = db
      .prepare('SELECT name FROM workout_logs WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1')
      .get() as { name: string };
    expect(active.name).toBe('Active');
    db.close();
  });

  it('filters completed logs by date, template, and exercise', () => {
    const db = createSessionDb();
    // Soft-delete columns used by production filters
    db.exec(`ALTER TABLE workout_logs ADD COLUMN deleted_at INTEGER`);
    db.exec(`ALTER TABLE set_entries ADD COLUMN deleted_at INTEGER`);

    const now = Date.now();
    const day = 86_400_000;
    const insertLog = db.prepare(
      `INSERT INTO workout_logs (template_id, name, started_at, ended_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const insertSet = db.prepare(
      `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, created_at)
       VALUES (?, ?, 0, 100, 5, 1, ?)`,
    );

    const recentPush = Number(insertLog.run(1, 'Push', now - day, now - day, now, now).lastInsertRowid);
    const oldPull = Number(insertLog.run(2, 'Pull', now - 40 * day, now - 40 * day, now, now).lastInsertRowid);
    insertSet.run(recentPush, 10, now);
    insertSet.run(oldPull, 20, now);

    const byDate = db
      .prepare(
        `SELECT w.name FROM workout_logs w
         WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND w.started_at >= ?
         ORDER BY w.started_at DESC`,
      )
      .all(now - 30 * day) as { name: string }[];
    expect(byDate.map((r) => r.name)).toEqual(['Push']);

    const byTemplate = db
      .prepare(
        `SELECT w.name FROM workout_logs w
         WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND w.template_id = ?`,
      )
      .all(2) as { name: string }[];
    expect(byTemplate.map((r) => r.name)).toEqual(['Pull']);

    const byExercise = db
      .prepare(
        `SELECT w.name FROM workout_logs w
         WHERE w.ended_at IS NOT NULL AND w.deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM set_entries s
             WHERE s.workout_log_id = w.id AND s.exercise_id = ? AND s.completed = 1 AND s.deleted_at IS NULL
           )`,
      )
      .all(10) as { name: string }[];
    expect(byExercise.map((r) => r.name)).toEqual(['Push']);
    db.close();
  });

  it('matches last finished template session and ignores warm-ups in ghost volume', () => {
    const db = createSessionDb();
    db.exec(`ALTER TABLE workout_logs ADD COLUMN deleted_at INTEGER`);
    db.exec(`ALTER TABLE set_entries ADD COLUMN deleted_at INTEGER`);
    db.exec(`ALTER TABLE set_entries ADD COLUMN set_type TEXT NOT NULL DEFAULT 'working'`);
    const now = Date.now();
    const insertLog = db.prepare(
      `INSERT INTO workout_logs (template_id, name, started_at, ended_at, duration_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, 3600, ?, ?)`,
    );
    const older = Number(insertLog.run(1, 'Push', now - 2000, now - 1500, now, now).lastInsertRowid);
    const last = Number(insertLog.run(1, 'Push', now - 1000, now - 500, now, now).lastInsertRowid);
    Number(insertLog.run(1, 'Push', now, null, now, now).lastInsertRowid);

    const insertSet = db.prepare(
      `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, set_type, created_at)
       VALUES (?, 1, 0, ?, ?, 1, ?, ?)`,
    );
    insertSet.run(older, 80, 5, 'working', now);
    insertSet.run(last, 40, 8, 'warmup', now);
    insertSet.run(last, 100, 5, 'working', now);

    const prev = db
      .prepare(
        `SELECT id FROM workout_logs
         WHERE template_id = 1 AND id != ? AND ended_at IS NOT NULL AND deleted_at IS NULL
           AND started_at < ?
         ORDER BY started_at DESC LIMIT 1`,
      )
      .get(0, now) as { id: number };
    expect(prev.id).toBe(last);

    const stats = db
      .prepare(
        `SELECT COALESCE(SUM(s.weight * s.reps), 0) as v, COUNT(*) as c
         FROM set_entries s
         WHERE s.workout_log_id = ?
           AND (s.set_type IS NULL OR s.set_type = 'working')
           AND s.weight > 0 AND s.reps > 0 AND s.completed = 1 AND s.deleted_at IS NULL`,
      )
      .get(last) as { v: number; c: number };
    expect(stats.v).toBe(500);
    expect(stats.c).toBe(1);
    db.close();
  });
});
