-- Model catalog (FOUNDATION-REVIEW G8): which upstream model serves which
-- kind of request, so a new or larger model is a row change plus an eval run,
-- not an app release. Provider keys and base URLs stay in function secrets;
-- a row only names the env slot ('primary' = AI_*, 'fallback' = AI_FALLBACK_*)
-- and optionally overrides that slot's model.
--
-- Public read: nothing here is secret, and the app can show processors and
-- retention on the consent screen from it. Writes: dashboard / SQL only.
--   update public.ai_models set model = 'openai/gpt-oss-120b' where id = 'chat-primary';

create table if not exists public.ai_models (
  id text primary key check (id ~ '^[a-z0-9._-]{1,64}$'),
  provider text not null,                       -- display: 'Groq', 'OpenRouter'
  slot text not null check (slot in ('primary', 'fallback')),
  model text,                                   -- null = the slot's env model
  uses text[] not null default '{}',            -- 'chat', 'task'
  tools boolean not null default false,
  vision boolean not null default false,
  json_schema boolean not null default false,
  context_tokens integer,
  cost_tier smallint not null default 1 check (cost_tier between 0 and 5),
  retention text,                               -- provider data-retention note (feeds consent copy)
  priority integer not null default 100,        -- lower runs first
  enabled boolean not null default true,
  note text,
  updated_at timestamptz not null default now()
);

alter table public.ai_models enable row level security;

drop policy if exists "ai_models readable by everyone" on public.ai_models;
create policy "ai_models readable by everyone" on public.ai_models
  for select to anon, authenticated using (true);

revoke all on table public.ai_models from public, anon, authenticated;
grant select on table public.ai_models to anon, authenticated;
grant select, insert, update, delete on table public.ai_models to service_role;

insert into public.ai_models (id, provider, slot, uses, tools, context_tokens, cost_tier, retention, priority, note)
values
  ('chat-primary', 'Groq', 'primary', '{chat}', true, 131072, 1, 'Groq: not used for training; transient processing', 10, 'Ask chat; model from AI_MODEL until set here'),
  ('chat-fallback', 'OpenRouter', 'fallback', '{chat}', true, null, 1, 'Depends on the routed provider; free tiers may log prompts', 20, 'Ask chat fallback')
on conflict (id) do nothing;
