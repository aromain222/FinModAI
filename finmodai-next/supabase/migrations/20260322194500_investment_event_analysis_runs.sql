create table if not exists public.investment_event_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  company_ticker text not null,
  company_name text not null,
  model_type text not null default 'DCF' check (model_type in ('DCF')),
  original_prompt text not null,
  parsed_prompt_context jsonb not null,
  event_category text,
  event_confidence text,
  detected_event jsonb,
  base_assumptions jsonb not null,
  assumption_deltas jsonb not null,
  adjusted_assumptions jsonb not null,
  valuation_outputs jsonb not null,
  generated_summary jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_investment_event_analysis_runs_user_updated
  on public.investment_event_analysis_runs (user_id, updated_at desc);

create index if not exists idx_investment_event_analysis_runs_user_company_updated
  on public.investment_event_analysis_runs (user_id, company_ticker, updated_at desc);

create index if not exists idx_investment_event_analysis_runs_user_event_updated
  on public.investment_event_analysis_runs (user_id, event_category, updated_at desc);

alter table public.investment_event_analysis_runs enable row level security;

drop policy if exists "investment_event_analysis_runs_select_own" on public.investment_event_analysis_runs;
create policy "investment_event_analysis_runs_select_own"
  on public.investment_event_analysis_runs
  for select
  using (auth.uid() = user_id);

drop policy if exists "investment_event_analysis_runs_insert_own" on public.investment_event_analysis_runs;
create policy "investment_event_analysis_runs_insert_own"
  on public.investment_event_analysis_runs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "investment_event_analysis_runs_update_own" on public.investment_event_analysis_runs;
create policy "investment_event_analysis_runs_update_own"
  on public.investment_event_analysis_runs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "investment_event_analysis_runs_delete_own" on public.investment_event_analysis_runs;
create policy "investment_event_analysis_runs_delete_own"
  on public.investment_event_analysis_runs
  for delete
  using (auth.uid() = user_id);
