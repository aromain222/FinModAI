alter table if exists public.prompt_model_run_versions
  add column if not exists export_seed_json jsonb not null default '{}'::jsonb;
