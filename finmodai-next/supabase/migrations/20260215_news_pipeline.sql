create extension if not exists pgcrypto;

create table if not exists public.news_headlines (
  id uuid primary key default gen_random_uuid(),
  published_at timestamptz not null,
  title text not null,
  source text not null,
  url text not null unique,
  summary text null,
  tickers text[] null,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_news_headlines_published_at_desc
  on public.news_headlines (published_at desc);

create index if not exists idx_news_headlines_url
  on public.news_headlines (url);

create table if not exists public.macro_events (
  id uuid primary key default gen_random_uuid(),
  window text not null,
  created_at timestamptz not null default now(),
  title text not null,
  bias text not null check (bias in ('Risk-On','Risk-Off','Hawkish','Dovish','Neutral')),
  confidence text not null check (confidence in ('low','medium','high')),
  one_line text not null,
  what_happened jsonb not null,
  why_it_matters text not null,
  impacted_assets jsonb not null,
  impacted_sectors jsonb not null,
  source_urls text[] not null default '{}'
);

create index if not exists idx_macro_events_window_created_at_desc
  on public.macro_events (window, created_at desc);

alter table public.news_headlines enable row level security;
alter table public.macro_events enable row level security;

drop policy if exists "news_headlines_read_anon" on public.news_headlines;
create policy "news_headlines_read_anon"
  on public.news_headlines
  for select
  to anon
  using (true);

drop policy if exists "news_headlines_read_authenticated" on public.news_headlines;
create policy "news_headlines_read_authenticated"
  on public.news_headlines
  for select
  to authenticated
  using (true);

drop policy if exists "macro_events_read_anon" on public.macro_events;
create policy "macro_events_read_anon"
  on public.macro_events
  for select
  to anon
  using (true);

drop policy if exists "macro_events_read_authenticated" on public.macro_events;
create policy "macro_events_read_authenticated"
  on public.macro_events
  for select
  to authenticated
  using (true);
