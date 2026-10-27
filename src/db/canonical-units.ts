/**
 * One-shot backfill to canonical storage units (TECH-DECISIONS §15).
 *
 * Before this, a set weight was stored as whatever number the user typed and
 * only the "kg"/"lb" label followed the global setting (#136). So:
 *
 * - If the persisted global unit is imperial, every stored set weight, log
 *   volume and profile bodyweight is a pound number → divide into kg.
 * - Bodyweight / circumference rows carry their own label ('lb' / 'in') →
 *   convert those rows individually, whatever the global unit (#144).
 *
 * Converted rows get a fresh `updated_at` and an outbox entry, so the cloud
 * converges by normal LWW. Runs once per device (schema_meta flag), inside
 * `openDatabase()` before anything can read or pull. A fresh install has no
 * rows yet, so it marks itself done without touching pulled (already-kg) data.
 *
 * Known limit: a device still on an older build keeps writing pound numbers;
 * every device must update. Pre-alpha, accepted.
 */

import { STORAGE_KEYS } from '@/constants/config';
import { CM_PER_IN, LB_PER_KG } from '@/lib/units';
import { enqueueSync } from '@/sync/outbox';
import { enqueueLogUpsert, enqueueSetUpserts } from './queries/sessions';
import type { Tx } from './write';

const FLAG = 'units_canonical';

/** Global unit as persisted by the settings store (zustand persist JSON in kv). */
async function persistedGlobalUnit(db: Tx): Promise<'metric' | 'imperial'> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM kv WHERE key = ?',
    STORAGE_KEYS.settings,
  );
  if (!row) return 'metric';
  try {
    const parsed = JSON.parse(row.value) as { state?: { unit?: unknown } };
    return parsed.state?.unit === 'imperial' ? 'imperial' : 'metric';
  } catch {
    return 'metric';
  }
}

export interface CanonicalizeResult {
  ran: boolean;
  sets: number;
  logs: number;
  bodyweight: number;
  measurements: number;
}

/** `db` is the boot connection; runs before anything else can write to it. */
export async function canonicalizeStoredUnits(db: Tx): Promise<CanonicalizeResult> {
  const none: CanonicalizeResult = { ran: false, sets: 0, logs: 0, bodyweight: 0, measurements: 0 };
  const done = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM schema_meta WHERE key = ?',
    FLAG,
  );
  if (done) return none;

  const unit = await persistedGlobalUnit(db);
  const now = Date.now();
  const result: CanonicalizeResult = { ran: true, sets: 0, logs: 0, bodyweight: 0, measurements: 0 };

  const tx = db;
  await db.execAsync('BEGIN IMMEDIATE');
  try {
    if (unit === 'imperial') {
      const setIds = (await tx.getAllAsync<{ id: number }>('SELECT id FROM set_entries')).map((r) => r.id);
      await tx.runAsync('UPDATE set_entries SET weight = weight / ?, updated_at = ?', LB_PER_KG, now);
      // One batched SELECT + outbox row per set (see enqueueSetUpserts).
      for (let i = 0; i < setIds.length; i += 500) {
        await enqueueSetUpserts(tx, setIds.slice(i, i + 500));
      }
      result.sets = setIds.length;

      const logIds = (await tx.getAllAsync<{ id: number }>('SELECT id FROM workout_logs')).map((r) => r.id);
      await tx.runAsync(
        'UPDATE workout_logs SET total_volume = total_volume / ?, updated_at = ?',
        LB_PER_KG,
        now,
      );
      // One-shot backfill: per-log enqueue is acceptable here (runs once).
      for (const id of logIds) await enqueueLogUpsert(tx, id);
      result.logs = logIds.length;

      const profile = await tx.getFirstAsync<{
        uuid: string | null;
        name: string;
        goal: string;
        bodyweight: number | null;
        unit: string;
        experience_level: string;
        onboarding_completed: number;
        avatar_url: string | null;
        deleted_at: number | null;
      }>('SELECT * FROM user_profile WHERE id = 1');
      if (profile && profile.bodyweight != null) {
        const kg = profile.bodyweight / LB_PER_KG;
        await tx.runAsync('UPDATE user_profile SET bodyweight = ?, updated_at = ? WHERE id = 1', kg, now);
        if (profile.uuid) {
          await enqueueSync('profiles', profile.uuid, 'upsert', {
            name: profile.name,
            goal: profile.goal,
            bodyweight: kg,
            unit: profile.unit,
            experience_level: profile.experience_level,
            onboarding_completed: profile.onboarding_completed,
            avatar_url: profile.avatar_url,
            updated_at: now,
            deleted_at: profile.deleted_at,
          }, tx);
        }
      }
    }

    const bw = await tx.getAllAsync<{
      id: number; uuid: string | null; weight: number; recorded_at: number; created_at: number; deleted_at: number | null;
    }>("SELECT id, uuid, weight, recorded_at, created_at, deleted_at FROM bodyweight_entries WHERE unit = 'lb'");
    for (const r of bw) {
      const kg = r.weight / LB_PER_KG;
      await tx.runAsync(
        "UPDATE bodyweight_entries SET weight = ?, unit = 'kg', updated_at = ? WHERE id = ?",
        kg, now, r.id,
      );
      if (r.uuid) {
        await enqueueSync('bodyweight_entries', r.uuid, r.deleted_at ? 'delete' : 'upsert', {
          weight: kg, unit: 'kg', recorded_at: r.recorded_at, created_at: r.created_at,
          updated_at: now, deleted_at: r.deleted_at,
        }, tx);
      }
    }
    result.bodyweight = bw.length;

    const ms = await tx.getAllAsync<{
      id: number; uuid: string | null; metric: string; value: number; recorded_at: number; created_at: number; deleted_at: number | null;
    }>("SELECT id, uuid, metric, value, recorded_at, created_at, deleted_at FROM body_measurements WHERE unit = 'in'");
    for (const r of ms) {
      const cm = r.value * CM_PER_IN;
      await tx.runAsync(
        "UPDATE body_measurements SET value = ?, unit = 'cm', updated_at = ? WHERE id = ?",
        cm, now, r.id,
      );
      if (r.uuid) {
        await enqueueSync('body_measurements', r.uuid, r.deleted_at ? 'delete' : 'upsert', {
          metric: r.metric, value: cm, unit: 'cm', recorded_at: r.recorded_at, created_at: r.created_at,
          updated_at: now, deleted_at: r.deleted_at,
        }, tx);
      }
    }
    result.measurements = ms.length;

    await tx.runAsync(
      'INSERT INTO schema_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      FLAG,
      `${now}:${unit}`,
    );
    await db.execAsync('COMMIT');
  } catch (err) {
    try {
      await db.execAsync('ROLLBACK');
    } catch {
      // Already rolled back; keep the original error.
    }
    throw err;
  }

  return result;
}
