create table if not exists public.pm_market_briefs (
  id text primary key,
  ticker text,
  status text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pm_market_briefs_created_at_idx
  on public.pm_market_briefs (created_at desc);

create index if not exists pm_market_briefs_status_created_at_idx
  on public.pm_market_briefs (status, created_at desc);

comment on table public.pm_market_briefs is
  'Scheduled CapitalBase Market Intelligence briefs. Each row is one run from /api/pm/market-brief-cron or a manual trigger. Payload holds the full structured report.';
