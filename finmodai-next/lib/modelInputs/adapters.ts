import { getLTMFinancials } from '@/lib/getLTMFinancials';
import type { LTMFinancials } from '@/lib/getLTMFinancials';
import type { ManualInputs, ModelInputs } from '@/types/modelInputs';
import { ManualInputsSchema } from '@/types/modelInputs';
import {
  LIVE_DATA_FALLBACK_NOTICE,
  normalizeModelInputs,
  safeDivide,
} from '@/lib/modelInputs/defensive';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normalizePct = (value: number, fallback: number): number => {
  if (!Number.isFinite(value)) return fallback;
  const normalized = Math.abs(value) > 1 ? value / 100 : value;
  return normalized;
};

const sortHistory = (items: Array<{ year: number; revenue: number }>) =>
  [...items].sort((a, b) => a.year - b.year);

const parseHumanNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const cleaned = trimmed.replace(/\$/g, '').replace(/,/g, '').replace(/\s+/g, '');
  const match = cleaned.match(/^(-?\d*\.?\d+)([kmbt])?$/i);
  if (!match) {
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const base = Number(match[1]);
  if (!Number.isFinite(base)) return undefined;
  const suffix = match[2]?.toLowerCase();
  const multiplier =
    suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : suffix === 'b' ? 1e9 : suffix === 't' ? 1e12 : 1;
  return base * multiplier;
};

const SEEDED_TICKER_FALLBACKS: Record<string, Partial<LTMFinancials>> = {
  AAPL: {
    companyName: 'Apple Inc.',
    revenue: 435620,
    ebitda: 152900,
    netIncome: 117780,
    cash: 144800,
    totalDebt: 90510,
    sharesOutstanding: 14680,
    marketCap: 2862600,
  },
  MSFT: {
    companyName: 'Microsoft Corporation',
    revenue: 261800,
    ebitda: 133100,
    netIncome: 94100,
    cash: 111700,
    totalDebt: 65800,
    sharesOutstanding: 7430,
    marketCap: 3070000,
  },
  GOOGL: {
    companyName: 'Alphabet Inc.',
    revenue: 347900,
    ebitda: 123000,
    netIncome: 100100,
    cash: 110900,
    totalDebt: 25000,
    sharesOutstanding: 12330,
    marketCap: 2230000,
  },
  AMZN: {
    companyName: 'Amazon.com, Inc.',
    revenue: 637900,
    ebitda: 129000,
    netIncome: 59200,
    cash: 93000,
    totalDebt: 158000,
    sharesOutstanding: 10600,
    marketCap: 2060000,
  },
};

const deterministicSeedFromTicker = (ticker: string): number =>
  ticker.split('').reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 7), 0);

export const buildSeededFallbackLtm = (ticker: string): LTMFinancials => {
  const seeded = SEEDED_TICKER_FALLBACKS[ticker];
  if (seeded?.revenue && seeded.revenue > 0) {
    return {
      ticker,
      revenue: seeded.revenue,
      ebitda: seeded.ebitda,
      netIncome: seeded.netIncome,
      cash: seeded.cash,
      totalDebt: seeded.totalDebt,
      sharesOutstanding: seeded.sharesOutstanding,
      marketCap: seeded.marketCap,
      companyName: seeded.companyName || ticker,
      sector: seeded.sector || undefined,
      dataSource: 'demo_seed_fallback',
      fiscalPeriod: 'LTM',
      lastUpdated: new Date().toISOString(),
    };
  }

  const seed = deterministicSeedFromTicker(ticker);
  const revenue = 25000 + (seed % 85000);
  const ebitdaMargin = 0.18 + ((seed % 12) / 100);
  const netMargin = 0.08 + ((seed % 7) / 100);
  const sharesOutstanding = 1500 + (seed % 10000);
  const sharePrice = 25 + (seed % 260);
  const marketCap = sharesOutstanding * sharePrice;
  const cash = revenue * 0.12;
  const totalDebt = revenue * 0.22;

  return {
    ticker,
    companyName: ticker,
    revenue,
    ebitda: revenue * ebitdaMargin,
    netIncome: revenue * netMargin,
    cash,
    totalDebt,
    sharesOutstanding,
    marketCap,
    dataSource: 'demo_seed_fallback',
    fiscalPeriod: 'LTM',
    lastUpdated: new Date().toISOString(),
  };
};

const toModelInputsFromLtm = (
  ticker: string,
  ltm: LTMFinancials,
  metadata?: { liveDataFallback?: boolean; liveDataStatus?: string }
): ModelInputs => {
  const revenue = ltm.revenue;
  const ebitdaMargin =
    typeof ltm.ebitda === 'number' && revenue > 0 ? ltm.ebitda / revenue : (ltm.ebitdaMargin ?? 0.25);
  const netDebt =
    typeof ltm.totalDebt === 'number' && typeof ltm.cash === 'number' ? ltm.totalDebt - ltm.cash : undefined;
  const derivedSharePrice = safeDivide(ltm.marketCap, ltm.sharesOutstanding, Number.NaN);
  const sharePrice = Number.isFinite(derivedSharePrice) && derivedSharePrice > 0 ? derivedSharePrice : undefined;

  return {
    company: {
      name: ltm.companyName || ticker,
      currency: 'USD',
      ticker,
    },
    historicals: {
      revenue: [revenue],
      years: [new Date().getUTCFullYear() - 1],
    },
    assumptions: {
      growth: 0.08,
      margin: clamp(ebitdaMargin, -0.2, 0.8),
      taxRate: 0.25,
      capexPctRevenue: 0.04,
      nwcPctRevenue: 0.02,
      daPctRevenue: 0.04,
      growthSeries: [0.08, 0.08, 0.08, 0.08, 0.08],
    },
    capitalStructure: {
      netDebt,
      sharesOutstanding: ltm.sharesOutstanding,
    },
    pricingAnchor: {
      marketCap: ltm.marketCap,
      sharesOutstanding: ltm.sharesOutstanding,
      sharePrice,
    },
    metadata: {
      source: 'ticker',
      asOfDate: new Date().toISOString().slice(0, 10),
      liveDataFallback: metadata?.liveDataFallback === true,
      liveDataStatus: metadata?.liveDataStatus,
    },
  };
};

export async function fromTicker(ticker: string): Promise<ModelInputs> {
  const cleanTicker = ticker.trim().toUpperCase();
  if (!cleanTicker) {
    throw new Error('Ticker is required for ticker data source.');
  }

  let ltm: LTMFinancials | null = null;
  let usedFallback = false;
  let fallbackStatus = 'live_data_available';
  try {
    ltm = await getLTMFinancials(cleanTicker);
  } catch (error: any) {
    usedFallback = true;
    fallbackStatus = `fetch_error:${error?.message || 'unknown'}`;
  }

  if (!ltm || !(typeof ltm.revenue === 'number' && Number.isFinite(ltm.revenue) && ltm.revenue > 0)) {
    usedFallback = true;
    fallbackStatus = fallbackStatus === 'live_data_available' ? 'missing_live_data' : fallbackStatus;
    ltm = buildSeededFallbackLtm(cleanTicker);
  }

  const normalized = normalizeModelInputs(
    toModelInputsFromLtm(cleanTicker, ltm, {
      liveDataFallback: usedFallback,
      liveDataStatus: usedFallback ? fallbackStatus : 'live_data_available',
    })
  );
  if (!normalized.ok || !normalized.value) {
    const reason = normalized.issues[0]?.message || `No usable ticker financials for ${cleanTicker}.`;
    throw new Error(reason);
  }
  if (usedFallback) {
    normalized.value.metadata.liveDataFallback = true;
    normalized.value.metadata.liveDataStatus = fallbackStatus;
  }
  return normalized.value;
}

export function fromManual(payload: ManualInputs): ModelInputs {
  const parsed = ManualInputsSchema.parse(payload);
  const nowYear = new Date().getUTCFullYear();
  const history = parsed.historicalRevenue ? sortHistory(parsed.historicalRevenue) : [];
  const ltmRevenue = parsed.ltmRevenue ?? (history.length > 0 ? history[history.length - 1].revenue : undefined);
  if (!ltmRevenue || !Number.isFinite(ltmRevenue) || ltmRevenue <= 0) {
    throw new Error('Manual inputs require positive revenue.');
  }

  const years = history.length > 0 ? history.map((p) => p.year) : [nowYear - 1];
  const revenueSeries = history.length > 0 ? history.map((p) => p.revenue) : [ltmRevenue];
  const growthAssumption = normalizePct(parsed.growthAssumption ?? 8, 0.08);
  const growthSeries = parsed.forecastRevenue
    ? (() => {
        const forecast = parsed.forecastRevenue;
        const rates: number[] = [];
        let prev = revenueSeries[revenueSeries.length - 1];
        for (const next of forecast) {
          if (!prev || prev <= 0) {
            rates.push(growthAssumption);
          } else {
            rates.push((next - prev) / prev);
          }
          prev = next;
        }
        return rates.map((g) => clamp(g, -0.95, 3));
      })()
    : Array.from({ length: 5 }, () => clamp(growthAssumption, -0.95, 3));

  const margin = clamp(normalizePct(parsed.marginAssumption ?? 0.2, 0.2), -0.5, 0.8);
  const taxRate = clamp(normalizePct(parsed.taxRate, 0.25), 0, 0.6);
  const capexPctRevenue = clamp(normalizePct(parsed.capexPctRevenue, 0.04), -1, 1);
  const nwcPctRevenue = clamp(normalizePct(parsed.nwcPctRevenue, 0.02), -1, 1);
  const daPctRevenue =
    parsed.daPctRevenue !== undefined ? clamp(normalizePct(parsed.daPctRevenue, 0.04), -1, 1) : undefined;

  const manualModelInputs: ModelInputs = {
    company: {
      name: parsed.companyName.trim(),
      currency: parsed.currency || 'USD',
      ticker: parsed.ticker?.trim() || undefined,
    },
    historicals: {
      years,
      revenue: revenueSeries,
    },
    assumptions: {
      growth: growthSeries[0] ?? growthAssumption,
      margin,
      taxRate,
      capexPctRevenue,
      nwcPctRevenue,
      daPctRevenue,
      growthSeries,
      forecastRevenue: parsed.forecastRevenue,
    },
    capitalStructure: {
      netDebt: parsed.netDebt,
      sharesOutstanding: parsed.sharesOutstanding,
    },
    pricingAnchor: {
      marketCap: parsed.marketCap,
      sharePrice: parsed.sharePrice,
      sharesOutstanding: parsed.sharesOutstanding,
    },
    metadata: {
      source: 'manual',
      asOfDate: parsed.asOfDate || new Date().toISOString().slice(0, 10),
    },
  };

  const normalized = normalizeModelInputs(manualModelInputs);
  if (!normalized.ok || !normalized.value) {
    const message =
      normalized.issues.map((issue) => issue.message).join(' ') || 'Manual inputs are invalid.';
    throw new Error(message);
  }
  return normalized.value;
}

export function manualPayloadFromRequest(body: any): Record<string, unknown> {
  const manualInputs = body?.manualInputs && typeof body.manualInputs === 'object' ? body.manualInputs : {};
  const revenueHistoryRaw =
    typeof manualInputs?.revenueHistory === 'string' ? manualInputs.revenueHistory.trim() : '';
  const parsedRevenueHistory =
    revenueHistoryRaw.length > 0
      ? revenueHistoryRaw
          .split(',')
          .map((item: string) => parseHumanNumber(item))
          .filter(
            (value: number | undefined): value is number =>
              typeof value === 'number' && Number.isFinite(value) && value > 0
          )
          .slice(0, 3)
          .map((value: number, idx: number, arr: number[]) => ({
            year: new Date().getUTCFullYear() - (arr.length - idx),
            revenue: value,
          }))
      : undefined;

  return {
    companyName: String(body?.companyName || manualInputs?.companyName || '').trim(),
    currency: String(body?.currency || manualInputs?.currency || 'USD').trim() || 'USD',
    ticker:
      typeof body?.ticker === 'string' && body.ticker.trim().length > 0
        ? body.ticker.trim().toUpperCase()
        : undefined,
    ltmRevenue: parseHumanNumber(manualInputs?.revenue ?? body?.revenue),
    historicalRevenue:
      parsedRevenueHistory && parsedRevenueHistory.length > 0 ? parsedRevenueHistory : undefined,
    growthAssumption: parseHumanNumber(manualInputs?.revenueGrowthPct ?? body?.growthAssumption),
    marginType: 'ebitda',
    marginAssumption: parseHumanNumber(manualInputs?.ebitMarginPct ?? body?.marginAssumption),
    taxRate: parseHumanNumber(manualInputs?.taxRatePct ?? body?.taxRate),
    capexPctRevenue: parseHumanNumber(manualInputs?.capexPctRevenue ?? body?.capexPctRevenue),
    nwcPctRevenue: parseHumanNumber(manualInputs?.nwcPctRevenue ?? body?.nwcPctRevenue),
    daPctRevenue: parseHumanNumber(manualInputs?.daPctRevenue ?? body?.daPctRevenue),
    netDebt: parseHumanNumber(manualInputs?.netDebt ?? body?.netDebt),
    sharesOutstanding: parseHumanNumber(
      manualInputs?.sharesOutstanding ?? body?.sharesOutstanding ?? body?.shares_outstanding ?? body?.shares_out_basic
    ),
    sharePrice: parseHumanNumber(manualInputs?.price ?? body?.sharePrice ?? body?.price),
    marketCap: parseHumanNumber(manualInputs?.marketCap ?? body?.marketCap ?? body?.market_cap),
  };
}

export { LIVE_DATA_FALLBACK_NOTICE };
