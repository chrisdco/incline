-- MCP access tokens (docs/decisions/AI-PLATFORM.md §3). A personal access token
-- lets an MCP client (Claude Code, Claude Desktop, Cursor…) read the user's
-- training data and create routines through the `incline-mcp` edge function.
-- Only the SHA-256 of a token is stored; the token itself is shown once, in
-- the app. Service-role only: no policies, so clients can't read or forge rows.
-- Kill switch: ai_flags key `actor:mcp:*` (every client) or `actor:mcp:<label>`.

create table if not exists public.mcp_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  token_hash text not null unique,
  label text not null default 'MCP client' check (char_length(label) between 1 and 60),
  scopes text[] not null default '{read,write}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

create index if not exists idx_mcp_tokens_user on public.mcp_tokens (user_id) where revoked_at is null;

alter table public.mcp_tokens enable row level security;
revoke all on public.mcp_tokens from anon, authenticated;
