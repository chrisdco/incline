-- App releases (docs/decisions/RELEASES.md): one row per finished EAS build
-- on a shareable profile, written by the EAS build webhook (app-release
-- edge function, service role). Public read: it is the same info as the
-- install page. Feeds the "always latest" share link and, later, the
-- in-app "What's new" cards.
CREATE TABLE IF NOT EXISTS app_releases (
  id UUID PRIMARY KEY,                       -- EAS build id
  platform TEXT NOT NULL CHECK (platform IN ('android', 'ios')),
  profile TEXT NOT NULL CHECK (char_length(profile) <= 40),
  channel TEXT CHECK (char_length(channel) <= 40),
  app_version TEXT NOT NULL CHECK (char_length(app_version) <= 40),
  build_version TEXT CHECK (char_length(build_version) <= 40),
  runtime_version TEXT CHECK (char_length(runtime_version) <= 80),
  git_commit TEXT CHECK (char_length(git_commit) <= 64),
  title TEXT NOT NULL DEFAULT '' CHECK (char_length(title) <= 200),
  -- What's new: short user-facing lines, edited after the fact if needed.
  notes JSONB NOT NULL DEFAULT '[]'::jsonb,
  page_url TEXT NOT NULL CHECK (page_url ~ '^https://expo\.dev/'),
  artifact_url TEXT CHECK (artifact_url ~ '^https://expo\.dev/'),
  artifact_expires_at TIMESTAMPTZ,
  -- Permanent copy (GitHub Release asset): EAS internal artifacts expire.
  mirror_url TEXT CHECK (mirror_url ~ '^https://github\.com/chrisdco/incline/releases/'),
  completed_at TIMESTAMPTZ NOT NULL,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS app_releases_latest ON app_releases (platform, completed_at DESC) WHERE NOT hidden;

ALTER TABLE app_releases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_releases_read" ON app_releases;
CREATE POLICY "app_releases_read" ON app_releases
  FOR SELECT TO anon, authenticated
  USING (NOT hidden);
