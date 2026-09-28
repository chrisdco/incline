// Offline import scripts / tooling only — not wired into the app UI.
import { openDatabase } from './client';
import { buildSearchText } from '@/lib/exercise-search';
import { fetchExercises, type ExerciseDbExercise } from '@/lib/api';
import type { Equipment, MuscleGroup, MovementPattern } from './types';

/* ---- field mapping ---- */

const MUSCLE_MAP: Record<string, MuscleGroup> = {
  abs: 'core',
  biceps: 'biceps',
  triceps: 'triceps',
  chest: 'chest',
  'lower back': 'back',
  'upper back': 'back',
  back: 'back',
  lats: 'back',
  traps: 'traps',
  shoulders: 'shoulders',
  'front delts': 'shoulders',
  'side delts': 'shoulders',
  'rear delts': 'shoulders',
  quads: 'quads',
  hamstrings: 'hamstrings',
  glutes: 'glutes',
  calves: 'calves',
  forearms: 'forearms',
  adductors: 'core',
  abductors: 'glutes',
  waist: 'core',
  spine: 'core',
  neck: 'traps',
  hip: 'glutes',
};

const EQUIPMENT_MAP: Record<string, Equipment> = {
  bodyweight: 'bodyweight',
  'body weight': 'bodyweight',
  barbell: 'barbell',
  dumbbell: 'dumbbell',
  cable: 'cable',
  machine: 'machine',
  'leverage machine': 'machine',
  kettlebell: 'kettlebell',
  band: 'band',
  'resistance band': 'band',
  'exercise ball': 'other',
  assisted: 'machine',
  foam_roll: 'other',
  other: 'other',
};

const COMPOUND_MOVEMENTS = new Set([
  'squat_hinge',
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
]);

function mapMuscle(target: string): MuscleGroup {
  const key = target.toLowerCase().trim();
  return MUSCLE_MAP[key] ?? 'full_body';
}

function mapEquipment(equipment: string): Equipment {
  const key = equipment.toLowerCase().trim();
  return EQUIPMENT_MAP[key] ?? 'other';
}

function inferMovementPattern(ex: ExerciseDbExercise): MovementPattern {
  const muscle = ex.target.toLowerCase();
  const name = ex.name.toLowerCase();
  const eq = ex.equipment.toLowerCase();

  if (eq === 'barbell' || eq === 'dumbbell') {
    if (muscle.includes('chest') || muscle.includes('shoulder')) {
      if (name.includes('press') || name.includes('push')) return 'horizontal_push';
      if (name.includes('overhead') || name.includes('shoulder')) return 'vertical_push';
    }
    if (muscle.includes('back') || muscle.includes('lats')) {
      if (name.includes('row') || name.includes('pull')) return 'horizontal_pull';
      if (name.includes('pulldown') || name.includes('pull-down')) return 'vertical_pull';
    }
    if (muscle.includes('quad') || muscle.includes('glute') || muscle.includes('hamstring')) {
      if (name.includes('squat') || name.includes('deadlift') || name.includes('lunge') || name.includes('press')) return 'squat_hinge';
    }
  }

  if (eq === 'bodyweight' || eq === 'body weight') {
    if (name.includes('push-up') || name.includes('dip')) return 'horizontal_push';
    if (name.includes('pull-up') || name.includes('chin-up')) return 'vertical_pull';
    if (name.includes('squat') || name.includes('lunge')) return 'squat_hinge';
    if (name.includes('plank') || name.includes('crunch') || name.includes('sit-up')) return 'core';
  }

  return 'isolation';
}

function inferCategory(ex: ExerciseDbExercise): 'strength' | 'cardio' | 'mobility' | 'accessory' {
  const pattern = inferMovementPattern(ex);
  if (COMPOUND_MOVEMENTS.has(pattern)) return 'strength';
  return 'accessory';
}

function isCompound(exercise: ExerciseDbExercise): boolean {
  const pattern = inferMovementPattern(exercise);
  return COMPOUND_MOVEMENTS.has(pattern);
}

/* ---- importer ---- */

export interface ImportProgress {
  total: number;
  imported: number;
  errors: number;
  phase: 'fetching' | 'importing' | 'done';
}

export async function importExercisesFromDb(
  onProgress?: (progress: ImportProgress) => void,
): Promise<{ imported: number; errors: number }> {
  const db = await openDatabase();
  let imported = 0;
  let errors = 0;
  const BATCH_SIZE = 100;
  const MAX_EXERCISES = 1500;

  onProgress?.({ total: 0, imported: 0, errors: 0, phase: 'fetching' });

  let offset = 0;
  let hasMore = true;

  while (hasMore && offset < MAX_EXERCISES) {
    try {
      const batch = await fetchExercises(BATCH_SIZE, offset);

      if (batch.length === 0) {
        hasMore = false;
        break;
      }

      onProgress?.({
        total: offset + batch.length,
        imported,
        errors,
        phase: 'importing',
      });

      for (const ex of batch) {
        try {
          const primaryMuscle = mapMuscle(ex.target);
          const equipment = mapEquipment(ex.equipment);
          const pattern = inferMovementPattern(ex);
          const category = inferCategory(ex);
          const compound = isCompound(ex);
          const now = Date.now();

          const existing = await db.getFirstAsync<{ id: number }>(
            'SELECT id FROM exercises WHERE external_id = ?',
            ex.id,
          );

          let exerciseId: number;

          if (existing) {
            await db.runAsync(
              `UPDATE exercises SET name = ?, primary_muscle = ?, movement_pattern = ?, equipment = ?, category = ?, is_compound = ?, difficulty = ?, search_text = ?, updated_at = ? WHERE external_id = ?`,
              ex.name, primaryMuscle, pattern, equipment, category, compound ? 1 : 0, 'beginner',
              buildSearchText({ name: ex.name, primaryMuscle, equipment, pattern, category }),
              now, ex.id,
            );
            exerciseId = existing.id;
          } else {
            const res = await db.runAsync(
              `INSERT INTO exercises (name, primary_muscle, movement_pattern, equipment, category, is_compound, is_custom, source, external_id, difficulty, default_rest_seconds, tips, search_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, 'exercisedb', ?, 'beginner', 90, '', ?, ?, ?)`,
              ex.name, primaryMuscle, pattern, equipment, category, compound ? 1 : 0, ex.id,
              buildSearchText({ name: ex.name, primaryMuscle, equipment, pattern, category }),
              now, now,
            );
            exerciseId = res.lastInsertRowId as number;
          }

          await db.runAsync('DELETE FROM exercise_secondary_muscles WHERE exercise_id = ?', exerciseId);
          for (const muscle of ex.secondaryMuscles) {
            const mapped = mapMuscle(muscle);
            await db.runAsync(
              'INSERT INTO exercise_secondary_muscles (exercise_id, muscle) VALUES (?, ?)',
              exerciseId, mapped,
            );
          }

          await db.runAsync('DELETE FROM exercise_instructions WHERE exercise_id = ?', exerciseId);
          for (let i = 0; i < ex.instructions.length; i++) {
            await db.runAsync(
              'INSERT INTO exercise_instructions (exercise_id, step, text) VALUES (?, ?, ?)',
              exerciseId, i + 1, ex.instructions[i],
            );
          }

          await db.runAsync('DELETE FROM exercise_aliases WHERE exercise_id = ?', exerciseId);
          await db.runAsync(
            'INSERT INTO exercise_aliases (exercise_id, alias) VALUES (?, ?)',
            exerciseId, ex.name.toLowerCase(),
          );

          if (ex.gifUrl) {
            await db.runAsync('DELETE FROM exercise_images WHERE exercise_id = ?', exerciseId);
            await db.runAsync(
              'INSERT INTO exercise_images (exercise_id, url, is_primary, sort_order) VALUES (?, ?, 1, 0)',
              exerciseId, ex.gifUrl,
            );
          }

          imported++;
        } catch {
          errors++;
        }
      }

      offset += BATCH_SIZE;
      hasMore = batch.length === BATCH_SIZE;
      await new Promise((r) => setTimeout(r, 100));
    } catch {
      errors++;
      hasMore = false;
    }
  }

  onProgress?.({ total: offset, imported, errors, phase: 'done' });
  return { imported, errors };
}

export async function getExerciseImage(exerciseId: number): Promise<string | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ url: string }>(
    'SELECT url FROM exercise_images WHERE exercise_id = ? ORDER BY is_primary DESC, sort_order LIMIT 1',
    exerciseId,
  );
  return row?.url ?? null;
}
