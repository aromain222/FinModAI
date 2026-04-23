create table if not exists public.financial_extraction_jobs (
  id uuid primary key default gen_random_uuid(),
  lane text not null check (lane in ('public', 'private')),
  stage text not null check (
    stage in (
      'queued',
      'resolving_company',
      'discovering_sources',
      'extracting',
      'normalizing',
      'reconciling',
      'mapping',
      'completed',
      'failed'
    )
  ),
  validation_state text check (validation_state in ('ok', 'warning', 'blocking_error')),
  company_identifier text,
  ticker text,
  company_name text,
  target_period_type text check (target_period_type in ('annual', 'quarterly', 'ltm')),
  target_model_type text,
  file_ids_json jsonb not null default '[]'::jsonb,
  resolved_identity_json jsonb not null default '{}'::jsonb,
  source_artifacts_json jsonb not null default '[]'::jsonb,
  facts_json jsonb not null default '[]'::jsonb,
  validation_findings_json jsonb not null default '[]'::jsonb,
  mapped_model_inputs_json jsonb not null default '{}'::jsonb,
  snapshot_json jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists financial_extraction_jobs_lane_idx
  on public.financial_extraction_jobs (lane, updated_at desc);

create index if not exists financial_extraction_jobs_ticker_idx
  on public.financial_extraction_jobs (ticker, updated_at desc);

create index if not exists financial_extraction_jobs_company_name_idx
  on public.financial_extraction_jobs (company_name, updated_at desc);
