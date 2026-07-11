create table if not exists public.pm_agent_outcomes (
  id text primary key,
  ticker text,
  status text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pm_agent_outcomes_ticker_created_at_idx
  on public.pm_agent_outcomes (ticker, created_at desc);

create index if not exists pm_agent_outcomes_status_updated_at_idx
  on public.pm_agent_outcomes (status, updated_at desc);

alter table public.pm_agent_outcomes enable row level security;
