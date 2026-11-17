-- Single-use Play Integrity nonces (FOUNDATION-REVIEW G2).
-- The AI edge functions insert each verified request's nonce; a replayed
-- token conflicts on the primary key and is graded unverified. Rows older
-- than a day are pruned by the functions. Service role only: no policies.
create table if not exists public.ai_integrity_nonces (
  nonce text primary key,
  created_at timestamptz not null default now()
);
create index if not exists ai_integrity_nonces_created_at on public.ai_integrity_nonces (created_at);
alter table public.ai_integrity_nonces enable row level security;
