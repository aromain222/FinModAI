create table if not exists public.model_reports (
  id uuid primary key default gen_random_uuid(),
  model_id uuid not null references public.models(id) on delete cascade,
  user_id uuid not null,
  model_type text not null,
  scenario_hash text not null,
  status text not null default 'queued',
  report_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists model_reports_model_id_idx on public.model_reports (model_id, created_at desc);
create index if not exists model_reports_scenario_hash_idx on public.model_reports (scenario_hash);
create index if not exists model_reports_user_id_idx on public.model_reports (user_id);

alter table public.model_reports enable row level security;

create policy "Users can select own reports" on public.model_reports
  for select using (auth.uid() = user_id);

create policy "Users can insert own reports" on public.model_reports
  for insert with check (auth.uid() = user_id);

create policy "Users can update own reports" on public.model_reports
  for update using (auth.uid() = user_id);
