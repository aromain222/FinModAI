-- Ensure every model row is owned by a specific user and RLS policies can enforce it

alter table if exists public.models
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists scenario_summary_notes text,
  add column if not exists updated_at timestamptz default now();

-- Allow legacy "type" column to remain nullable so inserts don't fail
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'models'
      and column_name = 'type'
  ) then
    begin
      alter table public.models alter column type drop not null;
    exception
      when others then null;
    end;
  end if;
end;
$$;

-- Backfill any existing NULL user_id values with the first available auth user (dev-safe fallback)
with fallback_user as (
  select id
  from auth.users
  order by created_at
  limit 1
)
update public.models m
set user_id = fallback_user.id
from fallback_user
where m.user_id is null
  and fallback_user.id is not null;

alter table if exists public.models
  alter column user_id set not null;

-- Auto-populate user_id from the authenticated session when inserts omit it
create or replace function public.set_models_user_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  if new.user_id is null then
    raise exception 'user_id is required for models';
  end if;

  return new;
end;
$$;

drop trigger if exists set_models_user_id on public.models;
create trigger set_models_user_id
before insert on public.models
for each row
execute function public.set_models_user_id();

-- Keep updated_at fresh on every write
create or replace function public.set_models_updated_at()
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
execute function public.set_models_updated_at();

-- RLS policies to enforce ownership for select/insert/update
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
