import type { MarketStateMetric, MarketStatePacket } from '@/lib/pm/marketState/marketStateContract';
import { internalRequestHeaders } from '@/lib/pm/monitoring/internalRequestHeaders';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : null;
}

function finite(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function round(value: number, decimals = 1): number {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

function metric(value: unknown, source: string | null, asOf: string | null, unit: string): MarketStateMetric {
  return { value: finite(value), source, asOf, unit };
}

async function fetchJson(url: string, requestHeaders?: Headers): Promise<unknown> {
  try {
    const response = await fetch(url, {
      cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: internalRequestHeaders(requestHeaders),
    });
    return response.ok ? await response.json() : null;
  } catch {
    return null;
  }
}

function performanceSummary(value: unknown, symbol: string) {
  const row = record(value);
  const points = Array.isArray(row?.points) ? row.points.flatMap(item => record(item) ? [record(item)!] : []) : [];
  const values = points.map(point => finite(point.value ?? point.close)).filter((item): item is number => item !== null);
  const return1mPct = values.length >= 2 && values[0] !== 0
    ? round(((values[values.length - 1] / values[0]) - 1) * 100)
    : null;
  return {
    symbol,
    return1mPct,
    source: text(row?.source),
    asOf: text(row?.asOf),
  };
}

function deriveRegime(params: {
  spy1m: number | null;
  qqq1m: number | null;
  hyg1m: number | null;
  tlt1m: number | null;
  vix: number | null;
  breadthNet: number | null;
}): Pick<MarketStatePacket, 'regime' | 'regimeConfidence'> {
  const signals: number[] = [];
  if (params.spy1m !== null) signals.push(params.spy1m > 2 ? 1 : params.spy1m < -2 ? -1 : 0);
  if (params.qqq1m !== null) signals.push(params.qqq1m > 2 ? 1 : params.qqq1m < -2 ? -1 : 0);
  if (params.hyg1m !== null && params.tlt1m !== null) signals.push(params.hyg1m > params.tlt1m ? 1 : -1);
  if (params.vix !== null) signals.push(params.vix < 18 ? 1 : params.vix > 25 ? -1 : 0);
  if (params.breadthNet !== null) signals.push(params.breadthNet > 15 ? 1 : params.breadthNet < -15 ? -1 : 0);
  if (signals.length < 3) return { regime: 'insufficient_data', regimeConfidence: Math.round((signals.length / 5) * 50) };
  const sum = signals.reduce((total, item) => total + item, 0);
  const confidence = Math.min(90, Math.round(45 + (Math.abs(sum) / signals.length) * 45));
  if (sum >= 2) return { regime: 'risk_on', regimeConfidence: confidence };
  if (sum <= -2) return { regime: 'risk_off', regimeConfidence: confidence };
  const hasPositive = signals.some(item => item > 0);
  const hasNegative = signals.some(item => item < 0);
  return { regime: hasPositive && hasNegative ? 'mixed' : 'neutral', regimeConfidence: confidence };
}

export async function buildMarketStatePacket(params: { origin: string; now?: Date; requestHeaders?: Headers }): Promise<MarketStatePacket> {
  const symbols = ['SPY', 'QQQ', 'IWM', 'HYG', 'TLT'] as const;
  const [snapshotValue, breadthValue, ...performanceValues] = await Promise.all([
    fetchJson(`${params.origin}/api/market/snapshot`, params.requestHeaders),
    fetchJson(`${params.origin}/api/market-brief/stocks?period=1D`, params.requestHeaders),
    ...symbols.map(symbol => fetchJson(`${params.origin}/api/market-brief/performance?range=1M&symbol=${symbol}`, params.requestHeaders)),
  ]);
  const snapshot = record(snapshotValue);
  const provider = text(snapshot?.provider);
  const asOf = text(snapshot?.asOf);
  const spy = record(snapshot?.spy);
  const vix = record(snapshot?.vix);
  const rates = record(snapshot?.rates);
  const fx = record(snapshot?.fx);
  const commodities = record(snapshot?.commodities);
  const breadth = record(breadthValue);
  const rising = Array.isArray(breadth?.rising) ? breadth.rising.length : null;
  const falling = Array.isArray(breadth?.falling) ? breadth.falling.length : null;
  const breadthNet = rising !== null && falling !== null && rising + falling > 0
    ? round(((rising - falling) / (rising + falling)) * 100)
    : null;
  const us2y = finite(rates?.us2y);
  const us10y = finite(rates?.us10y);
  const curve = us2y !== null && us10y !== null ? round((us10y - us2y) * 100) : null;
  const indices = performanceValues.map((value, index) => performanceSummary(value, symbols[index]));
  const bySymbol = new Map(indices.map(item => [item.symbol, item]));
  const sectors = Array.isArray(snapshot?.sectors)
    ? snapshot.sectors.flatMap(item => {
        const row = record(item);
        const name = text(row?.name);
        const changePct = finite(row?.changePct);
        return name && changePct !== null ? [{ name, changePct: round(changePct) }] : [];
      })
    : [];
  const missing: string[] = [];
  const checks: Array<[string, boolean]> = [
    ['spy_tape', finite(spy?.price) !== null && finite(spy?.changePct) !== null],
    ['volatility', finite(vix?.value) !== null],
    ['rates_curve', us2y !== null && us10y !== null],
    ['dollar', finite(fx?.dxy) !== null],
    ['commodities', finite(commodities?.wti) !== null],
    ['breadth', breadthNet !== null],
    ['index_history', indices.filter(item => item.return1mPct !== null).length >= 3],
    ['sector_tape', sectors.length > 0],
  ];
  for (const [key, present] of checks) if (!present) missing.push(key);
  const regime = deriveRegime({
    spy1m: bySymbol.get('SPY')?.return1mPct ?? null,
    qqq1m: bySymbol.get('QQQ')?.return1mPct ?? null,
    hyg1m: bySymbol.get('HYG')?.return1mPct ?? null,
    tlt1m: bySymbol.get('TLT')?.return1mPct ?? null,
    vix: finite(vix?.value),
    breadthNet,
  });
  const snapshotWarnings = Array.isArray(snapshot?.warnings)
    ? snapshot.warnings.filter((item): item is string => typeof item === 'string')
    : [];

  return {
    version: 1,
    builtAt: (params.now ?? new Date()).toISOString(),
    asOf,
    ...regime,
    indices,
    tape: {
      spyPrice: metric(spy?.price, provider, asOf, 'USD'),
      spyChangePct: metric(spy?.changePct, provider, asOf, '%'),
      vix: metric(vix?.value, provider, asOf, 'index'),
      us2y: metric(us2y, provider, asOf, '%'),
      us10y: metric(us10y, provider, asOf, '%'),
      curve2s10sBps: metric(curve, provider, asOf, 'bps'),
      dxy: metric(fx?.dxy, provider, asOf, 'index'),
      wti: metric(commodities?.wti, provider, asOf, 'USD'),
      gold: metric(commodities?.gold, provider, asOf, 'USD'),
    },
    breadth: { risingCount: rising, fallingCount: falling, netPct: breadthNet },
    sectors,
    quality: {
      provider,
      fallback: snapshot?.fallback === true || provider === 'demo' || provider === 'demo-fallback',
      coveragePct: Math.round(((checks.length - missing.length) / checks.length) * 100),
      missing,
      warnings: snapshotWarnings,
    },
  };
}
