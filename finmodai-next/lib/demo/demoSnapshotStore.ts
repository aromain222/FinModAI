import { getSupabaseServerClient } from '@/lib/supabaseClient';
import { DEMO_COMPANY_META } from '@/lib/demo/demoUniverse';

export type DemoCompanySnapshot = {
  ticker: string;
  companyName?: string | null;
  sector?: string | null;
  revenueLtm?: number | null;
  ebitdaLtm?: number | null;
  netIncomeLtm?: number | null;
  cash?: number | null;
  totalDebt?: number | null;
  sharesOutstanding?: number | null;
  sharePrice?: number | null;
  marketCap?: number | null;
  updatedAt?: string | null;
  sourceMap?: Record<string, string>;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
let cache: { loadedAt: number; data: Record<string, DemoCompanySnapshot> } | null = null;

function normalizeSnapshotRow(row: any): DemoCompanySnapshot {
  const meta = DEMO_COMPANY_META[row.ticker] || {};
  return {
    ticker: row.ticker,
    companyName: row.company_name ?? row.companyName ?? meta.name ?? null,
    sector: row.sector ?? meta.sector ?? null,
    revenueLtm: row.revenue_ltm ?? row.revenueLtm ?? null,
    ebitdaLtm: row.ebitda_ltm ?? row.ebitdaLtm ?? null,
    netIncomeLtm: row.net_income_ltm ?? row.netIncomeLtm ?? null,
    cash: row.cash ?? null,
    totalDebt: row.total_debt ?? row.totalDebt ?? null,
    sharesOutstanding: row.shares_outstanding ?? row.sharesOutstanding ?? null,
    sharePrice: row.share_price ?? row.sharePrice ?? null,
    marketCap: row.market_cap ?? row.marketCap ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    sourceMap: row.source_map ?? row.sourceMap ?? undefined,
  };
}

async function loadSnapshotsFromSupabase(): Promise<Record<string, DemoCompanySnapshot> | null> {
  const supabase = getSupabaseServerClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from('demo_company_snapshots')
    .select('*');

  if (error || !data) {
    console.warn('[demoSnapshotStore] Supabase snapshot fetch failed:', error?.message);
    return null;
  }

  return data.reduce<Record<string, DemoCompanySnapshot>>((acc, row) => {
    const snapshot = normalizeSnapshotRow(row);
    acc[snapshot.ticker.toUpperCase()] = snapshot;
    return acc;
  }, {});
}

export async function loadDemoSnapshots(): Promise<Record<string, DemoCompanySnapshot>> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) {
    return cache.data;
  }

  const data = (await loadSnapshotsFromSupabase()) || {};

  cache = { loadedAt: Date.now(), data };
  return data;
}

export async function getDemoSnapshot(ticker: string): Promise<DemoCompanySnapshot | null> {
  const snapshots = await loadDemoSnapshots();
  return snapshots[ticker.toUpperCase()] || null;
}

export async function getDemoSnapshotsMeta(): Promise<{ lastUpdated: string | null; count: number }> {
  const snapshots = await loadDemoSnapshots();
  const values = Object.values(snapshots);
  const lastUpdated = values
    .map((item) => item.updatedAt)
    .filter(Boolean)
    .sort()
    .pop() || null;
  return { lastUpdated, count: values.length };
}

export const DEMO_SNAPSHOT_FILE_PATH = null;
