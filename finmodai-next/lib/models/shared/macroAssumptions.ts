import { fetchFredSeries } from '@/lib/data/providers/fred';
import { getMacroSnapshot } from '@/lib/macroData';
import { fetchDailySeries } from '@/lib/marketData/fetchDailySeries';
import type { ModelType } from '@/types/models';

export type MacroAssumptionRelevance = 'primary' | 'secondary' | 'monitor';
export type MacroAssumptionStatus = 'reported' | 'fallback' | 'missing';

export type MacroAssumptionItem = {
  key:
    | 'riskFreeRate'
    | 'fedFunds'
    | 'inflation'
    | 'unemployment'
    | 'gdpGrowth'
    | 'creditSpread'
    | 'vix'
    | 'oilProxy'
    | 'usdProxy';
  label: string;
  value: number | null;
  unit: 'percent' | 'currency' | 'number' | 'index';
  displayValue: string;
  source: string;
  asOf: string | null;
  status: MacroAssumptionStatus;
  relevance: MacroAssumptionRelevance;
  note?: string;
};

export type MacroAssumptionContext = {
  asOf: string;
  summary: string;
  warnings: string[];
  items: MacroAssumptionItem[];
};

type BaseMacroDataset = {
  asOf: string;
  warnings: string[];
  riskFreeRate: Pick<MacroAssumptionItem, 'value' | 'source' | 'asOf' | 'status'>;
  fedFunds: Pick<MacroAssumptionItem, 'value' | 'source' | 'asOf' | 'status'>;
  inflation: Pick<MacroAssumptionItem, 'value' | 'source' | 'asOf' | 'status'>;
  unemployment: Pick<MacroAssumptionItem, 'value' | 'source' | 'asOf' | 'status'>;
  gdpGrowth: Pick<MacroAssumptionItem, 'value' | 'source' | 'asOf' | 'status'>;
  creditSpread: Pick<MacroAssumptionItem, 'value' | 'source' | 'asOf' | 'status'>;
  vix: Pick<MacroAssumptionItem, 'value' | 'source' | 'asOf' | 'status'>;
  oilProxy: Pick<MacroAssumptionItem, 'value' | 'source' | 'asOf' | 'status'>;
  usdProxy: Pick<MacroAssumptionItem, 'value' | 'source' | 'asOf' | 'status'>;
};

const CACHE_TTL_MS = 10 * 60 * 1000;
let cachedDataset: { expiresAt: number; value: BaseMacroDataset } | null = null;

function safePercent(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function safeNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function fmtValue(item: Pick<MacroAssumptionItem, 'value' | 'unit'>): string {
  if (item.value === null) return 'n/a';
  if (item.unit === 'percent') return `${item.value.toFixed(2)}%`;
  if (item.unit === 'currency') return `$${item.value.toFixed(2)}`;
  return item.value.toFixed(2);
}

function relevanceForModel(modelType: ModelType, key: MacroAssumptionItem['key']): MacroAssumptionRelevance {
  const primaryByModel: Partial<Record<ModelType, MacroAssumptionItem['key'][]>> = {
    dcf: ['riskFreeRate', 'creditSpread', 'fedFunds', 'inflation'],
    'reverse-dcf': ['riskFreeRate', 'creditSpread', 'fedFunds', 'inflation'],
    'debt-capacity-lite': ['riskFreeRate', 'creditSpread', 'fedFunds', 'vix'],
    lbo: ['riskFreeRate', 'creditSpread', 'fedFunds', 'inflation'],
    merger: ['riskFreeRate', 'creditSpread', 'fedFunds', 'vix'],
    comps: ['riskFreeRate', 'creditSpread', 'vix', 'fedFunds'],
    'football-field': ['riskFreeRate', 'creditSpread', 'vix', 'fedFunds'],
    precedents: ['riskFreeRate', 'creditSpread', 'fedFunds', 'vix'],
    'three-statement': ['inflation', 'fedFunds', 'unemployment', 'gdpGrowth'],
    operating: ['inflation', 'unemployment', 'gdpGrowth', 'fedFunds'],
    scorecard: ['riskFreeRate', 'creditSpread', 'vix', 'inflation'],
  };

  const secondaryByModel: Partial<Record<ModelType, MacroAssumptionItem['key'][]>> = {
    dcf: ['unemployment', 'gdpGrowth', 'vix', 'oilProxy', 'usdProxy'],
    'reverse-dcf': ['unemployment', 'gdpGrowth', 'vix', 'oilProxy', 'usdProxy'],
    'debt-capacity-lite': ['unemployment', 'gdpGrowth', 'inflation'],
    lbo: ['unemployment', 'gdpGrowth', 'vix', 'oilProxy', 'usdProxy'],
    merger: ['inflation', 'unemployment', 'gdpGrowth', 'oilProxy', 'usdProxy'],
    comps: ['inflation', 'unemployment', 'gdpGrowth', 'oilProxy', 'usdProxy'],
    'football-field': ['inflation', 'unemployment', 'gdpGrowth', 'oilProxy', 'usdProxy'],
    precedents: ['inflation', 'unemployment', 'gdpGrowth', 'oilProxy', 'usdProxy'],
    'three-statement': ['riskFreeRate', 'creditSpread', 'oilProxy', 'usdProxy'],
    operating: ['riskFreeRate', 'creditSpread', 'oilProxy', 'usdProxy'],
    scorecard: ['unemployment', 'gdpGrowth', 'oilProxy', 'usdProxy'],
  };

  if (primaryByModel[modelType]?.includes(key)) return 'primary';
  if (secondaryByModel[modelType]?.includes(key)) return 'secondary';
  return 'monitor';
}

async function fetchProxyClose(symbol: string): Promise<{ value: number | null; source: string; asOf: string | null; status: MacroAssumptionStatus }> {
  const end = new Date().toISOString().slice(0, 10);
  const start = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  try {
    const result = await fetchDailySeries({ symbol, start, end, rangePoints: 22 });
    const lastPoint = result.points[result.points.length - 1];
    const value = safeNumber(lastPoint?.close ?? null);
    if (value !== null) {
      return {
        value,
        source: `${symbol} proxy (${result.provider})`,
        asOf: lastPoint?.date?.slice(0, 10) ?? null,
        status: result.ok ? 'reported' : 'fallback',
      };
    }
  } catch {
    // Fall through to missing.
  }

  return {
    value: null,
    source: `${symbol} proxy unavailable`,
    asOf: null,
    status: 'missing',
  };
}

async function loadBaseMacroDataset(): Promise<BaseMacroDataset> {
  if (cachedDataset && cachedDataset.expiresAt > Date.now()) {
    return cachedDataset.value;
  }

  const warnings: string[] = [];
  const snapshotPromise = getMacroSnapshot('1Y').catch((error) => {
    warnings.push(error instanceof Error ? error.message : 'Macro snapshot unavailable.');
    return null;
  });
  const baaPromise = fetchFredSeries('BAA').catch(() => ({ ok: false } as const));
  const gdpPromise = fetchFredSeries('A191RL1Q225SBEA').catch(() => ({ ok: false } as const));
  const oilProxyPromise = fetchProxyClose('USO');
  const usdProxyPromise = fetchProxyClose('UUP');

  const [snapshot, baaRes, gdpRes, oilProxy, usdProxy] = await Promise.all([
    snapshotPromise,
    baaPromise,
    gdpPromise,
    oilProxyPromise,
    usdProxyPromise,
  ]);

  const asOf = snapshot?.asOf?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
  const riskFreeRate = safePercent(snapshot?.metrics.tenY_level ?? null);
  const fedFunds = safePercent(snapshot?.metrics.fed_funds_level ?? null);
  const inflation = safePercent(snapshot?.metrics.cpi_yoy ?? null);
  const unemployment = safePercent(snapshot?.metrics.unemployment_level ?? null);
  const vix = safeNumber(snapshot?.metrics.vix_level ?? null);

  const baaYield = baaRes.ok ? safePercent(baaRes.data.latestValue) : null;
  const creditSpread = baaYield !== null && riskFreeRate !== null ? Math.max(0, baaYield - riskFreeRate) : null;
  const gdpGrowth = gdpRes.ok ? safePercent(gdpRes.data.latestValue) : null;

  const dataset: BaseMacroDataset = {
    asOf,
    warnings,
    riskFreeRate: {
      value: riskFreeRate,
      source: riskFreeRate !== null ? 'FRED DGS10 / macro snapshot' : '10Y Treasury unavailable',
      asOf,
      status: riskFreeRate !== null ? 'reported' : 'missing',
    },
    fedFunds: {
      value: fedFunds,
      source: fedFunds !== null ? 'FRED FEDFUNDS / macro snapshot' : 'Fed funds unavailable',
      asOf,
      status: fedFunds !== null ? 'reported' : 'missing',
    },
    inflation: {
      value: inflation,
      source: inflation !== null ? 'FRED CPIAUCSL YoY / macro snapshot' : 'Inflation unavailable',
      asOf,
      status: inflation !== null ? 'reported' : 'missing',
    },
    unemployment: {
      value: unemployment,
      source: unemployment !== null ? 'FRED UNRATE / macro snapshot' : 'Unemployment unavailable',
      asOf,
      status: unemployment !== null ? 'reported' : 'missing',
    },
    gdpGrowth: {
      value: gdpGrowth,
      source: gdpGrowth !== null ? 'FRED A191RL1Q225SBEA' : 'GDP growth unavailable',
      asOf,
      status: gdpGrowth !== null ? 'reported' : 'missing',
    },
    creditSpread: {
      value: creditSpread,
      source: creditSpread !== null ? 'FRED BAA less 10Y Treasury' : 'Credit spread unavailable',
      asOf,
      status: creditSpread !== null ? 'reported' : 'missing',
    },
    vix: {
      value: vix,
      source: vix !== null ? 'Macro snapshot VIX level' : 'VIX unavailable',
      asOf,
      status: vix !== null ? 'reported' : 'missing',
    },
    oilProxy,
    usdProxy,
  };

  cachedDataset = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    value: dataset,
  };

  return dataset;
}

export async function getMacroAssumptionContext(modelType: ModelType): Promise<MacroAssumptionContext> {
  const base = await loadBaseMacroDataset();
  const items: MacroAssumptionItem[] = [
    {
      key: 'riskFreeRate',
      label: '10Y Treasury',
      unit: 'percent',
      displayValue: fmtValue({ value: base.riskFreeRate.value, unit: 'percent' }),
      relevance: relevanceForModel(modelType, 'riskFreeRate'),
      ...base.riskFreeRate,
    },
    {
      key: 'fedFunds',
      label: 'Fed Funds',
      unit: 'percent',
      displayValue: fmtValue({ value: base.fedFunds.value, unit: 'percent' }),
      relevance: relevanceForModel(modelType, 'fedFunds'),
      ...base.fedFunds,
    },
    {
      key: 'inflation',
      label: 'CPI YoY',
      unit: 'percent',
      displayValue: fmtValue({ value: base.inflation.value, unit: 'percent' }),
      relevance: relevanceForModel(modelType, 'inflation'),
      ...base.inflation,
    },
    {
      key: 'unemployment',
      label: 'Unemployment',
      unit: 'percent',
      displayValue: fmtValue({ value: base.unemployment.value, unit: 'percent' }),
      relevance: relevanceForModel(modelType, 'unemployment'),
      ...base.unemployment,
    },
    {
      key: 'gdpGrowth',
      label: 'GDP Growth',
      unit: 'percent',
      displayValue: fmtValue({ value: base.gdpGrowth.value, unit: 'percent' }),
      relevance: relevanceForModel(modelType, 'gdpGrowth'),
      ...base.gdpGrowth,
    },
    {
      key: 'creditSpread',
      label: 'BAA Credit Spread',
      unit: 'percent',
      displayValue: fmtValue({ value: base.creditSpread.value, unit: 'percent' }),
      relevance: relevanceForModel(modelType, 'creditSpread'),
      ...base.creditSpread,
    },
    {
      key: 'vix',
      label: 'VIX',
      unit: 'index',
      displayValue: fmtValue({ value: base.vix.value, unit: 'index' }),
      relevance: relevanceForModel(modelType, 'vix'),
      ...base.vix,
    },
    {
      key: 'oilProxy',
      label: 'Oil Proxy (USO)',
      unit: 'currency',
      displayValue: fmtValue({ value: base.oilProxy.value, unit: 'currency' }),
      relevance: relevanceForModel(modelType, 'oilProxy'),
      note: 'ETF proxy for oil sensitivity, not spot WTI.',
      ...base.oilProxy,
    },
    {
      key: 'usdProxy',
      label: 'USD Proxy (UUP)',
      unit: 'currency',
      displayValue: fmtValue({ value: base.usdProxy.value, unit: 'currency' }),
      relevance: relevanceForModel(modelType, 'usdProxy'),
      note: 'ETF proxy for broad USD sensitivity.',
      ...base.usdProxy,
    },
  ];

  const summary = items
    .filter((item) => item.relevance !== 'monitor')
    .slice(0, 6)
    .map((item) => `${item.label} ${item.displayValue}`)
    .join('; ');

  return {
    asOf: base.asOf,
    summary,
    warnings: base.warnings,
    items,
  };
}

