/**
 * Comps Calculator
 * Deterministic trading comps calculator using public data only.
 */

export type AggregateStats = {
  median: number | null;
  mean?: number | null;
  min?: number | null;
  max?: number | null;
  count: number;
};

export type CompsAggregationOptions = {
  method?: 'median' | 'mean';
  includeMean?: boolean;
  includeMinMax?: boolean;
};

export type CompsInputCompany = {
  ticker: string;
  name?: string;
  marketCap: number | null; // USD millions
  price: number | null;
  sharesOutstanding: number | null; // raw shares
  totalDebt: number | null; // USD millions
  cash: number | null; // USD millions
  revenue: number | null; // USD millions
  ebitda?: number | null; // USD millions
  netIncome?: number | null; // USD millions
};

export interface CompanyComp {
  ticker: string;
  name: string;
  marketCap: number | null;
  price: number | null;
  sharesOutstanding: number | null;
  totalDebt: number | null;
  cash: number | null;
  netDebt: number | null;
  enterpriseValue: number | null;
  revenue: number | null;
  ebitda: number | null;
  netIncome: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  peRatio: number | null;
  missing: string[];
  labels: Record<string, 'Reported (Public Data)' | 'Calculated'>;
}

export interface CompsResult {
  subject: CompanyComp;
  peers: CompanyComp[];
  medianMultiples: {
    evToEbitda: number | null;
    evToRevenue: number | null;
    peRatio: number | null;
  };
  meanMultiples?: {
    evToEbitda: number | null;
    evToRevenue: number | null;
    peRatio: number | null;
  };
  minMaxMultiples?: {
    evToEbitda: { min: number | null; max: number | null };
    evToRevenue: { min: number | null; max: number | null };
    peRatio: { min: number | null; max: number | null };
  };
  impliedValuation: {
    byEvEbitda: number | null;
    byEvRevenue: number | null;
    byPe: number | null;
    equityValueByEvEbitda: number | null;
    equityValueByEvRevenue: number | null;
    equityValueByPe: number | null;
    pricePerShareByEvEbitda: number | null;
    pricePerShareByEvRevenue: number | null;
    pricePerShareByPe: number | null;
  };
  warnings: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function normalizeCompany(input: CompsInputCompany): CompanyComp {
  const missing: string[] = [];
  const labels: CompanyComp['labels'] = {};

  const marketCap =
    isFiniteNumber(input.marketCap)
      ? input.marketCap
      : isFiniteNumber(input.price) && isFiniteNumber(input.sharesOutstanding)
        ? (labels.marketCap = 'Calculated', (input.price * input.sharesOutstanding) / 1_000_000)
        : null;

  if (marketCap === null) missing.push('marketCap');
  if (!isFiniteNumber(input.revenue)) missing.push('revenue');

  const totalDebt = isFiniteNumber(input.totalDebt) ? input.totalDebt : null;
  const cash = isFiniteNumber(input.cash) ? input.cash : null;
  const netDebt = totalDebt !== null && cash !== null ? totalDebt - cash : null;
  if (netDebt !== null) labels.netDebt = 'Calculated';

  const enterpriseValue = marketCap !== null && netDebt !== null ? marketCap + netDebt : null;
  if (enterpriseValue !== null) labels.enterpriseValue = 'Calculated';

  const revenue = isFiniteNumber(input.revenue) ? input.revenue : null;
  const ebitda = isFiniteNumber(input.ebitda) ? input.ebitda : null;
  const netIncome = isFiniteNumber(input.netIncome) ? input.netIncome : null;

  const evToRevenue = enterpriseValue !== null && revenue && revenue > 0 ? enterpriseValue / revenue : null;
  const evToEbitda = enterpriseValue !== null && ebitda && ebitda > 0 ? enterpriseValue / ebitda : null;
  const peRatio = marketCap !== null && netIncome && netIncome > 0 ? marketCap / netIncome : null;

  return {
    ticker: input.ticker,
    name: input.name || input.ticker,
    marketCap,
    price: isFiniteNumber(input.price) ? input.price : null,
    sharesOutstanding: isFiniteNumber(input.sharesOutstanding) ? input.sharesOutstanding : null,
    totalDebt,
    cash,
    netDebt,
    enterpriseValue,
    revenue,
    ebitda,
    netIncome,
    evToEbitda,
    evToRevenue,
    peRatio,
    missing,
    labels,
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stats(values: Array<number | null>, options: CompsAggregationOptions): AggregateStats {
  const clean = values.filter((v): v is number => isFiniteNumber(v));
  return {
    median: median(clean),
    mean: options.includeMean ? mean(clean) : undefined,
    min: options.includeMinMax ? (clean.length ? Math.min(...clean) : null) : undefined,
    max: options.includeMinMax ? (clean.length ? Math.max(...clean) : null) : undefined,
    count: clean.length,
  };
}

export function calculateCompsFromData(
  target: CompsInputCompany,
  peers: CompsInputCompany[],
  options: CompsAggregationOptions = {}
): CompsResult {
  const warnings: string[] = [];
  const normalizedTarget = normalizeCompany(target);
  let normalizedPeers = peers.map(normalizeCompany);

  let validPeers = normalizedPeers.filter((peer) => peer.missing.length === 0);
  if (validPeers.length === 0) {
    throw new Error('Limited peer coverage in demo universe; required fields missing across peers.');
  }
  if (validPeers.length < 3) {
    warnings.push('Fewer than 3 valid peers; multiples may be unstable');
  }
  const filterOutliers = (field: 'evToRevenue' | 'evToEbitda' | 'peRatio') => {
    const values = validPeers.map((p) => p[field]).filter((v): v is number => isFiniteNumber(v));
    if (values.length < 3) return;
    const meanVal = mean(values) ?? 0;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - meanVal, 2), 0) / values.length;
    const std = Math.sqrt(variance);
    if (!isFiniteNumber(std) || std === 0) return;
    validPeers = validPeers.filter((peer) => {
      const val = peer[field];
      if (!isFiniteNumber(val)) return true;
      const z = Math.abs((val - meanVal) / std);
      return z <= 3;
    });
  };
  // With small universes (e.g. 50 companies), outlier filtering can remove all peers. Skip when peer count is low.
  const MIN_PEERS_FOR_OUTLIER_FILTER = 6;
  if (validPeers.length > MIN_PEERS_FOR_OUTLIER_FILTER) {
    const beforeOutlier = [...validPeers];
    filterOutliers('evToRevenue');
    filterOutliers('evToEbitda');
    filterOutliers('peRatio');
    if (validPeers.length === 0) {
      warnings.push('Outlier filtering removed all peers; using pre-filter peer set (small universe).');
      validPeers = beforeOutlier;
    }
  }

  if (validPeers.length === 0) {
    throw new Error('Limited peer coverage in demo universe; outlier filtering removed peers.');
  }

  const evToRevenueStats = stats(validPeers.map(p => p.evToRevenue), {
    includeMean: true,
    includeMinMax: true,
    ...options,
  });
  const evToEbitdaStats = stats(validPeers.map(p => p.evToEbitda), {
    includeMean: true,
    includeMinMax: true,
    ...options,
  });
  const peStats = stats(validPeers.map(p => p.peRatio), {
    includeMean: true,
    includeMinMax: true,
    ...options,
  });
  if (evToRevenueStats.count === 0 && evToEbitdaStats.count === 0 && peStats.count === 0) {
    throw new Error('No valid multiples could be computed for the peer set');
  }

  const dispersionWarn = (label: string, stat: AggregateStats) => {
    if (stat.min !== undefined && stat.max !== undefined && isFiniteNumber(stat.min) && isFiniteNumber(stat.max)) {
      if (stat.min > 0 && stat.max / stat.min > 3) {
        warnings.push(`Wide dispersion in ${label} multiples (max/min > 3x).`);
      }
    }
  };

  dispersionWarn('EV/Revenue', evToRevenueStats);
  dispersionWarn('EV/EBITDA', evToEbitdaStats);
  dispersionWarn('P/E', peStats);

  const aggregateMethod = options.method || 'median';
  const chosenEvRevenue = aggregateMethod === 'mean' ? evToRevenueStats.mean ?? null : evToRevenueStats.median;
  const chosenEvEbitda = aggregateMethod === 'mean' ? evToEbitdaStats.mean ?? null : evToEbitdaStats.median;
  const chosenPe = aggregateMethod === 'mean' ? peStats.mean ?? null : peStats.median;

  if (!normalizedTarget.revenue && !normalizedTarget.ebitda && !normalizedTarget.netIncome) {
    warnings.push('Target metrics missing; implied valuation unavailable until public data is available.');
  }

  const netDebt = normalizedTarget.netDebt ?? null;

  const impliedEvRevenue = chosenEvRevenue && normalizedTarget.revenue ? chosenEvRevenue * normalizedTarget.revenue : null;
  const impliedEvEbitda = chosenEvEbitda && normalizedTarget.ebitda ? chosenEvEbitda * normalizedTarget.ebitda : null;
  const impliedMarketCap = chosenPe && normalizedTarget.netIncome ? chosenPe * normalizedTarget.netIncome : null;

  const equityValueByEvRevenue = impliedEvRevenue !== null && netDebt !== null ? impliedEvRevenue - netDebt : null;
  const equityValueByEvEbitda = impliedEvEbitda !== null && netDebt !== null ? impliedEvEbitda - netDebt : null;
  const equityValueByPe = impliedMarketCap;

  const shares = normalizedTarget.sharesOutstanding;
  const pricePerShareByEvRevenue = equityValueByEvRevenue !== null && shares ? (equityValueByEvRevenue * 1_000_000) / shares : null;
  const pricePerShareByEvEbitda = equityValueByEvEbitda !== null && shares ? (equityValueByEvEbitda * 1_000_000) / shares : null;
  const pricePerShareByPe = equityValueByPe !== null && shares ? (equityValueByPe * 1_000_000) / shares : null;

  [pricePerShareByEvRevenue, pricePerShareByEvEbitda, pricePerShareByPe].forEach((value) => {
    if (isFiniteNumber(value) && value > 10000) {
      warnings.push('Extreme implied price per share (> $10,000).');
    }
  });

  return {
    subject: normalizedTarget,
    peers: validPeers,
    medianMultiples: {
      evToEbitda: evToEbitdaStats.median,
      evToRevenue: evToRevenueStats.median,
      peRatio: peStats.median,
    },
    meanMultiples: options.includeMean
      ? {
          evToEbitda: evToEbitdaStats.mean ?? null,
          evToRevenue: evToRevenueStats.mean ?? null,
          peRatio: peStats.mean ?? null,
        }
      : undefined,
    minMaxMultiples: options.includeMinMax
      ? {
          evToEbitda: { min: evToEbitdaStats.min ?? null, max: evToEbitdaStats.max ?? null },
          evToRevenue: { min: evToRevenueStats.min ?? null, max: evToRevenueStats.max ?? null },
          peRatio: { min: peStats.min ?? null, max: peStats.max ?? null },
        }
      : undefined,
    impliedValuation: {
      byEvEbitda: impliedEvEbitda,
      byEvRevenue: impliedEvRevenue,
      byPe: impliedMarketCap,
      equityValueByEvEbitda,
      equityValueByEvRevenue,
      equityValueByPe,
      pricePerShareByEvEbitda,
      pricePerShareByEvRevenue,
      pricePerShareByPe,
    },
    warnings,
  };
}

// Backwards compatible wrapper for legacy callers
export async function calculateComps(ticker: string, peerTickers: string[]): Promise<CompsResult> {
  throw new Error('calculateComps requires full public data inputs; use calculateCompsFromData');
}

export const buildCompsModel = calculateCompsFromData;
