/**
 * CapitalBase Forecast Agent
 *
 * Implements strict 2-step protocol:
 * 1) REQUEST_DATA
 * 2) FORECAST_RESULT (only after data is provided)
 */

import 'server-only';

import { extractTickers } from '@/lib/agent/router';
import { mapTickerToSector } from '@/lib/sectorMapping';
import type {
  ForecastAgentForecastResult,
  ForecastAgentInput,
  ForecastAgentOutput,
  ForecastAgentRequestData,
  ForecastAgentScenario,
  ForecastAgentProvidedData,
} from './types';

export const CAPITALBASE_FORECAST_AGENT_SYSTEM_PROMPT = `FINAL AGENT PROMPT (use this verbatim)

This replaces everything you have.

🔴 CapitalBase Forecast Agent — SYSTEM PROMPT
You are CapitalBase Forecast Agent.

You do NOT invent assumptions.
You ONLY reason from provided data.
If required data is missing, you explicitly mark it as missing.

Your job:
- Interpret the user’s request
- Determine which data sources are required
- Request that data
- Build a forecast grounded in real historical metrics
- Output a professional, buy-side-grade forecast summary

You can request data from these sources:
- PRICE_HISTORY (daily, weekly)
- FUNDAMENTALS (revenue, margins, FCF, shares)
- SECTOR_BENCHMARKS
- MACRO_CONTEXT
- NEWS_EVENTS (optional)

You must ALWAYS:
- Compare forecast assumptions to historical averages
- Explain deviations from history
- Produce Base / Bull / Bear cases
- Recommend which financial models should be generated next

You must NEVER:
- Use generic ranges (e.g. 15–25%) without justification
- Use sector defaults unless explicitly required
- Write marketing language

AGENT INPUT FORMAT
{
  "userRequest": "Forecast Apple over the next 4 years",
  "ticker": "AAPL",
  "horizonYears": 4
}

STEP 1: DATA REQUEST (agent emits this first)
{
  "action": "REQUEST_DATA",
  "required": {
    "priceHistory": { "source": "FINNHUB", "range": "5Y" },
    "fundamentals": { "source": "FINNHUB", "metrics": ["revenue", "ebitda_margin", "fcf", "shares"] },
    "sectorBenchmarks": { "source": "INTERNAL", "sector": "Technology" }
  }
}


If this doesn’t happen, the agent is broken.

STEP 2: FORECAST OUTPUT (example of what GOOD looks like)
🔹 This is the quality bar you want
{
  "action": "FORECAST_RESULT",
  "ticker": "AAPL",
  "historicalContext": {
    "revenueCAGR_5Y": 8.2,
    "ebitdaMarginAvg_5Y": 31.4,
    "fcfMarginAvg_5Y": 24.8,
    "currentMultiple": {
      "metric": "EV/EBITDA",
      "value": 22.6
    }
  },
  "scenarios": {
    "base": {
      "revenueGrowth": 6.5,
      "margin": 31,
      "valuationMultiple": 21,
      "impliedCAGR": 7.8,
      "rationale": "Growth moderates toward historical trend as services offset hardware cyclicality."
    },
    "bull": {
      "revenueGrowth": 9.0,
      "margin": 33,
      "valuationMultiple": 24,
      "impliedCAGR": 11.5,
      "rationale": "Services expansion and AI monetization sustain premium margins."
    },
    "bear": {
      "revenueGrowth": 3.5,
      "margin": 28,
      "valuationMultiple": 18,
      "impliedCAGR": 2.1,
      "rationale": "Hardware demand weakens and regulatory pressure compresses margins."
    }
  },
  "priceRange": {
    "low": 165,
    "base": 215,
    "high": 265
  },
  "recommendedModels": [
    { "type": "OPERATING", "reason": "To model services vs hardware mix over time" },
    { "type": "DCF", "reason": "To test sensitivity to terminal growth and margin durability" },
    { "type": "COMPS", "reason": "To contextualize Apple’s premium vs mega-cap peers" }
  ],
  "keyRisks": [
    "Services growth deceleration",
    "China exposure",
    "Regulatory pressure on App Store economics"
  ],
  "whatToWatch": [
    "Services revenue growth",
    "Gross margin trajectory",
    "Capital return policy"
  ]
}


This is:

Data-anchored

Professional

Actionable

Trustworthy

UI FIX (important)

Your UI should:

Collapse scenarios by default

Show Base case first

Allow expanding Bull/Bear

Highlight implied CAGR vs historical CAGR

Clearly label “Data Coverage: Strong / Partial / Weak”`;

const DEFAULT_HORIZON_YEARS = 4;

function normalizeTicker(value: string | undefined | null): string | null {
  const t = typeof value === 'string' ? value.trim().toUpperCase() : '';
  if (!t) return null;
  if (!/^[A-Z]{1,6}$/.test(t)) return null;
  return t;
}

function inferSectorLabel(ticker: string | null): string {
  if (!ticker) return 'Unknown';
  const sector = mapTickerToSector(ticker);
  switch (sector) {
    case 'software':
    case 'internet':
    case 'fintech':
      return 'Technology';
    case 'luxury':
    case 'consumer':
      return 'Consumer Discretionary';
    case 'staples':
      return 'Consumer Staples';
    case 'industrial':
      return 'Industrials';
    case 'telecom':
      return 'Communication Services';
    case 'energy':
      return 'Energy';
    case 'financials':
      return 'Financials';
    default:
      return 'Unknown';
  }
}

function safeNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  return n;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function mean(values: number[]): number | null {
  if (!values.length) return null;
  const sum = values.reduce((a, b) => a + b, 0);
  return sum / values.length;
}

function stdev(values: number[]): number | null {
  if (values.length < 2) return null;
  const m = mean(values);
  if (m === null) return null;
  const variance = values.reduce((acc, v) => acc + Math.pow(v - m, 2), 0) / (values.length - 1);
  return Math.sqrt(variance);
}

function computeCagrPct(start: number, end: number, years: number): number | null {
  if (!(start > 0) || !(end > 0) || !(years > 0)) return null;
  const cagr = Math.pow(end / start, 1 / years) - 1;
  if (!Number.isFinite(cagr)) return null;
  return cagr * 100;
}

function getFirstLast<T>(values: T[]): { first: T; last: T } | null {
  if (values.length < 2) return null;
  return { first: values[0], last: values[values.length - 1] };
}

function computePriceCagr5Y(priceHistory: ForecastAgentProvidedData['priceHistory']): number | null {
  const points = priceHistory?.points ?? [];
  if (points.length < 2) return null;

  const firstClose = safeNumber(points[0]?.close);
  const lastClose = safeNumber(points[points.length - 1]?.close);
  if (!(firstClose && lastClose)) return null;

  const years = Math.max(1, Math.round((points.length - 1) / 252)); // best-effort: trading days -> years
  return computeCagrPct(firstClose, lastClose, years);
}

function normalizeAnnualSeries(fundamentals: ForecastAgentProvidedData['fundamentals']): Array<{
  key: string;
  revenue: number | null;
  ebitda: number | null;
  fcf: number | null;
  shares: number | null;
}> {
  const raw = fundamentals?.annual ?? [];

  const normalized = raw
    .map((row) => {
      const key = row.periodEndISO?.slice(0, 10) ?? (typeof row.year === 'number' ? String(row.year) : '');
      return {
        key,
        revenue: safeNumber(row.revenue),
        ebitda: safeNumber(row.ebitda),
        fcf: safeNumber(row.fcf),
        shares: safeNumber(row.shares),
      };
    })
    .filter((row) => Boolean(row.key));

  normalized.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return normalized;
}

function computeRevenueCagr5Y(fundamentals: ForecastAgentProvidedData['fundamentals']): number | null {
  const series = normalizeAnnualSeries(fundamentals).filter((r) => r.revenue !== null) as Array<{
    key: string;
    revenue: number;
    ebitda: number | null;
    fcf: number | null;
    shares: number | null;
  }>;
  const pair = getFirstLast(series);
  if (!pair) return null;
  const years = Math.max(1, Math.min(5, series.length - 1));
  return computeCagrPct(pair.first.revenue, pair.last.revenue, years);
}

function computeAvgMarginPct(
  fundamentals: ForecastAgentProvidedData['fundamentals'],
  kind: 'ebitda' | 'fcf'
): number | null {
  const series = normalizeAnnualSeries(fundamentals);
  const margins: number[] = [];
  for (const row of series) {
    const revenue = row.revenue;
    if (!(revenue && revenue > 0)) continue;
    const numerator = kind === 'ebitda' ? row.ebitda : row.fcf;
    if (!(numerator && Number.isFinite(numerator))) continue;
    margins.push((numerator / revenue) * 100);
  }
  const m = mean(margins);
  return m === null ? null : round1(m);
}

function computeYoyRevenueStdDevPct(fundamentals: ForecastAgentProvidedData['fundamentals']): number | null {
  const series = normalizeAnnualSeries(fundamentals).filter((r) => r.revenue !== null) as Array<{
    key: string;
    revenue: number;
    ebitda: number | null;
    fcf: number | null;
    shares: number | null;
  }>;
  if (series.length < 3) return null;
  const yoy: number[] = [];
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!.revenue;
    const cur = series[i]!.revenue;
    if (!(prev > 0 && cur > 0)) continue;
    yoy.push(((cur - prev) / prev) * 100);
  }
  const sigma = stdev(yoy);
  return sigma === null ? null : round1(sigma);
}

function computeMarginStdDevPct(
  fundamentals: ForecastAgentProvidedData['fundamentals'],
  kind: 'ebitda' | 'fcf'
): number | null {
  const series = normalizeAnnualSeries(fundamentals);
  const margins: number[] = [];
  for (const row of series) {
    const revenue = row.revenue;
    if (!(revenue && revenue > 0)) continue;
    const numerator = kind === 'ebitda' ? row.ebitda : row.fcf;
    if (!(numerator && Number.isFinite(numerator))) continue;
    margins.push((numerator / revenue) * 100);
  }
  const sigma = stdev(margins);
  return sigma === null ? null : round1(sigma);
}

function getCurrentPrice(priceHistory: ForecastAgentProvidedData['priceHistory']): number | null {
  const points = priceHistory?.points ?? [];
  if (!points.length) return null;
  const last = points[points.length - 1];
  return safeNumber(last?.close);
}

function getCurrentShares(fundamentals: ForecastAgentProvidedData['fundamentals']): number | null {
  const shares = safeNumber(fundamentals?.ttm?.shares);
  if (shares && shares > 0) return shares;
  const series = normalizeAnnualSeries(fundamentals).filter((r) => r.shares !== null) as Array<{
    key: string;
    revenue: number | null;
    ebitda: number | null;
    fcf: number | null;
    shares: number;
  }>;
  const last = series.length ? series[series.length - 1] : null;
  return last?.shares && last.shares > 0 ? last.shares : null;
}

function getCurrentRevenue(fundamentals: ForecastAgentProvidedData['fundamentals']): number | null {
  const revenue = safeNumber(fundamentals?.ttm?.revenue);
  if (revenue && revenue > 0) return revenue;
  const series = normalizeAnnualSeries(fundamentals).filter((r) => r.revenue !== null) as Array<{
    key: string;
    revenue: number;
    ebitda: number | null;
    fcf: number | null;
    shares: number | null;
  }>;
  const last = series.length ? series[series.length - 1] : null;
  return last?.revenue && last.revenue > 0 ? last.revenue : null;
}

function getCurrentEbitda(fundamentals: ForecastAgentProvidedData['fundamentals']): number | null {
  // Prefer last annual EBITDA if provided
  const series = normalizeAnnualSeries(fundamentals).filter((r) => r.ebitda !== null) as Array<{
    key: string;
    revenue: number | null;
    ebitda: number;
    fcf: number | null;
    shares: number | null;
  }>;
  if (series.length) {
    const last = series[series.length - 1]!;
    if (last.ebitda > 0) return last.ebitda;
  }

  // Fallback: revenue * margin
  const revenue = getCurrentRevenue(fundamentals);
  const marginPct = safeNumber(fundamentals?.ttm?.ebitdaMarginPct);
  if (revenue && revenue > 0 && marginPct !== null && Number.isFinite(marginPct)) {
    return (revenue * marginPct) / 100;
  }

  return null;
}

function computeNetDebtFromEVInputs(params: {
  currentPrice: number | null;
  shares: number | null;
  currentMultiple: number | null;
  currentEbitda: number | null;
}): number | null {
  const { currentPrice, shares, currentMultiple, currentEbitda } = params;
  if (!(currentPrice && currentPrice > 0)) return null;
  if (!(shares && shares > 0)) return null;
  if (!(currentMultiple && currentMultiple > 0)) return null;
  if (!(currentEbitda && currentEbitda > 0)) return null;

  const marketCap = currentPrice * shares; // ($mm / shares(mm)) => $mm
  const enterpriseValue = currentMultiple * currentEbitda; // $mm
  const netDebt = enterpriseValue - marketCap; // $mm (derived)
  return Number.isFinite(netDebt) ? netDebt : null;
}

function projectPriceAtHorizon(params: {
  horizonYears: number;
  currentPrice: number | null;
  shares: number | null;
  baseRevenue: number | null;
  netDebt: number | null;
  revenueGrowthPct: number | null;
  ebitdaMarginPct: number | null;
  multiple: number | null;
}): number | null {
  const {
    horizonYears,
    currentPrice,
    shares,
    baseRevenue,
    netDebt,
    revenueGrowthPct,
    ebitdaMarginPct,
    multiple,
  } = params;

  if (!(currentPrice && currentPrice > 0)) return null;
  if (!(shares && shares > 0)) return null;
  if (!(baseRevenue && baseRevenue > 0)) return null;
  if (netDebt === null || !Number.isFinite(netDebt)) return null;
  if (revenueGrowthPct === null || !Number.isFinite(revenueGrowthPct)) return null;
  if (ebitdaMarginPct === null || !Number.isFinite(ebitdaMarginPct)) return null;
  if (!(multiple && multiple > 0)) return null;

  const revenueGrowth = revenueGrowthPct / 100;
  const margin = ebitdaMarginPct / 100;

  const futureRevenue = baseRevenue * Math.pow(1 + revenueGrowth, horizonYears);
  const futureEbitda = futureRevenue * margin;
  const futureEV = futureEbitda * multiple;
  const futureEquityValue = futureEV - netDebt;
  const price = futureEquityValue / shares;
  if (!Number.isFinite(price)) return null;
  return price;
}

function computeImpliedCagrPct(currentPrice: number | null, futurePrice: number | null, years: number): number | null {
  if (!(currentPrice && currentPrice > 0)) return null;
  if (!(futurePrice && futurePrice > 0)) return null;
  const cagr = Math.pow(futurePrice / currentPrice, 1 / years) - 1;
  return Number.isFinite(cagr) ? round1(cagr * 100) : null;
}

export function buildForecastAgentDataRequest(input: ForecastAgentInput): ForecastAgentRequestData {
  const inferredTicker = normalizeTicker(input.ticker) ?? normalizeTicker(extractTickers(input.userRequest)[0]) ?? null;
  const sector = inferSectorLabel(inferredTicker);

  return {
    action: 'REQUEST_DATA',
    required: {
      priceHistory: { source: 'FINNHUB', range: '5Y' },
      fundamentals: {
        source: 'FINNHUB',
        metrics: ['revenue', 'ebitda_margin', 'fcf', 'shares'],
      },
      sectorBenchmarks: { source: 'INTERNAL', sector },
    },
  };
}

function buildForecastResultFromData(input: ForecastAgentInput, data: ForecastAgentProvidedData): ForecastAgentForecastResult {
  const horizonYears = input.horizonYears ?? DEFAULT_HORIZON_YEARS;
  const ticker = normalizeTicker(input.ticker) ?? normalizeTicker(extractTickers(input.userRequest)[0]) ?? null;

  const revenueCagr = computeRevenueCagr5Y(data.fundamentals);
  const ebitdaMarginAvg = computeAvgMarginPct(data.fundamentals, 'ebitda');
  const fcfMarginAvg = computeAvgMarginPct(data.fundamentals, 'fcf');
  const priceCagr = computePriceCagr5Y(data.priceHistory);

  const currentMultiple = safeNumber(data.fundamentals?.ttm?.evToEbitda);
  const currentMultipleObj =
    currentMultiple === null ? { metric: 'EV/EBITDA' as const, value: null } : { metric: 'EV/EBITDA' as const, value: round1(currentMultiple) };

  const currentPrice = getCurrentPrice(data.priceHistory);
  const shares = getCurrentShares(data.fundamentals);
  const baseRevenue = getCurrentRevenue(data.fundamentals);
  const currentEbitda = getCurrentEbitda(data.fundamentals);
  const netDebt = computeNetDebtFromEVInputs({
    currentPrice,
    shares,
    currentMultiple,
    currentEbitda,
  });

  const missing: string[] = [];
  if (!data.priceHistory?.points?.length) missing.push('PRICE_HISTORY');
  if (revenueCagr === null) missing.push('FUNDAMENTALS:revenue_history');
  if (ebitdaMarginAvg === null) missing.push('FUNDAMENTALS:ebitda_margin_history');
  if (fcfMarginAvg === null) missing.push('FUNDAMENTALS:fcf_history');
  if (currentMultiple === null) missing.push('FUNDAMENTALS:ev_to_ebitda');
  if (shares === null) missing.push('FUNDAMENTALS:shares');
  if (baseRevenue === null) missing.push('FUNDAMENTALS:revenue_current');
  if (currentPrice === null) missing.push('PRICE_HISTORY:current_price');
  if (netDebt === null) missing.push('FUNDAMENTALS:net_debt (derived)');

  const hasCore =
    currentPrice !== null &&
    shares !== null &&
    baseRevenue !== null &&
    revenueCagr !== null &&
    ebitdaMarginAvg !== null &&
    currentMultiple !== null &&
    netDebt !== null;

  const coverageLabel: ForecastAgentForecastResult['dataCoverage']['label'] = hasCore
    ? 'Strong'
    : missing.length <= 3
      ? 'Partial'
      : 'Weak';

  const revenueSigma = computeYoyRevenueStdDevPct(data.fundamentals);
  const ebitdaMarginSigma = computeMarginStdDevPct(data.fundamentals, 'ebitda');

  const baseGrowth = revenueCagr === null ? null : round1(revenueCagr);
  const baseMargin = ebitdaMarginAvg === null ? null : round1(ebitdaMarginAvg);
  const baseMultiple = currentMultiple === null ? null : round1(currentMultiple);

  const bullGrowth =
    baseGrowth === null ? null : revenueSigma === null ? baseGrowth : round1(clamp(baseGrowth + revenueSigma, -50, 80));
  const bearGrowth =
    baseGrowth === null ? null : revenueSigma === null ? baseGrowth : round1(clamp(baseGrowth - revenueSigma, -50, 80));

  const bullMargin =
    baseMargin === null ? null : ebitdaMarginSigma === null ? baseMargin : round1(clamp(baseMargin + ebitdaMarginSigma, 0, 80));
  const bearMargin =
    baseMargin === null ? null : ebitdaMarginSigma === null ? baseMargin : round1(clamp(baseMargin - ebitdaMarginSigma, 0, 80));

  const basePrice = projectPriceAtHorizon({
    horizonYears,
    currentPrice,
    shares,
    baseRevenue,
    netDebt,
    revenueGrowthPct: baseGrowth,
    ebitdaMarginPct: baseMargin,
    multiple: baseMultiple,
  });
  const bullPrice = projectPriceAtHorizon({
    horizonYears,
    currentPrice,
    shares,
    baseRevenue,
    netDebt,
    revenueGrowthPct: bullGrowth,
    ebitdaMarginPct: bullMargin,
    multiple: baseMultiple,
  });
  const bearPrice = projectPriceAtHorizon({
    horizonYears,
    currentPrice,
    shares,
    baseRevenue,
    netDebt,
    revenueGrowthPct: bearGrowth,
    ebitdaMarginPct: bearMargin,
    multiple: baseMultiple,
  });

  const baseImpliedCagr = computeImpliedCagrPct(currentPrice, basePrice, horizonYears);
  const bullImpliedCagr = computeImpliedCagrPct(currentPrice, bullPrice, horizonYears);
  const bearImpliedCagr = computeImpliedCagrPct(currentPrice, bearPrice, horizonYears);

  const baseRationaleParts: string[] = [];
  if (baseGrowth !== null) baseRationaleParts.push(`Revenue growth set to ${baseGrowth}% (anchored to 5Y revenue CAGR).`);
  else baseRationaleParts.push('Revenue growth cannot be anchored (missing 5Y revenue history).');
  if (baseMargin !== null) baseRationaleParts.push(`EBITDA margin set to ${baseMargin}% (5Y average).`);
  else baseRationaleParts.push('EBITDA margin cannot be anchored (missing margin history).');
  if (baseMultiple !== null) baseRationaleParts.push(`Multiple held at ${baseMultiple}x (current EV/EBITDA).`);
  else baseRationaleParts.push('Valuation multiple missing (no current EV/EBITDA).');

  const sigmaRationale = (sigma: number | null, label: string) =>
    sigma === null ? `No dispersion available for ${label}; bull/bear reflect base levels.` : `Bull/Bear tilt uses ±${sigma}% (1σ) vs history for ${label}.`;

  const bullRationale = `${sigmaRationale(revenueSigma, 'revenue growth')} ${sigmaRationale(ebitdaMarginSigma, 'margin')}`.trim();
  const bearRationale = bullRationale;

  const buildScenario = (params: {
    revenueGrowth: number | null;
    margin: number | null;
    valuationMultiple: number | null;
    impliedCAGR: number | null;
    rationale: string;
  }): ForecastAgentScenario => ({
    revenueGrowth: params.revenueGrowth,
    margin: params.margin,
    valuationMultiple: params.valuationMultiple,
    impliedCAGR: params.impliedCAGR,
    rationale: params.rationale,
  });

  const result: ForecastAgentForecastResult = {
    action: 'FORECAST_RESULT',
    ticker,
    horizonYears,
    dataCoverage: { label: coverageLabel, missing },
    historicalContext: {
      revenueCAGR_5Y: revenueCagr === null ? null : round1(revenueCagr),
      ebitdaMarginAvg_5Y: ebitdaMarginAvg,
      fcfMarginAvg_5Y: fcfMarginAvg,
      priceCAGR_5Y: priceCagr === null ? null : round1(priceCagr),
      currentMultiple: currentMultipleObj,
    },
    scenarios: {
      base: buildScenario({
        revenueGrowth: baseGrowth,
        margin: baseMargin,
        valuationMultiple: baseMultiple,
        impliedCAGR: baseImpliedCagr,
        rationale: baseRationaleParts.join(' '),
      }),
      bull: buildScenario({
        revenueGrowth: bullGrowth,
        margin: bullMargin,
        valuationMultiple: baseMultiple,
        impliedCAGR: bullImpliedCagr,
        rationale: bullRationale,
      }),
      bear: buildScenario({
        revenueGrowth: bearGrowth,
        margin: bearMargin,
        valuationMultiple: baseMultiple,
        impliedCAGR: bearImpliedCagr,
        rationale: bearRationale,
      }),
    },
    priceRange: {
      low: bearPrice === null ? null : Math.round(bearPrice),
      base: basePrice === null ? null : Math.round(basePrice),
      high: bullPrice === null ? null : Math.round(bullPrice),
    },
    recommendedModels: [
      {
        type: 'OPERATING',
        reason: 'To translate revenue and margin drivers into a full operating bridge and cash flow path.',
      },
      {
        type: 'DCF',
        reason: 'To stress-test terminal assumptions and discount-rate sensitivity once cash flows are modeled.',
      },
      {
        type: 'COMPS',
        reason: 'To benchmark the current multiple against peers and validate the multiple used in scenarios.',
      },
    ],
    keyRisks: [
      'Growth reverts below historical trend if the recent revenue trajectory is not repeatable.',
      'Margins mean-revert if input costs or competitive intensity compress operating leverage.',
      'Multiple de-rates if the market reprices duration or growth quality.',
    ],
    whatToWatch: [
      'Forward revenue guidance vs. the 5Y growth anchor.',
      'EBITDA margin trajectory vs. the historical band.',
      'EV/EBITDA multiple vs. peer set into earnings.',
    ],
  };

  // If core data is missing, keep output but remove implied precision
  if (!hasCore) {
    result.keyRisks = [
      'Data coverage is incomplete; scenario outputs reflect only the metrics available from provided inputs.',
      ...result.keyRisks,
    ];
  }

  return result;
}

/**
 * Main agent entrypoint.
 * Returns REQUEST_DATA unless `input.data` is provided.
 */
export async function runForecastAgent(input: ForecastAgentInput): Promise<ForecastAgentOutput> {
  if (!input.data) {
    return buildForecastAgentDataRequest(input);
  }
  return buildForecastResultFromData(input, input.data);
}

