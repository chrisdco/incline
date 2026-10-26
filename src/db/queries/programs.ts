import { openDatabase } from '../client';
import { newUuid } from '@/lib/uuid';
import { kvStorage } from '../kv';
import { mutate, type Tx } from '../write';
import { startOfDay, weekdayMon1 } from '../calc';
import { enqueueSync } from '@/sync/outbox';
import { templateRefForId } from '@/sync/template-ref';
import type { MuscleGroup, Program, ProgramWorkout } from '../types';
import {
  type ProgramRow,
  type ProgramWorkoutRow,
} from './helpers';

export { weekdayMon1 };

export const ACTIVE_PROGRAM_KEY = 'active_program';

export interface ActiveProgramState {
  programId: number;
  /** Local midnight ms when the user activated (week 1 day-alignment anchor). */
  startedAt: number;
}

export interface TodayProgramSlot {
  program: Program;
  week: number;
  day: number;
  workout: ProgramWorkout | null;
  /** Primary muscles covered by today's template (if any). */
  muscles: MuscleGroup[];
  /** True when this calendar day has no programmed session. */
  isRestDay: boolean;
}

const PROGRAM_TABLES = ['programs', 'program_workouts'] as const;

async function enqueueProgramUpsert(tx: Tx, programId: number): Promise<void> {
  const p = await tx.getFirstAsync<ProgramRow>(
    'SELECT * FROM programs WHERE id = ? AND is_custom = 1',
    programId,
  );
  if (!p?.uuid) return;
  await enqueueSync('user_programs', p.uuid, p.deleted_at ? 'delete' : 'upsert', {
    name: p.name,
    description: p.description,
    weeks: p.weeks,
    created_at: p.created_at,
    updated_at: p.updated_at,
    deleted_at: p.deleted_at,
  }, tx);
}

async function enqueueProgramWorkoutUpsert(tx: Tx, slotId: number): Promise<void> {
  const row = await tx.getFirstAsync<
    ProgramWorkoutRow & { program_uuid: string | null; is_custom: number }
  >(
    `SELECT pw.*, p.uuid as program_uuid, p.is_custom as is_custom
     FROM program_workouts pw
     JOIN programs p ON p.id = pw.program_id
     WHERE pw.id = ?`,
    slotId,
  );
  if (!row?.uuid || !row.is_custom || !row.program_uuid) return;
  const templateRef = await templateRefForId(row.template_id);
  if (templateRef.ref === 'unknown') return;
  await enqueueSync('user_program_workouts', row.uuid, row.deleted_at ? 'delete' : 'upsert', {
    program_uuid: row.program_uuid,
    template_ref: templateRef,
    week: row.week,
    day: row.day,
    sort_order: row.sort_order,
    updated_at: row.updated_at ?? Date.now(),
    deleted_at: row.deleted_at,
  }, tx);
}

async function enqueueActiveProgramSync(tx: Tx, state: ActiveProgramState | null): Promise<void> {
  const now = Date.now();
  if (!state) {
    await enqueueSync('user_active_program', 'active', 'delete', {
      updated_at: now,
      deleted_at: now,
    }, tx);
    return;
  }
  const p = await tx.getFirstAsync<ProgramRow>(
    'SELECT * FROM programs WHERE id = ? AND deleted_at IS NULL',
    state.programId,
  );
  if (!p) return;
  await enqueueSync('user_active_program', 'active', 'upsert', {
    custom_program_uuid: p.is_custom ? p.uuid : null,
    seed_program_id: p.is_custom ? null : p.id,
    started_at: state.startedAt,
    updated_at: now,
    deleted_at: null,
  }, tx);
}

function mapProgram(p: ProgramRow, workouts?: ProgramWorkout[]): Program {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    weeks: p.weeks,
    isCustom: !!p.is_custom,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    workouts,
  };
}

export async function listPrograms(): Promise<Program[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<ProgramRow>(
    'SELECT * FROM programs WHERE deleted_at IS NULL ORDER BY is_custom DESC, name',
  );
  const slots = await db.getAllAsync<ProgramWorkoutRow>(
    'SELECT * FROM program_workouts WHERE deleted_at IS NULL',
  );
  const byProgram = new Map<number, ProgramWorkout[]>();
  for (const r of slots) {
    const list = byProgram.get(r.program_id) ?? [];
    list.push({
      id: r.id,
      programId: r.program_id,
      templateId: r.template_id,
      week: r.week,
      day: r.day,
      sortOrder: r.sort_order,
    });
    byProgram.set(r.program_id, list);
  }
  return rows.map((p) => mapProgram(p, byProgram.get(p.id) ?? []));
}

export async function getProgram(id: number): Promise<Program | null> {
  const db = await openDatabase();
  const p = await db.getFirstAsync<ProgramRow>(
    'SELECT * FROM programs WHERE id = ? AND deleted_at IS NULL',
    id,
  );
  if (!p) return null;
  const pwRows = await db.getAllAsync<(ProgramWorkoutRow & { template_name: string | null; estimated_minutes: number | null })>(
    `SELECT pw.*, t.name AS template_name, t.estimated_minutes
     FROM program_workouts pw
     LEFT JOIN workout_templates t ON t.id = pw.template_id AND t.deleted_at IS NULL
     WHERE pw.program_id = ? AND pw.deleted_at IS NULL
     ORDER BY pw.week, pw.day, pw.sort_order`,
    id,
  );
  const workouts: ProgramWorkout[] = pwRows.map((r) => ({
    id: r.id,
    programId: r.program_id,
    templateId: r.template_id,
    week: r.week,
    day: r.day,
    sortOrder: r.sort_order,
    templateName: r.template_name ?? 'Workout',
    estimatedMinutes: r.estimated_minutes ?? 0,
  }));
  return mapProgram(p, workouts);
}

export async function createProgram(name: string, description: string, weeks = 4): Promise<number> {
  const now = Date.now();
  return mutate(PROGRAM_TABLES, async (tx) => {
    const res = await tx.runAsync(
      `INSERT INTO programs (name, description, weeks, is_custom, uuid, created_at, updated_at)
       VALUES (?, ?, ?, 1, ?, ?, ?)`,
      name.trim() || 'My Program',
      description.trim(),
      Math.max(1, Math.min(16, weeks)),
      newUuid(),
      now,
      now,
    );
    const id = res.lastInsertRowId as number;
    await enqueueProgramUpsert(tx, id);
    return id;
  });
}

export async function updateProgram(
  id: number,
  patch: Partial<Pick<Program, 'name' | 'description' | 'weeks'>>,
): Promise<void> {
  await mutate(PROGRAM_TABLES, async (tx) => {
    const existing = await tx.getFirstAsync<ProgramRow>(
      'SELECT * FROM programs WHERE id = ? AND is_custom = 1 AND deleted_at IS NULL',
      id,
    );
    if (!existing) return;

    const sets: string[] = [];
    const args: (string | number)[] = [];
    if (patch.name !== undefined) { sets.push('name = ?'); args.push(patch.name.trim() || existing.name); }
    if (patch.description !== undefined) { sets.push('description = ?'); args.push(patch.description.trim()); }
    if (patch.weeks !== undefined) {
      const weeks = Math.max(1, Math.min(16, patch.weeks));
      sets.push('weeks = ?');
      args.push(weeks);
    }
    if (sets.length === 0) return;
    sets.push('updated_at = ?');
    args.push(Date.now());
    args.push(id);
    await tx.runAsync(`UPDATE programs SET ${sets.join(', ')} WHERE id = ?`, ...args);

    if (patch.weeks !== undefined) {
      const weeks = Math.max(1, Math.min(16, patch.weeks));
      const extra = await tx.getAllAsync<{ id: number }>(
        'SELECT id FROM program_workouts WHERE program_id = ? AND week > ? AND deleted_at IS NULL',
        id,
        weeks,
      );
      const now = Date.now();
      await tx.runAsync(
        'UPDATE program_workouts SET deleted_at = ?, updated_at = ? WHERE program_id = ? AND week > ? AND deleted_at IS NULL',
        now,
        now,
        id,
        weeks,
      );
      for (const slot of extra) {
        await enqueueProgramWorkoutUpsert(tx, slot.id);
      }
    }
    await enqueueProgramUpsert(tx, id);
  });
}

export async function deleteProgram(id: number): Promise<void> {
  const now = Date.now();
  await mutate([...PROGRAM_TABLES, 'kv'], async (tx) => {
    const row = await tx.getFirstAsync<ProgramRow>(
      'SELECT * FROM programs WHERE id = ? AND is_custom = 1',
      id,
    );
    if (!row) return;
    const slots = await tx.getAllAsync<{ id: number }>(
      'SELECT id FROM program_workouts WHERE program_id = ? AND deleted_at IS NULL',
      id,
    );
    await tx.runAsync(
      'UPDATE program_workouts SET deleted_at = ?, updated_at = ? WHERE program_id = ? AND deleted_at IS NULL',
      now, now, id,
    );
    for (const slot of slots) {
      await enqueueProgramWorkoutUpsert(tx, slot.id);
    }
    await tx.runAsync(
      'UPDATE programs SET deleted_at = ?, updated_at = ? WHERE id = ?',
      now, now, id,
    );
    await enqueueProgramUpsert(tx, id);
    const active = parseActiveProgram(await readActiveProgram(tx));
    if (active?.programId === id) await clearActiveProgramIn(tx, true);
  });
}

/** Assign or replace the routine for a week/day slot (custom programs only). */
export async function setProgramDay(
  programId: number,
  week: number,
  day: number,
  templateId: number,
): Promise<void> {
  await mutate(PROGRAM_TABLES, async (tx) => {
    const program = await tx.getFirstAsync<ProgramRow>(
      'SELECT * FROM programs WHERE id = ? AND is_custom = 1 AND deleted_at IS NULL',
      programId,
    );
    if (!program) return;
    const now = Date.now();
    const existing = await tx.getFirstAsync<ProgramWorkoutRow>(
      'SELECT * FROM program_workouts WHERE program_id = ? AND week = ? AND day = ? AND deleted_at IS NULL',
      programId, week, day,
    );
    if (existing) {
      await tx.runAsync(
        'UPDATE program_workouts SET template_id = ?, updated_at = ? WHERE id = ?',
        templateId, now, existing.id,
      );
      await enqueueProgramWorkoutUpsert(tx, existing.id);
    } else {
      const res = await tx.runAsync(
        `INSERT INTO program_workouts (program_id, template_id, week, day, sort_order, uuid, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
        programId, templateId, week, day, newUuid(), now,
      );
      await enqueueProgramWorkoutUpsert(tx, res.lastInsertRowId as number);
    }
    await tx.runAsync('UPDATE programs SET updated_at = ? WHERE id = ?', now, programId);
    await enqueueProgramUpsert(tx, programId);
  });
}

export async function clearProgramDay(programId: number, week: number, day: number): Promise<void> {
  const now = Date.now();
  await mutate(PROGRAM_TABLES, async (tx) => {
    const slots = await tx.getAllAsync<{ id: number }>(
      `SELECT id FROM program_workouts
       WHERE program_id = ? AND week = ? AND day = ? AND deleted_at IS NULL
         AND program_id IN (SELECT id FROM programs WHERE is_custom = 1)`,
      programId, week, day,
    );
    await tx.runAsync(
      `UPDATE program_workouts SET deleted_at = ?, updated_at = ?
       WHERE program_id = ? AND week = ? AND day = ? AND deleted_at IS NULL
         AND program_id IN (SELECT id FROM programs WHERE is_custom = 1)`,
      now, now, programId, week, day,
    );
    for (const slot of slots) {
      await enqueueProgramWorkoutUpsert(tx, slot.id);
    }
    await tx.runAsync('UPDATE programs SET updated_at = ? WHERE id = ? AND is_custom = 1', now, programId);
    await enqueueProgramUpsert(tx, programId);
  });
}

/** Copy week 1 slots onto weeks 2..N (custom programs). */
export async function applyWeek1ToAllWeeks(programId: number): Promise<void> {
  const program = await getProgram(programId);
  if (!program?.isCustom) return;
  const week1 = (program.workouts ?? []).filter((w) => w.week === 1);
  const now = Date.now();
  await mutate(PROGRAM_TABLES, async (tx) => {
    const oldSlots = await tx.getAllAsync<{ id: number }>(
      'SELECT id FROM program_workouts WHERE program_id = ? AND week > 1 AND deleted_at IS NULL',
      programId,
    );
    await tx.runAsync(
      'UPDATE program_workouts SET deleted_at = ?, updated_at = ? WHERE program_id = ? AND week > 1 AND deleted_at IS NULL',
      now, now, programId,
    );
    for (const slot of oldSlots) {
      await enqueueProgramWorkoutUpsert(tx, slot.id);
    }
    for (let week = 2; week <= program.weeks; week++) {
      for (const slot of week1) {
        const res = await tx.runAsync(
          `INSERT INTO program_workouts (program_id, template_id, week, day, sort_order, uuid, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          programId, slot.templateId, week, slot.day, slot.sortOrder, newUuid(), now,
        );
        await enqueueProgramWorkoutUpsert(tx, res.lastInsertRowId as number);
      }
    }
    await tx.runAsync('UPDATE programs SET updated_at = ? WHERE id = ?', now, programId);
    await enqueueProgramUpsert(tx, programId);
  });
}

function parseActiveProgram(raw: string | null): ActiveProgramState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as ActiveProgramState;
    if (!parsed?.programId || !parsed?.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

async function readActiveProgram(tx: Tx): Promise<string | null> {
  const row = await tx.getFirstAsync<{ value: string }>('SELECT value FROM kv WHERE key = ?', ACTIVE_PROGRAM_KEY);
  return row?.value ?? null;
}

// The active program lives in kv; written on the mutate() tx (not kvStorage)
// so the kv change and its outbox row commit together.
async function clearActiveProgramIn(tx: Tx, sync: boolean): Promise<void> {
  await tx.runAsync('DELETE FROM kv WHERE key = ?', ACTIVE_PROGRAM_KEY);
  if (sync) await enqueueActiveProgramSync(tx, null);
}

export async function getActiveProgramState(): Promise<ActiveProgramState | null> {
  return parseActiveProgram(await kvStorage.getItem(ACTIVE_PROGRAM_KEY));
}

export async function setActiveProgram(programId: number): Promise<void> {
  const state: ActiveProgramState = {
    programId,
    startedAt: startOfDay(Date.now()),
  };
  await mutate(['kv'], async (tx) => {
    await tx.runAsync(
      'INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ACTIVE_PROGRAM_KEY,
      JSON.stringify({ ...state, updatedAt: Date.now() }),
    );
    await enqueueActiveProgramSync(tx, state);
  });
}

export async function clearActiveProgram(opts?: { sync?: boolean }): Promise<void> {
  await mutate(['kv'], (tx) => clearActiveProgramIn(tx, opts?.sync !== false));
}

/**
 * Resolve today's programmed slot from the active program.
 * Week cycles through program.weeks from the activation anchor; day is Mon=1..Sun=7.
 */
export async function getTodayProgramSlot(now = Date.now()): Promise<TodayProgramSlot | null> {
  const active = await getActiveProgramState();
  if (!active) return null;
  const program = await getProgram(active.programId);
  if (!program || program.weeks < 1) {
    await clearActiveProgram();
    return null;
  }

  const anchor = startOfDay(active.startedAt);
  const today = startOfDay(now);
  const elapsedDays = Math.max(0, Math.floor((today - anchor) / 86_400_000));
  const week = (Math.floor(elapsedDays / 7) % program.weeks) + 1;
  const day = weekdayMon1(today);
  const workout = (program.workouts ?? []).find((w) => w.week === week && w.day === day) ?? null;

  let muscles: MuscleGroup[] = [];
  if (workout?.templateId) {
    const db = await openDatabase();
    const muscleRows = await db.getAllAsync<{ primary_muscle: string }>(
      `SELECT DISTINCT e.primary_muscle
       FROM template_exercises te
       JOIN exercises e ON e.id = te.exercise_id
       WHERE te.template_id = ? AND te.deleted_at IS NULL AND e.deleted_at IS NULL`,
      workout.templateId,
    );
    muscles = muscleRows.map((r) => r.primary_muscle as MuscleGroup);
  }

  return {
    program,
    week,
    day,
    workout,
    muscles,
    isRestDay: !workout,
  };
}
