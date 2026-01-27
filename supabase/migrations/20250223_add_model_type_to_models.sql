-- Ensure model_type column exists on public.models for create pipeline
alter table public.models
  add column if not exists model_type text;

-- Backfill any null model_type values to avoid NOT NULL issues in future
update public.models
set model_type = coalesce(model_type, 'UNKNOWN');
