create table if not exists public.pm_quant_score_snapshots (
  id text primary key,
  ticker text not null,
  analyst_key text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pm_signal_events (
  id text primary key,
  ticker text not null,
  analyst_key text not null,
  status text not null,
  severity text not null,
  should_escalate boolean not null default false,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pm_quant_score_snapshots enable row level security;
alter table public.pm_signal_events enable row level security;

create index if not exists pm_quant_scores_ticker_analyst_time_idx
  on public.pm_quant_score_snapshots (ticker, analyst_key, created_at desc);

create index if not exists pm_quant_scores_analyst_time_idx
  on public.pm_quant_score_snapshots (analyst_key, created_at desc);

create index if not exists pm_signal_events_ticker_time_idx
  on public.pm_signal_events (ticker, created_at desc);

create index if not exists pm_signal_events_escalation_idx
  on public.pm_signal_events (status, should_escalate, severity, created_at desc);
