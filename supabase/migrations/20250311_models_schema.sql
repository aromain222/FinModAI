-- Ensure pgcrypto available for gen_random_uuid
create extension if not exists "pgcrypto";

-- Core models table
create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  ticker text not null,
  company_name text null,
  model_type text not null,
  scenario text not null default 'BASE',
  scenario_adjustment_notes text null,
  assumptions jsonb not null default '{}'::jsonb,
  results jsonb null,
  preview jsonb null,
  status text not null default 'created',
  notes text null,
  r2_key text null,
  file_name text null,
  signed_url text null,
  export_key text null,
  error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Trigger to keep updated_at current
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_models_updated_at on public.models;
create trigger set_models_updated_at
before update on public.models
for each row
execute function public.set_updated_at();

-- Helpful indexes
create index if not exists models_user_created_at_idx on public.models(user_id, created_at desc);
create index if not exists models_ticker_idx on public.models(ticker);
create index if not exists models_model_type_idx on public.models(model_type);

-- Model run stats table
create table if not exists public.model_run_stats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid null references auth.users(id) on delete set null,
  model_id uuid null references public.models(id) on delete set null,
  ticker text not null,
  model_type text not null,
  duration_ms integer not null,
  success boolean not null default true,
  created_at timestamptz not null default now()
);

-- RLS policies
alter table public.models enable row level security;

drop policy if exists "models_select_own" on public.models;
create policy "models_select_own"
  on public.models
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "models_insert_own" on public.models;
create policy "models_insert_own"
  on public.models
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "models_update_own" on public.models;
create policy "models_update_own"
  on public.models
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "models_delete_own" on public.models;
create policy "models_delete_own"
  on public.models
  for delete
  to authenticated
  using (auth.uid() = user_id);
