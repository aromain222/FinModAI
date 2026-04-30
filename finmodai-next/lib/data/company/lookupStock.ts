import { extractCompanyQuery } from '@/lib/data/company/extractCompanyQuery';
import { getLiveCompanyFinancialSnapshot } from '@/lib/data/company/liveFinancialSnapshot';
import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import type { CompanyQuery } from '@/lib/data/company/types';
import { getSupabaseServiceClient } from '@/lib/events/store';

export type StockLookupResult = {
  ticker: string;
  companyName: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  country: string | null;
  currency: string | null;
  price: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  revenueLtm: number | null;
  ebitdaLtm: number | null;
  netIncomeLtm: number | null;
  cash: number | null;
  totalDebt: number | null;
  asOfDate: string | null;
  priceAsOfDate: string | null;
  source: {
    company: string | null;
    fundamentals: string | null;
    price: string | null;
  };
  chart: {
    kind: 'price' | 'fundamentals';
    points: Array<{ label: string; value: number }>;
  };
  fallbackUsed: {
    yfinance: boolean;
    financedatabase: boolean;
  };
};

function pickNumber(primary: number | null | undefined, fallback: number | null | undefined): number | null {
  return typeof primary === 'number' && Number.isFinite(primary)
    ? primary
    : typeof fallback === 'number' && Number.isFinite(fallback)
      ? fallback
      : null;
}

export async function lookupStock(input: CompanyQuery): Promise<StockLookupResult | null> {
  const query = extractCompanyQuery(input);
  const profile = await resolveCompanyProfile(input);
  const supabase = getSupabaseServiceClient();

  const initialTicker = profile?.company.ticker ?? query.ticker;
  if (!initialTicker) return null;
  const liveSnapshot = await getLiveCompanyFinancialSnapshot(initialTicker).catch(() => null);
  const resolvedTicker = liveSnapshot?.ticker ?? initialTicker;

  const companyName =
    liveSnapshot?.companyName ??
    profile?.company.name ??
    query.companyName ??
    null;

  const price = pickNumber(liveSnapshot?.price, profile?.latestPrice?.close);
  const marketCap = pickNumber(liveSnapshot?.marketCap, profile?.snapshot?.marketCap);
  const sharesOutstanding = pickNumber(liveSnapshot?.sharesOutstanding, profile?.snapshot?.sharesOutstanding);
  const priceRows =
    profile?.company.id && supabase
      ? await supabase
          .from('company_prices')
          .select('date, close')
          .eq('company_id', profile.company.id)
          .order('date', { ascending: false })
          .limit(24)
      : null;

  const recentPricePoints =
    Array.isArray(priceRows?.data) && priceRows.data.length > 1
      ? [...priceRows.data]
          .reverse()
          .map((row) => ({
            label: String(row.date).slice(5),
            value: typeof row.close === 'number' ? row.close : Number(row.close),
          }))
          .filter((row) => Number.isFinite(row.value))
      : [];

  const fundamentalPoints = [
    { label: 'Revenue', value: pickNumber(liveSnapshot?.revenueLtm, profile?.snapshot?.revenueLtm) ?? NaN },
    { label: 'EBITDA', value: pickNumber(liveSnapshot?.ebitdaLtm, profile?.snapshot?.ebitdaLtm) ?? NaN },
    { label: 'Net Inc.', value: pickNumber(liveSnapshot?.netIncomeLtm, profile?.snapshot?.netIncomeLtm) ?? NaN },
  ].filter((row) => Number.isFinite(row.value));

  return {
    ticker: resolvedTicker,
    companyName,
    sector: liveSnapshot?.sector ?? profile?.company.sector ?? null,
    industry: liveSnapshot?.industry ?? profile?.company.industry ?? null,
    exchange: liveSnapshot?.exchange ?? profile?.company.exchange ?? null,
    country: liveSnapshot?.country ?? profile?.company.country ?? null,
    currency: liveSnapshot?.currency ?? profile?.snapshot?.currency ?? 'USD',
    price,
    marketCap,
    sharesOutstanding,
    revenueLtm: pickNumber(liveSnapshot?.revenueLtm, profile?.snapshot?.revenueLtm),
    ebitdaLtm: pickNumber(liveSnapshot?.ebitdaLtm, profile?.snapshot?.ebitdaLtm),
    netIncomeLtm: pickNumber(liveSnapshot?.netIncomeLtm, profile?.snapshot?.netIncomeLtm),
    cash: pickNumber(liveSnapshot?.cash, profile?.snapshot?.cash),
    totalDebt: pickNumber(liveSnapshot?.totalDebt, profile?.snapshot?.totalDebt),
    asOfDate: liveSnapshot?.asOfDate ?? profile?.snapshot?.asOfDate ?? null,
    priceAsOfDate: liveSnapshot?.priceAsOfDate ?? profile?.latestPrice?.date ?? (price !== null ? new Date().toISOString().slice(0, 10) : null),
    source: {
      company: liveSnapshot?.source.company ?? (profile?.company.name ? 'company_cache' : null),
      fundamentals: liveSnapshot?.source.fundamentals ?? profile?.snapshot?.source ?? null,
      price: liveSnapshot?.source.price ?? profile?.latestPrice?.source ?? null,
    },
    chart:
      recentPricePoints.length > 1
        ? { kind: 'price', points: recentPricePoints }
        : { kind: 'fundamentals', points: fundamentalPoints },
    fallbackUsed: {
      yfinance: Boolean(liveSnapshot?.fallbackUsed.yfinance),
      financedatabase: false,
    },
  };
}
