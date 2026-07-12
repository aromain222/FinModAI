import { getLatestEarningsPackage } from '@/lib/analyst/earningsPackageRepo';
import { fetchConsensusEstimates } from '@/lib/data/consensusEstimates';
import { getLiveCompanyFinancialSnapshot } from '@/lib/data/company/liveFinancialSnapshot';
import { fetchHistoricalFinancials } from '@/lib/data/historicalFinancials';
import { buildProviderBackedPriceForecast } from '@/lib/forecast/providerBackedForecast';
import { buildMarketStatePacket } from '@/lib/pm/marketState/buildMarketState';
import type { MarketStatePacket } from '@/lib/pm/marketState/marketStateContract';
import { fetchXTickerPulse } from '@/lib/x/tickerPulse';
import {
  DEFAULT_RESEARCH_HORIZON_DAYS,
  type ResearchCatalyst,
  type ResearchHorizon,
  type ResearchMetric,
  type ResearchPacket,
} from '@/lib/pm/research/researchPacketContract';

export { DEFAULT_RESEARCH_HORIZON_DAYS } from '@/lib/pm/research/researchPacketContract';
export type { ResearchPacket } from '@/lib/pm/research/researchPacketContract';

type CompanyInfoPayload = {
  news?: Array<{
    title?: string;
    source?: string;
    publishedAt?: string;
    url?: string;
  }>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, decimals = 1): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function metric(
  value: number | null | undefined,
  source: string | null,
  asOf: string | null,
  unit?: string,
): ResearchMetric {
  return {
    value: typeof value === 'number' && Number.isFinite(value) ? value : null,
    source,
    asOf,
    ...(unit ? { unit } : {}),
  };
}

function safeRatio(numerator: number | null, denominator: number | null, scale = 1): number | null {
  if (numerator === null || denominator === null || denominator === 0) return null;
  return round((numerator / denominator) * scale);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildHorizon(days: number, now: Date): ResearchHorizon {
  const normalizedDays = Math.round(clamp(days, 21, 90));
  return {
    days: normalizedDays,
    startDate: now.toISOString().slice(0, 10),
    endDate: addDays(now, normalizedDays).toISOString().slice(0, 10),
    label: `${normalizedDays}-day / 1-3 month`,
  };
}

function historicalRevenueGrowth(
  years: number[],
  revenue: number[],
): number | null {
  const points = years
    .map((year, index) => ({ year, value: revenue[index] }))
    .filter((point): point is { year: number; value: number } => (
      Number.isFinite(point.year) && Number.isFinite(point.value) && point.value > 0
    ))
    .sort((left, right) => right.year - left.year);
  if (points.length < 2) return null;
  return round(((points[0].value / points[1].value) - 1) * 100);
}

function pricePathStats(prices: number[]): { momentum20dPct: number | null; annualizedVolatilityPct: number | null } {
  const clean = prices.filter(price => Number.isFinite(price) && price > 0);
  const momentum20dPct = clean.length >= 21
    ? round(((clean[clean.length - 1] / clean[clean.length - 21]) - 1) * 100)
    : null;
  if (clean.length < 21) return { momentum20dPct, annualizedVolatilityPct: null };

  const returns: number[] = [];
  for (let index = 1; index < clean.length; index += 1) {
    returns.push((clean[index] / clean[index - 1]) - 1);
  }
  const sample = returns.slice(-60);
  const mean = sample.reduce((sum, value) => sum + value, 0) / sample.length;
  const variance = sample.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / Math.max(1, sample.length - 1);
  return {
    momentum20dPct,
    annualizedVolatilityPct: round(Math.sqrt(variance) * Math.sqrt(252) * 100),
  };
}

function compactEarningsHighlights(value: Record<string, unknown>): string[] {
  const highlights: string[] = [];
  const visit = (record: Record<string, unknown>, prefix = '', depth = 0): void => {
    if (depth > 2 || highlights.length >= 12) return;
    for (const [key, item] of Object.entries(record)) {
      if (highlights.length >= 12) break;
      const label = prefix ? `${prefix}.${key}` : key;
      if (typeof item === 'string' && item.trim()) {
        highlights.push(`${label}: ${item.trim().replace(/\s+/g, ' ').slice(0, 180)}`);
      } else if (typeof item === 'number' && Number.isFinite(item)) {
        highlights.push(`${label}: ${item}`);
      } else if (item && typeof item === 'object' && !Array.isArray(item)) {
        visit(item as Record<string, unknown>, label, depth + 1);
      }
    }
  };
  visit(value);
  return highlights;
}

async function fetchCompanyCatalysts(ticker: string, origin: string): Promise<ResearchCatalyst[]> {
  try {
    const response = await fetch(`${origin}/api/company-info?ticker=${encodeURIComponent(ticker)}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const payload = await response.json() as CompanyInfoPayload;
    return (payload.news ?? [])
      .filter(item => typeof item.title === 'string' && item.title.trim().length > 0)
      .slice(0, 12)
      .map(item => ({
        title: item.title!.trim(),
        source: item.source?.trim() || null,
        publishedAt: item.publishedAt ?? null,
        url: item.url ?? null,
      }));
  } catch {
    return [];
  }
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

export async function buildResearchPacket(params: {
  ticker: string;
  origin: string;
  horizonDays?: number;
  now?: Date;
  /** Pre-built market-wide state, so batch callers don't refetch it per ticker. */
  marketState?: MarketStatePacket | null;
}): Promise<ResearchPacket> {
  const ticker = params.ticker.trim().toUpperCase();
  const now = params.now ?? new Date();
  const horizon = buildHorizon(params.horizonDays ?? DEFAULT_RESEARCH_HORIZON_DAYS, now);
  const results = await Promise.allSettled([
    getLiveCompanyFinancialSnapshot(ticker),
    fetchHistoricalFinancials(ticker, 5),
    fetchConsensusEstimates(ticker),
    getLatestEarningsPackage(ticker),
    buildProviderBackedPriceForecast(ticker, horizon.days),
    fetchCompanyCatalysts(ticker, params.origin),
    params.marketState !== undefined
      ? Promise.resolve(params.marketState)
      : buildMarketStatePacket({ origin: params.origin, now }),
    fetchXTickerPulse(ticker),
  ] as const);

  const snapshot = settledValue(results[0]);
  const historical = settledValue(results[1]);
  const consensus = settledValue(results[2]);
  const earnings = settledValue(results[3]);
  const forecast = settledValue(results[4]);
  const catalysts = settledValue(results[5]) ?? [];
  const marketState = settledValue(results[6]);
  const socialPulse = settledValue(results[7]);

  const fundamentalsSource = snapshot?.source.fundamentals ?? null;
  const fundamentalsAsOf = snapshot?.asOfDate ?? null;
  const priceSource = snapshot?.source.price ?? forecast?.model_source ?? null;
  const priceAsOf = snapshot?.priceAsOfDate ?? forecast?.historical.dates.at(-1) ?? null;
  const revenueLtm = snapshot?.revenueLtm ?? null;
  const ebitdaLtm = snapshot?.ebitdaLtm ?? null;
  const netIncomeLtm = snapshot?.netIncomeLtm ?? null;
  const grossMarginPct = safeRatio(snapshot?.grossProfitLtm ?? null, revenueLtm, 100);
  const ebitdaMarginPct = safeRatio(ebitdaLtm, revenueLtm, 100);
  const netMarginPct = safeRatio(netIncomeLtm, revenueLtm, 100);
  const netDebt = snapshot?.totalDebt !== null && snapshot?.totalDebt !== undefined
    ? snapshot.totalDebt - (snapshot.cash ?? 0)
    : null;
  // Negative EBITDA flips the ratio's sign, which downstream scoring would read
  // as net cash — treat leverage as unmeasurable instead.
  const netDebtToEbitda = ebitdaLtm !== null && ebitdaLtm <= 0
    ? null
    : safeRatio(netDebt, ebitdaLtm);

  const historicalGrowth = historical
    ? historicalRevenueGrowth(historical.years, historical.revenue)
    : null;
  const currentPrice = snapshot?.price ?? forecast?.historical.prices.at(-1) ?? null;
  const forecastTarget = forecast?.forecast.values.at(-1) ?? null;
  const forecastLower = forecast?.forecast.lower.at(-1) ?? null;
  const forecastUpper = forecast?.forecast.upper.at(-1) ?? null;
  const expectedReturnPct = currentPrice && forecastTarget
    ? round(((forecastTarget / currentPrice) - 1) * 100)
    : null;
  const lowerReturnPct = currentPrice && forecastLower
    ? round(((forecastLower / currentPrice) - 1) * 100)
    : null;
  const upperReturnPct = currentPrice && forecastUpper
    ? round(((forecastUpper / currentPrice) - 1) * 100)
    : null;
  const pathStats = pricePathStats(forecast?.historical.prices ?? []);
  const consensusTargetUpside = currentPrice && consensus?.targetPrice
    ? round(((consensus.targetPrice / currentPrice) - 1) * 100)
    : null;

  const available: string[] = [];
  const missing: string[] = [];
  const mark = (key: string, present: boolean): void => {
    (present ? available : missing).push(key);
  };
  mark('live_price', currentPrice !== null);
  mark('company_fundamentals', revenueLtm !== null && ebitdaLtm !== null);
  mark('historical_growth', historicalGrowth !== null);
  mark('consensus_estimates', consensus !== null);
  mark('earnings_package', earnings !== null);
  mark('price_history_and_forecast', forecast !== null);
  mark('company_catalysts', catalysts.length > 0);
  mark('market_state', marketState !== null && marketState.quality.coveragePct >= 50);
  mark('x_social_pulse', socialPulse !== null && socialPulse.postCount > 0);
  // Options/institutional positioning data is still absent — the X pulse covers
  // only the social half of positioning, so this stays explicitly missing.
  mark('positioning_and_options', false);
  mark('peer_valuation', false);
  const coveragePct = Math.round((available.length / (available.length + missing.length)) * 100);
  const warnings = [
    ...(snapshot?.warnings ?? []),
    ...(forecast?.warnings ?? []),
    ...results.flatMap((result, index) => result.status === 'rejected'
      ? [`source_${index + 1}: ${result.reason instanceof Error ? result.reason.message : 'unavailable'}`]
      : []),
  ].slice(0, 20);

  return {
    version: 1,
    ticker,
    companyName: snapshot?.companyName ?? earnings?.companyName ?? null,
    builtAt: now.toISOString(),
    horizon,
    company: {
      sector: snapshot?.sector ?? null,
      industry: snapshot?.industry ?? null,
      exchange: snapshot?.exchange ?? null,
      currency: snapshot?.currency ?? null,
    },
    market: {
      price: metric(currentPrice, priceSource, priceAsOf, snapshot?.currency ?? 'USD'),
      marketCap: metric(snapshot?.marketCap, snapshot?.source.company ?? fundamentalsSource, fundamentalsAsOf, 'USD millions'),
      sharesOutstanding: metric(snapshot?.sharesOutstanding, fundamentalsSource, fundamentalsAsOf, 'millions'),
    },
    fundamentals: {
      revenueLtm: metric(revenueLtm, fundamentalsSource, fundamentalsAsOf, 'USD millions'),
      grossMarginPct: metric(grossMarginPct, fundamentalsSource, fundamentalsAsOf, '%'),
      ebitdaLtm: metric(ebitdaLtm, fundamentalsSource, fundamentalsAsOf, 'USD millions'),
      ebitdaMarginPct: metric(ebitdaMarginPct, fundamentalsSource, fundamentalsAsOf, '%'),
      netIncomeLtm: metric(netIncomeLtm, fundamentalsSource, fundamentalsAsOf, 'USD millions'),
      netMarginPct: metric(netMarginPct, fundamentalsSource, fundamentalsAsOf, '%'),
      cash: metric(snapshot?.cash, fundamentalsSource, fundamentalsAsOf, 'USD millions'),
      totalDebt: metric(snapshot?.totalDebt, fundamentalsSource, fundamentalsAsOf, 'USD millions'),
      netDebtToEbitda: metric(netDebtToEbitda, fundamentalsSource, fundamentalsAsOf, 'x'),
      historicalRevenueGrowthPct: metric(historicalGrowth, historical?.dataSource ?? null, historical?.lastUpdated ?? null, '%'),
    },
    consensus: {
      revenueEstimateNtm: metric(consensus?.revenueEstimateNTM, consensus?.dataSource ?? null, consensus?.lastUpdated ?? null, 'provider units'),
      epsEstimateNtm: metric(consensus?.epsEstimateNTM, consensus?.dataSource ?? null, consensus?.lastUpdated ?? null, 'USD/share'),
      targetPrice: metric(consensus?.targetPrice, consensus?.dataSource ?? null, consensus?.lastUpdated ?? null, snapshot?.currency ?? 'USD'),
      targetUpsidePct: metric(consensusTargetUpside, consensus?.dataSource ?? null, consensus?.lastUpdated ?? null, '%'),
      analystCount: consensus?.analystCount ?? null,
      rating: consensus?.rating ?? null,
    },
    earnings: {
      fiscalPeriod: earnings?.fiscalPeriod ?? null,
      reportEndDate: earnings?.reportEndDate ?? null,
      filedAt: earnings?.filedAt ?? null,
      lastFetchedAt: earnings?.lastFetchedAt ?? null,
      highlights: earnings ? compactEarningsHighlights(earnings.quarterData) : [],
      source: earnings ? String(earnings.sourceMetadata.provider ?? earnings.sourceMetadata.source ?? 'earnings_package') : null,
    },
    pricePath: {
      expectedReturnPct: metric(expectedReturnPct, forecast?.model_source ?? null, priceAsOf, '%'),
      lowerReturnPct: metric(lowerReturnPct, forecast?.model_source ?? null, priceAsOf, '%'),
      upperReturnPct: metric(upperReturnPct, forecast?.model_source ?? null, priceAsOf, '%'),
      momentum20dPct: metric(pathStats.momentum20dPct, priceSource, priceAsOf, '%'),
      annualizedVolatilityPct: metric(pathStats.annualizedVolatilityPct, priceSource, priceAsOf, '%'),
      methodology: forecast?.methodology ?? null,
    },
    catalysts,
    marketState,
    socialPulse,
    quality: { coveragePct, available, missing, warnings },
  };
}
