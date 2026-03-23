import path from 'node:path';
import { extractCompanyQuery } from '@/lib/data/company/extractCompanyQuery';
import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import { getDemoFundamentals, getDemoQuote } from '@/lib/data/providers/demoProvider';
import type { CompanyQuery } from '@/lib/data/company/types';
import { runPythonJson } from '@/lib/integrations/python/runPythonJson';
import { getSupabaseServiceClient } from '@/lib/events/store';

type PythonFallbackRow = {
  ticker?: string;
  companyName?: string | null;
  sector?: string | null;
  industry?: string | null;
  country?: string | null;
  exchange?: string | null;
  currency?: string | null;
  price?: number | null;
  marketCap?: number | null;
  sharesOutstanding?: number | null;
};

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

function daysOld(dateString: string | null | undefined): number | null {
  if (!dateString) return null;
  const parsed = new Date(dateString);
  if (Number.isNaN(parsed.getTime())) return null;
  const diffMs = Date.now() - parsed.getTime();
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

function isStale(dateString: string | null | undefined, maxDays: number): boolean {
  const age = daysOld(dateString);
  return age === null ? true : age > maxDays;
}

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

  const resolvedTicker = profile?.company.ticker ?? query.ticker;
  if (!resolvedTicker) return null;

  const useDemoFundamentalsFallback =
    !profile?.snapshot ||
    !(typeof profile.snapshot.revenueLtm === 'number' && Number.isFinite(profile.snapshot.revenueLtm) && profile.snapshot.revenueLtm > 0);

  const useYfinanceFallback =
    !profile?.latestPrice ||
    isStale(profile.latestPrice.date, 3) ||
    !profile.company.name ||
    !profile.snapshot;

  const useFinanceDatabaseFallback =
    !profile?.company.name ||
    !profile.company.sector ||
    !profile.company.industry ||
    !profile.company.exchange;

  const yfinanceScript = path.join(process.cwd(), 'scripts/providers/yfinance_quote.py');
  const financeDatabaseScript = path.join(process.cwd(), 'scripts/providers/financedatabase_metadata.py');

  const [demoFundamentals, demoQuote, yfinanceFallback, financedatabaseFallback] = await Promise.all([
    useDemoFundamentalsFallback ? getDemoFundamentals(resolvedTicker).catch(() => null) : Promise.resolve(null),
    useDemoFundamentalsFallback ? getDemoQuote(resolvedTicker).catch(() => null) : Promise.resolve(null),
    useYfinanceFallback
      ? runPythonJson<PythonFallbackRow>(yfinanceScript, [resolvedTicker])
      : Promise.resolve(null),
    useFinanceDatabaseFallback
      ? runPythonJson<PythonFallbackRow>(financeDatabaseScript, [resolvedTicker])
      : Promise.resolve(null),
  ]);

  const companyName =
    profile?.company.name ??
    demoFundamentals?.companyName ??
    financedatabaseFallback?.companyName ??
    yfinanceFallback?.companyName ??
    query.companyName ??
    null;

  const price = pickNumber(profile?.latestPrice?.close, pickNumber(demoQuote?.price ?? null, yfinanceFallback?.price));
  const marketCap = pickNumber(profile?.snapshot?.marketCap, pickNumber(demoQuote?.marketCap ?? null, yfinanceFallback?.marketCap));
  const sharesOutstanding = pickNumber(profile?.snapshot?.sharesOutstanding, pickNumber(demoQuote?.sharesOutstanding ?? null, yfinanceFallback?.sharesOutstanding));
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
    { label: 'Revenue', value: pickNumber(profile?.snapshot?.revenueLtm, demoFundamentals?.revenueLTM ?? null) ?? NaN },
    { label: 'EBITDA', value: pickNumber(profile?.snapshot?.ebitdaLtm, demoFundamentals?.ebitdaLTM ?? null) ?? NaN },
    { label: 'Net Inc.', value: pickNumber(profile?.snapshot?.netIncomeLtm, demoFundamentals?.netIncomeLTM ?? null) ?? NaN },
  ].filter((row) => Number.isFinite(row.value));

  return {
    ticker: resolvedTicker,
    companyName,
    sector: profile?.company.sector ?? demoFundamentals?.sector ?? financedatabaseFallback?.sector ?? yfinanceFallback?.sector ?? null,
    industry: profile?.company.industry ?? financedatabaseFallback?.industry ?? yfinanceFallback?.industry ?? null,
    exchange: profile?.company.exchange ?? financedatabaseFallback?.exchange ?? yfinanceFallback?.exchange ?? null,
    country: profile?.company.country ?? financedatabaseFallback?.country ?? yfinanceFallback?.country ?? null,
    currency: profile?.snapshot?.currency ?? demoFundamentals?.currency ?? yfinanceFallback?.currency ?? 'USD',
    price,
    marketCap,
    sharesOutstanding,
    revenueLtm: pickNumber(profile?.snapshot?.revenueLtm, demoFundamentals?.revenueLTM ?? null),
    ebitdaLtm: pickNumber(profile?.snapshot?.ebitdaLtm, demoFundamentals?.ebitdaLTM ?? null),
    netIncomeLtm: pickNumber(profile?.snapshot?.netIncomeLtm, demoFundamentals?.netIncomeLTM ?? null),
    cash: pickNumber(profile?.snapshot?.cash, demoFundamentals?.cash ?? null),
    totalDebt: pickNumber(profile?.snapshot?.totalDebt, demoFundamentals?.totalDebt ?? null),
    asOfDate: profile?.snapshot?.asOfDate ?? null,
    priceAsOfDate: profile?.latestPrice?.date ?? (price !== null ? new Date().toISOString().slice(0, 10) : null),
    source: {
      company: profile?.company.name
        ? 'company_cache'
        : demoFundamentals?.companyName
          ? 'demo_snapshots'
        : financedatabaseFallback?.companyName
          ? 'financedatabase'
          : yfinanceFallback?.companyName
            ? 'yfinance'
            : null,
      fundamentals: profile?.snapshot?.source ?? demoFundamentals?.source ?? null,
      price: profile?.latestPrice?.source ?? demoQuote?.source ?? (price !== null ? 'yfinance' : null),
    },
    chart:
      recentPricePoints.length > 1
        ? { kind: 'price', points: recentPricePoints }
        : { kind: 'fundamentals', points: fundamentalPoints },
    fallbackUsed: {
      yfinance: Boolean(yfinanceFallback),
      financedatabase: Boolean(financedatabaseFallback),
    },
  };
}
