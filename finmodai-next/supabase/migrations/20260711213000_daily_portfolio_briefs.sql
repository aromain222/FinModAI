create table if not exists public.pm_daily_portfolio_briefs (
  id text primary key,
  ticker text,
  status text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pm_daily_portfolio_briefs_created_at_idx
  on public.pm_daily_portfolio_briefs (created_at desc);

create index if not exists pm_daily_portfolio_briefs_status_created_at_idx
  on public.pm_daily_portfolio_briefs (status, created_at desc);

alter table public.pm_daily_portfolio_briefs enable row level security;
