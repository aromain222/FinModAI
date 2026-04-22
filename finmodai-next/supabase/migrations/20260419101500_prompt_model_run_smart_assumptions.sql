alter table if exists public.prompt_model_run_versions
  add column if not exists smart_assumption_json jsonb;
