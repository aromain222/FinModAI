create table if not exists public.news_enrichments (
  url text primary key,
  title text not null,
  ai_summary text null,
  why_it_matters text null,
  affected_tickers text[] null,
  affected_sectors text[] null,
  confidence text null check (confidence in ('high', 'medium', 'low')),
  updated_at timestamptz not null default now()
);

create index if not exists idx_news_enrichments_updated_at_desc
  on public.news_enrichments (updated_at desc);

alter table public.news_enrichments enable row level security;

drop policy if exists "news_enrichments_read_anon" on public.news_enrichments;
create policy "news_enrichments_read_anon"
  on public.news_enrichments
  for select
  to anon
  using (true);

drop policy if exists "news_enrichments_read_authenticated" on public.news_enrichments;
create policy "news_enrichments_read_authenticated"
  on public.news_enrichments
  for select
  to authenticated
  using (true);
