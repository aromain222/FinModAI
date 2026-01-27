-- Ensure models table enforces row level security with sane defaults
alter table if exists public.models enable row level security;

drop policy if exists "models_insert_own" on public.models;
create policy "models_insert_own"
on public.models
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "models_select_own" on public.models;
create policy "models_select_own"
on public.models
for select
to authenticated
using (user_id = auth.uid());
