-- Per-account AI allowance (the small plug before real account tiers).
-- ai-task multiplies each task's dailyLimit by `multiplier` for listed users.
-- Service role only: no policies, so clients can neither read nor grant.
create table if not exists public.ai_user_tiers (
  user_id text primary key,
  tier text not null default 'tester' check (tier in ('tester', 'staff', 'pro')),
  multiplier integer not null default 5 check (multiplier between 1 and 100),
  note text,
  created_at timestamptz not null default now()
);
alter table public.ai_user_tiers enable row level security;
