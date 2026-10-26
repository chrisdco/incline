import { openDatabase } from '@/db/client';
import type { Tx } from '@/db/write';
import type { ExerciseRef } from '@/sync/types';

/** Resolve a local exercise id into a stable sync reference. */
export async function exerciseRefForId(exerciseId: number, tx?: Tx): Promise<ExerciseRef> {
  const db = tx ?? (await openDatabase());
  const row = await db.getFirstAsync<ExerciseRefRow>(
    'SELECT is_custom, uuid, external_id FROM exercises WHERE id = ?',
    exerciseId,
  );
  return exerciseRefFromRow(exerciseId, row);
}

export interface ExerciseRefRow {
  is_custom: number;
  uuid: string | null;
  external_id: string | null;
}

/** Pure half of exerciseRefForId, for callers that already joined `exercises`. */
export function exerciseRefFromRow(exerciseId: number, row: ExerciseRefRow | null): ExerciseRef {
  if (!row) return { ref: 'unknown' };
  if (row.is_custom) {
    if (!row.uuid) return { ref: 'unknown' };
    return { ref: 'custom', exerciseUuid: row.uuid };
  }
  if (row.external_id) return { ref: 'catalog', externalId: row.external_id };
  // Seed exercises without external_id: use stable local name key is fragile;
  // prefer catalog_seed:{id} only as last resort for bundled seeds.
  return { ref: 'catalog', externalId: `seed:${exerciseId}` };
}

/** Resolve a sync exercise ref to a local integer id (creates nothing). */
export async function resolveExerciseRef(ref: ExerciseRef): Promise<number | null> {
  const db = await openDatabase();
  if (ref.ref === 'custom') {
    const row = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM exercises WHERE uuid = ? AND deleted_at IS NULL',
      ref.exerciseUuid,
    );
    return row?.id ?? null;
  }
  if (ref.ref === 'catalog') {
    if (ref.externalId.startsWith('seed:')) {
      const id = Number(ref.externalId.slice(5));
      if (!Number.isFinite(id)) return null;
      const row = await db.getFirstAsync<{ id: number }>(
        'SELECT id FROM exercises WHERE id = ? AND deleted_at IS NULL',
        id,
      );
      return row?.id ?? null;
    }
    const row = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM exercises WHERE external_id = ? AND deleted_at IS NULL',
      ref.externalId,
    );
    return row?.id ?? null;
  }
  return null;
}
