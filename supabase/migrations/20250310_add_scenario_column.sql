-- Ensure scenario column exists on public.models

alter table if exists public.models
  add column if not exists scenario text;

comment on column public.models.scenario is 'Active scenario selected by the user when creating the model (e.g., BASE, BULLISH, BEARISH).';
