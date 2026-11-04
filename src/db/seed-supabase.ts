import type { SQLiteDatabase } from 'expo-sqlite';
import { buildSearchText } from '@/lib/exercise-search';
import { supabase, supabaseReady, type SupabaseExercise } from '@/lib/supabase';
import type { Tx } from './write';

/**
 * Fetch all exercises from Supabase and seed them into local SQLite.
 * Diffs against local rows by external_id and writes only what changed, so a
 * normal launch writes nothing and repeated runs are safe.
 * Cleans up old exercisedb exercises that no longer exist in Supabase.
 * This bundles the full library for offline use.
 */
export async function seedFromSupabase(db: SQLiteDatabase): Promise<number> {
  if (!supabaseReady || !supabase) return 0;

  const MUSCLE_MAP: Record<string, string> = {
    pectorals: 'chest', lats: 'back', back: 'back',
    full_body: 'full_body', traps: 'traps',
  };
  const EQUIP_MAP: Record<string, string> = {
    'body weight': 'bodyweight', assisted: 'bodyweight',
    weighted: 'bodyweight', 'smith machine': 'machine',
    'leverage machine': 'machine', 'sled machine': 'other',
    'resistance band': 'band', roller: 'other',
  };
  const mapMuscle = (m: string) => MUSCLE_MAP[m] ?? m;
  const mapEquip = (e: string) => EQUIP_MAP[e] ?? e;

  // Fetch all exercises (paginated)
  const all: SupabaseExercise[] = [];
  let offset = 0;
  const PAGE = 200;
  while (true) {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('name')
      .range(offset, offset + PAGE - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    offset += data.length;
  }

  if (all.length === 0) return 0;

  // One read for everything the diff needs (never a query per row). The
  // has_* flags drive the backfills below.
  const local = await db.getAllAsync<LocalCatalogRow>(
    `SELECT e.id, e.external_id, e.source, e.name, e.primary_muscle, e.equipment, e.category,
            e.is_compound, e.difficulty,
            EXISTS (SELECT 1 FROM exercise_instructions i WHERE i.exercise_id = e.id) AS has_instructions,
            EXISTS (SELECT 1 FROM exercise_secondary_muscles m WHERE m.exercise_id = e.id) AS has_secondary,
            EXISTS (SELECT 1 FROM exercise_images g WHERE g.exercise_id = e.id) AS has_image
       FROM exercises e
      WHERE e.external_id IS NOT NULL`,
  );
  const byExternalId = new Map(local.map((row) => [row.external_id, row]));
  const supabaseIds = new Set(all.map((e) => e.external_id).filter(Boolean));

  // Writes go through mutate() in short chunks: the same queue and writer
  // connection as the app's own writes, so starting a workout mid-seed waits
  // at most one chunk instead of failing with "database is locked" (the seed
  // used to write on the read connection, outside the queue).
  const writes: ((tx: Tx) => Promise<void>)[] = [];
  let inserted = 0;
  const now = Date.now();

  // Old exercisedb exercises that no longer exist in Supabase.
  for (const old of local) {
    if (old.source === 'exercisedb' && !supabaseIds.has(old.external_id)) {
      writes.push(async (tx) => {
        await tx.runAsync('DELETE FROM exercise_images WHERE exercise_id = ?', old.id);
        await tx.runAsync('DELETE FROM exercise_instructions WHERE exercise_id = ?', old.id);
        await tx.runAsync('DELETE FROM exercise_secondary_muscles WHERE exercise_id = ?', old.id);
        await tx.runAsync('DELETE FROM exercise_aliases WHERE exercise_id = ?', old.id);
        await tx.runAsync('DELETE FROM exercises WHERE id = ?', old.id);
      });
    }
  }

  for (const ex of all) {
    const primary = mapMuscle(ex.target_muscle);
    const equip = mapEquip(ex.equipment);
    const difficulty = ex.difficulty || 'intermediate';
    const compound = ex.is_compound ? 1 : 0;
    const secondary = (ex.secondary_muscles ?? []).map(mapMuscle).filter(Boolean);
    const instructions = ex.instructions ?? [];
    const existing = byExternalId.get(ex.external_id);

    if (existing) {
      const changed =
        existing.name !== ex.name ||
        existing.primary_muscle !== primary ||
        existing.equipment !== equip ||
        existing.category !== ex.category ||
        existing.is_compound !== compound ||
        existing.difficulty !== difficulty;
      const needsInstructions = !existing.has_instructions && instructions.length > 0;
      const needsSecondary = !existing.has_secondary && secondary.length > 0;
      const needsImage = !existing.has_image && !!ex.gif_url;
      if (!changed && !needsInstructions && !needsSecondary && !needsImage) continue;

      const localId = existing.id;
      writes.push(async (tx) => {
        if (changed) {
          // Update exercise fields from Supabase (data changed upstream).
          await tx.runAsync(
            `UPDATE exercises SET name = ?, primary_muscle = ?, equipment = ?, category = ?,
             is_compound = ?, difficulty = ?, updated_at = ? WHERE id = ?`,
            ex.name, primary, equip, ex.category, compound, difficulty, now, localId,
          );
        }
        if (needsInstructions) await insertInstructions(tx, localId, instructions);
        if (needsSecondary) await insertSecondary(tx, localId, secondary);
        if (needsImage) await insertImage(tx, localId, ex.gif_url);
      });
      continue;
    }

    const defaultRest = ex.is_compound ? 120 : 90;
    writes.push(async (tx) => {
      const res = await tx.runAsync(
        `INSERT INTO exercises (name, primary_muscle, movement_pattern, equipment, category, is_compound, tips, source, external_id, difficulty, default_rest_seconds, is_custom, search_text, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, '', 'exercisedb', ?, ?, ?, 0, ?, ?, ?)`,
        ex.name, primary, ex.movement_pattern ?? 'isolation', equip, ex.category,
        compound, ex.external_id, difficulty, defaultRest,
        buildSearchText({ name: ex.name, primaryMuscle: primary, equipment: equip, pattern: ex.movement_pattern, category: ex.category }),
        now, now,
      );
      const localId = res.lastInsertRowId as number;
      await insertSecondary(tx, localId, secondary);
      await insertInstructions(tx, localId, instructions);
      if (ex.gif_url) await insertImage(tx, localId, ex.gif_url);
    });
    inserted++;
  }

  if (writes.length === 0) return 0;

  // Lazy import: write.ts imports client.ts, which imports this module.
  const { mutate } = await import('./write');
  for (let i = 0; i < writes.length; i += SEED_CHUNK) {
    const chunk = writes.slice(i, i + SEED_CHUNK);
    await mutate(SEED_TABLES, async (tx) => {
      for (const write of chunk) await write(tx);
    });
  }

  return inserted;
}

/** Rows per seed transaction: short enough that a user write never waits long. */
const SEED_CHUNK = 100;

const SEED_TABLES = [
  'exercises',
  'exercise_images',
  'exercise_instructions',
  'exercise_secondary_muscles',
  'exercise_aliases',
] as const;

interface LocalCatalogRow {
  id: number;
  external_id: string;
  source: string | null;
  name: string;
  primary_muscle: string;
  equipment: string;
  category: string;
  is_compound: number;
  difficulty: string | null;
  has_instructions: number;
  has_secondary: number;
  has_image: number;
}

async function insertInstructions(tx: Tx, exerciseId: number, steps: string[]): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    await tx.runAsync(
      'INSERT INTO exercise_instructions (exercise_id, step, text) VALUES (?, ?, ?)',
      exerciseId, i + 1, steps[i],
    );
  }
}

async function insertSecondary(tx: Tx, exerciseId: number, muscles: string[]): Promise<void> {
  for (const muscle of muscles) {
    await tx.runAsync(
      'INSERT OR IGNORE INTO exercise_secondary_muscles (exercise_id, muscle) VALUES (?, ?)',
      exerciseId, muscle,
    );
  }
}

async function insertImage(tx: Tx, exerciseId: number, url: string): Promise<void> {
  await tx.runAsync(
    'INSERT INTO exercise_images (exercise_id, url, is_primary, sort_order) VALUES (?, ?, 1, 0)',
    exerciseId, url,
  );
}
