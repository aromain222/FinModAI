create table if not exists public.positions (
  id text primary key,
  ticker text not null,
  direction text not null check (direction in ('LONG', 'SHORT')),
  entry_price numeric not null,
  target_price numeric,
  stop_loss numeric,
  size_pct numeric not null check (size_pct >= 0 and size_pct <= 10),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  horizon text,
  status text not null default 'PENDING' check (status in ('PENDING', 'OPEN', 'CLOSED')),
  exit_price numeric,
  result text check (result in ('WIN', 'LOSS')),
  notes text,
  created_at timestamptz not null default now(),
  opened_at timestamptz,
  closed_at timestamptz
);

create index if not exists positions_status_created_at_idx
  on public.positions (status, created_at desc);

create index if not exists positions_ticker_created_at_idx
  on public.positions (ticker, created_at desc);
