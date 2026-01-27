-- ============================================================
-- CapitalBase Model Versioning & Audit Trail
-- ============================================================
-- Table: model_versions
-- Stores version snapshots of MODEL_AND_VIZ artifacts for comparison, restoration, and audit

create table if not exists public.model_versions (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid not null references public.agent_artifacts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  label text null,
  notes text null,
  base_inputs jsonb not null default '{}'::jsonb,
  scenario_overrides jsonb null,
  formula_overrides jsonb null,
  derived_key_outputs jsonb not null default '{}'::jsonb
);

comment on column public.model_versions.artifact_id is 'References the agent_artifacts.id for MODEL_AND_VIZ type';
comment on column public.model_versions.base_inputs is 'Snapshot of model.inputs array from ModelAndVizArtifact';
comment on column public.model_versions.scenario_overrides is 'Any scenario-specific overrides applied';
comment on column public.model_versions.formula_overrides is 'Any formula/equation modifications';
comment on column public.model_versions.derived_key_outputs is 'Small set of headline outputs for quick comparison (e.g., summary values)';

-- Indexes for query performance
create index if not exists idx_model_versions_artifact_created on public.model_versions (artifact_id, created_at desc);
create index if not exists idx_model_versions_user_created on public.model_versions (user_id, created_at desc);

-- RLS policies
alter table public.model_versions enable row level security;

create policy "Users can select own model versions" on public.model_versions
  for select using (auth.uid() = user_id);

create policy "Users can insert own model versions" on public.model_versions
  for insert with check (auth.uid() = user_id);

create policy "Users can update own model versions" on public.model_versions
  for update using (auth.uid() = user_id);

create policy "Users can delete own model versions" on public.model_versions
  for delete using (auth.uid() = user_id);

