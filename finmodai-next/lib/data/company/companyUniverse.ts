import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type MarketCompanyListing = {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  country: string | null;
  exchange: string | null;
  companyType: string | null;
  updatedAt: string | null;
  asOfDate: string | null;
  revenueLtm: number | null;
  ebitdaLtm: number | null;
  netIncomeLtm: number | null;
  cash: number | null;
  totalDebt: number | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
  sharePrice: number | null;
  source: 'company_cache' | 'demo_company_snapshots';
};

type CompanyRow = {
  id: string | null;
  ticker: string | null;
  name: string | null;
  sector: string | null;
  industry: string | null;
  country?: string | null;
  exchange?: string | null;
  company_type?: string | null;
  updated_at: string | null;
};

type SnapshotRow = {
  company_id: string | null;
  as_of_date: string | null;
  revenue_ltm: number | string | null;
  ebitda_ltm: number | string | null;
  net_income_ltm?: number | string | null;
  cash: number | string | null;
  total_debt: number | string | null;
  shares_outstanding: number | string | null;
  market_cap: number | string | null;
  source_priority?: number | null;
};

type PriceRow = {
  company_id: string | null;
  date: string | null;
  close: number | string | null;
};

type MarketCompanyUniverseOptions = {
  qualityOnly?: boolean;
  snapshotFreshnessDays?: number;
  priceFreshnessDays?: number;
};

const COMPANY_UNIVERSE_BATCH_SIZE = 100;

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

function daysSince(dateValue: string | null | undefined): number | null {
  if (!dateValue) return null;
  const millis = Date.parse(dateValue);
  if (!Number.isFinite(millis)) return null;
  return (Date.now() - millis) / (1000 * 60 * 60 * 24);
}

function isFreshEnough(dateValue: string | null | undefined, maxDays: number): boolean {
  const days = daysSince(dateValue);
  return days !== null && days >= 0 && days <= maxDays;
}

function hasPositiveNumber(value: number | null): boolean {
  return value !== null && Number.isFinite(value) && value > 0;
}

function hasNumber(value: number | null): boolean {
  return value !== null && Number.isFinite(value);
}

function chunkArray<T>(items: T[], size: number): T[][] {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function preferMetricValue(
  current: string | number | null | undefined,
  candidate: string | number | null | undefined,
  options: { allowZero?: boolean } = {},
): string | number | null {
  const currentNumber = toNumber(current);
  const candidateNumber = toNumber(candidate);
  const currentUsable = options.allowZero ? currentNumber !== null : hasPositiveNumber(currentNumber);
  const candidateUsable = options.allowZero ? candidateNumber !== null : hasPositiveNumber(candidateNumber);

  if (currentUsable) return current ?? null;
  if (candidateUsable) return candidate ?? null;
  return current ?? candidate ?? null;
}

function mergeSnapshotRows(rows: SnapshotRow[]): SnapshotRow | null {
  if (rows.length === 0) return null;
  const anchor = rows[0];

  return rows.reduce<SnapshotRow>(
    (merged, row) => ({
      ...merged,
      as_of_date: merged.as_of_date ?? row.as_of_date ?? null,
      revenue_ltm: preferMetricValue(merged.revenue_ltm, row.revenue_ltm),
      ebitda_ltm: preferMetricValue(merged.ebitda_ltm, row.ebitda_ltm, { allowZero: true }),
      net_income_ltm: preferMetricValue(merged.net_income_ltm, row.net_income_ltm, { allowZero: true }),
      cash: preferMetricValue(merged.cash, row.cash, { allowZero: true }),
      total_debt: preferMetricValue(merged.total_debt, row.total_debt, { allowZero: true }),
      shares_outstanding: preferMetricValue(merged.shares_outstanding, row.shares_outstanding),
      market_cap: preferMetricValue(merged.market_cap, row.market_cap),
    }),
    { ...anchor }
  );
}

function isQualityListing(
  row: MarketCompanyListing,
  options: Required<Pick<MarketCompanyUniverseOptions, 'snapshotFreshnessDays' | 'priceFreshnessDays'>>
): boolean {
  const sector = String(row.sector ?? '').toLowerCase();
  const isFinancialLike = sector.includes('financial');
  const hasCoreFundamentals =
    hasPositiveNumber(row.sharesOutstanding) &&
    hasPositiveNumber(row.marketCap) &&
    (
      (hasPositiveNumber(row.revenueLtm) && hasNumber(row.ebitdaLtm)) ||
      (isFinancialLike && hasNumber(row.netIncomeLtm))
    );
  const hasBalanceSheetContext = row.cash !== null && row.totalDebt !== null;
  const hasPriceBase = hasPositiveNumber(row.sharePrice);
  const snapshotFresh = isFreshEnough(row.asOfDate, options.snapshotFreshnessDays);
  const priceFresh = isFreshEnough(row.updatedAt, options.priceFreshnessDays);

  return hasCoreFundamentals && hasBalanceSheetContext && hasPriceBase && snapshotFresh && priceFresh;
}

export async function getMarketCompanyUniverse(
  limit = 1000,
  options: MarketCompanyUniverseOptions = {}
): Promise<MarketCompanyListing[]> {
  const supabase = getCompanyUniverseClient();
  if (!supabase) return [];

  const qualityOnly = options.qualityOnly ?? false;
  const snapshotFreshnessDays = options.snapshotFreshnessDays ?? 550;
  const priceFreshnessDays = options.priceFreshnessDays ?? 21;
  const baseLimit = Math.max(limit * 4, 2500);

  const companiesResult = await supabase
    .from('companies')
    .select('id, ticker, name, sector, industry, country, exchange, company_type, updated_at')
    .order('updated_at', { ascending: false })
    .limit(baseLimit);

  const companies = Array.isArray(companiesResult.data) ? (companiesResult.data as CompanyRow[]) : [];
  if (companies.length === 0) return [];

  const companyIds = companies
    .map((row) => (typeof row.id === 'string' ? row.id : null))
    .filter((value): value is string => Boolean(value));

  const snapshotRows: SnapshotRow[] = [];
  const priceRows: PriceRow[] = [];

  for (const companyIdBatch of chunkArray(companyIds, COMPANY_UNIVERSE_BATCH_SIZE)) {
    const [snapshotsResult, pricesResult] = await Promise.all([
      supabase
        .from('company_snapshots')
        .select('company_id, as_of_date, revenue_ltm, ebitda_ltm, net_income_ltm, cash, total_debt, shares_outstanding, market_cap, source_priority')
        .in('company_id', companyIdBatch)
        .order('as_of_date', { ascending: false })
        .order('source_priority', { ascending: false }),
      supabase
        .from('company_prices')
        .select('company_id, date, close')
        .in('company_id', companyIdBatch)
        .order('date', { ascending: false }),
    ]);

    if (Array.isArray(snapshotsResult.data)) {
      snapshotRows.push(...(snapshotsResult.data as SnapshotRow[]));
    }
    if (Array.isArray(pricesResult.data)) {
      priceRows.push(...(pricesResult.data as PriceRow[]));
    }
  }

  const snapshotRowsByCompany = new Map<string, SnapshotRow[]>();
  for (const row of snapshotRows) {
    const companyId = typeof row.company_id === 'string' ? row.company_id : null;
    if (!companyId) continue;
    const bucket = snapshotRowsByCompany.get(companyId) ?? [];
    bucket.push(row);
    snapshotRowsByCompany.set(companyId, bucket);
  }

  const latestPriceByCompany = new Map<string, PriceRow>();
  for (const row of priceRows) {
    const companyId = typeof row.company_id === 'string' ? row.company_id : null;
    if (!companyId || latestPriceByCompany.has(companyId)) continue;
    latestPriceByCompany.set(companyId, row);
  }

  const listings = companies
    .map((company): MarketCompanyListing | null => {
      const companyId = typeof company.id === 'string' ? company.id : null;
      const ticker = String(company.ticker ?? '').trim().toUpperCase();
      if (!companyId || !ticker) return null;

      const snapshot = mergeSnapshotRows(snapshotRowsByCompany.get(companyId) ?? []);
      const price = latestPriceByCompany.get(companyId);

      return {
        ticker,
        companyName: typeof company.name === 'string' ? company.name : null,
        sector: typeof company.sector === 'string' ? company.sector : null,
        industry: typeof company.industry === 'string' ? company.industry : null,
        country: typeof company.country === 'string' ? company.country : null,
        exchange: typeof company.exchange === 'string' ? company.exchange : null,
        companyType: typeof company.company_type === 'string' ? company.company_type : null,
        updatedAt: typeof price?.date === 'string' ? price.date : typeof company.updated_at === 'string' ? company.updated_at : null,
        asOfDate: typeof snapshot?.as_of_date === 'string' ? snapshot.as_of_date : null,
        revenueLtm: toNumber(snapshot?.revenue_ltm),
        ebitdaLtm: toNumber(snapshot?.ebitda_ltm),
        netIncomeLtm: toNumber(snapshot?.net_income_ltm),
        cash: toNumber(snapshot?.cash),
        totalDebt: toNumber(snapshot?.total_debt),
        sharesOutstanding: toNumber(snapshot?.shares_outstanding),
        marketCap: toNumber(snapshot?.market_cap),
        sharePrice: toNumber(price?.close),
        source: 'company_cache',
      };
    })
    .filter((row): row is MarketCompanyListing => Boolean(row));

  const filtered = qualityOnly
    ? listings.filter((row) => isQualityListing(row, { snapshotFreshnessDays, priceFreshnessDays }))
    : listings;

  return filtered
    .sort((left, right) => {
      const marketCapDiff = (right.marketCap ?? -1) - (left.marketCap ?? -1);
      if (marketCapDiff !== 0) return marketCapDiff;
      return String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? ''));
    })
    .slice(0, limit);
}

export async function getMarketUniverseTickers(limit = 1000): Promise<string[]> {
  const rows = await getMarketCompanyUniverse(limit);
  return rows.map((row) => row.ticker);
}

export async function getQualityPublicCompanyUniverse(limit = 1000): Promise<MarketCompanyListing[]> {
  return getMarketCompanyUniverse(limit, { qualityOnly: true });
}

export async function getQualityPublicTickers(limit = 1000): Promise<string[]> {
  const rows = await getQualityPublicCompanyUniverse(limit);
  return rows.map((row) => row.ticker);
}

export async function getMarketCompanyListingByTicker(
  ticker: string
): Promise<MarketCompanyListing | null> {
  const supabase = getCompanyUniverseClient();
  if (!supabase) return null;

  const normalized = ticker.trim().toUpperCase();
  if (!normalized) return null;

  const companyResult = await supabase
    .from('companies')
    .select('id, ticker, name, sector, industry, country, exchange, company_type, updated_at')
    .eq('ticker', normalized)
    .maybeSingle();

  const company = companyResult.data as CompanyRow | null;
  if (!company?.id) return null;

  const [snapshotsResult, pricesResult] = await Promise.all([
    supabase
      .from('company_snapshots')
      .select('company_id, as_of_date, revenue_ltm, ebitda_ltm, net_income_ltm, cash, total_debt, shares_outstanding, market_cap, source_priority')
      .eq('company_id', company.id)
      .order('as_of_date', { ascending: false })
      .order('source_priority', { ascending: false })
      .limit(20),
    supabase
      .from('company_prices')
      .select('company_id, date, close')
      .eq('company_id', company.id)
      .order('date', { ascending: false })
      .limit(10),
  ]);

  const snapshot = mergeSnapshotRows(
    Array.isArray(snapshotsResult.data) ? (snapshotsResult.data as SnapshotRow[]) : []
  );
  const price = Array.isArray(pricesResult.data) ? ((pricesResult.data as PriceRow[])[0] ?? null) : null;

  return {
    ticker: normalized,
    companyName: typeof company.name === 'string' ? company.name : null,
    sector: typeof company.sector === 'string' ? company.sector : null,
    industry: typeof company.industry === 'string' ? company.industry : null,
    country: typeof company.country === 'string' ? company.country : null,
    exchange: typeof company.exchange === 'string' ? company.exchange : null,
    companyType: typeof company.company_type === 'string' ? company.company_type : null,
    updatedAt:
      typeof price?.date === 'string'
        ? price.date
        : typeof company.updated_at === 'string'
          ? company.updated_at
          : null,
    asOfDate: typeof snapshot?.as_of_date === 'string' ? snapshot.as_of_date : null,
    revenueLtm: toNumber(snapshot?.revenue_ltm),
    ebitdaLtm: toNumber(snapshot?.ebitda_ltm),
    netIncomeLtm: toNumber(snapshot?.net_income_ltm),
    cash: toNumber(snapshot?.cash),
    totalDebt: toNumber(snapshot?.total_debt),
    sharesOutstanding: toNumber(snapshot?.shares_outstanding),
    marketCap: toNumber(snapshot?.market_cap),
    sharePrice: toNumber(price?.close),
    source: 'company_cache',
  };
}

export async function isQualityPublicTicker(
  ticker: string,
  options: Omit<MarketCompanyUniverseOptions, 'qualityOnly'> = {}
): Promise<boolean> {
  const normalized = ticker.trim().toUpperCase();
  if (!normalized) return false;

  const row = await getMarketCompanyListingByTicker(normalized);
  if (!row) return false;

  return isQualityListing(row, {
    snapshotFreshnessDays: options.snapshotFreshnessDays ?? 550,
    priceFreshnessDays: options.priceFreshnessDays ?? 21,
  });
}
