import { getLTMFinancials, type LTMFinancials } from '@/lib/getLTMFinancials';
import type { LboAdvancedOptions } from '@/types/lbo';

export interface UnifiedAssumptions {
  ticker: string;
  ltmRevenue: number;
  ltmEbitda: number;
  netDebt: number;
  sharePrice: number;
  basicShares: number;
  fdShares: number;
  taxRate: number;
  revenueCagr: number;
  ebitdaMargin: number;
  lboAdvanced?: LboAdvancedOptions;
}

const DEFAULT_EBITDA_MARGIN = 0.12;
const DEFAULT_REVENUE_CAGR = 0.05;
const DEFAULT_TAX_RATE = 0.25;

/**
 * Build deterministic, fully backfilled assumptions using Polygon (with fallbacks).
 * Ensures required values always exist before running any model.
 */
export async function buildUnifiedAssumptionsFromPolygon(
  ticker: string,
  seedFinancials?: LTMFinancials | null,
  options?: { lboAdvanced?: LboAdvancedOptions }
): Promise<UnifiedAssumptions> {
  const cleanTicker = ticker.trim().toUpperCase();
  const baseFinancials = seedFinancials ?? (await getLTMFinancials(cleanTicker));

  if (!baseFinancials) {
    throw new Error(`[ASSUMPTIONS] Unable to fetch financials for ${cleanTicker}`);
  }

  const fundamentals = baseFinancials as any;

  const polygonRevenue =
    fundamentals?.ltmRevenue ??
    fundamentals?.ttmRevenue ??
    fundamentals?.revenue ??
    fundamentals?.revenueMillions ??
    0;
  const polygonEbitda =
    fundamentals?.ltmEbitda ??
    fundamentals?.ttmEbitda ??
    fundamentals?.ebitda ??
    fundamentals?.ebitdaMillions ??
    0;
  const polygonShares =
    fundamentals?.sharesOutstanding ??
    fundamentals?.sharesOutstandingMillions ??
    fundamentals?.weightedAvgShares ??
    0;

  const needsFallback =
    !polygonRevenue || polygonRevenue <= 0 || !polygonEbitda || polygonEbitda <= 0 || !polygonShares || polygonShares <= 0;

  let fmpData: RawFundamentals | null = null;
  let alphaData: RawFundamentals | null = null;

  if (needsFallback) {
    [fmpData, alphaData] = await Promise.all([
      fetchFmpFundamentals(cleanTicker),
      fetchAlphaVantageFundamentals(cleanTicker),
    ]);
  }

  const rawRevenue =
    polygonRevenue ||
    fmpData?.ltmRevenue ||
    alphaData?.ltmRevenue ||
    0;
  const rawEbitda =
    polygonEbitda ||
    fmpData?.ltmEbitda ||
    0;
  const rawShares =
    polygonShares ||
    fmpData?.sharesOutstanding ||
    alphaData?.sharesOutstanding ||
    0;
  const rawDebt =
    fundamentals?.totalDebt ??
    fundamentals?.totalDebtMillions ??
    (fundamentals?.shortTermDebt ?? 0) + (fundamentals?.longTermDebt ?? 0) ??
    fmpData?.totalDebt ??
    (fmpData ? (fmpData.shortTermDebt ?? 0) + (fmpData.longTermDebt ?? 0) : 0);
  const rawShortTermDebt = fundamentals?.shortTermDebt ?? fmpData?.shortTermDebt ?? 0;
  const rawLongTermDebt = fundamentals?.longTermDebt ?? fmpData?.longTermDebt ?? 0;
  const rawCash = fundamentals?.cashAndEquivalents ?? fundamentals?.cash ?? fmpData?.cashAndEquivalents ?? 0;
  const rawCagr = fundamentals?.revenueCagr ?? fmpData?.revenueCagr ?? alphaData?.revenueCagr;
  const rawPrice = fundamentals?.sharePrice ?? fundamentals?.price ?? fmpData?.sharePrice ?? alphaData?.sharePrice ?? 0;

  const ltmRevenue = toMillionsValue(rawRevenue);
  if (!ltmRevenue || ltmRevenue <= 0) {
    throw new Error(`[ASSUMPTIONS] Polygon missing revenue for ${cleanTicker}. Cannot build model.`);
  }

  let ltmEbitda = toMillionsValue(rawEbitda);
  let usedEbitdaFallback = false;
  if (!ltmEbitda || ltmEbitda <= 0) {
    ltmEbitda = Math.max(ltmRevenue * DEFAULT_EBITDA_MARGIN, 1);
    usedEbitdaFallback = true;
  }

  const basicShares = toMillionsValue(rawShares);
  if (!basicShares || basicShares <= 0) {
    throw new Error(`[ASSUMPTIONS] Polygon missing shares for ${cleanTicker}. Cannot build model.`);
  }

  const fdShares = basicShares;

  let sharePrice = toNumber(rawPrice);
  if (!sharePrice || sharePrice <= 0) {
    const inferredPrice = inferSharePrice(baseFinancials, basicShares, ltmRevenue);
    sharePrice = inferredPrice;
    console.warn(`[FALLBACK] Price missing for ${cleanTicker}. Using fallback value ${sharePrice.toFixed(2)}.`);
  }

  const totalDebtMillions =
    toMillionsValue(rawDebt) || toMillionsValue(rawShortTermDebt + rawLongTermDebt);
  const cashMillions = toMillionsValue(rawCash);
  const netDebt = totalDebtMillions - cashMillions;

  const revenueCagr =
    typeof rawCagr === 'number' && rawCagr > 0 ? rawCagr : DEFAULT_REVENUE_CAGR;
  let ebitdaMargin = ltmEbitda / ltmRevenue;
  if (!isFinite(ebitdaMargin) || ebitdaMargin <= 0) {
    ebitdaMargin = DEFAULT_EBITDA_MARGIN;
  }

  let taxRate = toNumber((baseFinancials as any)?.taxRate);
  if (!isFinite(taxRate) || taxRate <= 0) {
    taxRate = DEFAULT_TAX_RATE;
  }

  const assumptions: UnifiedAssumptions = {
    ticker: cleanTicker,
    ltmRevenue,
    ltmEbitda,
    netDebt,
    sharePrice,
    basicShares,
    fdShares,
    taxRate,
    revenueCagr,
    ebitdaMargin,
    lboAdvanced: options?.lboAdvanced,
  };

  console.log('[ASSUMPTIONS]', {
    ticker: assumptions.ticker,
    source: {
      polygon: Boolean(fundamentals),
      fmp: Boolean(fmpData),
      alphaVantage: Boolean(alphaData),
    },
    ltmRevenue: assumptions.ltmRevenue,
    ltmEbitda: assumptions.ltmEbitda,
    netDebt: assumptions.netDebt,
    basicShares: assumptions.basicShares,
    revenueCagr: assumptions.revenueCagr,
    ebitdaMargin: assumptions.ebitdaMargin,
  });

  if (usedEbitdaFallback) {
    console.warn(`[ASSUMPTIONS WARNING] Using fallback EBITDA margin for ${cleanTicker}`);
  }

  if (usedEbitdaFallback) {
    console.warn(`[ASSUMPTIONS WARNING] Using fallback EBITDA margin for ${cleanTicker}`);
  }

  return assumptions;
}

function toNumber(value: unknown): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toMillionsValue(value: unknown): number {
  const num = toNumber(value);
  if (!num || !isFinite(num)) {
    return 0;
  }
  if (Math.abs(num) > 1_000_000) {
    return num / 1_000_000;
  }
  return num;
}

function inferSharePrice(financials: LTMFinancials, shares: number, revenue: number): number {
  const marketCap = toNumber((financials as any)?.marketCap);
  if (marketCap > 0 && shares > 0) {
    return Math.max(marketCap / shares, 1);
  }

  return Math.max((revenue / Math.max(shares, 1)) * 0.5, 5);
}

interface RawFundamentals {
  ltmRevenue?: number;
  ltmEbitda?: number;
  totalDebt?: number;
  shortTermDebt?: number;
  longTermDebt?: number;
  cashAndEquivalents?: number;
  sharesOutstanding?: number;
  revenueCagr?: number;
  sharePrice?: number;
}

async function fetchFmpFundamentals(ticker: string): Promise<RawFundamentals | null> {
  try {
    const apiKey = process.env.FMP_API_KEY;
    if (!apiKey) {
      return null;
    }
    const url = `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${ticker}?apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : data;
    if (!first) {
      return null;
    }
    return {
      ltmRevenue: typeof first.revenueTTM === 'number' ? first.revenueTTM : undefined,
      ltmEbitda: typeof first.ebitdaTTM === 'number' ? first.ebitdaTTM : undefined,
      sharesOutstanding: typeof first.sharesOutstanding === 'number' ? first.sharesOutstanding : undefined,
      totalDebt: typeof first.totalDebt === 'number' ? first.totalDebt : undefined,
      shortTermDebt: typeof first.shortTermDebt === 'number' ? first.shortTermDebt : undefined,
      longTermDebt: typeof first.longTermDebt === 'number' ? first.longTermDebt : undefined,
      cashAndEquivalents: typeof first.cashAndShortTermInvestments === 'number' ? first.cashAndShortTermInvestments : undefined,
      revenueCagr: typeof first.revenueGrowthTTM === 'number' ? first.revenueGrowthTTM : undefined,
      sharePrice: typeof first.marketCap === 'number' && typeof first.sharesOutstanding === 'number' && first.sharesOutstanding > 0
        ? first.marketCap / first.sharesOutstanding
        : undefined,
    };
  } catch (error) {
    console.warn('[FMP FALLBACK ERROR]', error);
    return null;
  }
}

async function fetchAlphaVantageFundamentals(ticker: string): Promise<RawFundamentals | null> {
  try {
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
    if (!apiKey) {
      return null;
    }
    const url = `https://www.alphavantage.co/query?function=OVERVIEW&symbol=${ticker}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) {
      return null;
    }
    const data = await res.json();
    if (!data || !data.Symbol) {
      return null;
    }
    return {
      ltmRevenue: data.RevenueTTM ? Number(data.RevenueTTM) : undefined,
      sharesOutstanding: data.SharesOutstanding ? Number(data.SharesOutstanding) : undefined,
      revenueCagr: data.QuarterlyRevenueGrowthYOY ? Number(data.QuarterlyRevenueGrowthYOY) : undefined,
      sharePrice: data.MarketCapitalization && data.SharesOutstanding
        ? Number(data.MarketCapitalization) / Number(data.SharesOutstanding)
        : undefined,
    };
  } catch (error) {
    console.warn('[ALPHA FALLBACK ERROR]', error);
    return null;
  }
}
