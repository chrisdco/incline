import { openDatabase } from '../client';

export interface HealthWriteRow {
  id: number;
  uuid: string | null;
  name: string;
  startedAt: number;
  endedAt: number;
  notes: string;
  deleted: boolean;
  updatedAt: number;
}

/**
 * Finished workouts changed since the Health Connect cursor (one query, oldest
 * change first). Deleted rows are included so their Health record goes too.
 */
export async function listWorkoutsForHealth(afterUpdatedAt: number, floorStartedAt: number, limit = 100): Promise<HealthWriteRow[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{
    id: number;
    uuid: string | null;
    name: string;
    started_at: number;
    ended_at: number;
    notes: string;
    deleted_at: number | null;
    updated_at: number;
  }>(
    `SELECT id, uuid, name, started_at, ended_at, notes, deleted_at, updated_at
       FROM workout_logs
      WHERE ended_at IS NOT NULL AND updated_at > ? AND started_at >= ?
      ORDER BY updated_at ASC
      LIMIT ?`,
    [afterUpdatedAt, floorStartedAt, limit],
  );
  return rows.map((r) => ({
    id: r.id,
    uuid: r.uuid,
    name: r.name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    notes: r.notes,
    deleted: r.deleted_at != null,
    updatedAt: r.updated_at,
  }));
}
