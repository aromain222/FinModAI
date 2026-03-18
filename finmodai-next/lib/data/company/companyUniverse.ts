import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type MarketCompanyListing = {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  updatedAt: string | null;
  asOfDate: string | null;
  revenueLtm: number | null;
  marketCap: number | null;
  source: 'company_cache' | 'demo_company_snapshots';
};

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getCompanyUniverseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  const key = serviceKey || anonKey;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function getMarketCompanyUniverse(limit = 500): Promise<MarketCompanyListing[]> {
  const supabase = getCompanyUniverseClient();
  if (!supabase) return [];

  const baseLimit = Math.max(limit * 3, 100);
  const companiesResult = await supabase
    .from('companies')
    .select('id, ticker, name, sector, industry, updated_at')
    .order('updated_at', { ascending: false })
    .limit(baseLimit);

  const companies = Array.isArray(companiesResult.data) ? companiesResult.data : [];
  if (companies.length === 0) return [];

  const companyIds = companies
    .map((row) => (typeof row.id === 'string' ? row.id : null))
    .filter((value): value is string => Boolean(value));

  const snapshotsResult = companyIds.length
    ? await supabase
        .from('company_snapshots')
        .select('company_id, as_of_date, revenue_ltm, market_cap, source_priority')
        .in('company_id', companyIds)
        .order('as_of_date', { ascending: false })
        .order('source_priority', { ascending: false })
    : { data: [] };

  const latestSnapshotByCompany = new Map<string, Record<string, unknown>>();
  for (const row of Array.isArray(snapshotsResult.data) ? snapshotsResult.data : []) {
    const companyId = typeof row.company_id === 'string' ? row.company_id : null;
    if (!companyId || latestSnapshotByCompany.has(companyId)) continue;
    latestSnapshotByCompany.set(companyId, row as Record<string, unknown>);
  }

  return companies
    .map((company) => {
      const snapshot = latestSnapshotByCompany.get(String(company.id));
      return {
        ticker: String(company.ticker ?? '').trim().toUpperCase(),
        companyName: typeof company.name === 'string' ? company.name : null,
        sector: typeof company.sector === 'string' ? company.sector : null,
        industry: typeof company.industry === 'string' ? company.industry : null,
        updatedAt: typeof company.updated_at === 'string' ? company.updated_at : null,
        asOfDate: typeof snapshot?.as_of_date === 'string' ? snapshot.as_of_date : null,
        revenueLtm: toNumber(snapshot?.revenue_ltm),
        marketCap: toNumber(snapshot?.market_cap),
        source: 'company_cache' as const,
      };
    })
    .filter((row) => row.ticker.length > 0)
    .sort((left, right) => {
      const marketCapDiff = (right.marketCap ?? -1) - (left.marketCap ?? -1);
      if (marketCapDiff !== 0) return marketCapDiff;
      return String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? ''));
    })
    .slice(0, limit);
}

export async function getMarketUniverseTickers(limit = 500): Promise<string[]> {
  const rows = await getMarketCompanyUniverse(limit);
  return rows.map((row) => row.ticker);
}
