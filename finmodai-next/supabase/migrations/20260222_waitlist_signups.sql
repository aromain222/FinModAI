-- Waitlist signups for marketing landing early access
create table if not exists public.waitlist_signups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  created_at timestamptz not null default now()
);

create index if not exists waitlist_signups_email_idx on public.waitlist_signups (email);
create index if not exists waitlist_signups_created_at_idx on public.waitlist_signups (created_at desc);

-- Allow anon/authenticated insert for public waitlist form
alter table public.waitlist_signups enable row level security;

create policy "Allow insert for waitlist"
  on public.waitlist_signups for insert
  to anon, authenticated
  with check (true);

-- Optional: restrict read to service role only (no public read)
create policy "Service role can read waitlist"
  on public.waitlist_signups for select
  to service_role
  using (true);
