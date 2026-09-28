import { openDatabase } from '../client';
import { newUuid } from '@/lib/uuid';
import { buildSearchText, scoreField, tokenize } from '@/lib/exercise-search';
import { enqueueSync } from '@/sync/outbox';
import type {
  Category,
  Equipment,
  Exercise,
  ExerciseHistoryRow,
  MovementPattern,
  MuscleGroup,
  SearchHit,
  SetEntry,
} from '../types';
import {
  type ExerciseRow,
  mapExercise,
  mapSet,
  type SetRow,
} from './helpers';
import { WORKING_PR_PREDICATE } from './coaching/prs';

export async function listExercises(): Promise<Exercise[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<ExerciseRow>(
    'SELECT * FROM exercises WHERE deleted_at IS NULL ORDER BY name',
  );
  return Promise.all(rows.map((r) => mapExercise(db, r)));
}

export async function getExercise(id: number): Promise<Exercise | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<ExerciseRow>(
    'SELECT * FROM exercises WHERE id = ? AND deleted_at IS NULL',
    id,
  );
  return row ? mapExercise(db, row) : null;
}

export async function getExerciseByExternalId(externalId: string): Promise<Exercise | null> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<ExerciseRow>(
    'SELECT * FROM exercises WHERE external_id = ? AND deleted_at IS NULL',
    externalId,
  );
  return row ? mapExercise(db, row) : null;
}

/** Most recently trained exercises (by session start), for pickers. */
export async function getRecentExercises(limit = 10): Promise<Exercise[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<ExerciseRow>(
    `SELECT e.* FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id
     JOIN exercises e ON e.id = s.exercise_id
     WHERE s.deleted_at IS NULL AND w.deleted_at IS NULL
       AND e.deleted_at IS NULL AND s.completed = 1 AND w.ended_at IS NOT NULL
     GROUP BY s.exercise_id ORDER BY MAX(w.started_at) DESC LIMIT ?`,
    limit,
  );
  return Promise.all(rows.map((r) => mapExercise(db, r)));
}

export interface ExerciseFilters {
  muscle?: MuscleGroup;
  equipment?: Equipment;
  pattern?: MovementPattern;
}

/**
 * Tokenized exercise search with typo tolerance and recency boost.
 *
 * Pipeline: normalize → tokenize → SQL candidate prefilter on `search_text`
 * (OR over tokens; NULL blobs always pass so legacy/diaticritic rows are
 * never silently dropped) → JS ranking (exact/prefix/substring/fuzzy per
 * field, AND across tokens) → recency boost → sort.
 *
 * Bands preserve the old precedence (name > alias > muscle > equipment >
 * pattern); a fuzzy name hit still outranks an exact muscle hit because name
 * intent is stronger. Recency (the Hevy move) adds +12 top-10 / +6 next-40.
 */
export async function searchExercises(
  query: string,
  filters?: ExerciseFilters,
  options?: { recentIds?: number[] },
): Promise<SearchHit[]> {
  const db = await openDatabase();
  const tokens = tokenize(query);
  const where: string[] = [];
  const args: (string | number)[] = [];
  if (filters?.muscle) { where.push('primary_muscle = ?'); args.push(filters.muscle); }
  if (filters?.equipment) { where.push('equipment = ?'); args.push(filters.equipment); }
  if (filters?.pattern) { where.push('movement_pattern = ?'); args.push(filters.pattern); }
  let sql = 'SELECT * FROM exercises';
  // Tokens are [a-z0-9]+ by construction (normalizer strips the rest), so
  // LIKE needs no ESCAPE clause.
  const prefilter = tokens.map(() => `search_text LIKE '%' || ? || '%'`).join(' OR ');
  const clauses = [...where, 'deleted_at IS NULL'];
  if (prefilter) clauses.push(`(search_text IS NULL OR (${prefilter}))`);
  sql += ' WHERE ' + clauses.join(' AND ');
  sql += ' ORDER BY name';
  let rows = await db.getAllAsync<ExerciseRow>(sql, ...args, ...tokens);
  if (rows.length === 0 && tokens.length > 0) {
    // Prefilter is substring-only, so a fully-typo'd query matches nothing.
    // Fall back to the full set and let the fuzzy ranker decide — bounded
    // cost, only on otherwise-empty results.
    const fallback = [...where, 'deleted_at IS NULL'].join(' AND ');
    rows = await db.getAllAsync<ExerciseRow>(
      `SELECT * FROM exercises WHERE ${fallback} ORDER BY name`,
      ...args,
    );
  }

  // Batch-load related data to avoid N+1 queries
  const ids = rows.map((r) => r.id);
  if (ids.length === 0) return [];

  const placeholders = ids.map(() => '?').join(',');

  const [aliasRows, muscleRows, instrRows, imgRows] = await Promise.all([
    db.getAllAsync<{ exercise_id: number; alias: string }>(
      `SELECT exercise_id, alias FROM exercise_aliases WHERE exercise_id IN (${placeholders}) ORDER BY id`, ...ids,
    ),
    db.getAllAsync<{ exercise_id: number; muscle: string }>(
      `SELECT exercise_id, muscle FROM exercise_secondary_muscles WHERE exercise_id IN (${placeholders}) ORDER BY id`, ...ids,
    ),
    db.getAllAsync<{ exercise_id: number; text: string }>(
      `SELECT exercise_id, text FROM exercise_instructions WHERE exercise_id IN (${placeholders}) ORDER BY step`, ...ids,
    ),
    db.getAllAsync<{ exercise_id: number; url: string }>(
      `SELECT exercise_id, url FROM exercise_images WHERE exercise_id IN (${placeholders}) AND is_primary = 1`, ...ids,
    ),
  ]);

  // Build lookup maps
  const aliasMap = new Map<number, string[]>();
  for (const r of aliasRows) {
    if (!aliasMap.has(r.exercise_id)) aliasMap.set(r.exercise_id, []);
    aliasMap.get(r.exercise_id)!.push(r.alias);
  }
  const muscleMap = new Map<number, MuscleGroup[]>();
  for (const r of muscleRows) {
    if (!muscleMap.has(r.exercise_id)) muscleMap.set(r.exercise_id, []);
    muscleMap.get(r.exercise_id)!.push(r.muscle as MuscleGroup);
  }
  const instrMap = new Map<number, string[]>();
  for (const r of instrRows) {
    if (!instrMap.has(r.exercise_id)) instrMap.set(r.exercise_id, []);
    instrMap.get(r.exercise_id)!.push(r.text);
  }
  const imgMap = new Map<number, string>();
  for (const r of imgRows) imgMap.set(r.exercise_id, r.url);

  // Assemble exercises
  const exercises: Exercise[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    aliases: aliasMap.get(row.id) ?? [],
    primaryMuscle: row.primary_muscle as MuscleGroup,
    secondaryMuscles: muscleMap.get(row.id) ?? [],
    movementPattern: row.movement_pattern as MovementPattern | null,
    equipment: row.equipment as Equipment,
    category: row.category as Category,
    isCompound: !!row.is_compound,
    isCustom: !!row.is_custom,
    source: row.source as 'seed' | 'exercisedb' | 'custom',
    externalId: row.external_id,
    difficulty: row.difficulty,
    defaultRestSeconds: row.default_rest_seconds,
    instructions: instrMap.get(row.id) ?? [],
    tips: row.tips,
    imageUrl: imgMap.get(row.id) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  if (!tokens.length) return exercises.map((exercise) => ({ exercise, score: 0, matchedOn: 'name' as const }));

  const recentBonus = new Map<number, number>();
  (options?.recentIds ?? []).forEach((id, i) => {
    if (!recentBonus.has(id)) recentBonus.set(id, i < 10 ? 12 : 6);
  });

  const hits: SearchHit[] = [];
  for (const ex of exercises) {
    const nameTokens = tokenize(ex.name);
    let best: { score: number; matchedOn: SearchHit['matchedOn'] } | null = null;
    const nameHit = scoreField(tokens, nameTokens, {
      exact: 100, prefix: 88, substring: 72, fuzzy: 55, matchedOn: 'name',
    });
    if (nameHit) best = { score: nameHit.score, matchedOn: 'name' };
    if (!best) {
      for (const alias of ex.aliases) {
        const aliasHit = scoreField(tokens, tokenize(alias), {
          exact: 94, prefix: 82, substring: 66, fuzzy: 50, matchedOn: 'alias',
        });
        if (aliasHit) {
          best = { score: aliasHit.score, matchedOn: 'alias' };
          break;
        }
      }
    }
    if (!best) {
      const muscleHit = scoreField(tokens, tokenize([ex.primaryMuscle, ...ex.secondaryMuscles].join(' ')), {
        exact: 48, prefix: 44, substring: 40, fuzzy: 36, matchedOn: 'muscle',
      });
      if (muscleHit) best = { score: muscleHit.score, matchedOn: 'muscle' };
    }
    if (!best && ex.equipment) {
      const equipHit = scoreField(tokens, tokenize(ex.equipment), {
        exact: 40, prefix: 36, substring: 32, fuzzy: 28, matchedOn: 'equipment',
      });
      if (equipHit) best = { score: equipHit.score, matchedOn: 'equipment' };
    }
    if (!best && ex.movementPattern) {
      const patternHit = scoreField(tokens, tokenize(ex.movementPattern), {
        exact: 30, prefix: 27, substring: 24, fuzzy: 20, matchedOn: 'pattern',
      });
      if (patternHit) best = { score: patternHit.score, matchedOn: 'pattern' };
    }
    if (best) {
      hits.push({
        exercise: ex,
        score: best.score + (recentBonus.get(ex.id) ?? 0),
        matchedOn: best.matchedOn,
      });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name));
  return hits;
}

export interface CreateCustomExerciseInput {
  name: string;
  primaryMuscle: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  movementPattern: MovementPattern;
  equipment: Equipment;
  category: Category;
  isCompound?: boolean;
  instructions?: string[];
  tips?: string;
  aliases?: string[];
}

export async function createCustomExercise(input: CreateCustomExerciseInput): Promise<number> {
  const db = await openDatabase();
  const now = Date.now();
  const uuid = newUuid();
  const res = await db.runAsync(
    `INSERT INTO exercises (name, primary_muscle, movement_pattern, equipment, category, is_compound, is_custom, source, tips, search_text, uuid, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, 'custom', ?, ?, ?, ?, ?)`,
    input.name, input.primaryMuscle, input.movementPattern, input.equipment, input.category, input.isCompound ? 1 : 0, input.tips ?? '',
    buildSearchText({ name: input.name, primaryMuscle: input.primaryMuscle, equipment: input.equipment, pattern: input.movementPattern, category: input.category }),
    uuid, now, now,
  );
  const id = res.lastInsertRowId as number;
  for (const alias of (input.aliases ?? [])) {
    await db.runAsync(`INSERT INTO exercise_aliases (exercise_id, alias) VALUES (?, ?)`, id, alias.toLowerCase());
  }
  for (const muscle of (input.secondaryMuscles ?? [])) {
    await db.runAsync(`INSERT INTO exercise_secondary_muscles (exercise_id, muscle) VALUES (?, ?)`, id, muscle);
  }
  for (let i = 0; i < (input.instructions ?? []).length; i++) {
    await db.runAsync(`INSERT INTO exercise_instructions (exercise_id, step, text) VALUES (?, ?, ?)`, id, i + 1, input.instructions![i]);
  }
  await enqueueSync('user_exercises', uuid, 'upsert', {
    name: input.name,
    primary_muscle: input.primaryMuscle,
    movement_pattern: input.movementPattern,
    equipment: input.equipment,
    category: input.category,
    is_compound: input.isCompound ? 1 : 0,
    tips: input.tips ?? '',
    aliases: input.aliases ?? [],
    secondary_muscles: input.secondaryMuscles ?? [],
    instructions: input.instructions ?? [],
    created_at: now,
    updated_at: now,
    deleted_at: null,
  });
  return id;
}

export async function deleteCustomExercise(id: number): Promise<void> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ uuid: string | null }>(
    'SELECT uuid FROM exercises WHERE id = ? AND is_custom = 1',
    id,
  );
  const now = Date.now();
  await db.runAsync(
    'UPDATE exercises SET deleted_at = ?, updated_at = ? WHERE id = ? AND is_custom = 1',
    now, now, id,
  );
  if (row?.uuid) {
    await enqueueSync('user_exercises', row.uuid, 'delete', {
      updated_at: now,
      deleted_at: now,
    });
  }
}

/** List only user-created exercises (local SQLite), sorted by name. */
export async function listCustomExercises(): Promise<Exercise[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<ExerciseRow>(
    'SELECT * FROM exercises WHERE is_custom = 1 AND deleted_at IS NULL ORDER BY name',
  );
  return Promise.all(rows.map((row) => mapExercise(db, row)));
}

/** Logged sets + template usages for an exercise (0 = safe to delete). */
export async function getCustomExerciseUsage(exerciseId: number): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ c: number }>(
    `SELECT
       (SELECT COUNT(*) FROM set_entries WHERE exercise_id = ? AND deleted_at IS NULL) +
       (SELECT COUNT(*) FROM template_exercises WHERE exercise_id = ? AND deleted_at IS NULL) AS c`,
    exerciseId, exerciseId,
  );
  return row?.c ?? 0;
}

export async function updateExerciseDefaultRest(exerciseId: number, seconds: number): Promise<void> {
  const db = await openDatabase();
  await db.runAsync('UPDATE exercises SET default_rest_seconds = ?, updated_at = ? WHERE id = ?', seconds, Date.now(), exerciseId);
}

export async function getExerciseDefaultRest(exerciseId: number): Promise<number> {
  const db = await openDatabase();
  const row = await db.getFirstAsync<{ default_rest_seconds: number }>(
    'SELECT default_rest_seconds FROM exercises WHERE id = ?',
    exerciseId,
  );
  return row?.default_rest_seconds ?? 0;
}

/**
 * Ensure an exercise exists in local SQLite by external_id.
 * If it exists, return its local id. If not, insert it and return the new id.
 * Used when picking exercises from Supabase — saves locally for workout logging.
 */
export async function ensureExerciseExists(
  exercise: {
    name: string;
    primaryMuscle: MuscleGroup;
    secondaryMuscles?: MuscleGroup[];
    movementPattern?: MovementPattern | null;
    equipment: Equipment;
    category: Category;
    isCompound: boolean;
    instructions?: string[];
    tips?: string | null;
    defaultRestSeconds?: number;
  },
  externalId: string,
): Promise<number> {
  const db = await openDatabase();
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM exercises WHERE external_id = ?',
    externalId,
  );
  if (existing) return existing.id;

  const now = Date.now();
  const res = await db.runAsync(
     `INSERT INTO exercises (name, primary_muscle, movement_pattern, equipment, category, is_compound, is_custom, source, external_id, difficulty, default_rest_seconds, tips, search_text, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 'exercisedb', ?, 'intermediate', ?, '', ?, ?, ?)`,
    exercise.name, exercise.primaryMuscle, exercise.movementPattern ?? 'isolation', exercise.equipment,
    exercise.category, exercise.isCompound ? 1 : 0, externalId,
    exercise.defaultRestSeconds ?? 90,
    buildSearchText({ name: exercise.name, primaryMuscle: exercise.primaryMuscle, equipment: exercise.equipment, pattern: exercise.movementPattern, category: exercise.category }),
    now, now,
  );
  const id = res.lastInsertRowId as number;

  // Secondary muscles
  for (const muscle of exercise.secondaryMuscles ?? []) {
    await db.runAsync(
      'INSERT INTO exercise_secondary_muscles (exercise_id, muscle) VALUES (?, ?)',
      id, muscle,
    );
  }

  // Instructions
  for (let i = 0; i < (exercise.instructions ?? []).length; i++) {
    await db.runAsync(
      'INSERT INTO exercise_instructions (exercise_id, step, text) VALUES (?, ?, ?)',
      id, i + 1, exercise.instructions![i],
    );
  }

  return id;
}

/** Most recent completed sets for an exercise (used for carry-over values). */
export async function getLastSetsForExercise(exerciseId: number): Promise<SetEntry[]> {
  const map = await getLastSetsForExercises([exerciseId]);
  return map[exerciseId] ?? [];
}

/** Batch last-session sets for many exercises (avoids N+1 on workout start). */
export async function getLastSetsForExercises(exerciseIds: number[]): Promise<Record<number, SetEntry[]>> {
  const out: Record<number, SetEntry[]> = {};
  const ids = [...new Set(exerciseIds.filter((id) => id > 0))];
  for (const id of ids) out[id] = [];
  if (ids.length === 0) return out;

  const db = await openDatabase();
  const placeholders = ids.map(() => '?').join(',');
  const rows = await db.getAllAsync<SetRow>(
    `SELECT s.*
     FROM set_entries s
     JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE s.exercise_id IN (${placeholders})
       AND s.completed = 1 AND s.deleted_at IS NULL
       AND (s.set_type IS NULL OR s.set_type = 'working')
       AND w.ended_at IS NOT NULL AND w.deleted_at IS NULL
       AND w.started_at = (
         SELECT MAX(w2.started_at)
         FROM set_entries s2
         JOIN workout_logs w2 ON w2.id = s2.workout_log_id
         WHERE s2.exercise_id = s.exercise_id
           AND s2.completed = 1 AND s2.deleted_at IS NULL
           AND w2.ended_at IS NOT NULL AND w2.deleted_at IS NULL
       )
     ORDER BY s.exercise_id, s.set_index`,
    ...ids,
  );

  for (const row of rows) {
    (out[row.exercise_id] ??= []).push(mapSet(row));
  }
  return out;
}

export async function getExerciseHistory(exerciseId: number, limit = 10): Promise<ExerciseHistoryRow[]> {
  const db = await openDatabase();
  return db.getAllAsync<ExerciseHistoryRow>(
    `SELECT w.id as workoutLogId, w.name as workoutName, w.started_at as startedAt, s.set_index as setIndex, s.weight, s.reps, s.completed as completed, s.rpe as rpe
     FROM set_entries s JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE s.exercise_id = ? AND w.ended_at IS NOT NULL AND w.deleted_at IS NULL AND s.deleted_at IS NULL AND s.completed = 1
     ORDER BY w.started_at DESC, s.set_index LIMIT ?`,
    exerciseId, limit,
  );
}

export interface ExercisePRSummary {
  heaviestWeight: number;
  best1RM: number;
  bestSetVolume: number;
  bestSessionVolume: number;
  heaviestWeightAt: number;
}

export async function getExercisePRSummary(exerciseId: number): Promise<ExercisePRSummary> {
  const db = await openDatabase();
  const base = await db.getFirstAsync<{ max_weight: number; best_1rm: number; best_set_vol: number }>(
    `SELECT MAX(s.weight) as max_weight,
            MAX(CASE WHEN s.reps <= 1 THEN s.weight
                     ELSE s.weight * (1.0 + s.reps / 30.0) END) as best_1rm,
            MAX(s.weight * s.reps) as best_set_vol
     FROM set_entries s JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE s.exercise_id = ? AND ${WORKING_PR_PREDICATE}`,
    exerciseId,
  );
  const maxWeight = base?.max_weight ?? 0;
  const best1RM = Math.round((base?.best_1rm ?? 0) * 100) / 100;
  const bestSetVol = base?.best_set_vol ?? 0;

  // Best session volume: max sum(weight*reps) per workout_log
  const sessionVol = await db.getFirstAsync<{ vol: number }>(
    `SELECT SUM(s.weight * s.reps) as vol
     FROM set_entries s JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE s.exercise_id = ? AND ${WORKING_PR_PREDICATE}
     GROUP BY w.id ORDER BY vol DESC LIMIT 1`,
    exerciseId,
  );

  // When was heaviest weight achieved
  const atMax = await db.getFirstAsync<{ created_at: number }>(
    `SELECT s.created_at FROM set_entries s JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE s.exercise_id = ? AND ${WORKING_PR_PREDICATE} AND s.weight = ?
     ORDER BY s.created_at DESC LIMIT 1`,
    exerciseId, maxWeight,
  );

  return {
    heaviestWeight: maxWeight,
    best1RM,
    bestSetVolume: bestSetVol,
    bestSessionVolume: sessionVol?.vol ?? 0,
    heaviestWeightAt: atMax?.created_at ?? 0,
  };
}

export interface RepRecord {
  reps: number;
  weight: number;
}

export async function getExerciseRepRecords(exerciseId: number): Promise<RepRecord[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{ reps: number; weight: number }>(
    `SELECT s.reps, MAX(s.weight) as weight
     FROM set_entries s JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE s.exercise_id = ? AND ${WORKING_PR_PREDICATE}
     GROUP BY s.reps ORDER BY s.reps`,
    exerciseId,
  );
  return rows;
}

export interface ProgressionPoint {
  date: string;
  weight: number;
}

export interface ExerciseSeriesPoint {
  date: string;
  heaviestWeight: number;
  estimated1RM: number;
  setVolume: number;
}

export async function getExerciseProgression(exerciseId: number): Promise<ProgressionPoint[]> {
  const series = await getExerciseSeries(exerciseId);
  return series.map((p) => ({ date: p.date, weight: p.heaviestWeight }));
}

/** Daily bests for heaviest weight, estimated 1RM, and best set volume (completed sets only). */
export async function getExerciseSeries(exerciseId: number): Promise<ExerciseSeriesPoint[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<{
    w: string;
    weight: number;
    e1rm: number;
    set_vol: number;
  }>(
    `SELECT strftime('%Y-%m-%d', s.created_at / 1000, 'unixepoch') as w,
            MAX(s.weight) as weight,
            MAX(CASE WHEN s.reps <= 1 THEN s.weight
                     ELSE s.weight * (1.0 + s.reps / 30.0) END) as e1rm,
            MAX(s.weight * s.reps) as set_vol
     FROM set_entries s JOIN workout_logs w ON w.id = s.workout_log_id
     WHERE s.exercise_id = ? AND ${WORKING_PR_PREDICATE}
     GROUP BY w ORDER BY w`,
    exerciseId,
  );
  return rows.map((r) => ({
    date: r.w,
    heaviestWeight: r.weight,
    estimated1RM: Math.round(r.e1rm * 100) / 100,
    setVolume: Math.round(r.set_vol * 100) / 100,
  }));
}
