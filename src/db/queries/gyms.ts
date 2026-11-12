import { openDatabase } from '../client';
import { newUuid } from '@/lib/uuid';
import { standardBar, standardPlates } from '@/lib/plate-calculator';
import { enqueueSync } from '@/sync/outbox';
import type { Gym, Unit } from '../types';
import { mutate, type Tx } from '../write';
import { WORKING_PR_PREDICATE } from './coaching/prs';

/**
 * Gym profiles (#243). Zero gyms = the app behaves as before: nothing reads
 * a gym unless one exists, and `gym_uuid` stays null on every workout.
 *
 * The current gym is an account-scoped kv key holding the gym's uuid (local
 * to this device, wiped by resetUserData). A deleted gym is never current.
 */
export const CURRENT_GYM_KEY = 'gym.current';

const GYM_TABLES = ['gyms', 'kv'] as const;

interface GymRow {
  id: number;
  uuid: string;
  name: string;
  unit: string;
  bar_weight: number;
  plates: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export function plateUnitOf(unit: Unit): 'kg' | 'lb' {
  return unit === 'imperial' ? 'lb' : 'kg';
}

/** Default inventory for a new gym: the full standard set and bar for its unit. */
export function defaultGymEquipment(unit: Unit): { barWeight: number; plates: number[] } {
  const u = plateUnitOf(unit);
  return { barWeight: standardBar(u), plates: standardPlates(u) };
}

/** Plate JSON → sizes heaviest first. Unreadable or empty → the standard set. */
export function parseGymPlates(raw: string | null | undefined, unit: Unit): number[] {
  try {
    const parsed: unknown = JSON.parse(raw ?? '');
    if (Array.isArray(parsed)) {
      const sizes = [...new Set(parsed.map(Number).filter((n) => Number.isFinite(n) && n > 0))];
      if (sizes.length > 0) return sizes.sort((a, b) => b - a);
    }
  } catch {
    // fall through to the standard set
  }
  return standardPlates(plateUnitOf(unit));
}

export function mapGymRow(r: GymRow): Gym {
  const unit: Unit = r.unit === 'imperial' ? 'imperial' : 'metric';
  return {
    id: r.id,
    uuid: r.uuid,
    name: r.name,
    unit,
    barWeight: r.bar_weight,
    plates: parseGymPlates(r.plates, unit),
    sortOrder: r.sort_order,
  };
}

function gymPayload(r: GymRow): Record<string, unknown> {
  return {
    name: r.name,
    unit: r.unit,
    bar_weight: r.bar_weight,
    plates: parseGymPlates(r.plates, r.unit === 'imperial' ? 'imperial' : 'metric'),
    sort_order: r.sort_order,
    created_at: r.created_at,
    updated_at: r.updated_at,
    deleted_at: r.deleted_at,
  };
}

async function enqueueGym(tx: Tx, uuid: string): Promise<void> {
  const row = await tx.getFirstAsync<GymRow>('SELECT * FROM gyms WHERE uuid = ?', uuid);
  if (!row) return;
  await enqueueSync('gyms', uuid, row.deleted_at ? 'delete' : 'upsert', gymPayload(row), tx);
}

/** The current gym's uuid, or null if unset or that gym is deleted. Joins the caller's tx. */
export async function readCurrentGymUuid(tx: Tx): Promise<string | null> {
  const row = await tx.getFirstAsync<{ uuid: string }>(
    `SELECT g.uuid FROM kv JOIN gyms g ON g.uuid = kv.value
     WHERE kv.key = ? AND g.deleted_at IS NULL`,
    CURRENT_GYM_KEY,
  );
  return row?.uuid ?? null;
}

async function writeCurrentGym(tx: Tx, uuid: string | null): Promise<void> {
  if (uuid == null) {
    await tx.runAsync('DELETE FROM kv WHERE key = ?', CURRENT_GYM_KEY);
    return;
  }
  await tx.runAsync(
    'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    CURRENT_GYM_KEY,
    uuid,
  );
}

export async function listGyms(): Promise<Gym[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<GymRow>(
    'SELECT * FROM gyms WHERE deleted_at IS NULL ORDER BY sort_order, created_at',
  );
  return rows.map(mapGymRow);
}

export interface GymsState {
  gyms: Gym[];
  /** Null when no gym is current (or none exist). */
  current: Gym | null;
}

/** Every live gym plus the current one: two reads, shared by every gym surface. */
export async function getGymsState(): Promise<GymsState> {
  const db = await openDatabase();
  const [gyms, currentUuid] = await Promise.all([listGyms(), readCurrentGymUuid(db)]);
  return { gyms, current: gyms.find((g) => g.uuid === currentUuid) ?? null };
}

export async function getGymByUuid(uuid: string): Promise<Gym | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<GymRow>('SELECT * FROM gyms WHERE uuid = ?', uuid);
  return row ? mapGymRow(row) : null;
}

/** The gym a workout is tagged with (deleted gyms still resolve: history keeps its iron). */
export async function getWorkoutGym(logId: number): Promise<Gym | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<GymRow>(
    'SELECT g.* FROM workout_logs w JOIN gyms g ON g.uuid = w.gym_uuid WHERE w.id = ?',
    logId,
  );
  return row ? mapGymRow(row) : null;
}

export interface GymInput {
  name: string;
  unit: Unit;
  barWeight: number;
  plates: number[];
}

function cleanInput(input: GymInput): { name: string; unit: Unit; bar: number; plates: string } {
  const name = input.name.trim() || 'Gym';
  const sizes = [...new Set(input.plates.filter((p) => Number.isFinite(p) && p > 0))].sort((a, b) => b - a);
  const plates = sizes.length > 0 ? sizes : standardPlates(plateUnitOf(input.unit));
  const bar = Number.isFinite(input.barWeight) && input.barWeight >= 0 ? input.barWeight : 0;
  return { name, unit: input.unit, bar, plates: JSON.stringify(plates) };
}

/**
 * Add a gym. It becomes current when asked to, or when no gym is current
 * yet (the first gym you add is where you train). Returns its uuid.
 */
export async function createGym(input: GymInput, opts: { makeCurrent?: boolean } = {}): Promise<string> {
  const { name, unit, bar, plates } = cleanInput(input);
  const uuid = newUuid();
  const now = Date.now();
  await mutate(GYM_TABLES, async (tx) => {
    const max = await tx.getFirstAsync<{ m: number | null }>(
      'SELECT MAX(sort_order) as m FROM gyms WHERE deleted_at IS NULL',
    );
    await tx.runAsync(
      `INSERT INTO gyms (uuid, name, unit, bar_weight, plates, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      uuid, name, unit, bar, plates, (max?.m ?? -1) + 1, now, now,
    );
    await enqueueGym(tx, uuid);
    if (opts.makeCurrent || (await readCurrentGymUuid(tx)) == null) await writeCurrentGym(tx, uuid);
  });
  return uuid;
}

/** Edit a gym. `opts.current` true makes it current; false un-sets it if it was. */
export async function updateGym(uuid: string, input: GymInput, opts: { current?: boolean } = {}): Promise<void> {
  const { name, unit, bar, plates } = cleanInput(input);
  await mutate(GYM_TABLES, async (tx) => {
    await tx.runAsync(
      'UPDATE gyms SET name = ?, unit = ?, bar_weight = ?, plates = ?, updated_at = ? WHERE uuid = ?',
      name, unit, bar, plates, Date.now(), uuid,
    );
    await enqueueGym(tx, uuid);
    if (opts.current === true) await writeCurrentGym(tx, uuid);
    else if (opts.current === false && (await readCurrentGymUuid(tx)) === uuid) await writeCurrentGym(tx, null);
  });
}

/**
 * Soft-delete (tombstone syncs). Workouts keep their tag so history still
 * knows where it happened. Returns whether it was current, for Undo.
 */
export async function deleteGym(uuid: string): Promise<{ wasCurrent: boolean }> {
  return mutate(GYM_TABLES, async (tx) => {
    const wasCurrent = (await readCurrentGymUuid(tx)) === uuid;
    const now = Date.now();
    await tx.runAsync('UPDATE gyms SET deleted_at = ?, updated_at = ? WHERE uuid = ?', now, now, uuid);
    await enqueueGym(tx, uuid);
    if (wasCurrent) await writeCurrentGym(tx, null);
    return { wasCurrent };
  });
}

/** Undo for deleteGym. */
export async function restoreGym(uuid: string, opts: { makeCurrent?: boolean } = {}): Promise<void> {
  await mutate(GYM_TABLES, async (tx) => {
    await tx.runAsync('UPDATE gyms SET deleted_at = NULL, updated_at = ? WHERE uuid = ?', Date.now(), uuid);
    await enqueueGym(tx, uuid);
    if (opts.makeCurrent) await writeCurrentGym(tx, uuid);
  });
}

export async function setCurrentGym(uuid: string | null): Promise<void> {
  await mutate(['kv'], async (tx) => writeCurrentGym(tx, uuid));
}

/** Join helper for writes that also move the current gym (session gym switch). */
export { writeCurrentGym as writeCurrentGymTx };

/**
 * Gyms (uuids) where this exercise has PR-eligible working sets: one grouped
 * query. Drives the exercise screen's opt-in "This gym / All gyms" toggle.
 */
export async function getExerciseGymUuids(exerciseId: number): Promise<string[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ gym_uuid: string }>(
    `SELECT DISTINCT w.gym_uuid FROM set_entries s JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE s.exercise_id = ? AND w.gym_uuid IS NOT NULL AND ${WORKING_PR_PREDICATE}`,
    exerciseId,
  );
  return rows.map((r) => r.gym_uuid);
}
