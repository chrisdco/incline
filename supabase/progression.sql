-- Progression decisions (docs/decisions/PROGRESSION.md §4). Additive and
-- idempotent: safe to re-run. Same shape as gyms (uuid id, Clerk user_id,
-- client-stamped updated_at for LWW, own-row RLS). Also re-creates sync_push
-- with 'progression_decisions' in its table whitelist. sync-schema.sql
-- carries the same edits.

-- Progression decisions (docs/decisions/PROGRESSION.md §4; supabase/progression.sql)
CREATE TABLE IF NOT EXISTS progression_decisions (
  id UUID PRIMARY KEY,
  user_id TEXT NOT NULL,
  exercise_ref TEXT NOT NULL CHECK (char_length(exercise_ref) <= 200),
  exercise_name TEXT NOT NULL DEFAULT '' CHECK (char_length(exercise_name) <= 120),
  remedy TEXT NOT NULL CHECK (remedy IN ('reset', 'add_set', 'rep_range', 'swap', 'deload', 'keep_going')),
  params JSONB,
  status TEXT NOT NULL CHECK (status IN ('proposed', 'applied', 'declined', 'done', 'reverted')),
  source TEXT NOT NULL CHECK (source ~ '^(coach|user|web|app_ai|mcp:[a-z0-9._-]{1,64})$'),
  rationale TEXT NOT NULL DEFAULT '' CHECK (char_length(rationale) <= 600),
  rule_version TEXT NOT NULL DEFAULT '',
  resume_after_sessions INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_progression_decisions_user_updated
  ON progression_decisions (user_id, updated_at);

ALTER TABLE progression_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "progression_decisions_own" ON progression_decisions;
CREATE POLICY "progression_decisions_own" ON progression_decisions
  FOR ALL TO authenticated
  USING (user_id = (select auth.jwt() ->> 'sub'))
  WITH CHECK (user_id = (select auth.jwt() ->> 'sub'));

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
    WHEN 'progression_decisions' THEN 'id'
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

NOTIFY pgrst, 'reload schema';
