/**
 * Gym profiles (#243): the REAL gym + session query modules against the REAL
 * schema. Pins current-gym bookkeeping, session tagging, the outbox enqueue
 * riding in the same write, and the reset wipe.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createTestDatabase, type TestDbHandle } from './sqlite-adapter';

vi.mock('expo-crypto', () => {
  let n = 0;
  return {
    randomUUID: () => `test-uuid-${++n}`,
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digestStringAsync: async () => 'deadbeef',
  };
});

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///tmp/',
  makeDirectoryAsync: async () => {},
  copyAsync: async () => {},
  deleteAsync: async () => {},
  getInfoAsync: async () => ({ exists: false }),
}));

vi.mock('@/sync/photo-blobs', () => ({
  checksumFile: async () => 'checksum',
  compressPhotoToJpeg: async () => 'file:///tmp/compressed.jpg',
  enqueuePhotoBlob: async () => {},
  localPhotoPath: () => 'file:///tmp/photo.jpg',
}));

// resetUserData's in-memory side effects are out of scope here.
vi.mock('@/lib/query-client', () => ({ queryClient: { clear: () => {} } }));
vi.mock('@/store/active-workout-store', () => ({
  useActiveWorkout: { getState: () => ({ clear: () => {} }) },
}));
vi.mock('@/ai/byok', () => ({ resetAiSettings: async () => {} }));
vi.mock('@/store/settings-store', () => ({ resetAccountPreferences: () => {} }));
vi.mock('@/sync/supabase-auth', () => ({ clearAuthedSupabase: () => {} }));

let currentDb: TestDbHandle | null = null;

vi.mock('../client', () => ({
  openDatabase: async () => {
    if (!currentDb) throw new Error('test db not mounted');
    return currentDb;
  },
  openWriterDatabase: async () => {
    if (!currentDb) throw new Error('test db not mounted');
    return currentDb;
  },
  isDatabaseReady: () => currentDb != null,
  __resetDatabaseCacheForTests: () => {},
}));

import {
  CURRENT_GYM_KEY,
  createGym,
  deleteGym,
  getExerciseGymUuids,
  getGymsState,
  getWorkoutGym,
  restoreGym,
  setCurrentGym,
  updateGym,
} from '../queries/gyms';
import { getWorkoutLog, setWorkoutGym, startWorkout } from '../queries/sessions';
import { resetUserData } from '../reset';

const faults: { failOn: RegExp | null } = { failOn: null };
let closeDb = () => {};

beforeEach(() => {
  faults.failOn = null;
  closeDb();
  const t = createTestDatabase(faults);
  currentDb = t.db;
  closeDb = t.close;
});

afterEach(() => {
  closeDb();
  currentDb = null;
});

function db(): TestDbHandle {
  if (!currentDb) throw new Error('test db not mounted');
  return currentDb;
}

const HOME = { name: 'Home', unit: 'metric' as const, barWeight: 15, plates: [20, 10, 5, 2.5] };
const BIG = { name: 'Big box', unit: 'metric' as const, barWeight: 20, plates: [25, 20, 15, 10, 5, 2.5, 1.25] };

async function outboxPayload(table: string, uuid: string): Promise<Record<string, unknown> | null> {
  const row = await db().getFirstAsync<{ payload: string }>(
    'SELECT payload FROM sync_outbox WHERE table_name = ? AND row_uuid = ?',
    table,
    uuid,
  );
  return row ? (JSON.parse(row.payload) as Record<string, unknown>) : null;
}

async function logUuid(logId: number): Promise<string> {
  const row = await db().getFirstAsync<{ uuid: string }>('SELECT uuid FROM workout_logs WHERE id = ?', logId);
  return row!.uuid;
}

describe('gyms: current gym', () => {
  it('with zero gyms there is no current gym and workouts are untagged', async () => {
    expect(await getGymsState()).toEqual({ gyms: [], current: null });
    const logId = await startWorkout(null, 'Push');
    expect((await getWorkoutLog(logId))?.gymUuid).toBeNull();
    expect(await getWorkoutGym(logId)).toBeNull();
  });

  it('the first gym becomes current; later ones only when asked', async () => {
    const home = await createGym(HOME);
    const big = await createGym(BIG);
    let state = await getGymsState();
    expect(state.gyms.map((g) => g.name)).toEqual(['Home', 'Big box']);
    expect(state.current?.uuid).toBe(home);

    await setCurrentGym(big);
    state = await getGymsState();
    expect(state.current?.uuid).toBe(big);
  });

  it('stores bar and plates in the gym unit and enqueues the row in the same write', async () => {
    const home = await createGym(HOME);
    const gym = (await getGymsState()).gyms[0];
    expect(gym).toMatchObject({ uuid: home, unit: 'metric', barWeight: 15, plates: [20, 10, 5, 2.5] });
    expect(await outboxPayload('gyms', home)).toMatchObject({
      name: 'Home',
      unit: 'metric',
      bar_weight: 15,
      plates: [20, 10, 5, 2.5],
      deleted_at: null,
    });

    await updateGym(home, { ...HOME, name: 'Garage', plates: [20, 10] }, { current: false });
    const state = await getGymsState();
    expect(state.gyms[0]).toMatchObject({ name: 'Garage', plates: [20, 10] });
    expect(state.current).toBeNull();
    expect(await outboxPayload('gyms', home)).toMatchObject({ name: 'Garage', plates: [20, 10] });
  });

  it('deleting the current gym clears current; restore can bring it back', async () => {
    const home = await createGym(HOME);
    expect(await deleteGym(home)).toEqual({ wasCurrent: true });
    expect(await getGymsState()).toEqual({ gyms: [], current: null });
    expect(await outboxPayload('gyms', home)).toMatchObject({ deleted_at: expect.any(Number) });

    await restoreGym(home, { makeCurrent: true });
    const state = await getGymsState();
    expect(state.current?.uuid).toBe(home);
  });
});

describe('gyms: session tagging', () => {
  it('new workouts are tagged with the current gym and the tag is pushed', async () => {
    const home = await createGym(HOME);
    const logId = await startWorkout(null, 'Push');
    expect((await getWorkoutLog(logId))?.gymUuid).toBe(home);
    expect((await getWorkoutGym(logId))?.name).toBe('Home');
    expect(await outboxPayload('workout_logs', await logUuid(logId))).toMatchObject({ gym_uuid: home });
  });

  it('switching the workout gym retags it and makes that gym current', async () => {
    const home = await createGym(HOME);
    const big = await createGym(BIG);
    const logId = await startWorkout(null, 'Push');

    await setWorkoutGym(logId, big);
    expect((await getWorkoutLog(logId))?.gymUuid).toBe(big);
    expect((await getGymsState()).current?.uuid).toBe(big);
    expect(await outboxPayload('workout_logs', await logUuid(logId))).toMatchObject({ gym_uuid: big });

    await setWorkoutGym(logId, null);
    expect((await getWorkoutLog(logId))?.gymUuid).toBeNull();
    expect((await getGymsState()).current).toBeNull();
    expect(home).not.toBe(big);
  });

  it('a deleted gym is not current, so the next workout is untagged', async () => {
    const home = await createGym(HOME);
    await deleteGym(home);
    const logId = await startWorkout(null, 'Pull');
    expect((await getWorkoutLog(logId))?.gymUuid).toBeNull();
  });

  it('lists the distinct gyms an exercise has working sets at', async () => {
    const home = await createGym(HOME);
    const big = await createGym(BIG);
    await db().runAsync(
      `INSERT INTO exercises (id, name, primary_muscle, movement_pattern, equipment, category, created_at, updated_at)
       VALUES (1, 'Bench', 'chest', 'horizontal_push', 'barbell', 'strength', 1, 1)`,
    );
    const insertLog = async (gym: string | null, uuid: string) => {
      const r = await db().runAsync(
        `INSERT INTO workout_logs (name, started_at, ended_at, unit, uuid, gym_uuid, created_at, updated_at)
         VALUES ('W', 1, 2, 'metric', ?, ?, 1, 1)`,
        uuid,
        gym,
      );
      await db().runAsync(
        `INSERT INTO set_entries (workout_log_id, exercise_id, set_index, weight, reps, completed, uuid, created_at, updated_at)
         VALUES (?, 1, 0, 100, 5, 1, ?, 1, 1)`,
        r.lastInsertRowId,
        `set-${uuid}`,
      );
    };
    await insertLog(home, 'l1');
    await insertLog(home, 'l2');
    expect(await getExerciseGymUuids(1)).toEqual([home]);
    await insertLog(big, 'l3');
    await insertLog(null, 'l4');
    expect([...(await getExerciseGymUuids(1))].sort()).toEqual([home, big].sort());
  });
});

describe('gyms: reset', () => {
  it('the reset wipe clears gyms and the current-gym key', async () => {
    await createGym(HOME);
    await resetUserData();
    expect(await getGymsState()).toEqual({ gyms: [], current: null });
    const kv = await db().getFirstAsync<{ c: number }>('SELECT COUNT(*) c FROM kv WHERE key = ?', CURRENT_GYM_KEY);
    expect(kv?.c).toBe(0);
    const rows = await db().getFirstAsync<{ c: number }>('SELECT COUNT(*) c FROM gyms');
    expect(rows?.c).toBe(0);
  });
});
