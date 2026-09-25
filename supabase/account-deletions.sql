-- Account deletion with a 30-day grace period (free-tier design).
-- Idempotent: safe to re-run.
--
-- Model: scheduling is self-serve (RLS), purge is privileged (cron route).
-- The CHECK constraint caps the window so clients cannot forge it; the app
-- never UPDATEs these rows (immutable window), cancel = DELETE.
CREATE TABLE IF NOT EXISTS account_deletions (
  user_id TEXT PRIMARY KEY,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  purge_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT purge_window CHECK (purge_at > requested_at AND purge_at <= requested_at + INTERVAL '31 days')
);

ALTER TABLE account_deletions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "account_deletions_select_own" ON account_deletions;
CREATE POLICY "account_deletions_select_own" ON account_deletions
  FOR SELECT TO authenticated
  USING (user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "account_deletions_insert_own" ON account_deletions;
CREATE POLICY "account_deletions_insert_own" ON account_deletions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.jwt() ->> 'sub');

DROP POLICY IF EXISTS "account_deletions_delete_own" ON account_deletions;
CREATE POLICY "account_deletions_delete_own" ON account_deletions
  FOR DELETE TO authenticated
  USING (user_id = auth.jwt() ->> 'sub');
