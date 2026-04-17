alter table if exists public.prompt_model_run_versions
  add column if not exists event_context_json jsonb,
  add column if not exists event_adjustment_json jsonb;
