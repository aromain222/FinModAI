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
export async function getDemoUniverseTickers(): Promise<DemoUniverseTickerRow[]> {
  const supabase = getSupabaseClient();

  const { data, error } = await supabase
    .from('demo_company_snapshots')
    .select('ticker, company_name, sector, updated_at')
    .not('ticker', 'is', null)
    .order('ticker', { ascending: true });

  if (error) {
    throw new Error(`[demoUniverse] Query failed: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{
    ticker: string;
    company_name: string | null;
    sector: string | null;
    updated_at: string | null;
  }>;

  const seen = new Set<string>();
  const result: DemoUniverseTickerRow[] = [];

  for (const row of rows) {
    const ticker = String(row.ticker ?? '').trim().toUpperCase();
    if (!ticker || seen.has(ticker)) continue;
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
