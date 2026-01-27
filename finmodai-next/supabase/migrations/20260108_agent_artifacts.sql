-- ============================================================
-- CapitalBase AI Output Agent artifact persistence
-- ============================================================

create table if not exists public.agent_artifacts (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  type text not null check (
    type in (
      'FORECAST_BLUEPRINT',
      'SCENARIO_ENGINE',
      'DCF_DRIVERS',
      'MARKET_IMPACT_BRIEF',
      'SQL_QUERY',
      'PYTHON_NOTEBOOK',
      'SLIDE_OUTLINE',
      'CHECKLIST'
    )
  ),
  title text not null,
  summary text not null,
  artifact_json jsonb not null,
  prompt text not null
);

create index if not exists idx_agent_artifacts_user_created on public.agent_artifacts (user_id, created_at desc);
create index if not exists idx_agent_artifacts_type_created on public.agent_artifacts (type, created_at desc);

alter table public.agent_artifacts enable row level security;

create policy "Users can select own agent artifacts" on public.agent_artifacts
  for select using (auth.uid() = user_id);

create policy "Users can insert own agent artifacts" on public.agent_artifacts
  for insert with check (auth.uid() = user_id);

create policy "Users can update own agent artifacts" on public.agent_artifacts
  for update using (auth.uid() = user_id);

create policy "Users can delete own agent artifacts" on public.agent_artifacts
  for delete using (auth.uid() = user_id);
