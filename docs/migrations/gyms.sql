-- Gym profiles (#243). Additive and idempotent: safe to re-run.
-- Mirrors body_measurements in supabase/sync-schema.sql (uuid id, Clerk
-- user_id, client-stamped updated_at for LWW, (user_id, updated_at) pull
-- index, "<table>_own" RLS on the JWT sub). `plates` is a jsonb array of
-- plate sizes in the gym's unit (metric → kg, imperial → lb).
-- Also re-creates sync_push with 'gyms' in its table whitelist (the only
-- change to the function). supabase/sync-schema.sql carries the same edits.
-- Apply before shipping a build that pushes gyms: an older server answers
-- "unknown table gyms" and those outbox rows retry (other tables unaffected).

CREATE TABLE IF NOT EXISTS gyms (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'metric',
  bar_weight DOUBLE PRECISION NOT NULL,
  plates JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_gyms_user_updated
  ON gyms (user_id, updated_at);

ALTER TABLE gyms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "gyms_own" ON gyms;
CREATE POLICY "gyms_own" ON gyms
  FOR ALL TO authenticated
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

-- Workout gym tag: the gym's uuid as plain text (no FK), so a gym tombstone
-- or push order can never block a workout row.
ALTER TABLE workout_logs ADD COLUMN IF NOT EXISTS gym_uuid TEXT;

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
    WHEN 'gyms' THEN 'id'
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
