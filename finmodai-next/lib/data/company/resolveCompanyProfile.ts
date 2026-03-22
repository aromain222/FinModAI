import { getSupabaseServiceClient } from '@/lib/events/store';
import { extractCompanyQuery } from '@/lib/data/company/extractCompanyQuery';
import type {
  Company,
  CompanyIdentifier,
  CompanyKpi,
  CompanyPrice,
  CompanyQuery,
  CompanySnapshot,
  ResolvedCompanyProfile,
} from '@/lib/data/company/types';

const COMPANY_SUFFIXES = /\b(inc|incorporated|corp|corporation|co|company|holdings|holding|group|plc|limited|ltd|nv|sa|ag)\b/gi;

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCompanyName(value: string | null | undefined): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[.,/#!$%^*;:{}=_`~()'-]/g, ' ')
    .replace(COMPANY_SUFFIXES, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameMatchScore(candidate: string, query: string): number {
  const normalizedCandidate = normalizeCompanyName(candidate);
  const normalizedQuery = normalizeCompanyName(query);
  if (!normalizedCandidate || !normalizedQuery) return 0;
  if (normalizedCandidate === normalizedQuery) return 1000;
  if (normalizedCandidate.startsWith(normalizedQuery)) return 700 - normalizedCandidate.length;
  if (normalizedCandidate.includes(normalizedQuery)) return 500 - normalizedCandidate.length;

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const candidateTokens = new Set(normalizedCandidate.split(' ').filter(Boolean));
  const overlap = queryTokens.filter((token) => candidateTokens.has(token)).length;
  if (overlap === 0) return 0;
  return overlap * 100 - Math.abs(candidateTokens.size - queryTokens.length) * 10;
}

function mapCompany(row: any): Company {
  return {
    id: row.id,
    ticker: row.ticker,
    name: row.name,
    sector: row.sector ?? null,
    industry: row.industry ?? null,
    country: row.country ?? null,
    exchange: row.exchange ?? null,
    companyType: row.company_type ?? null,
    isSaas: Boolean(row.is_saas),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapIdentifier(row: any): CompanyIdentifier {
  return {
    id: row.id,
    companyId: row.company_id,
    ticker: row.ticker ?? null,
    compositeFigi: row.composite_figi ?? null,
    shareClassFigi: row.share_class_figi ?? null,
    cik: row.cik ?? null,
    isin: row.isin ?? null,
    cusip: row.cusip ?? null,
    source: row.source,
    createdAt: row.created_at,
  };
}

function mapSnapshot(row: any): CompanySnapshot {
  return {
    id: row.id,
    companyId: row.company_id,
    asOfDate: row.as_of_date,
    periodType: row.period_type,
    currency: row.currency ?? 'USD',
    revenueLtm: toNumber(row.revenue_ltm),
    grossProfitLtm: toNumber(row.gross_profit_ltm),
    ebitdaLtm: toNumber(row.ebitda_ltm),
    ebitLtm: toNumber(row.ebit_ltm),
    netIncomeLtm: toNumber(row.net_income_ltm),
    cash: toNumber(row.cash),
    totalDebt: toNumber(row.total_debt),
    sharesOutstanding: toNumber(row.shares_outstanding),
    marketCap: toNumber(row.market_cap),
    source: row.source,
    sourcePriority: typeof row.source_priority === 'number' ? row.source_priority : Number(row.source_priority ?? 1),
    createdAt: row.created_at,
  };
}

function snapshotFieldCount(snapshot: CompanySnapshot): number {
  return [
    snapshot.revenueLtm,
    snapshot.grossProfitLtm,
    snapshot.ebitdaLtm,
    snapshot.ebitLtm,
    snapshot.netIncomeLtm,
    snapshot.cash,
    snapshot.totalDebt,
    snapshot.sharesOutstanding,
    snapshot.marketCap,
  ].filter((value) => value !== null).length;
}

function mergeRecentSnapshots(rows: any[]): CompanySnapshot | null {
  const mapped = rows.map(mapSnapshot);
  if (mapped.length === 0) return null;

  const sorted = [...mapped].sort((left, right) => {
    const dateCompare = String(right.asOfDate).localeCompare(String(left.asOfDate));
    if (dateCompare !== 0) return dateCompare;

    if (right.sourcePriority !== left.sourcePriority) {
      return right.sourcePriority - left.sourcePriority;
    }

    return snapshotFieldCount(right) - snapshotFieldCount(left);
  });

  const anchor = sorted[0];
  const pick = <K extends keyof CompanySnapshot>(field: K): CompanySnapshot[K] => {
    for (const snapshot of sorted) {
      const value = snapshot[field];
      if (value !== null && value !== undefined) {
        return value;
      }
    }
    return anchor[field];
  };

  // Keep the latest snapshot as the anchor, but backfill missing fields from
  // nearby recent rows so one sparse provider response does not blank the profile.
  return {
    ...anchor,
    revenueLtm: pick('revenueLtm'),
    grossProfitLtm: pick('grossProfitLtm'),
    ebitdaLtm: pick('ebitdaLtm'),
    ebitLtm: pick('ebitLtm'),
    netIncomeLtm: pick('netIncomeLtm'),
    cash: pick('cash'),
    totalDebt: pick('totalDebt'),
    sharesOutstanding: pick('sharesOutstanding'),
    marketCap: pick('marketCap'),
  };
}

function mapPrice(row: any): CompanyPrice {
  return {
    id: row.id,
    companyId: row.company_id,
    date: row.date,
    open: toNumber(row.open),
    high: toNumber(row.high),
    low: toNumber(row.low),
    close: toNumber(row.close),
    volume: toNumber(row.volume),
    source: row.source,
    createdAt: row.created_at,
  };
}

function mapKpi(row: any): CompanyKpi {
  return {
    id: row.id,
    companyId: row.company_id,
    asOfDate: row.as_of_date,
    arr: toNumber(row.arr),
    netRetention: toNumber(row.net_retention),
    grossRetention: toNumber(row.gross_retention),
    customers: toNumber(row.customers),
    arpu: toNumber(row.arpu),
    grossMargin: toNumber(row.gross_margin),
    source: row.source,
    confidence: row.confidence ?? null,
    createdAt: row.created_at,
  };
}

async function resolveCompanyId(query: { ticker?: string; companyName?: string }): Promise<Company | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;

  if (query.ticker) {
    const normalizedTicker = query.ticker.toUpperCase();
    const direct = await supabase.from('companies').select('*').eq('ticker', normalizedTicker).maybeSingle();
    if (direct.data) return mapCompany(direct.data);

    const byIdentifier = await supabase
      .from('company_identifiers')
      .select('company:companies(*)')
      .or(`ticker.eq.${normalizedTicker},composite_figi.eq.${normalizedTicker},share_class_figi.eq.${normalizedTicker},cik.eq.${normalizedTicker},isin.eq.${normalizedTicker},cusip.eq.${normalizedTicker}`)
      .limit(1)
      .maybeSingle();
    const company = (byIdentifier.data as any)?.company;
    if (company) return mapCompany(company);
  }

  if (query.companyName) {
    const exact = await supabase.from('companies').select('*').ilike('name', query.companyName).limit(1).maybeSingle();
    if (exact.data) return mapCompany(exact.data);

    const fuzzy = await supabase
      .from('companies')
      .select('*')
      .ilike('name', `%${query.companyName}%`)
      .order('updated_at', { ascending: false })
      .limit(25);
    if (Array.isArray(fuzzy.data) && fuzzy.data.length > 0) {
      const best = [...fuzzy.data].sort((left, right) => {
        const leftScore = nameMatchScore(String(left.name ?? ''), query.companyName ?? '');
        const rightScore = nameMatchScore(String(right.name ?? ''), query.companyName ?? '');
        if (leftScore !== rightScore) return rightScore - leftScore;
        return String(right.updated_at ?? '').localeCompare(String(left.updated_at ?? ''));
      })[0];
      if (best) return mapCompany(best);
    }
  }

  return null;
}

export async function resolveCompanyProfile(input: CompanyQuery): Promise<ResolvedCompanyProfile | null> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) return null;

  const query = extractCompanyQuery(input);
  if (!query.ticker && !query.companyName) return null;

  const company = await resolveCompanyId(query);
  if (!company) return null;

  const [identifiersResult, snapshotResult, priceResult, kpiResult] = await Promise.all([
    supabase.from('company_identifiers').select('*').eq('company_id', company.id).order('created_at', { ascending: false }),
    supabase
      .from('company_snapshots')
      .select('*')
      .eq('company_id', company.id)
      .order('as_of_date', { ascending: false })
      .order('source_priority', { ascending: false })
      .limit(10),
    supabase.from('company_prices').select('*').eq('company_id', company.id).order('date', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('company_kpis').select('*').eq('company_id', company.id).order('as_of_date', { ascending: false }),
  ]);

  return {
    company,
    identifiers: Array.isArray(identifiersResult.data) ? identifiersResult.data.map(mapIdentifier) : [],
    snapshot: Array.isArray(snapshotResult.data) ? mergeRecentSnapshots(snapshotResult.data) : null,
    latestPrice: priceResult.data ? mapPrice(priceResult.data) : null,
    kpis: Array.isArray(kpiResult.data) ? kpiResult.data.map(mapKpi) : [],
  };
}
