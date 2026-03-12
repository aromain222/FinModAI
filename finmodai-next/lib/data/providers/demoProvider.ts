import { createClient } from '@supabase/supabase-js';
import type { NormalizedFundamentals, NormalizedQuote } from '@/lib/data/types';
import { normalizeDemoQuote, normalizeDemoSnapshot } from '@/lib/demo/normalizeDemoSnapshot';
import { aiFillFinancialData } from '@/lib/aiFillFinancialData';

export type DemoSnapshotRow = {
  ticker: string;
  company_name?: string | null;
  sector?: string | null;
  revenue_ltm?: number | null;
  ebitda_ltm?: number | null;
  net_income_ltm?: number | null;
  cash?: number | null;
  total_debt?: number | null;
  shares_outstanding?: number | null;
  share_price?: number | null;
  market_cap?: number | null;
  enterprise_value?: number | null;
  currency?: string | null;
  units?: string | null;
  as_of_date?: string | null;
  updated_at?: string | null;
  source_map?: Record<string, string> | null;
};

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedLastUpdated: { value: string | null; fetchedAt: number } | null = null;

function getSupabaseClient() {
  const key = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!SUPABASE_URL || !key) {
    throw new Error(
      '[demoProvider] Missing Supabase credentials for demo snapshots. Set SUPABASE_URL and one of SUPABASE_SERVICE_ROLE_KEY/SUPABASE_ANON_KEY/NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false },
  });
}

type StoredCompanyOverlay = {
  companyName: string | null;
  sector: string | null;
  revenueLtm: number | null;
  ebitdaLtm: number | null;
  netIncomeLtm: number | null;
  cash: number | null;
  totalDebt: number | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
  sharePrice: number | null;
  asOfDate: string | null;
  updatedAt: string | null;
  sourceMap: Record<string, string>;
};

async function getStoredCompanyOverlay(ticker: string): Promise<StoredCompanyOverlay | null> {
  const supabase = getSupabaseClient();
  const normalizedTicker = ticker.toUpperCase().trim();

  const companyResult = await supabase.from('companies').select('id, name, sector').eq('ticker', normalizedTicker).maybeSingle();
  if (companyResult.error || !companyResult.data) {
    return null;
  }

  const companyId = companyResult.data.id as string;
  const [snapshotResult, priceResult] = await Promise.all([
    supabase
      .from('company_snapshots')
      .select('*')
      .eq('company_id', companyId)
      .order('as_of_date', { ascending: false })
      .order('source_priority', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('company_prices')
      .select('*')
      .eq('company_id', companyId)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const snapshot = snapshotResult.data as Record<string, unknown> | null;
  const price = priceResult.data as Record<string, unknown> | null;
  if (!snapshot && !price) {
    return null;
  }

  const snapshotSource = typeof snapshot?.source === 'string' ? snapshot.source : 'company_snapshots';
  const priceSource = typeof price?.source === 'string' ? price.source : 'company_prices';
  const sourceMap: Record<string, string> = {};

  if (snapshot?.revenue_ltm != null) sourceMap.revenueLtm = snapshotSource;
  if (snapshot?.ebitda_ltm != null) sourceMap.ebitdaLtm = snapshotSource;
  if (snapshot?.net_income_ltm != null) sourceMap.netIncomeLtm = snapshotSource;
  if (snapshot?.cash != null) sourceMap.cash = snapshotSource;
  if (snapshot?.total_debt != null) sourceMap.totalDebt = snapshotSource;
  if (snapshot?.shares_outstanding != null) sourceMap.sharesOutstanding = snapshotSource;
  if (snapshot?.market_cap != null) sourceMap.marketCap = snapshotSource;
  if (price?.close != null) sourceMap.sharePrice = priceSource;

  return {
    companyName: (companyResult.data.name as string | null) ?? null,
    sector: (companyResult.data.sector as string | null) ?? null,
    revenueLtm: typeof snapshot?.revenue_ltm === 'number' ? snapshot.revenue_ltm : Number(snapshot?.revenue_ltm ?? NaN) || null,
    ebitdaLtm: typeof snapshot?.ebitda_ltm === 'number' ? snapshot.ebitda_ltm : Number(snapshot?.ebitda_ltm ?? NaN) || null,
    netIncomeLtm: typeof snapshot?.net_income_ltm === 'number' ? snapshot.net_income_ltm : Number(snapshot?.net_income_ltm ?? NaN) || null,
    cash: typeof snapshot?.cash === 'number' ? snapshot.cash : Number(snapshot?.cash ?? NaN) || null,
    totalDebt: typeof snapshot?.total_debt === 'number' ? snapshot.total_debt : Number(snapshot?.total_debt ?? NaN) || null,
    sharesOutstanding:
      typeof snapshot?.shares_outstanding === 'number'
        ? snapshot.shares_outstanding
        : Number(snapshot?.shares_outstanding ?? NaN) || null,
    marketCap: typeof snapshot?.market_cap === 'number' ? snapshot.market_cap : Number(snapshot?.market_cap ?? NaN) || null,
    sharePrice: typeof price?.close === 'number' ? price.close : Number(price?.close ?? NaN) || null,
    asOfDate: (snapshot?.as_of_date as string | null) ?? (price?.date as string | null) ?? null,
    updatedAt: (snapshot?.created_at as string | null) ?? (price?.created_at as string | null) ?? null,
    sourceMap,
  };
}

function mergeDemoWithStored(row: DemoSnapshotRow, stored: StoredCompanyOverlay | null): DemoSnapshotRow {
  if (!stored) return row;

  const sharePrice = stored.sharePrice ?? row.share_price ?? null;
  const marketCap = stored.marketCap ?? row.market_cap ?? null;
  const sharesOutstanding = stored.sharesOutstanding ?? row.shares_outstanding ?? null;
  const totalDebt = stored.totalDebt ?? row.total_debt ?? null;
  const cash = stored.cash ?? row.cash ?? null;
  const enterpriseValue =
    marketCap != null && totalDebt != null && cash != null ? marketCap + totalDebt - cash : row.enterprise_value ?? null;

  return {
    ...row,
    company_name: stored.companyName ?? row.company_name ?? null,
    sector: stored.sector ?? row.sector ?? null,
    revenue_ltm: stored.revenueLtm ?? row.revenue_ltm ?? null,
    ebitda_ltm: stored.ebitdaLtm ?? row.ebitda_ltm ?? null,
    net_income_ltm: stored.netIncomeLtm ?? row.net_income_ltm ?? null,
    cash,
    total_debt: totalDebt,
    shares_outstanding: sharesOutstanding,
    share_price: sharePrice,
    market_cap: marketCap,
    enterprise_value: enterpriseValue,
    as_of_date: stored.asOfDate ?? row.as_of_date ?? null,
    updated_at: stored.updatedAt ?? row.updated_at ?? null,
    source_map: {
      ...(row.source_map ?? {}),
      ...stored.sourceMap,
    },
  };
}

export async function getDemoSnapshot(ticker: string): Promise<DemoSnapshotRow | null> {
  const supabase = getSupabaseClient();
  const cleanTicker = ticker.toUpperCase().trim();

  const { data, error } = await supabase
    .from('demo_company_snapshots')
    .select('*')
    .eq('ticker', cleanTicker)
    .maybeSingle();

  if (error) {
    throw new Error(`[demoProvider] snapshot query failed: ${error.message}`);
  }
  const baseRow = data as DemoSnapshotRow | null;
  const stored = await getStoredCompanyOverlay(cleanTicker);
  const row = baseRow ? mergeDemoWithStored(baseRow, stored) : null;
  if (!row) return null;

  const aiFilled = await aiFillFinancialData({
    ticker: row.ticker || cleanTicker,
    company_name: row.company_name ?? null,
    share_price: row.share_price ?? null,
    market_cap: row.market_cap ?? null,
    enterprise_value: row.enterprise_value ?? null,
    shares_outstanding: row.shares_outstanding ?? null,
  });

  return {
    ...row,
    share_price: row.share_price ?? aiFilled.share_price ?? null,
    market_cap: row.market_cap ?? aiFilled.market_cap ?? null,
    enterprise_value: row.enterprise_value ?? aiFilled.enterprise_value ?? null,
    shares_outstanding: row.shares_outstanding ?? aiFilled.shares_outstanding ?? null,
  };
}

export async function getDemoFundamentals(ticker: string): Promise<NormalizedFundamentals | null> {
  const row = await getDemoSnapshot(ticker);
  if (!row) return null;

  const normalized = normalizeDemoSnapshot(row);
  const hasValue = (value: unknown) => value !== null && value !== undefined && value !== '';
  const cashPresent = ['cash', 'cash_equivalents', 'cashAndEquivalents'].some((key) => hasValue((row as any)[key]));
  const totalDebtPresent = ['total_debt', 'totalDebt', 'debt'].some((key) => hasValue((row as any)[key]));

  return {
    ticker: normalized.ticker,
    revenueLTM: normalized.revenueLtm,
    ebitdaLTM: normalized.ebitdaLtm,
    netIncomeLTM: normalized.netIncomeLtm,
    cash: cashPresent ? normalized.cash : null,
    totalDebt: totalDebtPresent ? normalized.totalDebt : null,
    companyName: normalized.companyName,
    sector: normalized.sector,
    currency: normalized.currency,
    units: normalized.units,
    sharesOutstanding: normalized.sharesOutstanding,
    revenueSeries: normalized.revenueSeries,
    provenance: normalized.provenance,
    source: normalized.source,
  };
}

export async function getDemoQuote(ticker: string): Promise<NormalizedQuote | null> {
  const row = await getDemoSnapshot(ticker);
  if (!row) return null;

  const normalized = normalizeDemoSnapshot(row);
  const quote = normalizeDemoQuote(row, normalized);

  return {
    ticker: quote.ticker,
    price: quote.price ?? null,
    asOf: quote.asOf ?? null,
    currency: quote.currency,
    marketCap: quote.marketCap ?? null,
    sharesOutstanding: quote.sharesOutstanding ?? null,
    units: quote.units,
    provenance: quote.provenance || {},
    source: quote.source || 'demo_snapshots',
  };
}

export async function getDemoLastUpdated(): Promise<string | null> {
  if (cachedLastUpdated && Date.now() - cachedLastUpdated.fetchedAt < CACHE_TTL_MS) {
    return cachedLastUpdated.value;
  }
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('demo_company_snapshots')
    .select('updated_at')
    .order('updated_at', { ascending: false })
    .limit(1);

  if (error) {
    console.warn('[demoProvider] lastUpdated query failed:', error.message);
    return null;
  }

  const value = data && data.length > 0 ? (data[0].updated_at as string) : null;
  cachedLastUpdated = { value, fetchedAt: Date.now() };
  return value;
}

/** Row shape for demo ticker picker: ticker, company_name, sector from public.demo_company_snapshots */
export type DemoTickerRow = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
};

/** Typed demo universe row for UI: ticker, company_name (string), sector (string | null). */
export type DemoUniverseRow = {
  ticker: string;
  company_name: string;
  sector: string | null;
};

const CACHED_TICKER_ROWS_TTL_MS = 5 * 60 * 1000;
let cachedTickerRows: { value: DemoTickerRow[]; fetchedAt: number } | null = null;

/**
 * Fetch ticker, company_name, sector from public.demo_company_snapshots (ticker not null).
 * Order: sector asc, ticker asc. De-duplicates by ticker (first occurrence wins).
 */
async function fetchDemoTickerRowsUncached(): Promise<DemoTickerRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('demo_company_snapshots')
    .select('ticker, company_name, sector')
    .not('ticker', 'is', null)
    .order('sector', { ascending: true })
    .order('ticker', { ascending: true });

  if (error || !data) {
    console.warn('[demoProvider] demo universe query failed:', error?.message);
    return [];
  }
  const seen = new Set<string>();
  const value: DemoTickerRow[] = [];
  for (const row of data as { ticker: string; company_name: string | null; sector: string | null }[]) {
    const t = String(row.ticker ?? '').trim().toUpperCase();
    if (!t || seen.has(t)) continue;
    seen.add(t);
    value.push({
      ticker: t,
      company_name: row.company_name != null ? String(row.company_name) : null,
      sector: row.sector != null ? String(row.sector).trim() || null : null,
    });
  }
  return value;
}

/**
 * getDemoUniverse: returns only tickers that exist in public.demo_company_snapshots.
 * Order: sector asc, ticker asc. Typed as company_name string (empty string if null).
 */
export async function getDemoUniverse(): Promise<DemoUniverseRow[]> {
  if (cachedTickerRows && Date.now() - cachedTickerRows.fetchedAt < CACHED_TICKER_ROWS_TTL_MS) {
    return cachedTickerRows.value.map((r) => ({
      ticker: r.ticker,
      company_name: r.company_name ?? '',
      sector: r.sector,
    }));
  }
  const rows = await fetchDemoTickerRowsUncached();
  cachedTickerRows = { value: rows, fetchedAt: Date.now() };
  return rows.map((r) => ({
    ticker: r.ticker,
    company_name: r.company_name ?? '',
    sector: r.sector,
  }));
}

/**
 * Fetch ticker, company_name, sector from public.demo_company_snapshots (order sector asc, ticker asc).
 * De-duplicates by ticker (first occurrence wins).
 */
export async function getDemoTickerRows(): Promise<DemoTickerRow[]> {
  if (cachedTickerRows && Date.now() - cachedTickerRows.fetchedAt < CACHED_TICKER_ROWS_TTL_MS) {
    return cachedTickerRows.value;
  }
  const rows = await fetchDemoTickerRowsUncached();
  cachedTickerRows = { value: rows, fetchedAt: Date.now() };
  return rows;
}

/**
 * Get a single demo company row by ticker from public.demo_company_snapshots. Returns null if not found.
 */
export async function getDemoCompany(ticker: string): Promise<DemoSnapshotRow | null> {
  return getDemoSnapshot(ticker);
}

export async function getDemoTickers(): Promise<string[]> {
  const rows = await getDemoTickerRows();
  return rows.map((r) => r.ticker);
}

export async function isDemoTickerAvailable(ticker: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  const { data, error } = await supabase
    .from('demo_company_snapshots')
    .select('ticker')
    .eq('ticker', ticker.toUpperCase())
    .maybeSingle();

  if (error) {
    console.warn('[demoProvider] demo ticker check failed:', error.message);
    return false;
  }

  return !!data;
}

/** Top N companies by revenue_ltm desc for Market Brief landing. */
export async function getDemoSnapshotsTopByRevenue(limit: number = 20): Promise<DemoSnapshotRow[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('demo_company_snapshots')
      .select('*')
      .not('revenue_ltm', 'is', null)
      .order('revenue_ltm', { ascending: false })
      .limit(limit);
    if (error) {
      console.warn('[demoProvider] getDemoSnapshotsTopByRevenue failed:', error.message);
      return [];
    }
    return (data || []) as DemoSnapshotRow[];
  } catch {
    return [];
  }
}

/** All companies in a sector for Comps / sector view. Sorted by revenue_ltm desc. */
export async function getDemoSnapshotsBySector(sector: string): Promise<DemoSnapshotRow[]> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('demo_company_snapshots')
      .select('*')
      .ilike('sector', sector.trim())
      .order('revenue_ltm', { ascending: false });
    if (error) {
      console.warn('[demoProvider] getDemoSnapshotsBySector failed:', error.message);
      return [];
    }
    return (data || []) as DemoSnapshotRow[];
  } catch {
    return [];
  }
}

/** All sectors with count, avg EBITDA margin, and top 3 by revenue. */
export async function getDemoSnapshotsGroupedBySector(): Promise<{
  sector: string;
  count: number;
  avgEbitdaMarginPct: number | null;
  topByRevenue: DemoSnapshotRow[];
}[]> {
  try {
    const supabase = getSupabaseClient();
    const { data: rows, error } = await supabase
      .from('demo_company_snapshots')
      .select('*')
      .order('revenue_ltm', { ascending: false });
    if (error || !rows?.length) return [];
    const bySector = new Map<string, DemoSnapshotRow[]>();
    for (const row of rows as DemoSnapshotRow[]) {
      const s = (row.sector || 'Other').trim() || 'Other';
      if (!bySector.has(s)) bySector.set(s, []);
      bySector.get(s)!.push(row);
    }
    return Array.from(bySector.entries()).map(([sector, list]) => {
      const withRevenue = list.filter((r) => r.revenue_ltm != null && Number.isFinite(r.revenue_ltm));
      const margins = withRevenue
        .filter((r) => r.ebitda_ltm != null && r.revenue_ltm && r.revenue_ltm > 0)
        .map((r) => (r.ebitda_ltm! / r.revenue_ltm!) * 100);
      const avgEbitdaMarginPct =
        margins.length > 0 ? margins.reduce((a, b) => a + b, 0) / margins.length : null;
      return {
        sector,
        count: list.length,
        avgEbitdaMarginPct,
        topByRevenue: list.slice(0, 3),
      };
    });
  } catch {
    return [];
  }
}
