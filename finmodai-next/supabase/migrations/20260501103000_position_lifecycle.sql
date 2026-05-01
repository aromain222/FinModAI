alter table public.positions
  add column if not exists opened_at timestamptz,
  add column if not exists result text;

update public.positions
set status = case
  when status = 'open' then 'OPEN'
  when status = 'closed' then 'CLOSED'
  when status = 'pending' then 'PENDING'
  else status
end;

update public.positions
set opened_at = created_at
where status = 'OPEN' and opened_at is null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'positions_status_check'
      and conrelid = 'public.positions'::regclass
  ) then
    alter table public.positions drop constraint positions_status_check;
  end if;
end $$;

alter table public.positions
  alter column status set default 'PENDING';

alter table public.positions
  add constraint positions_status_check
  check (status in ('PENDING', 'OPEN', 'CLOSED'));

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'positions_result_check'
      and conrelid = 'public.positions'::regclass
  ) then
    alter table public.positions
      add constraint positions_result_check
      check (result in ('WIN', 'LOSS'));
  end if;
end $$;
