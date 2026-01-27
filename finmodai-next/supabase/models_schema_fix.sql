-- Idempotent models table hardening for Supabase SQL editor
-- Ensures required columns, defaults, RLS policies, and indexes exist for public.models

begin;

-- 1) Columns and defaults
alter table public.models
    add column if not exists user_id uuid references auth.users(id),
    add column if not exists ticker text,
    add column if not exists model_type text,
    add column if not exists type text default 'dcf',
    add column if not exists company_name text,
    add column if not exists status text default 'created',
    add column if not exists scenario text default 'BASE',
    add column if not exists scenario_adjustment_notes text default '',
    add column if not exists scenario_summary_notes text default '',
    add column if not exists assumptions jsonb default '{}'::jsonb,
    add column if not exists normalized_assumptions jsonb default '{}'::jsonb,
    add column if not exists validation jsonb default '{}'::jsonb,
    add column if not exists units jsonb default '{"currency":"USD","scale":"MILLIONS","shares":"MILLIONS","rates":"DECIMAL"}'::jsonb,
    add column if not exists results jsonb,
    add column if not exists preview jsonb,
    add column if not exists error text,
    add column if not exists r2_key text,
    add column if not exists file_name text,
    add column if not exists created_at timestamptz default now(),
    add column if not exists updated_at timestamptz default now();

-- 2) Backfill to avoid NOT NULL errors and keep legacy compatibility
update public.models
set
  model_type = coalesce(model_type, type),
  type = coalesce(type, model_type, 'dcf'),
  scenario = coalesce(scenario, 'BASE'),
  scenario_adjustment_notes = coalesce(scenario_adjustment_notes, ''),
  scenario_summary_notes = coalesce(scenario_summary_notes, '')
where true;

alter table public.models alter column type set not null;

-- 3) updated_at trigger
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_updated_at on public.models;
create trigger set_updated_at
  before update on public.models
  for each row
  execute function public.set_updated_at();

-- 4) RLS and policies
alter table public.models enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where polname = 'models_select_own' and tablename = 'models'
  ) then
    create policy models_select_own on public.models
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies 
    where polname = 'models_insert_own' and tablename = 'models'
  ) then
    create policy models_insert_own on public.models
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies 
    where polname = 'models_update_own' and tablename = 'models'
  ) then
    create policy models_update_own on public.models
      for update using (auth.uid() = user_id);
  end if;
end
$$;

-- 5) Indexes
create index if not exists models_user_id_idx on public.models (user_id);
create index if not exists models_created_at_desc_idx on public.models (created_at desc);
create index if not exists models_status_idx on public.models (status);

commit;
