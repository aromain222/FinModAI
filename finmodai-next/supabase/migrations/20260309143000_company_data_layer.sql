create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  ticker text not null,
  name text not null,
  sector text,
  industry text,
  country text,
  exchange text,
  company_type text,
  is_saas boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_ticker_key unique (ticker)
);

create index if not exists companies_name_idx on public.companies (name);
create index if not exists companies_name_lower_idx on public.companies ((lower(name)));
create index if not exists companies_company_type_idx on public.companies (company_type);
create index if not exists companies_is_saas_idx on public.companies (is_saas);

drop trigger if exists companies_set_updated_at on public.companies;

create trigger companies_set_updated_at
before update on public.companies
for each row
execute function public.set_updated_at();

create table if not exists public.company_identifiers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  ticker text,
  composite_figi text,
  share_class_figi text,
  cik text,
  isin text,
  cusip text,
  source text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists company_identifiers_company_id_source_key
  on public.company_identifiers (company_id, source);
create index if not exists company_identifiers_company_id_idx on public.company_identifiers (company_id);
create index if not exists company_identifiers_composite_figi_idx on public.company_identifiers (composite_figi);
create index if not exists company_identifiers_cik_idx on public.company_identifiers (cik);
create index if not exists company_identifiers_ticker_idx on public.company_identifiers (ticker);
create index if not exists company_identifiers_isin_idx on public.company_identifiers (isin);
create index if not exists company_identifiers_cusip_idx on public.company_identifiers (cusip);

create table if not exists public.company_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  as_of_date date not null,
  period_type text not null,
  currency text not null default 'USD',
  revenue_ltm numeric,
  gross_profit_ltm numeric,
  ebitda_ltm numeric,
  ebit_ltm numeric,
  net_income_ltm numeric,
  cash numeric,
  total_debt numeric,
  shares_outstanding numeric,
  market_cap numeric,
  source text not null,
  source_priority int not null default 1,
  created_at timestamptz not null default now(),
  constraint company_snapshots_company_id_as_of_date_period_type_source_key unique (company_id, as_of_date, period_type, source)
);

create index if not exists company_snapshots_company_id_idx on public.company_snapshots (company_id);
create index if not exists company_snapshots_as_of_date_desc_idx on public.company_snapshots (as_of_date desc);
create index if not exists company_snapshots_company_id_as_of_date_desc_idx on public.company_snapshots (company_id, as_of_date desc, source_priority desc);

create table if not exists public.company_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume numeric,
  source text not null,
  created_at timestamptz not null default now(),
  constraint company_prices_company_id_date_key unique (company_id, date)
);

create index if not exists company_prices_company_id_idx on public.company_prices (company_id);
create index if not exists company_prices_date_desc_idx on public.company_prices (date desc);
create index if not exists company_prices_company_id_date_desc_idx on public.company_prices (company_id, date desc);

create table if not exists public.company_kpis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  as_of_date date not null,
  arr numeric,
  net_retention numeric,
  gross_retention numeric,
  customers numeric,
  arpu numeric,
  gross_margin numeric,
  source text not null,
  confidence text,
  created_at timestamptz not null default now(),
  constraint company_kpis_company_id_as_of_date_source_key unique (company_id, as_of_date, source)
);

create index if not exists company_kpis_company_id_idx on public.company_kpis (company_id);
create index if not exists company_kpis_company_id_as_of_date_desc_idx on public.company_kpis (company_id, as_of_date desc);
