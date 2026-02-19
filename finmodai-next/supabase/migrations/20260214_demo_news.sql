-- Demo news tables for Headlines + Event Intelligence panels
-- Source of truth: Supabase (no hardcoded in app layer)

create extension if not exists pgcrypto;

create table if not exists public.demo_macro_events (
  id uuid primary key default gen_random_uuid(),
  event_date date not null,
  title text not null,
  bias text not null,
  confidence text not null,
  one_line text not null,
  what_happened jsonb not null,
  why_it_matters text not null,
  impacted_assets jsonb not null,
  impacted_sectors jsonb not null,
  sources jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.demo_headlines (
  id uuid primary key default gen_random_uuid(),
  published_at timestamptz not null,
  title text not null,
  source text not null,
  url text not null,
  tags jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_demo_macro_events_event_date_desc
  on public.demo_macro_events (event_date desc);

create index if not exists idx_demo_headlines_published_at_desc
  on public.demo_headlines (published_at desc);

alter table public.demo_macro_events enable row level security;
alter table public.demo_headlines enable row level security;

drop policy if exists "demo_macro_events_read_anon" on public.demo_macro_events;
create policy "demo_macro_events_read_anon"
  on public.demo_macro_events
  for select
  to anon
  using (true);

drop policy if exists "demo_macro_events_read_authenticated" on public.demo_macro_events;
create policy "demo_macro_events_read_authenticated"
  on public.demo_macro_events
  for select
  to authenticated
  using (true);

drop policy if exists "demo_headlines_read_anon" on public.demo_headlines;
create policy "demo_headlines_read_anon"
  on public.demo_headlines
  for select
  to anon
  using (true);

drop policy if exists "demo_headlines_read_authenticated" on public.demo_headlines;
create policy "demo_headlines_read_authenticated"
  on public.demo_headlines
  for select
  to authenticated
  using (true);
