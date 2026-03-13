create table if not exists public.prompt_model_runs (
  id uuid primary key default gen_random_uuid(),
  surface text not null,
  session_id text,
  prompt text not null,
  model_type text not null,
  company_name text,
  ticker text,
  status text not null default 'previewed',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists prompt_model_runs_surface_idx
  on public.prompt_model_runs (surface);
create index if not exists prompt_model_runs_session_idx
  on public.prompt_model_runs (session_id);
create index if not exists prompt_model_runs_model_company_idx
  on public.prompt_model_runs (model_type, company_name, ticker);
create index if not exists prompt_model_runs_created_at_desc_idx
  on public.prompt_model_runs (created_at desc);

drop trigger if exists prompt_model_runs_set_updated_at on public.prompt_model_runs;

create trigger prompt_model_runs_set_updated_at
before update on public.prompt_model_runs
for each row
execute function public.set_updated_at();

create table if not exists public.prompt_model_run_versions (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.prompt_model_runs(id) on delete cascade,
  version_number int not null,
  status text not null default 'previewed',
  assumptions_json jsonb not null default '{}'::jsonb,
  defaults_json jsonb not null default '{}'::jsonb,
  extracted_inputs_json jsonb not null default '{}'::jsonb,
  provenance_json jsonb not null default '{}'::jsonb,
  comparison_json jsonb,
  workbook_filename text,
  created_at timestamptz not null default now(),
  constraint prompt_model_run_versions_run_id_version_number_key unique (run_id, version_number)
);

create index if not exists prompt_model_run_versions_run_id_idx
  on public.prompt_model_run_versions (run_id);
create index if not exists prompt_model_run_versions_created_at_desc_idx
  on public.prompt_model_run_versions (created_at desc);
