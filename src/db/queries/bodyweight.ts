import { openDatabase } from '../client';
import { newUuid } from '@/lib/uuid';
import { enqueueSync } from '@/sync/outbox';
import { mutate } from '../write';
import { labelledToCanonical } from '@/lib/units';

/** Log bodyweight typed in `inputLabel` ('kg' | 'lb'); stored canonical kg. */
export async function addBodyweightEntry(value: number, inputLabel: string): Promise<void> {
  const weight = labelledToCanonical(value, inputLabel);
  const unit = 'kg';
  const now = Date.now();
  const uuid = newUuid();
  await mutate(['bodyweight_entries'], async (tx) => {
    await tx.runAsync(
      'INSERT INTO bodyweight_entries (weight, unit, recorded_at, uuid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
      weight, unit, now, uuid, now, now,
    );
    await enqueueSync('bodyweight_entries', uuid, 'upsert', {
      weight,
      unit,
      recorded_at: now,
      created_at: now,
      updated_at: now,
      deleted_at: null,
    }, tx);
  });
}

/** Entries in canonical kg (rows synced from an older build may still carry 'lb'). */
export async function getBodyweightEntries(limit = 90): Promise<{ id: number; weight: number; unit: string; recordedAt: number }[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ id: number; weight: number; unit: string; recorded_at: number }>(
    'SELECT id, weight, unit, recorded_at FROM bodyweight_entries WHERE deleted_at IS NULL ORDER BY recorded_at DESC LIMIT ?',
    limit,
  );
  return rows.map((r) => ({
    id: r.id,
    weight: labelledToCanonical(r.weight, r.unit),
    unit: 'kg',
    recordedAt: r.recorded_at,
  }));
}

export async function getLatestBodyweight(): Promise<number | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ weight: number; unit: string }>(
    'SELECT weight, unit FROM bodyweight_entries WHERE deleted_at IS NULL ORDER BY recorded_at DESC LIMIT 1',
  );
  return row ? labelledToCanonical(row.weight, row.unit) : null;
}

export async function deleteBodyweightEntry(id: number): Promise<void> {
  const now = Date.now();
  await mutate(['bodyweight_entries'], async (tx) => {
    const row = await tx.getFirstAsync<{ uuid: string | null }>(
      'SELECT uuid FROM bodyweight_entries WHERE id = ?',
      id,
    );
    await tx.runAsync(
      'UPDATE bodyweight_entries SET deleted_at = ?, updated_at = ? WHERE id = ?',
      now, now, id,
    );
    if (row?.uuid) {
      await enqueueSync('bodyweight_entries', row.uuid, 'delete', {
        updated_at: now,
        deleted_at: now,
      }, tx);
    }
  });
}
