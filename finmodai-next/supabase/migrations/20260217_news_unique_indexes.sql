create extension if not exists pgcrypto;

create unique index if not exists uq_news_headlines_url
  on public.news_headlines (url);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'macro_events' and column_name = 'provider'
  ) then
    alter table public.macro_events add column provider text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'macro_events' and column_name = 'published_at'
  ) then
    alter table public.macro_events add column published_at timestamptz;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'macro_events' and column_name = 'description'
  ) then
    alter table public.macro_events add column description text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'macro_events' and column_name = 'event_type'
  ) then
    alter table public.macro_events add column event_type text;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'macro_events' and column_name = 'affected_tickers'
  ) then
    alter table public.macro_events add column affected_tickers text[] default '{}';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'macro_events' and column_name = 'affected_sectors'
  ) then
    alter table public.macro_events add column affected_sectors text[] default '{}';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'macro_events' and column_name = 'importance'
  ) then
    alter table public.macro_events add column importance integer;
  end if;
end $$;

create unique index if not exists uq_macro_events_provider_title_published_at
  on public.macro_events (provider, title, published_at);
