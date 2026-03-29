create table if not exists public.earnings_packages (
  id uuid primary key default gen_random_uuid(),
  package_key text not null unique,
  ticker text not null,
  company_name text,
  fiscal_period text not null default '',
  fiscal_year integer,
  report_end_date text not null default '',
  filed_at timestamptz,
  quarter_data jsonb not null default '{}'::jsonb,
  annual_data jsonb not null default '{}'::jsonb,
  commentary_data jsonb not null default '{}'::jsonb,
  source_metadata jsonb not null default '{}'::jsonb,
  raw_payload jsonb not null default '{}'::jsonb,
  last_fetched_at timestamptz not null default now(),
  freshness_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists earnings_packages_ticker_idx
  on public.earnings_packages (ticker);

create index if not exists earnings_packages_ticker_period_idx
  on public.earnings_packages (ticker, fiscal_period, fiscal_year);

create index if not exists earnings_packages_latest_idx
  on public.earnings_packages (ticker, last_fetched_at desc);

create table if not exists public.earnings_training_queue (
  id uuid primary key default gen_random_uuid(),
  earnings_package_id uuid not null references public.earnings_packages(id) on delete cascade,
  review_status text not null default 'pending_review',
  ingestion_status text not null default 'not_imported',
  reason_codes jsonb not null default '[]'::jsonb,
  notes text,
  source_type text not null default 'earnings_package',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (earnings_package_id)
);

create index if not exists earnings_training_queue_review_idx
  on public.earnings_training_queue (review_status, ingestion_status, created_at desc);
