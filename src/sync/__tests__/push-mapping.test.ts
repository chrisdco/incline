/**
 * Push mapping (outbox row → sync_push op) and the round trip back through
 * the pull path: what one device pushes, another applies to the same local
 * shape. Also the local JWT pre-flight (#201).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from '@/db/__tests__/sqlite-adapter';

let currentDb: TestDbHandle | null = null;

vi.mock('@/db/client', () => ({
  openDatabase: async () => {
    if (!currentDb) throw new Error('test db not mounted');
    return currentDb;
  },
}));
vi.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `test-uuid-${++n}` };
});
vi.mock('@/lib/env', () => ({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' }));
vi.mock('expo-file-system', () => ({
  File: class {
    exists = false;
    constructor(public uri: string) {}
  },
}));
vi.mock('@/store/settings-store', () => ({ applyRemoteAccountPrefs: vi.fn() }));
vi.mock('../photo-blobs', () => ({
  drainPhotoBlobs: vi.fn(async () => {}),
  enqueuePhotoBlob: vi.fn(async () => {}),
  localPhotoPath: (logId: number, uuid: string) => `file:///photos/${logId}/${uuid}.jpg`,
}));

import { applyRemoteRow } from '../engine';
import { buildPushOp, cloudToExerciseRef, exerciseRefToCloud, isoToMs, msToIso } from '../mappers';
import { inspectSyncToken } from '../supabase-auth';
import type { ExerciseRef, SyncTable } from '../types';

function item(op: 'upsert' | 'delete', rowUuid: string, payload: Record<string, unknown>) {
  return { op, rowUuid, payload: JSON.stringify(payload) };
}

/** What PostgREST hands back: JSON round trip, timestamptz as +00:00. */
function asServerRow(row: Record<string, unknown>): Record<string, unknown> {
  const out = JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'string' && /^\d{4}-\d\d-\d\dT.*Z$/.test(v)) out[k] = v.replace('Z', '+00:00');
  }
  return out;
}

async function roundTrip(table: SyncTable, rowUuid: string, payload: Record<string, unknown>) {
  const { row } = buildPushOp(table, item('upsert', rowUuid, payload), 'user-1');
  return applyRemoteRow(table, asServerRow(row), 'user-1');
}

describe('buildPushOp', () => {
  it('maps id-table deletes to tombstone-only ops', () => {
    expect(
      buildPushOp('set_entries', item('delete', 'set-1', { updated_at: 2_000, deleted_at: 2_000 }), 'u'),
    ).toEqual({
      op: 'delete',
      row: {
        id: 'set-1',
        user_id: 'u',
        updated_at: msToIso(2_000),
        deleted_at: msToIso(2_000),
      },
    });
  });

  it('maps an active-program clear to a null upsert with a tombstone', () => {
    const op = buildPushOp(
      'user_active_program',
      item('delete', 'active', { updated_at: 5_000, deleted_at: 5_000 }),
      'u',
    );
    expect(op).toEqual({
      op: 'upsert',
      row: {
        user_id: 'u',
        custom_program_id: null,
        seed_program_id: null,
        started_at: null,
        updated_at: msToIso(5_000),
        deleted_at: msToIso(5_000),
      },
    });
  });

  it('keys profiles by user_id and coerces onboarding to boolean', () => {
    const op = buildPushOp(
      'profiles',
      item('upsert', 'local-profile-uuid', { name: 'Sam', onboarding_completed: 1, updated_at: 7 }),
      'u',
    );
    expect(op.op).toBe('upsert');
    expect(op.row).toMatchObject({ user_id: 'u', name: 'Sam', onboarding_completed: true });
    expect(op.row).not.toHaveProperty('id');
  });

  it('wraps account prefs in the payload column', () => {
    const op = buildPushOp(
      'user_preferences',
      item('upsert', 'account', { themeMode: 'dark', weeklyWorkoutGoal: 4, updated_at: 9 }),
      'u',
    );
    expect(op.row).toMatchObject({ user_id: 'u', payload: { themeMode: 'dark', weeklyWorkoutGoal: 4 } });
  });

  it('throws on an unreadable payload', () => {
    expect(() => buildPushOp('set_entries', { op: 'upsert', rowUuid: 'x', payload: '{' }, 'u')).toThrow();
  });
});

describe('ref + timestamp round trips', () => {
  it('exercise refs survive cloud mapping', () => {
    const refs: ExerciseRef[] = [
      { ref: 'catalog', externalId: 'barbell-bench-press' },
      { ref: 'custom', exerciseUuid: 'ex-uuid' },
    ];
    for (const ref of refs) expect(cloudToExerciseRef(exerciseRefToCloud(ref))).toEqual(ref);
  });

  it('ms timestamps survive ISO and the server +00:00 form', () => {
    const ms = Date.UTC(2026, 9, 26, 12, 0, 0, 123);
    expect(isoToMs(msToIso(ms))).toBe(ms);
    expect(isoToMs(msToIso(ms)!.replace('Z', '+00:00'))).toBe(ms);
  });
});

describe('push → pull round trip', () => {
  let close: () => void;

  beforeEach(() => {
    const t = createTestDatabase();
    currentDb = t.db;
    close = t.close;
  });

  afterEach(() => {
    close();
    currentDb = null;
  });

  it('workout log + custom exercise + set land with the same fields', async () => {
    const db = currentDb!;
    expect(
      await roundTrip('user_exercises', 'ex-1', {
        name: 'Landmine Press',
        primary_muscle: 'shoulders',
        movement_pattern: 'push',
        equipment: 'barbell',
        category: 'strength',
        is_compound: 1,
        tips: 'Brace',
        created_at: 100,
        updated_at: 200,
      }),
    ).toBe('ok');
    expect(
      await roundTrip('workout_logs', 'log-1', {
        name: 'Push Day',
        started_at: 1_000,
        ended_at: 4_600,
        duration_seconds: 3_600,
        total_volume: 4_200,
        unit: 'metric',
        notes: 'felt strong',
        created_at: 1_000,
        updated_at: 4_700,
      }),
    ).toBe('ok');
    expect(
      await roundTrip('set_entries', 'set-1', {
        workout_log_uuid: 'log-1',
        exercise_ref: { ref: 'custom', exerciseUuid: 'ex-1' },
        set_index: 2,
        weight: 62.5,
        reps: 8,
        completed: 1,
        rest_seconds: 120,
        superset_group: 1,
        set_type: 'drop',
        rpe: 9,
        created_at: 2_000,
        updated_at: 2_100,
      }),
    ).toBe('ok');

    const log = await db.getFirstAsync<Record<string, unknown>>(
      'SELECT * FROM workout_logs WHERE uuid = ?',
      'log-1',
    );
    expect(log).toMatchObject({
      name: 'Push Day',
      started_at: 1_000,
      ended_at: 4_600,
      duration_seconds: 3_600,
      total_volume: 4_200,
      notes: 'felt strong',
      updated_at: 4_700,
      deleted_at: null,
    });
    const set = await db.getFirstAsync<Record<string, unknown>>(
      `SELECT s.*, e.uuid AS ex_uuid FROM set_entries s JOIN exercises e ON e.id = s.exercise_id
       WHERE s.uuid = ?`,
      'set-1',
    );
    expect(set).toMatchObject({
      ex_uuid: 'ex-1',
      set_index: 2,
      weight: 62.5,
      reps: 8,
      completed: 1,
      rest_seconds: 120,
      superset_group: 1,
      set_type: 'drop',
      rpe: 9,
      updated_at: 2_100,
    });
  });

  it('a child whose parent is not local is blocked, not dropped', async () => {
    expect(
      await roundTrip('set_entries', 'orphan', {
        workout_log_uuid: 'missing-log',
        exercise_ref: { ref: 'catalog', externalId: 'x' },
        updated_at: 1,
      }),
    ).toBe('blocked');
  });

  it('bodyweight and measurements land with the same fields', async () => {
    const db = currentDb!;
    await roundTrip('bodyweight_entries', 'bw-1', { weight: 81.4, unit: 'kg', recorded_at: 5_000, created_at: 5_000, updated_at: 5_001 });
    await roundTrip('body_measurements', 'm-1', { metric: 'waist', value: 82, unit: 'cm', recorded_at: 6_000, created_at: 6_000, updated_at: 6_001 });
    expect(
      await db.getFirstAsync('SELECT weight, unit, recorded_at, updated_at FROM bodyweight_entries WHERE uuid = ?', 'bw-1'),
    ).toEqual({ weight: 81.4, unit: 'kg', recorded_at: 5_000, updated_at: 5_001 });
    expect(
      await db.getFirstAsync('SELECT metric, value, unit, recorded_at FROM body_measurements WHERE uuid = ?', 'm-1'),
    ).toEqual({ metric: 'waist', value: 82, unit: 'cm', recorded_at: 6_000 });
  });
});

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${b64({ alg: 'RS256' })}.${b64(claims)}.sig`;
}

describe('inspectSyncToken', () => {
  const now = 1_800_000_000_000;
  const exp = now / 1000 + 60;

  it('accepts the supabase JWT template (aud) and the native integration (role)', () => {
    expect(inspectSyncToken(jwt({ sub: 'u', aud: 'authenticated', exp }), 'u', now)).toEqual({ ok: true });
    expect(inspectSyncToken(jwt({ sub: 'u', aud: ['authenticated'], exp }), 'u', now)).toEqual({ ok: true });
    expect(inspectSyncToken(jwt({ sub: 'u', role: 'authenticated', exp }), 'u', now)).toEqual({ ok: true });
  });

  it('rejects a bare Clerk session token (wrong audience)', () => {
    const r = inspectSyncToken(jwt({ sub: 'u', azp: 'https://app', exp }), 'u', now);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/misconfigured/);
  });

  it('rejects expired, foreign and malformed tokens', () => {
    expect(inspectSyncToken(jwt({ sub: 'u', aud: 'authenticated', exp: now / 1000 - 1 }), 'u', now).ok).toBe(false);
    expect(inspectSyncToken(jwt({ sub: 'other', aud: 'authenticated', exp }), 'u', now).ok).toBe(false);
    expect(inspectSyncToken('not-a-jwt', 'u', now).ok).toBe(false);
  });
});
