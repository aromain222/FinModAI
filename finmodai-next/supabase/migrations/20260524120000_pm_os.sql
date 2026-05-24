create table if not exists public.pm_positions (
  id text primary key,
  ticker text,
  status text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pm_position_theses (
  id text primary key,
  ticker text,
  thesis_status text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pm_thesis_updates (
  id text primary key,
  ticker text,
  thesis_status text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pm_agent_views (
  id text primary key,
  ticker text,
  agent_name text,
  stance text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pm_investment_decisions (
  id text primary key,
  ticker text,
  action text,
  approval_status text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pm_alerts (
  id text primary key,
  ticker text,
  alert_type text,
  severity text,
  should_notify_pm boolean,
  resolved_at timestamptz,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pm_memory (
  id text primary key,
  ticker text,
  memory_type text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pm_weekly_memos (
  id text primary key,
  ticker text,
  week_start date,
  week_end date,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pm_positions_ticker_created_at_idx
  on public.pm_positions (ticker, created_at desc);
create index if not exists pm_positions_status_created_at_idx
  on public.pm_positions (status, created_at desc);

create index if not exists pm_position_theses_ticker_created_at_idx
  on public.pm_position_theses (ticker, created_at desc);
create index if not exists pm_position_theses_status_idx
  on public.pm_position_theses (thesis_status, created_at desc);

create index if not exists pm_thesis_updates_ticker_created_at_idx
  on public.pm_thesis_updates (ticker, created_at desc);

create index if not exists pm_agent_views_ticker_created_at_idx
  on public.pm_agent_views (ticker, created_at desc);
create index if not exists pm_agent_views_stance_idx
  on public.pm_agent_views (stance, created_at desc);

create index if not exists pm_investment_decisions_ticker_created_at_idx
  on public.pm_investment_decisions (ticker, created_at desc);
create index if not exists pm_investment_decisions_approval_idx
  on public.pm_investment_decisions (approval_status, created_at desc);

create index if not exists pm_alerts_active_idx
  on public.pm_alerts (resolved_at, severity, created_at desc);
create index if not exists pm_alerts_ticker_created_at_idx
  on public.pm_alerts (ticker, created_at desc);
create index if not exists pm_alerts_notify_idx
  on public.pm_alerts (should_notify_pm, created_at desc);

create index if not exists pm_memory_type_created_at_idx
  on public.pm_memory (memory_type, created_at desc);

create index if not exists pm_weekly_memos_week_idx
  on public.pm_weekly_memos (week_start desc, week_end desc);
