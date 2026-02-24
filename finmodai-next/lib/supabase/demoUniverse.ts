/**
 * Server-side helper: demo universe tickers from public.demo_company_snapshots.
 * Does not read env at import; throws only when getDemoUniverseTickers() is invoked
 * if Supabase credentials are missing.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type DemoUniverseTickerRow = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  updated_at: string | null;
};

type DemoUniverseTickerQueryRow = DemoUniverseTickerRow & {
  revenue_ltm?: number | string | null;
  ebitda_ltm?: number | string | null;
  shares_outstanding?: number | string | null;
  share_price?: number | string | null;
  market_cap?: number | string | null;
};

type GetDemoUniverseTickersOptions = {
  scenarioReady?: boolean;
};

function getSupabaseClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error(
      '[demoUniverse] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Configure env and retry.'
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Returns all demo tickers from public.demo_company_snapshots (ticker, company_name, sector, updated_at),
 * ordered by ticker asc. Use for demo ticker picker; only tickers that exist in the table are returned.
 */
export async function getDemoUniverseTickers(
  options: GetDemoUniverseTickersOptions = {}
): Promise<DemoUniverseTickerRow[]> {
  const { scenarioReady = false } = options;
  const supabase = getSupabaseClient();

  const selectColumns = scenarioReady
    ? 'ticker, company_name, sector, updated_at, revenue_ltm, ebitda_ltm, shares_outstanding, share_price, market_cap'
    : 'ticker, company_name, sector, updated_at';

  const { data, error } = await supabase
    .from('demo_company_snapshots')
    .select(selectColumns)
    .not('ticker', 'is', null)
    .order('ticker', { ascending: true });

  if (error) {
    throw new Error(`[demoUniverse] Query failed: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as DemoUniverseTickerQueryRow[];

  const seen = new Set<string>();
  const result: DemoUniverseTickerRow[] = [];

  for (const row of rows) {
    const ticker = String(row.ticker ?? '').trim().toUpperCase();
    if (!ticker || seen.has(ticker)) continue;

    if (scenarioReady && !isScenarioReadyRow(row)) {
      continue;
    }

    seen.add(ticker);
    result.push({
      ticker,
      company_name: row.company_name != null ? String(row.company_name) : null,
      sector: row.sector != null ? String(row.sector).trim() || null : null,
      updated_at: row.updated_at != null ? String(row.updated_at) : null,
    });
  }

  return result;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isScenarioReadyRow(row: DemoUniverseTickerQueryRow): boolean {
  const revenue = toFiniteNumber(row.revenue_ltm);
  const ebitda = toFiniteNumber(row.ebitda_ltm);
  const shares = toFiniteNumber(row.shares_outstanding);
  const price = toFiniteNumber(row.share_price);
  const marketCap = toFiniteNumber(row.market_cap);

  const hasOperatingBase = !!revenue && revenue > 0 && !!ebitda && ebitda > 0;
  const hasPricingBase = !!shares && shares > 0 && ((!!price && price > 0) || (!!marketCap && marketCap > 0));
  return hasOperatingBase && hasPricingBase;
}
