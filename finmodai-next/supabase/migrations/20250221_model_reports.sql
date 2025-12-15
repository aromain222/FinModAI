-- CapitalBase model reports storage
create table if not exists public.model_reports (
  id uuid primary key default gen_random_uuid(),
  model_run_id uuid,
  ticker text not null,
  model_type text not null,
  title text not null,
  summary_text text,
  pdf_url text,
  created_at timestamptz not null default now()
);

create index if not exists model_reports_ticker_idx on public.model_reports (ticker);
create index if not exists model_reports_type_idx on public.model_reports (model_type);
