create table if not exists public.pm_competition_rounds (
  id text primary key,
  ticker text,
  status text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pm_competition_rounds_status_created_at_idx
  on public.pm_competition_rounds (status, created_at desc);

create index if not exists pm_competition_rounds_ticker_idx
  on public.pm_competition_rounds (ticker);

comment on table public.pm_competition_rounds is
  'Stock-picking competition rounds. Each row = one sector run. Payload includes sector, candidates, committee verdict, winner ticker, entry price, entry date, and the per-candidate research snapshots.';
