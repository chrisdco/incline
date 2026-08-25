-- Incline user-data sync tables (run in Supabase SQL Editor after catalog schema).
-- Idempotent: safe to re-run. Tables/indexes use IF NOT EXISTS; policies are dropped then recreated.
-- RLS: Clerk JWT `sub` must equal user_id. Configure Clerk as a Supabase third-party
-- JWT provider (or JWT template) so auth.jwt()->>'sub' is the Clerk user id.

-- Profiles (one row per Clerk user)
CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT 'build_muscle',
  bodyweight DOUBLE PRECISION,
  unit TEXT NOT NULL DEFAULT 'metric',
  experience_level TEXT NOT NULL DEFAULT 'intermediate',
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

-- Custom exercises only (catalog stays in public.exercises)
CREATE TABLE IF NOT EXISTS user_exercises (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  primary_muscle TEXT NOT NULL,
  movement_pattern TEXT,
  equipment TEXT NOT NULL,
  category TEXT NOT NULL,
  is_compound BOOLEAN NOT NULL DEFAULT false,
  tips TEXT DEFAULT '',
  aliases TEXT[] DEFAULT '{}',
  secondary_muscles TEXT[] DEFAULT '{}',
  instructions TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_exercises_user_updated
  ON user_exercises (user_id, updated_at);

CREATE TABLE IF NOT EXISTS user_templates (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'strength',
  difficulty TEXT NOT NULL DEFAULT 'intermediate',
  estimated_minutes INTEGER NOT NULL DEFAULT 45,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_templates_user_updated
  ON user_templates (user_id, updated_at);

CREATE TABLE IF NOT EXISTS user_template_exercises (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id UUID NOT NULL REFERENCES user_templates(id),
  ref_type TEXT NOT NULL CHECK (ref_type IN ('catalog', 'custom')),
  catalog_external_id TEXT,
  user_exercise_id UUID REFERENCES user_exercises(id),
  sort_order INTEGER NOT NULL DEFAULT 0,
  target_sets INTEGER NOT NULL DEFAULT 3,
  target_reps_min INTEGER NOT NULL DEFAULT 8,
  target_reps_max INTEGER NOT NULL DEFAULT 12,
  rest_seconds INTEGER NOT NULL DEFAULT 90,
  notes TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_template_exercises_user_updated
  ON user_template_exercises (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_user_template_exercises_template
  ON user_template_exercises (template_id);
ALTER TABLE user_template_exercises ADD COLUMN IF NOT EXISTS superset_group INTEGER;

CREATE TABLE IF NOT EXISTS workout_logs (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  template_id UUID REFERENCES user_templates(id),
  name TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  total_volume DOUBLE PRECISION NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'metric',
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workout_logs_user_updated
  ON workout_logs (user_id, updated_at);

CREATE TABLE IF NOT EXISTS set_entries (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  workout_log_id UUID NOT NULL REFERENCES workout_logs(id),
  ref_type TEXT NOT NULL CHECK (ref_type IN ('catalog', 'custom')),
  catalog_external_id TEXT,
  user_exercise_id UUID REFERENCES user_exercises(id),
  set_index INTEGER NOT NULL DEFAULT 0,
  weight DOUBLE PRECISION NOT NULL DEFAULT 0,
  reps INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT false,
  rest_seconds INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
ALTER TABLE set_entries ADD COLUMN IF NOT EXISTS superset_group INTEGER;
ALTER TABLE set_entries ADD COLUMN IF NOT EXISTS set_type TEXT NOT NULL DEFAULT 'working';
ALTER TABLE set_entries ADD COLUMN IF NOT EXISTS rpe INTEGER;
CREATE INDEX IF NOT EXISTS idx_set_entries_user_updated
  ON set_entries (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_set_entries_log
  ON set_entries (workout_log_id);

CREATE TABLE IF NOT EXISTS bodyweight_entries (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  weight DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg',
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_bodyweight_user_updated
  ON bodyweight_entries (user_id, updated_at);

CREATE TABLE IF NOT EXISTS body_measurements (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  metric TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  unit TEXT NOT NULL DEFAULT 'cm',
  recorded_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_body_measurements_user_updated
  ON body_measurements (user_id, updated_at);

-- Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_template_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE set_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE bodyweight_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE body_measurements ENABLE ROW LEVEL SECURITY;

-- Clerk JWT sub == user_id
DROP POLICY IF EXISTS "profiles_own" ON profiles;
CREATE POLICY "profiles_own" ON profiles
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "user_exercises_own" ON user_exercises;
CREATE POLICY "user_exercises_own" ON user_exercises
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "user_templates_own" ON user_templates;
CREATE POLICY "user_templates_own" ON user_templates
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "user_template_exercises_own" ON user_template_exercises;
CREATE POLICY "user_template_exercises_own" ON user_template_exercises
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "workout_logs_own" ON workout_logs;
CREATE POLICY "workout_logs_own" ON workout_logs
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "set_entries_own" ON set_entries;
CREATE POLICY "set_entries_own" ON set_entries
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "bodyweight_entries_own" ON bodyweight_entries;
CREATE POLICY "bodyweight_entries_own" ON bodyweight_entries
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "body_measurements_own" ON body_measurements;
CREATE POLICY "body_measurements_own" ON body_measurements
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE TABLE IF NOT EXISTS user_programs (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  weeks INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_programs_user_updated
  ON user_programs (user_id, updated_at);

CREATE TABLE IF NOT EXISTS user_program_workouts (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  program_id UUID NOT NULL REFERENCES user_programs(id),
  ref_type TEXT NOT NULL CHECK (ref_type IN ('custom', 'seed')),
  user_template_id UUID REFERENCES user_templates(id),
  seed_template_id INTEGER,
  week INTEGER NOT NULL DEFAULT 1,
  day INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_program_workouts_user_updated
  ON user_program_workouts (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_user_program_workouts_program
  ON user_program_workouts (program_id);

CREATE TABLE IF NOT EXISTS user_active_program (
  user_id TEXT PRIMARY KEY,
  custom_program_id UUID REFERENCES user_programs(id),
  seed_program_id INTEGER,
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE user_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_program_workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_active_program ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_programs_own" ON user_programs;
CREATE POLICY "user_programs_own" ON user_programs
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "user_program_workouts_own" ON user_program_workouts;
CREATE POLICY "user_program_workouts_own" ON user_program_workouts
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "user_active_program_own" ON user_active_program;
CREATE POLICY "user_active_program_own" ON user_active_program
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE TABLE IF NOT EXISTS user_preferences (
  user_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preferences_own" ON user_preferences;
CREATE POLICY "user_preferences_own" ON user_preferences
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

CREATE TABLE IF NOT EXISTS workout_photos (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  workout_log_id UUID NOT NULL REFERENCES workout_logs(id),
  storage_path TEXT,
  content_type TEXT NOT NULL DEFAULT 'image/jpeg',
  byte_size INTEGER,
  checksum TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_workout_photos_user_updated
  ON workout_photos (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_workout_photos_log
  ON workout_photos (workout_log_id);

ALTER TABLE workout_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "workout_photos_own" ON workout_photos;
CREATE POLICY "workout_photos_own" ON workout_photos
  FOR ALL TO authenticated
  USING (user_id = auth.jwt() ->> 'sub')
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

INSERT INTO storage.buckets (id, name, public)
VALUES ('workout-photos', 'workout-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "workout_photos_storage_own" ON storage.objects;
CREATE POLICY "workout_photos_storage_own" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'workout-photos'
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'sub'
  )
  WITH CHECK (
    bucket_id = 'workout-photos'
    AND (storage.foldername(name))[1] = auth.jwt() ->> 'sub'
  );

-- Last-write-wins helper: clients send updated_at; reject older writes via RPC optional later.
-- Tombstone GC (run periodically via Edge Function / cron after 90 days):
-- DELETE FROM set_entries WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
-- (and similarly for other sync tables, children before parents).
