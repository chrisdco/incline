import { describe, expect, it } from 'vitest';

import { healthKey, syncWorkoutsToHealth, type WorkoutChange } from '../write-workouts';
import type { HealthWorkout } from '../types';

const row = (id: number, updatedAt: number, extra: Partial<WorkoutChange> = {}): WorkoutChange => ({
  id,
  uuid: `u${id}`,
  name: `W${id}`,
  startedAt: 1000 * id,
  endedAt: 1000 * id + 600_000,
  notes: '',
  deleted: false,
  updatedAt,
  ...extra,
});

function harness(rows: WorkoutChange[], { failWrite = false } = {}) {
  const written: HealthWorkout[] = [];
  const deleted: string[] = [];
  const state = { cursor: 0 };
  const deps = (start = 0, batch = 100) => ({
    port: {
      writeWorkouts: async (w: readonly HealthWorkout[]) => {
        if (failWrite) return false;
        written.push(...w);
        return true;
      },
      deleteWorkouts: async (k: readonly string[]) => {
        deleted.push(...k);
        return true;
      },
    },
    list: async (after: number, floor: number, limit: number) =>
      rows
        .filter((r) => r.updatedAt > after && r.startedAt >= floor)
        .sort((a, b) => a.updatedAt - b.updatedAt)
        .slice(0, limit),
    cursor: start,
    floor: 0,
    setCursor: (n: number) => {
      state.cursor = n;
    },
    batch,
  });
  return { written, deleted, state, deps };
}

describe('save workouts to Health Connect', () => {
  it('writes changes, deletes removed workouts, advances the cursor', async () => {
    const h = harness([row(1, 10), row(2, 20, { deleted: true }), row(3, 30, { notes: ' felt strong ' })]);
    const r = await syncWorkoutsToHealth(h.deps());
    expect(r).toEqual({ written: 2, deleted: 1, ok: true });
    expect(h.written.map((w) => w.key)).toEqual(['incline-workout-u1', 'incline-workout-u3']);
    expect(h.written[1]).toMatchObject({ notes: 'felt strong', version: 30 });
    expect(h.deleted).toEqual(['incline-workout-u2']);
    expect(h.state.cursor).toBe(30);
  });

  it('pages through big backlogs', async () => {
    const h = harness(Array.from({ length: 5 }, (_, i) => row(i + 1, (i + 1) * 10)));
    await syncWorkoutsToHealth(h.deps(0, 2));
    expect(h.written).toHaveLength(5);
    expect(h.state.cursor).toBe(50);
  });

  it('keeps the cursor when Health refuses, so the next pass retries', async () => {
    const h = harness([row(1, 10)], { failWrite: true });
    expect((await syncWorkoutsToHealth(h.deps())).ok).toBe(false);
    expect(h.state.cursor).toBe(0);
  });

  it('keys by uuid, local id only before sync', () => {
    expect(healthKey({ id: 7, uuid: null })).toBe('incline-workout-local-7');
  });
});
