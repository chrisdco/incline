import type { HealthPort, HealthWorkout } from './types';

/** What the sync needs from a workout row (src/db/queries/health-write.ts). */
export interface WorkoutChange {
  id: number;
  uuid: string | null;
  name: string;
  startedAt: number;
  endedAt: number;
  notes: string;
  deleted: boolean;
  updatedAt: number;
}

/** clientRecordId: stable per workout across devices (uuid), local id only for pre-sync rows. */
export function healthKey(w: Pick<WorkoutChange, 'id' | 'uuid'>): string {
  return w.uuid ? `incline-workout-${w.uuid}` : `incline-workout-local-${w.id}`;
}

export function toHealthWorkout(w: WorkoutChange): HealthWorkout {
  const notes = w.notes.trim();
  return { key: healthKey(w), title: w.name, start: w.startedAt, end: w.endedAt, version: w.updatedAt, ...(notes ? { notes } : {}) };
}

/**
 * One pass of "Save workouts to Health Connect": write changed workouts,
 * remove deleted ones, then advance the cursor. Writes are upserts by key, so
 * a pass that fails half-way is simply repeated next time; the cursor only
 * moves after both calls succeed.
 */
export async function syncWorkoutsToHealth(deps: {
  port: Pick<HealthPort, 'writeWorkouts' | 'deleteWorkouts'>;
  list: (afterUpdatedAt: number, floorStartedAt: number, limit: number) => Promise<WorkoutChange[]>;
  cursor: number;
  floor: number;
  setCursor: (updatedAt: number) => void;
  batch?: number;
}): Promise<{ written: number; deleted: number; ok: boolean }> {
  const batch = deps.batch ?? 100;
  let cursor = deps.cursor;
  let written = 0;
  let deleted = 0;
  // Bounded: at most 5 batches per pass; the rest go next pass.
  for (let i = 0; i < 5; i += 1) {
    const rows = await deps.list(cursor, deps.floor, batch);
    if (rows.length === 0) break;
    const live = rows.filter((r) => !r.deleted);
    const gone = rows.filter((r) => r.deleted);
    const okWrite = await deps.port.writeWorkouts(live.map(toHealthWorkout));
    const okDelete = await deps.port.deleteWorkouts(gone.map(healthKey));
    if (!okWrite || !okDelete) return { written, deleted, ok: false };
    written += live.length;
    deleted += gone.length;
    cursor = rows[rows.length - 1]!.updatedAt;
    deps.setCursor(cursor);
    if (rows.length < batch) break;
  }
  return { written, deleted, ok: true };
}
