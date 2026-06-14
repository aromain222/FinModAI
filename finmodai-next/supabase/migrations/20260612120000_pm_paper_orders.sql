create table if not exists public.pm_paper_orders (
  id text primary key,
  ticker text,
  status text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pm_paper_orders_ticker_created_at_idx
  on public.pm_paper_orders (ticker, created_at desc);

create index if not exists pm_paper_orders_status_created_at_idx
  on public.pm_paper_orders (status, created_at desc);

comment on table public.pm_paper_orders is
  'Simulated agent fills. Each row is a hypothetical buy/sell at a real-time-anchored price, written when the senior investment committee returns an actionable decision. No real broker contact.';
