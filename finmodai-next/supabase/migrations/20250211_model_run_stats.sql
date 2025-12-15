-- CapitalBase model run metrics
create table if not exists public.model_run_stats (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  model_type text not null,
  duration_ms integer not null,
  success boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists model_run_stats_ticker_type_idx
  on public.model_run_stats (ticker, model_type, created_at desc);
