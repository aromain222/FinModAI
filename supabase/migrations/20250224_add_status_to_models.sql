-- Ensure public.models includes a status column for lifecycle tracking
alter table public.models
  add column if not exists status text default 'created';

-- Backfill missing statuses to maintain consistency
update public.models
set status = coalesce(status, 'created');
