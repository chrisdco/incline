-- Generic AI gateway storage for Edge Function `ai-task` (docs/decisions/AI-PLATFORM.md).
-- Replaces the never-deployed coach-narrate.sql. Writes go through the function
-- (service role); users may read their own cached outputs (web companion).

create table if not exists public.ai_task_cache (
  user_id text not null,
  task text not null,
  prompt_version text not null,
  cache_key text not null,
  output jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, task, prompt_version, cache_key)
);

create index if not exists ai_task_cache_created_idx on public.ai_task_cache (created_at);

create table if not exists public.ai_task_rate (
  user_id text not null,
  task text not null,
  window_start timestamptz not null,
  count integer not null default 0,
  primary key (user_id, task)
);

alter table public.ai_task_cache enable row level security;
alter table public.ai_task_rate enable row level security;

drop policy if exists "ai_task_cache_select_own" on public.ai_task_cache;
create policy "ai_task_cache_select_own" on public.ai_task_cache
  for select to authenticated using (user_id = (auth.jwt() ->> 'sub'));

revoke all on table public.ai_task_cache from public, anon, authenticated;
grant select on table public.ai_task_cache to authenticated;
grant select, insert, update, delete on table public.ai_task_cache to service_role;

revoke all on table public.ai_task_rate from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_task_rate to service_role;

-- One atomic step: start a new window or count one more call; false = over quota.
create or replace function public.ai_task_consume(p_user text, p_task text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into public.ai_task_rate as r (user_id, task, window_start, count)
  values (p_user, p_task, now(), 1)
  on conflict (user_id, task) do update
    set window_start = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then now() else r.window_start end,
        count = case when r.window_start <= now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end
  returning count into v_count;
  return v_count <= p_limit;
end;
$$;

revoke all on function public.ai_task_consume(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_task_consume(text, text, integer, integer) to service_role;

-- Keep the cache bounded: outputs older than 30 days are re-generated on demand.
create or replace function public.ai_task_cache_prune()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.ai_task_cache where created_at < now() - interval '30 days';
$$;

revoke all on function public.ai_task_cache_prune() from public, anon, authenticated;
grant execute on function public.ai_task_cache_prune() to service_role;
