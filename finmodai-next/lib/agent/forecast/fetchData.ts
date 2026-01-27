import 'server-only';

import { ENV, keysPresent } from '@/lib/env/server';
import { getMarketSeries, type MarketRange } from '@/lib/market/provider';
import type { ForecastAgentProvidedData, ForecastRequiredData } from './types';

type ProviderAttempt = {
  provider: string;
  ok: boolean;
  reason?: string;
  status?: number;
};

const timeoutMs = 12_000;

function log(traceId: string, level: 'info' | 'warn' | 'error', message: string, data?: unknown) {
  const payload = { traceId, ts: new Date().toISOString(), ...(data ? { data } : {}) };
  const prefix = `[forecast-data:${level}] ${message}`;
  if (level === 'error') console.error(prefix, payload);
  else if (level === 'warn') console.warn(prefix, payload);
  else console.log(prefix, payload);
}

async function fetchJson<T>(url: string): Promise<{ ok: true; status: number; data: T } | { ok: false; status: number; error: string }> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) {
      return { ok: false, status: res.status, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as T;
    return { ok: true, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

function toMillions(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) > 1_000_000 ? n / 1_000_000 : n;
}

function toSharesMillions(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  // FMP tends to return raw share count; Finnhub returns millions.
  return Math.abs(n) > 1_000_000 ? n / 1_000_000 : n;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function computeEtfForSector(sector: string): string {
  const key = sector.trim().toLowerCase();
  const map: Record<string, string> = {
    technology: 'XLK',
    'communication services': 'XLC',
    energy: 'XLE',
    financials: 'XLF',
    healthcare: 'XLV',
    industrials: 'XLI',
    'consumer discretionary': 'XLY',
    'consumer staples': 'XLP',
    materials: 'XLB',
    utilities: 'XLU',
    'real estate': 'XLRE',
    unknown: 'SPY',
  };
  return map[key] || 'SPY';
}

function computePriceCagrPct(points: Array<{ t: string; close: number }>): number | null {
  if (points.length < 2) return null;
  const first = points[0]?.close;
  const last = points[points.length - 1]?.close;
  if (!(first > 0) || !(last > 0)) return null;
  const years = Math.max(1, Math.round((points.length - 1) / 252));
  const cagr = Math.pow(last / first, 1 / years) - 1;
  return Number.isFinite(cagr) ? round1(cagr * 100) : null;
}

async function fetchPriceHistory(ticker: string, range: MarketRange, traceId: string) {
  const series = await getMarketSeries({ ticker, range, traceId });
  return {
    ticker,
    points: series.points.map((p) => ({ t: p.t, close: p.close })),
  };
}

async function fetchFmpAnnualSeries(ticker: string, traceId: string): Promise<{
  ok: boolean;
  attempt: ProviderAttempt;
  annual?: NonNullable<ForecastAgentProvidedData['fundamentals']>['annual'];
}> {
  if (!keysPresent.fmp || !ENV.FMP_API_KEY) {
    return { ok: false, attempt: { provider: 'FMP', ok: false, reason: 'missing-key' } };
  }

  const apiKey = ENV.FMP_API_KEY;
  const incomeUrl = `https://financialmodelingprep.com/api/v3/income-statement/${encodeURIComponent(ticker)}?limit=6&apikey=${apiKey}`;
  const cashflowUrl = `https://financialmodelingprep.com/api/v3/cash-flow-statement/${encodeURIComponent(ticker)}?limit=6&apikey=${apiKey}`;

  const [incomeRes, cashflowRes] = await Promise.all([fetchJson<any[]>(incomeUrl), fetchJson<any[]>(cashflowUrl)]);

  if (!incomeRes.ok) {
    return { ok: false, attempt: { provider: 'FMP', ok: false, reason: incomeRes.error, status: incomeRes.status } };
  }

  const income = Array.isArray(incomeRes.data) ? incomeRes.data : [];
  const cashflow = cashflowRes.ok && Array.isArray(cashflowRes.data) ? cashflowRes.data : [];

  const byYear = new Map<string, { periodEndISO?: string; year?: number; revenue?: number; ebitda?: number; fcf?: number; shares?: number }>();

  for (const row of income) {
    const periodEndISO = typeof row.date === 'string' ? row.date : undefined;
    const year = typeof row.calendarYear === 'string' ? Number(row.calendarYear) : typeof row.calendarYear === 'number' ? row.calendarYear : undefined;
    const key = String(year ?? (periodEndISO ? Number(periodEndISO.slice(0, 4)) : ''));
    if (!key || key === 'NaN') continue;
    const existing = byYear.get(key) ?? {};
    byYear.set(key, {
      ...existing,
      periodEndISO,
      year: year ?? existing.year,
      revenue: toMillions(row.revenue) ?? existing.revenue,
      ebitda: toMillions(row.ebitda) ?? existing.ebitda,
      shares: toSharesMillions(row.weightedAverageShsOut ?? row.weightedAverageShsOutDil) ?? existing.shares,
    });
  }

  for (const row of cashflow) {
    const periodEndISO = typeof row.date === 'string' ? row.date : undefined;
    const year = typeof row.calendarYear === 'string' ? Number(row.calendarYear) : typeof row.calendarYear === 'number' ? row.calendarYear : undefined;
    const key = String(year ?? (periodEndISO ? Number(periodEndISO.slice(0, 4)) : ''));
    if (!key || key === 'NaN') continue;
    const existing = byYear.get(key) ?? {};
    const freeCashFlow = toMillions(row.freeCashFlow);
    const operatingCashFlow = toMillions(row.operatingCashFlow);
    const capitalExpenditure = toMillions(row.capitalExpenditure);
    const derivedFcf =
      freeCashFlow ?? (operatingCashFlow !== null && capitalExpenditure !== null ? operatingCashFlow - capitalExpenditure : null);
    byYear.set(key, {
      ...existing,
      periodEndISO,
      year: year ?? existing.year,
      fcf: derivedFcf ?? existing.fcf,
    });
  }

  const annual = Array.from(byYear.values())
    .filter((row) => typeof row.year === 'number' || typeof row.periodEndISO === 'string')
    .sort((a, b) => {
      const ak = (a.periodEndISO ?? String(a.year ?? '')).slice(0, 10);
      const bk = (b.periodEndISO ?? String(b.year ?? '')).slice(0, 10);
      return ak < bk ? -1 : ak > bk ? 1 : 0;
    });

  log(traceId, 'info', 'FMP annual series fetched', { ticker, years: annual.length });
  return { ok: true, attempt: { provider: 'FMP', ok: true }, annual };
}

async function fetchFmpTtmMetrics(ticker: string, traceId: string): Promise<{
  ok: boolean;
  attempt: ProviderAttempt;
  ttm?: NonNullable<ForecastAgentProvidedData['fundamentals']>['ttm'];
}> {
  if (!keysPresent.fmp || !ENV.FMP_API_KEY) {
    return { ok: false, attempt: { provider: 'FMP', ok: false, reason: 'missing-key' } };
  }

  const apiKey = ENV.FMP_API_KEY;
  const url = `https://financialmodelingprep.com/api/v3/key-metrics-ttm/${encodeURIComponent(ticker)}?apikey=${apiKey}`;
  const res = await fetchJson<any[]>(url);
  if (!res.ok) {
    return { ok: false, attempt: { provider: 'FMP', ok: false, reason: res.error, status: res.status } };
  }
  const first = Array.isArray(res.data) ? res.data[0] : null;
  if (!first) {
    return { ok: false, attempt: { provider: 'FMP', ok: false, reason: 'no-data' } };
  }

  const revenue = toMillions(first.revenueTTM);
  const ebitda = toMillions(first.ebitdaTTM);
  const fcf = toMillions(first.freeCashFlowTTM ?? first.freeCashFlow);
  const shares = toSharesMillions(first.sharesOutstanding);

  const marginPct =
    revenue !== null && revenue > 0 && ebitda !== null && ebitda > 0 ? round1((ebitda / revenue) * 100) : null;

  const ev =
    typeof first.enterpriseValueTTM === 'number'
      ? toMillions(first.enterpriseValueTTM)
      : typeof first.enterpriseValue === 'number'
        ? toMillions(first.enterpriseValue)
        : null;

  const evToEbitdaRaw =
    typeof first.enterpriseValueOverEBITDATTM === 'number'
      ? first.enterpriseValueOverEBITDATTM
      : typeof first.evToEbitdaTTM === 'number'
        ? first.evToEbitdaTTM
        : null;

  const evToEbitda =
    typeof evToEbitdaRaw === 'number'
      ? round1(evToEbitdaRaw)
      : ev !== null && ebitda !== null && ebitda > 0
        ? round1((ev * 1_000_000) / (ebitda * 1_000_000)) // keep units aligned even if already mm
        : null;

  log(traceId, 'info', 'FMP TTM metrics fetched', { ticker, hasRevenue: revenue !== null, hasMultiple: evToEbitda !== null });
  return {
    ok: true,
    attempt: { provider: 'FMP', ok: true },
    ttm: {
      revenue,
      ebitdaMarginPct: marginPct,
      fcf,
      shares,
      evToEbitda,
    },
  };
}

async function fetchFinnhubTtmMetrics(ticker: string, traceId: string): Promise<{
  ok: boolean;
  attempt: ProviderAttempt;
  ttm?: NonNullable<ForecastAgentProvidedData['fundamentals']>['ttm'];
}> {
  if (!keysPresent.finnhub || !ENV.FINNHUB_API_KEY) {
    return { ok: false, attempt: { provider: 'FINNHUB', ok: false, reason: 'missing-key' } };
  }
  const token = ENV.FINNHUB_API_KEY;

  const profileUrl = `https://finnhub.io/api/v1/stock/profile2?symbol=${encodeURIComponent(ticker)}&token=${token}`;
  const metricsUrl = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(ticker)}&metric=all&token=${token}`;

  const [profileRes, metricsRes] = await Promise.all([fetchJson<any>(profileUrl), fetchJson<any>(metricsUrl)]);

  if (!profileRes.ok) {
    return { ok: false, attempt: { provider: 'FINNHUB', ok: false, reason: profileRes.error, status: profileRes.status } };
  }
  if (!metricsRes.ok) {
    return { ok: false, attempt: { provider: 'FINNHUB', ok: false, reason: metricsRes.error, status: metricsRes.status } };
  }

  const profile = profileRes.data ?? {};
  const metric = metricsRes.data?.metric ?? {};

  const shares = typeof profile.shareOutstanding === 'number' ? profile.shareOutstanding : null; // already millions
  const revenuePerShareTtm = typeof metric.revenuePerShareTTM === 'number' ? metric.revenuePerShareTTM : null;
  const revenue = shares !== null && revenuePerShareTtm !== null ? revenuePerShareTtm * shares : null; // $mm

  const ebitdaMarginRaw = typeof metric.ebitdaMarginTTM === 'number' ? metric.ebitdaMarginTTM : null;
  const ebitdaMarginPct = ebitdaMarginRaw !== null ? round1(ebitdaMarginRaw * 100) : null; // Finnhub margin is ratio

  const fcfPerShareTtm = typeof metric.fcfPerShareTTM === 'number' ? metric.fcfPerShareTTM : null;
  const fcf = shares !== null && fcfPerShareTtm !== null ? fcfPerShareTtm * shares : null; // $mm

  const evToEbitda = typeof metric.evToEbitdaTTM === 'number' ? round1(metric.evToEbitdaTTM) : null;

  log(traceId, 'info', 'Finnhub TTM metrics fetched', { ticker, hasRevenue: revenue !== null, hasMultiple: evToEbitda !== null });
  return {
    ok: true,
    attempt: { provider: 'FINNHUB', ok: true },
    ttm: {
      revenue,
      ebitdaMarginPct,
      fcf,
      shares,
      evToEbitda,
    },
  };
}

function mergeTtm(
  preferred: NonNullable<ForecastAgentProvidedData['fundamentals']>['ttm'] | undefined,
  fallback: NonNullable<ForecastAgentProvidedData['fundamentals']>['ttm'] | undefined
): NonNullable<ForecastAgentProvidedData['fundamentals']>['ttm'] | undefined {
  if (!preferred && !fallback) return undefined;
  return {
    revenue: preferred?.revenue ?? fallback?.revenue,
    ebitdaMarginPct: preferred?.ebitdaMarginPct ?? fallback?.ebitdaMarginPct,
    fcf: preferred?.fcf ?? fallback?.fcf,
    shares: preferred?.shares ?? fallback?.shares,
    evToEbitda: preferred?.evToEbitda ?? fallback?.evToEbitda,
  };
}

export async function fetchForecastAgentData(params: {
  ticker: string;
  required: ForecastRequiredData;
  traceId: string;
}): Promise<{ data: ForecastAgentProvidedData; attempts: ProviderAttempt[] }> {
  const { ticker, required, traceId } = params;
  const attempts: ProviderAttempt[] = [];

  // PRICE HISTORY
  const rangeRaw = required.priceHistory?.range ?? '5Y';
  const range = (['1D', '1W', '1M', '3M', '6M', '1Y', '5Y'].includes(rangeRaw) ? rangeRaw : '5Y') as MarketRange;

  let priceHistory: ForecastAgentProvidedData['priceHistory'] | undefined;
  try {
    priceHistory = await fetchPriceHistory(ticker, range, traceId);
    attempts.push({ provider: 'PRICE_HISTORY', ok: true });
  } catch (e) {
    attempts.push({ provider: 'PRICE_HISTORY', ok: false, reason: e instanceof Error ? e.message : String(e) });
    log(traceId, 'warn', 'Price history fetch failed', { ticker, error: e instanceof Error ? e.message : String(e) });
  }

  // FUNDAMENTALS (multi-provider merge)
  const [finnhubTtm, fmpAnnual, fmpTtm] = await Promise.allSettled([
    fetchFinnhubTtmMetrics(ticker, traceId),
    fetchFmpAnnualSeries(ticker, traceId),
    fetchFmpTtmMetrics(ticker, traceId),
  ]);

  const finnhubTtmVal = finnhubTtm.status === 'fulfilled' ? finnhubTtm.value : null;
  const fmpAnnualVal = fmpAnnual.status === 'fulfilled' ? fmpAnnual.value : null;
  const fmpTtmVal = fmpTtm.status === 'fulfilled' ? fmpTtm.value : null;

  if (finnhubTtmVal) attempts.push(finnhubTtmVal.attempt);
  if (fmpAnnualVal) attempts.push(fmpAnnualVal.attempt);
  if (fmpTtmVal) attempts.push(fmpTtmVal.attempt);

  const annual = fmpAnnualVal?.ok ? fmpAnnualVal.annual : undefined;
  const ttm = mergeTtm(finnhubTtmVal?.ok ? finnhubTtmVal.ttm : undefined, fmpTtmVal?.ok ? fmpTtmVal.ttm : undefined);

  const fundamentals: ForecastAgentProvidedData['fundamentals'] =
    annual || ttm
      ? {
          ticker,
          annual,
          ttm,
        }
      : undefined;

  // SECTOR BENCHMARKS (best-effort)
  let sectorBenchmarks: ForecastAgentProvidedData['sectorBenchmarks'] | undefined;
  const sector = required.sectorBenchmarks?.sector;
  if (typeof sector === 'string' && sector.trim().length) {
    const etfTicker = computeEtfForSector(sector);
    try {
      const series = await fetchPriceHistory(etfTicker, '5Y', traceId);
      sectorBenchmarks = {
        sector,
        etfTicker,
        priceCAGR_5Y: computePriceCagrPct(series.points),
      };
      attempts.push({ provider: 'SECTOR_BENCHMARKS', ok: true });
    } catch (e) {
      attempts.push({ provider: 'SECTOR_BENCHMARKS', ok: false, reason: e instanceof Error ? e.message : String(e) });
      log(traceId, 'warn', 'Sector benchmark fetch failed', { sector, etfTicker, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return {
    data: {
      priceHistory,
      fundamentals,
      sectorBenchmarks,
    },
    attempts,
  };
}

