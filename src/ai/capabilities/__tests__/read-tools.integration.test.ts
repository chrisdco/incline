/**
 * Device read tools on a real SQLite schema: correct shapes, batched reads,
 * and parity with the shared shapers incline-mcp uses (same NormSet in →
 * same output), so chat and external agents answer alike.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from '@/db/__tests__/sqlite-adapter';

vi.mock('@/db/client', () => ({ openDatabase: async () => currentDb }));

import { shapePersonalRecords, type NormSet } from '@/contracts/mcp/shape';
import { TOOLS } from '@/contracts/mcp/tools';

import { deviceReadTools } from '../read-tools';

let currentDb: TestDbHandle | null = null;
const DAY = 86_400_000;
const NOW = Date.now();

async function seed(db: TestDbHandle) {
  await db.runAsync(`INSERT INTO user_profile (id, name, goal, unit, experience_level, updated_at) VALUES (1, 'Sam', 'strength', 'metric', 'intermediate', 0)`);
  const ex = (id: number, name: string, muscle: string, equipment: string, custom = 0) =>
    db.runAsync(
      `INSERT INTO exercises (id, name, primary_muscle, equipment, category, is_custom, created_at, updated_at) VALUES (?, ?, ?, ?, 'strength', ?, 0, 0)`,
      id,
      name,
      muscle,
      equipment,
      custom,
    );
  await ex(1, 'Bench Press', 'chest', 'barbell');
  await ex(2, 'Back Squat', 'quads', 'barbell');
  await ex(3, 'Cable Fly', 'chest', 'cable', 1);
  await db.runAsync(`INSERT INTO exercise_secondary_muscles (exercise_id, muscle) VALUES (1, 'triceps'), (1, 'shoulders')`);
  await db.runAsync(`INSERT INTO exercise_aliases (exercise_id, alias) VALUES (1, 'flat bench')`);
  await db.runAsync(`INSERT INTO workout_templates (id, name, description, estimated_minutes, is_custom, created_at, updated_at) VALUES (10, 'Push A', '', 50, 1, 0, 0)`);
  await db.runAsync(
    `INSERT INTO template_exercises (template_id, exercise_id, sort_order, target_sets, target_reps_min, target_reps_max, rest_seconds) VALUES (10, 1, 0, 3, 6, 8, 120), (10, 3, 1, 3, 12, 12, 60)`,
  );
  const log = async (id: number, daysAgo: number) =>
    db.runAsync(
      `INSERT INTO workout_logs (id, name, started_at, duration_seconds, total_volume, created_at, updated_at) VALUES (?, 'Push', ?, 3600, 2000, 0, 0)`,
      id,
      NOW - daysAgo * DAY,
    );
  await log(100, 10);
  await log(101, 2);
  const set = (logId: number, exId: number, idx: number, w: number, r: number, done = 1) =>
    db.runAsync(
      `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      logId,
      exId,
      idx,
      w,
      r,
      done,
      NOW,
    );
  await set(100, 1, 0, 80, 8);
  await set(100, 1, 1, 85, 5);
  await set(101, 1, 0, 90, 3);
  await set(101, 2, 0, 120, 5);
  await set(101, 2, 1, 200, 1, 0); // not completed: ignored
}

function tool(name: string) {
  const t = deviceReadTools().find((x) => x.spec.name === name);
  if (!t) throw new Error(name);
  return t;
}

describe('device read tools', () => {
  beforeEach(async () => {
    currentDb = createTestDatabase().db;
    await seed(currentDb);
  });

  it('covers every MCP read tool', () => {
    const read = TOOLS.filter((t) => t.annotations.readOnlyHint).map((t) => t.name);
    expect(deviceReadTools().map((t) => t.spec.name)).toEqual(read);
  });

  it('personal records match the shared shaper (MCP parity)', async () => {
    const out = (await tool('get_personal_records').run({}, {})) as { records: { exercise: string; heaviest_set: string }[] };
    const norm = (logId: string, daysAgo: number, key: string, name: string, w: number, r: number, primary: string, sec: string[]): NormSet => ({
      logId,
      startedAt: new Date(NOW - daysAgo * DAY).toISOString(),
      exerciseKey: key,
      exercise: name,
      weightKg: w,
      reps: r,
      primaryMuscle: primary,
      secondaryMuscles: sec,
    });
    const expected = shapePersonalRecords(
      [
        norm('100', 10, '1', 'Bench Press', 80, 8, 'chest', ['triceps', 'shoulders']),
        norm('100', 10, '1', 'Bench Press', 85, 5, 'chest', ['triceps', 'shoulders']),
        norm('101', 2, '1', 'Bench Press', 90, 3, 'chest', ['triceps', 'shoulders']),
        norm('101', 2, '2', 'Back Squat', 120, 5, 'quads', []),
      ],
      'metric',
      20,
    );
    expect(out).toEqual(JSON.parse(JSON.stringify(expected)));
    expect(out.records.find((r) => r.exercise === 'Back Squat')!.heaviest_set).toBe('120 x 5');
  });

  it('exercise history resolves aliases and groups by session', async () => {
    const out = (await tool('get_exercise_history').run({ exercise: 'flat bench' }, {})) as { exercise: string; sessions: { sets: number }[] };
    expect(out.exercise).toBe('Bench Press');
    expect(out.sessions.map((s) => s.sets)).toEqual([1, 2]);
    await expect(tool('get_exercise_history').run({ exercise: 'deadlift' }, {})).rejects.toThrow(/No logged sets match/);
  });

  it('workouts, routines, profile, summary and search have the MCP shapes', async () => {
    const list = (await tool('list_workouts').run({ limit: 5 }, {})) as { workouts: { id: string; completed_sets: number }[] };
    expect(list.workouts.map((w) => [w.id, w.completed_sets])).toEqual([
      ['101', 2],
      ['100', 2],
    ]);
    const w = (await tool('get_workout').run({ workout_id: '101' }, {})) as { exercises: { exercise: string; sets: unknown[] }[] };
    expect(w.exercises.map((e) => [e.exercise, e.sets.length])).toEqual([
      ['Bench Press', 1],
      ['Back Squat', 2],
    ]);
    const routines = (await tool('list_routines').run({}, {})) as { routines: { id: string; exercises: number }[] };
    expect(routines.routines).toEqual([{ id: '10', name: 'Push A', exercises: 2, estimated_minutes: 50 }]);
    const r = (await tool('get_routine').run({ routine_id: '10' }, {})) as { exercises: { exercise: string; reps: string }[] };
    expect(r.exercises.map((e) => e.reps)).toEqual(['6-8', '12']);
    expect(await tool('get_profile').run({}, {})).toMatchObject({ name: 'Sam', unit: 'kg', goal: 'strength' });
    const sum = (await tool('get_training_summary').run({ weeks: 2 }, {})) as { sessions_per_week: number[]; sets_per_muscle_per_week: Record<string, unknown> };
    expect(sum.sessions_per_week).toEqual([1, 1]);
    expect(Object.keys(sum.sets_per_muscle_per_week)).toContain('chest');
    const search = (await tool('search_exercises').run({ query: 'fly' }, {})) as { exercises: { name: string; source: string }[] };
    expect(search.exercises[0]).toMatchObject({ name: 'Cable Fly', source: 'custom' });
  });

  it('bad arguments are readable errors, not crashes', async () => {
    await expect(tool('get_routine').run({}, {})).rejects.toThrow('routine_id is required');
    await expect(tool('get_workout').run({ workout_id: '999' }, {})).rejects.toThrow('workout not found');
  });
});
