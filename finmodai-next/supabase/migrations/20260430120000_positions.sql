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
  status text not null default 'open' check (status in ('open', 'closed')),
  exit_price numeric,
  notes text,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists positions_status_created_at_idx
  on public.positions (status, created_at desc);

create index if not exists positions_ticker_created_at_idx
  on public.positions (ticker, created_at desc);
