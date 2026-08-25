import { openDatabase } from '../client';
import type {
  Category,
  Difficulty,
  Equipment,
  Exercise,
  ExperienceLevel,
  Goal,
  MovementPattern,
  MuscleGroup,
  SetEntry,
  TemplateExercise,
  Unit,
  UserProfile,
  WorkoutLog,
  WorkoutTemplate,
} from '../types';

/* ------------------------------- row types ------------------------------- */
export interface ExerciseRow {
  id: number;
  name: string;
  primary_muscle: string;
  movement_pattern: string | null;
  equipment: string;
  category: string;
  is_compound: number;
  is_custom: number;
  source: string;
  external_id: string | null;
  difficulty: string | null;
  default_rest_seconds: number;
  tips: string | null;
  uuid: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}
export interface AliasRow { alias: string }
export interface MuscleRow { muscle: string }
export interface InstructionRow { step: number; text: string }
export interface TemplateRow {
  id: number;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  estimated_minutes: number;
  is_custom: number;
  uuid: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}
export interface TemplateExerciseRow {
  id: number;
  template_id: number;
  exercise_id: number;
  sort_order: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
  notes: string;
  superset_group: number | null;
  uuid: string | null;
  updated_at: number | null;
  deleted_at: number | null;
}
export interface ProgramRow {
  id: number;
  name: string;
  description: string;
  weeks: number;
  is_custom: number;
  uuid: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}
export interface ProgramWorkoutRow {
  id: number;
  program_id: number;
  template_id: number;
  week: number;
  day: number;
  sort_order: number;
  uuid: string | null;
  deleted_at: number | null;
  updated_at: number | null;
}

export interface LogRow {
  id: number;
  template_id: number | null;
  name: string;
  started_at: number;
  ended_at: number | null;
  duration_seconds: number;
  total_volume: number;
  unit: string;
  notes: string;
  uuid: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}
export interface SetRow {
  id: number;
  workout_log_id: number;
  exercise_id: number;
  set_index: number;
  weight: number;
  reps: number;
  completed: number;
  rest_seconds: number | null;
  superset_group: number | null;
  set_type?: string | null;
  rpe?: number | null;
  uuid: string | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}
export interface ProfileRow {
  id: number;
  name: string;
  goal: string;
  bodyweight: number | null;
  unit: string;
  experience_level: string;
  onboarding_completed: number;
  avatar_url: string | null;
  uuid: string | null;
  deleted_at: number | null;
  updated_at: number;
}

/* ------------------------------- session types ------------------------------- */
export interface SessionSet extends SetEntry {
  exerciseName: string;
  primaryMuscle: MuscleGroup;
}
export interface SessionWorkout extends WorkoutLog {
  sets: SessionSet[];
}

/* ------------------------------- helpers ------------------------------- */
export type DB = Awaited<ReturnType<typeof openDatabase>>;

export async function mapExercise(db: DB, row: ExerciseRow): Promise<Exercise> {
  const aliases = (await db.getAllAsync<AliasRow>('SELECT alias FROM exercise_aliases WHERE exercise_id = ? ORDER BY id', row.id)).map((r) => r.alias);
  const secondaryMuscles = (await db.getAllAsync<MuscleRow>('SELECT muscle FROM exercise_secondary_muscles WHERE exercise_id = ? ORDER BY id', row.id)).map((r) => r.muscle as MuscleGroup);
  const instructions = (await db.getAllAsync<InstructionRow>('SELECT step, text FROM exercise_instructions WHERE exercise_id = ? ORDER BY step', row.id)).map((r) => r.text);
  const imgRow = await db.getFirstAsync<{ url: string }>('SELECT url FROM exercise_images WHERE exercise_id = ? AND is_primary = 1 LIMIT 1', row.id);
  return {
    id: row.id,
    name: row.name,
    aliases,
    primaryMuscle: row.primary_muscle as MuscleGroup,
    secondaryMuscles,
    movementPattern: row.movement_pattern as MovementPattern | null,
    equipment: row.equipment as Equipment,
    category: row.category as Category,
    isCompound: !!row.is_compound,
    isCustom: !!row.is_custom,
    source: row.source as 'seed' | 'exercisedb' | 'custom',
    externalId: row.external_id,
    difficulty: row.difficulty,
    defaultRestSeconds: row.default_rest_seconds,
    instructions,
    tips: row.tips,
    imageUrl: imgRow?.url ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapSet(r: SetRow): SetEntry {
  const setType = r.set_type === 'warmup' ? 'warmup' : 'working';
  return {
    id: r.id,
    workoutLogId: r.workout_log_id,
    exerciseId: r.exercise_id,
    setIndex: r.set_index,
    weight: r.weight,
    reps: r.reps,
    completed: !!r.completed,
    restSeconds: r.rest_seconds,
    supersetGroup: r.superset_group ?? null,
    setType,
    rpe: typeof r.rpe === 'number' && r.rpe >= 1 && r.rpe <= 10 ? Math.round(r.rpe) : null,
    createdAt: r.created_at,
  };
}

export function mapLog(r: LogRow): WorkoutLog {
  return {
    id: r.id,
    templateId: r.template_id,
    name: r.name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    durationSeconds: r.duration_seconds,
    totalVolume: r.total_volume,
    unit: r.unit as Unit,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    isComplete: r.ended_at != null,
  };
}

export function mapProfile(r: ProfileRow): UserProfile {
  return {
    id: r.id,
    name: r.name,
    goal: r.goal as Goal,
    bodyweight: r.bodyweight,
    unit: r.unit as Unit,
    experienceLevel: (r.experience_level as ExperienceLevel) ?? 'intermediate',
    onboardingCompleted: !!r.onboarding_completed,
    avatarUrl: r.avatar_url ?? null,
    updatedAt: r.updated_at,
  };
}

export function mapTemplate(t: TemplateRow, exercises: TemplateExercise[]): WorkoutTemplate {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    difficulty: t.difficulty as Difficulty,
    estimatedMinutes: t.estimated_minutes,
    isCustom: !!t.is_custom,
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    exercises,
  };
}

export function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return i === needle.length;
}

export async function recomputeVolume(logId: number): Promise<void> {
  const db = await openDatabase();
  const r = await db.getFirstAsync<{ v: number }>(
    'SELECT COALESCE(SUM(weight * reps), 0) as v FROM set_entries WHERE workout_log_id = ? AND completed = 1 AND deleted_at IS NULL',
    logId,
  );
  await db.runAsync('UPDATE workout_logs SET total_volume = ?, updated_at = ? WHERE id = ?', r?.v ?? 0, Date.now(), logId);
}

export async function getSessionSets(logId: number): Promise<SessionSet[]> {
  const db = await openDatabase();
  const rows = await db.getAllAsync<SetRow & { exercise_name: string; primary_muscle: string }>(
    `SELECT s.*, e.name as exercise_name, e.primary_muscle
     FROM set_entries s JOIN exercises e ON e.id = s.exercise_id
     WHERE s.workout_log_id = ? AND s.deleted_at IS NULL
     ORDER BY s.id, s.set_index`,
    logId,
  );
  return rows.map((r) => ({
    ...mapSet(r),
    exerciseName: r.exercise_name,
    primaryMuscle: r.primary_muscle as MuscleGroup,
  }));
}
