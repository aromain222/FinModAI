-- Add export_key column to store R2 object keys for model exports
-- This allows re-signing download URLs after page refresh

-- First, create models table if it doesn't exist
create table if not exists public.models (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  ticker text not null,
  model_type text not null,
  export_key text, -- R2 object key (e.g., "models/{userId}/{modelId}.xlsx")
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add export_key to existing models table if column doesn't exist
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' 
    and table_name = 'models' 
    and column_name = 'export_key'
  ) then
    alter table public.models add column export_key text;
  end if;
end $$;

-- Create indexes
create index if not exists models_user_id_idx on public.models (user_id);
create index if not exists models_created_at_idx on public.models (created_at desc);
create index if not exists models_export_key_idx on public.models (export_key) where export_key is not null;

-- Enable RLS
alter table public.models enable row level security;

-- Policy: Users can only see their own models
create policy "Users can view own models"
  on public.models
  for select
  using (auth.uid() = user_id);

-- Policy: Users can insert their own models
create policy "Users can insert own models"
  on public.models
  for insert
  with check (auth.uid() = user_id);

-- Policy: Users can update their own models
create policy "Users can update own models"
  on public.models
  for update
  using (auth.uid() = user_id);







