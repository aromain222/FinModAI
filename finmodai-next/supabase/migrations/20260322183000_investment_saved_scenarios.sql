create table if not exists public.investment_saved_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  company_ticker text not null,
  company_name text not null,
  model_type text not null default 'DCF' check (model_type in ('DCF')),
  scenario_name text not null,
  scenario_key text not null check (scenario_key in ('base', 'bull', 'bear', 'custom')),
  assumptions jsonb not null,
  valuation jsonb not null,
  chart_payload jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create unique index if not exists idx_investment_saved_scenarios_user_company_name
  on public.investment_saved_scenarios (user_id, company_ticker, scenario_name);

create index if not exists idx_investment_saved_scenarios_user_company_updated
  on public.investment_saved_scenarios (user_id, company_ticker, updated_at desc);

create index if not exists idx_investment_saved_scenarios_user_updated
  on public.investment_saved_scenarios (user_id, updated_at desc);

alter table public.investment_saved_scenarios enable row level security;

drop policy if exists "investment_saved_scenarios_select_own" on public.investment_saved_scenarios;
create policy "investment_saved_scenarios_select_own"
  on public.investment_saved_scenarios
  for select
  using (auth.uid() = user_id);

drop policy if exists "investment_saved_scenarios_insert_own" on public.investment_saved_scenarios;
create policy "investment_saved_scenarios_insert_own"
  on public.investment_saved_scenarios
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "investment_saved_scenarios_update_own" on public.investment_saved_scenarios;
create policy "investment_saved_scenarios_update_own"
  on public.investment_saved_scenarios
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "investment_saved_scenarios_delete_own" on public.investment_saved_scenarios;
create policy "investment_saved_scenarios_delete_own"
  on public.investment_saved_scenarios
  for delete
  using (auth.uid() = user_id);
