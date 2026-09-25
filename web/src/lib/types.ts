/** Cloud row shapes (snake_case, as stored by Supabase). */

export interface ProfileRow {
  user_id: string;
  name: string;
  goal: string;
  bodyweight: number | null;
  unit: string;
  experience_level: string;
  onboarding_completed: boolean;
  avatar_url: string | null;
}

export interface WorkoutLogRow {
  id: string;
  user_id: string;
  template_id: string | null;
  name: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  total_volume: number;
  unit: string;
  notes: string;
}

export interface SetEntryRow {
  id: string;
  user_id: string;
  workout_log_id: string;
  ref_type: "catalog" | "custom";
  catalog_external_id: string | null;
  user_exercise_id: string | null;
  set_index: number;
  weight: number;
  reps: number;
  completed: boolean;
  rest_seconds: number | null;
  superset_group: number | null;
  set_type: string;
  rpe: number | null;
}

export interface CatalogExerciseRow {
  external_id: string;
  name: string;
  body_part: string;
  equipment: string;
  target_muscle: string;
  secondary_muscles: string[];
  movement_pattern: string;
  category: string;
  is_compound: boolean;
  difficulty: string;
  instructions: string[];
  gif_url: string;
  tips: string;
}

export interface CustomExerciseRow {
  id: string;
  user_id: string;
  name: string;
  primary_muscle: string;
  movement_pattern: string | null;
  equipment: string;
  category: string;
  is_compound: boolean;
  tips: string;
}

export interface RoutineRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  estimated_minutes: number;
}

export interface RoutineExerciseRow {
  id: string;
  user_id: string;
  template_id: string;
  ref_type: "catalog" | "custom";
  catalog_external_id: string | null;
  user_exercise_id: string | null;
  sort_order: number;
  target_sets: number;
  target_reps_min: number;
  target_reps_max: number;
  rest_seconds: number;
  notes: string;
  superset_group: number | null;
}

export interface ProgramRow {
  id: string;
  user_id: string;
  name: string;
  description: string;
  weeks: number;
}

export interface ProgramSlotRow {
  id: string;
  user_id: string;
  program_id: string;
  ref_type: "custom" | "seed";
  user_template_id: string | null;
  seed_template_id: number | null;
  week: number;
  day: number;
  sort_order: number;
}

export interface BodyweightRow {
  id: string;
  user_id: string;
  weight: number;
  unit: string;
  recorded_at: string;
}

export interface MeasurementRow {
  id: string;
  user_id: string;
  metric: string;
  value: number;
  unit: string;
  recorded_at: string;
}

/** Exercise identity as displayed: resolved name + origin. */
export interface ResolvedExercise {
  key: string;
  name: string;
  muscle: string;
  equipment: string;
  custom: boolean;
}
