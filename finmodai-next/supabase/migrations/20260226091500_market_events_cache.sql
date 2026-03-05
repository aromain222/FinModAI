create extension if not exists pgcrypto;

create table if not exists public.market_events (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  title text not null,
  event_type text not null check (
    event_type in (
      'Geopolitics',
      'Macro',
      'CentralBank',
      'Conflict',
      'Sanctions',
      'Elections',
      'EarningsMegaCap',
      'SystemicRisk',
      'RegulatoryShock'
    )
  ),
  status text not null default 'developing' check (status in ('developing', 'confirmed', 'resolved')),
  impact_targets jsonb not null,
  bias text not null check (bias in ('RiskOn', 'RiskOff', 'Mixed')),
  horizon text not null check (horizon in ('Immediate', 'NearTerm', 'Structural')),
  severity int not null check (severity between 0 and 100),
  confidence int not null check (confidence between 0 and 100),
  summary_bullets jsonb not null,
  watch_next jsonb not null,
  key_entities jsonb not null default '[]'::jsonb,
  first_seen_at timestamptz not null,
  last_updated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.market_event_sources (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.market_events(id) on delete cascade,
  source_name text,
  url text not null,
  published_at timestamptz not null,
  title text,
  snippet text,
  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'market_events' and column_name = 'key_entities'
  ) then
    alter table public.market_events add column key_entities jsonb not null default '[]'::jsonb;
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'market_event_sources' and column_name = 'snippet'
  ) then
    alter table public.market_event_sources add column snippet text;
  end if;
end $$;

create unique index if not exists uq_market_event_sources_event_url
  on public.market_event_sources (event_id, url);

create index if not exists idx_market_events_last_updated_at_desc
  on public.market_events (last_updated_at desc);

create index if not exists idx_market_events_severity_desc
  on public.market_events (severity desc);

create index if not exists idx_market_event_sources_event_id
  on public.market_event_sources (event_id);

alter table public.market_events enable row level security;
alter table public.market_event_sources enable row level security;

drop policy if exists "market_events_read_anon" on public.market_events;
create policy "market_events_read_anon"
  on public.market_events
  for select
  to anon
  using (true);

drop policy if exists "market_events_read_authenticated" on public.market_events;
create policy "market_events_read_authenticated"
  on public.market_events
  for select
  to authenticated
  using (true);

drop policy if exists "market_event_sources_read_anon" on public.market_event_sources;
create policy "market_event_sources_read_anon"
  on public.market_event_sources
  for select
  to anon
  using (true);

drop policy if exists "market_event_sources_read_authenticated" on public.market_event_sources;
create policy "market_event_sources_read_authenticated"
  on public.market_event_sources
  for select
  to authenticated
  using (true);

drop policy if exists "market_events_service_insert" on public.market_events;
create policy "market_events_service_insert"
  on public.market_events
  for insert
  to service_role
  with check (true);

drop policy if exists "market_events_service_update" on public.market_events;
create policy "market_events_service_update"
  on public.market_events
  for update
  to service_role
  using (true)
  with check (true);

drop policy if exists "market_event_sources_service_insert" on public.market_event_sources;
create policy "market_event_sources_service_insert"
  on public.market_event_sources
  for insert
  to service_role
  with check (true);

drop policy if exists "market_event_sources_service_update" on public.market_event_sources;
create policy "market_event_sources_service_update"
  on public.market_event_sources
  for update
  to service_role
  using (true)
  with check (true);
