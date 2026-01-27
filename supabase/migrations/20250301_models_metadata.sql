-- Ensure models table stores scenario, assumptions, results, and file_name

alter table if exists public.models
  add column if not exists file_name text,
  add column if not exists scenario text,
  add column if not exists assumptions jsonb,
  add column if not exists results jsonb;

alter table if exists public.models
  alter column status set default 'created';
