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
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "user_exercises_own" ON user_exercises;
CREATE POLICY "user_exercises_own" ON user_exercises
  FOR ALL TO authenticated
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "user_templates_own" ON user_templates;
CREATE POLICY "user_templates_own" ON user_templates
  FOR ALL TO authenticated
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "user_template_exercises_own" ON user_template_exercises;
CREATE POLICY "user_template_exercises_own" ON user_template_exercises
  FOR ALL TO authenticated
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "workout_logs_own" ON workout_logs;
CREATE POLICY "workout_logs_own" ON workout_logs
  FOR ALL TO authenticated
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "set_entries_own" ON set_entries;
CREATE POLICY "set_entries_own" ON set_entries
  FOR ALL TO authenticated
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "bodyweight_entries_own" ON bodyweight_entries;
CREATE POLICY "bodyweight_entries_own" ON bodyweight_entries
  FOR ALL TO authenticated
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "body_measurements_own" ON body_measurements;
CREATE POLICY "body_measurements_own" ON body_measurements
  FOR ALL TO authenticated
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

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
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "user_program_workouts_own" ON user_program_workouts;
CREATE POLICY "user_program_workouts_own" ON user_program_workouts
  FOR ALL TO authenticated
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

DROP POLICY IF EXISTS "user_active_program_own" ON user_active_program;
CREATE POLICY "user_active_program_own" ON user_active_program
  FOR ALL TO authenticated
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

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
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

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
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

INSERT INTO storage.buckets (id, name, public)
VALUES ('workout-photos', 'workout-photos', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "workout_photos_storage_own" ON storage.objects;
CREATE POLICY "workout_photos_storage_own" ON storage.objects
  FOR ALL TO authenticated
  USING (
    bucket_id = 'workout-photos'
    AND (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  )
  WITH CHECK (
    bucket_id = 'workout-photos'
    AND (storage.foldername(name))[1] = (select auth.jwt() ->> 'sub')
  );

-- Batched last-write-wins push (#139 / #143). The client sends one call per
-- table chunk: p_ops = [{"op": "upsert" | "delete", "row": {...cloud columns}}].
-- Returns one (idx, status, message) per op, idx = 0-based position in p_ops:
--   applied  row written
--   stale    cloud row is as new or newer (ties keep the incumbent), or the
--            profile guard refused an empty placeholder over a named profile
--   absent   delete for a row the cloud never had (nothing to tombstone)
--   error    this row failed (message = SQLSTATE: text); other rows still apply
-- SECURITY INVOKER: every write runs under the caller's RLS policies. user_id
-- is forced to the JWT sub, so a client can never write as someone else.
-- Upserts write only the columns present in the row (missing ones take their
-- default on insert and keep their value on update), but the row must still
-- be insertable: Postgres checks NOT NULL before resolving the conflict.
-- Deletes are tombstone-only updates (their payloads carry no full row).
CREATE OR REPLACE FUNCTION public.sync_push(p_table text, p_ops jsonb)
RETURNS TABLE (idx integer, status text, message text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_sub text := auth.jwt() ->> 'sub';
  v_pk text;
  v_rel regclass;
  v_guard text := '';
  v_op jsonb;
  v_row jsonb;
  v_cols text;
  v_sel text;
  v_set text;
  v_hit boolean;
  v_n integer;
BEGIN
  IF v_sub IS NULL OR v_sub = '' THEN
    RAISE EXCEPTION 'sync_push: request has no authenticated subject'
      USING ERRCODE = '28000';
  END IF;

  v_pk := CASE p_table
    WHEN 'profiles' THEN 'user_id'
    WHEN 'user_active_program' THEN 'user_id'
    WHEN 'user_preferences' THEN 'user_id'
    WHEN 'user_exercises' THEN 'id'
    WHEN 'user_templates' THEN 'id'
    WHEN 'user_template_exercises' THEN 'id'
    WHEN 'user_programs' THEN 'id'
    WHEN 'user_program_workouts' THEN 'id'
    WHEN 'workout_logs' THEN 'id'
    WHEN 'set_entries' THEN 'id'
    WHEN 'workout_photos' THEN 'id'
    WHEN 'bodyweight_entries' THEN 'id'
    WHEN 'body_measurements' THEN 'id'
  END;
  IF v_pk IS NULL THEN
    RAISE EXCEPTION 'sync_push: unknown table %', p_table USING ERRCODE = '22023';
  END IF;
  v_rel := format('public.%I', p_table)::regclass;

  -- Never clobber a named cloud profile with an empty local placeholder
  -- (fresh install / post-wipe device before onboarding).
  IF p_table = 'profiles' THEN
    v_guard := ' AND NOT (btrim(coalesce(excluded.name, '''')) = '''''
      || ' AND NOT coalesce(excluded.onboarding_completed, false)'
      || ' AND (btrim(t.name) <> '''' OR t.onboarding_completed))';
  END IF;

  FOR idx, v_op IN
    SELECT (e.ord - 1)::integer, e.value
    FROM jsonb_array_elements(coalesce(p_ops, '[]'::jsonb)) WITH ORDINALITY AS e(value, ord)
  LOOP
    status := NULL;
    message := NULL;
    BEGIN
      v_row := coalesce(v_op -> 'row', '{}'::jsonb) || jsonb_build_object('user_id', v_sub);
      IF v_row ->> v_pk IS NULL THEN
        RAISE EXCEPTION 'missing %', v_pk USING ERRCODE = '22023';
      END IF;
      IF v_row ->> 'updated_at' IS NULL THEN
        RAISE EXCEPTION 'missing updated_at' USING ERRCODE = '22023';
      END IF;

      IF coalesce(v_op ->> 'op', 'upsert') = 'delete' THEN
        EXECUTE format(
          'UPDATE %1$s AS t
             SET deleted_at = coalesce(r.deleted_at, r.updated_at), updated_at = r.updated_at
             FROM jsonb_populate_record(NULL::%1$s, $1) AS r
             WHERE t.%2$I = r.%2$I AND r.updated_at > t.updated_at',
          v_rel, v_pk) USING v_row;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n > 0 THEN
          status := 'applied';
        ELSE
          EXECUTE format(
            'SELECT EXISTS (SELECT 1 FROM %1$s AS t, jsonb_populate_record(NULL::%1$s, $1) AS r
               WHERE t.%2$I = r.%2$I)',
            v_rel, v_pk) INTO v_hit USING v_row;
          status := CASE WHEN v_hit THEN 'stale' ELSE 'absent' END;
        END IF;
      ELSE
        SELECT
          string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum),
          string_agg('r.' || quote_ident(a.attname), ', ' ORDER BY a.attnum),
          string_agg(
            CASE WHEN a.attname <> v_pk
              THEN quote_ident(a.attname) || ' = excluded.' || quote_ident(a.attname) END,
            ', ' ORDER BY a.attnum)
        INTO v_cols, v_sel, v_set
        FROM pg_attribute AS a
        WHERE a.attrelid = v_rel AND a.attnum > 0 AND NOT a.attisdropped
          AND v_row ? a.attname::text;

        v_hit := NULL;
        EXECUTE format(
          'INSERT INTO %1$s AS t (%2$s)
             SELECT %3$s FROM jsonb_populate_record(NULL::%1$s, $1) AS r
           ON CONFLICT (%4$I) DO UPDATE SET %5$s
             WHERE excluded.updated_at > t.updated_at%6$s
           RETURNING true',
          v_rel, v_cols, v_sel, v_pk, v_set, v_guard) INTO v_hit USING v_row;
        status := CASE WHEN v_hit THEN 'applied' ELSE 'stale' END;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      status := 'error';
      message := SQLSTATE || ': ' || SQLERRM;
    END;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_push(text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sync_push(text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.sync_push(text, jsonb) TO authenticated;

-- Make PostgREST see the new function without a restart.
NOTIFY pgrst, 'reload schema';

-- Tombstone GC (run periodically via Edge Function / cron after 90 days):
-- DELETE FROM set_entries WHERE deleted_at IS NOT NULL AND deleted_at < now() - interval '90 days';
-- (and similarly for other sync tables, children before parents).
