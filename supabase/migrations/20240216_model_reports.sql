create table if not exists public.model_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  ticker text not null,
  company_name text,
  model_kind text not null,
  as_of_date timestamptz not null default now(),
  runtime_seconds integer,
  key_outputs jsonb,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists model_reports_ticker_idx on public.model_reports (ticker);
create index if not exists model_reports_user_idx on public.model_reports (user_id);
