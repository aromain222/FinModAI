-- ============================================================
-- FinModAI Scenario & Forecast Engine schema additions
-- ============================================================
-- Table: scenarios
-- Stores named scenario configurations created by analysts.
-- JSONB assumptions flexible for future model evolution.

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('bull','base','bear','custom')),
  ticker text,
  assumptions jsonb not null,
  created_at timestamptz not null default timezone('utc', now())
);

comment on column public.scenarios.assumptions is 'Flexible JSON of scenario inputs (growth, margins, WACC, etc.)';

-- Table: scenario_results
-- Holds model outputs linked to a scenario snapshot

create table if not exists public.scenario_results (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  dcf_output jsonb not null,
  forecast_output jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

comment on column public.scenario_results.dcf_output is 'Deterministic DCF calculation payload';
comment on column public.scenario_results.forecast_output is 'Projected financial series keyed by frequency/period';

-- Recommended indexes for query performance
create index if not exists idx_scenarios_user on public.scenarios (user_id, created_at desc);
create index if not exists idx_scenario_results_scenario on public.scenario_results (scenario_id);
