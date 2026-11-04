-- AI kill switches (docs/decisions/AI-PLATFORM.md §5). Public read-only:
-- the app fetches disabled keys once per open (src/ai/flags.ts). Keys are
-- `task:<id>` or `actor:<actor>`; a trailing `*` matches a prefix
-- (`actor:mcp:*`). Flip a switch from the dashboard or SQL:
--   insert into public.ai_flags (key, disabled, note) values ('task:narrate', true, 'bad wording')
--   on conflict (key) do update set disabled = excluded.disabled, note = excluded.note, updated_at = now();

create table if not exists public.ai_flags (
  key text primary key check (key ~ '^(task|actor):[a-z0-9._:*-]{1,96}$'),
  disabled boolean not null default true,
  note text,
  updated_at timestamptz not null default now()
);

alter table public.ai_flags enable row level security;

drop policy if exists "ai_flags readable by everyone" on public.ai_flags;
create policy "ai_flags readable by everyone" on public.ai_flags
  for select to anon, authenticated using (true);

grant select on public.ai_flags to anon, authenticated;
