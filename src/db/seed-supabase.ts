import type { SQLiteDatabase } from 'expo-sqlite';
import { buildSearchText } from '@/lib/exercise-search';
import { supabase, supabaseReady, type SupabaseExercise } from '@/lib/supabase';

/**
 * Fetch all exercises from Supabase and seed them into local SQLite.
 * Uses upsert by external_id so repeated runs are safe.
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

  // Collect all external_ids from Supabase
  const supabaseIds = new Set(all.map((e) => e.external_id).filter(Boolean));

  // Clean up old exercisedb exercises that no longer exist in Supabase
  const oldExercises = await db.getAllAsync<{ id: number; external_id: string | null }>(
    "SELECT id, external_id FROM exercises WHERE source = 'exercisedb'",
  );
  for (const old of oldExercises) {
    if (old.external_id && !supabaseIds.has(old.external_id)) {
      // Delete child records first (foreign keys with CASCADE should handle this, but be safe)
      await db.runAsync('DELETE FROM exercise_images WHERE exercise_id = ?', old.id);
      await db.runAsync('DELETE FROM exercise_instructions WHERE exercise_id = ?', old.id);
      await db.runAsync('DELETE FROM exercise_secondary_muscles WHERE exercise_id = ?', old.id);
      await db.runAsync('DELETE FROM exercise_aliases WHERE exercise_id = ?', old.id);
      await db.runAsync('DELETE FROM exercises WHERE id = ?', old.id);
    }
  }

  let inserted = 0;
  const now = Date.now();

  for (const ex of all) {
    const existing = await db.getFirstAsync<{ id: number }>(
      'SELECT id FROM exercises WHERE external_id = ?',
      ex.external_id,
    );

    let localId: number;

    if (existing) {
      localId = existing.id;
      // Update exercise fields from Supabase (in case data changed)
      await db.runAsync(
        `UPDATE exercises SET name = ?, primary_muscle = ?, equipment = ?, category = ?,
         is_compound = ?, difficulty = ?, updated_at = ? WHERE id = ?`,
        ex.name, mapMuscle(ex.target_muscle), mapEquip(ex.equipment),
        ex.category, ex.is_compound ? 1 : 0, ex.difficulty || 'intermediate', now, localId,
      );
      // Backfill instructions for exercises that lack them
      const insCount = await db.getFirstAsync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM exercise_instructions WHERE exercise_id = ?', localId,
      );
      if (insCount && insCount.cnt === 0) {
        for (let i = 0; i < (ex.instructions ?? []).length; i++) {
          await db.runAsync(
            'INSERT INTO exercise_instructions (exercise_id, step, text) VALUES (?, ?, ?)',
            localId, i + 1, ex.instructions[i],
          );
        }
      }
      // Backfill secondary muscles
      const secCount = await db.getFirstAsync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM exercise_secondary_muscles WHERE exercise_id = ?', localId,
      );
      if (secCount && secCount.cnt === 0) {
        for (const muscle of ex.secondary_muscles ?? []) {
          const m = mapMuscle(muscle);
          if (m) {
            await db.runAsync(
              'INSERT OR IGNORE INTO exercise_secondary_muscles (exercise_id, muscle) VALUES (?, ?)',
              localId, m,
            );
          }
        }
      }
      // Backfill image for exercises that lack one
      const imgCount = await db.getFirstAsync<{ cnt: number }>(
        'SELECT COUNT(*) as cnt FROM exercise_images WHERE exercise_id = ?', localId,
      );
      if (ex.gif_url && imgCount && imgCount.cnt === 0) {
        await db.runAsync(
          'INSERT INTO exercise_images (exercise_id, url, is_primary, sort_order) VALUES (?, ?, 1, 0)',
          localId, ex.gif_url,
        );
      }
      continue;
    }

    const primary = mapMuscle(ex.target_muscle);
    const equip = mapEquip(ex.equipment);
    const defaultRest = ex.is_compound ? 120 : 90;

    const res = await db.runAsync(
      `INSERT INTO exercises (name, primary_muscle, movement_pattern, equipment, category, is_compound, tips, source, external_id, difficulty, default_rest_seconds, is_custom, search_text, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, '', 'exercisedb', ?, ?, ?, 0, ?, ?, ?)`,
      ex.name, primary, ex.movement_pattern ?? 'isolation', equip, ex.category,
      ex.is_compound ? 1 : 0, ex.external_id, ex.difficulty || 'intermediate', defaultRest,
      buildSearchText({ name: ex.name, primaryMuscle: primary, equipment: equip, pattern: ex.movement_pattern, category: ex.category }),
      now, now,
    );
    localId = res.lastInsertRowId as number;

    // Secondary muscles
    for (const muscle of ex.secondary_muscles ?? []) {
      const m = mapMuscle(muscle);
      if (m) {
        await db.runAsync(
          'INSERT OR IGNORE INTO exercise_secondary_muscles (exercise_id, muscle) VALUES (?, ?)',
          localId, m,
        );
      }
    }

    // Instructions
    for (let i = 0; i < (ex.instructions ?? []).length; i++) {
      await db.runAsync(
        'INSERT INTO exercise_instructions (exercise_id, step, text) VALUES (?, ?, ?)',
        localId, i + 1, ex.instructions[i],
      );
    }

    // Exercise image/GIF
    if (ex.gif_url) {
      await db.runAsync(
        'INSERT INTO exercise_images (exercise_id, url, is_primary, sort_order) VALUES (?, ?, 1, 0)',
        localId, ex.gif_url,
      );
    }

    inserted++;
  }

  return inserted;
}
