import { fetchFredSeries } from './fredAdapter';
import { fetchPolygonSeries } from './polygonAdapter';
import { fetchFmpSeries } from './fmpAdapter';
import { fetchAlphaSeries } from './alphaVantageAdapter';
import { getDailyBars as getDatabentoDaily, getIntradayBars as getDatabentoIntraday } from './databentoAdapter';
import { resolveMarketSymbol } from '../marketSymbols';
import { OrchestratorResponse, SourceResult, TimeSeriesPoint } from './types';

type GetSeriesParams = {
  kind: 'INDEX_PRICE' | 'RATE' | 'CPI' | 'UNEMPLOYMENT' | 'STOCK_PRICE' | string;
  symbol: string;
  range?: string;
};

const stubSeries = (label: string): TimeSeriesPoint[] => {
  const now = Date.now();
  return Array.from({ length: 30 }, (_, idx) => ({
    t: now - (30 - idx) * 24 * 60 * 60 * 1000,
    v: 100 + idx,
  }));
};

const logResult = (result: SourceResult, attempted: string[]) => {
  const status = result.ok ? 'ok' : 'fail';
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[orchestrator]', status, { source: result.source, attempted });
  }
};

export async function getSeries(params: GetSeriesParams): Promise<OrchestratorResponse> {
  const { kind, symbol, range = '1M' } = params;
  const resolvedSymbol = resolveMarketSymbol(symbol);
  const attemptedSources: string[] = [];
  const failures: OrchestratorResponse['meta']['failures'] = [];

  const trySource = async (fn: () => Promise<SourceResult>): Promise<SourceResult> => {
    const res = await fn();
    attemptedSources.push(res.source);
    if (!res.ok && res.error) {
      failures.push({ source: res.source, message: res.error.message, status: res.error.status });
    }
    logResult(res, attemptedSources);
    return res;
  };

  const pickSeries = async (): Promise<SourceResult> => {
    switch (kind) {
      case 'INDEX_PRICE': {
        const db = await trySource(() => getDatabentoDaily({ symbol: resolvedSymbol, range }));
        if (db.ok) return db;
        const poly = await trySource(() => fetchPolygonSeries({ symbol: resolvedSymbol, range }));
        if (poly.ok) return poly;
        const alpha = await trySource(() => fetchAlphaSeries({ symbol: resolvedSymbol, range }));
        if (alpha.ok) return alpha;
        return { ok: true, source: 'fallback', data: stubSeries(resolvedSymbol) };
      }
      case 'CPI':
      case 'UNEMPLOYMENT':
      case 'RATE': {
        const fred = await trySource(() => fetchFredSeries({ series: resolvedSymbol, range }));
        if (fred.ok) return fred;
        return { ok: true, source: 'fallback', data: stubSeries(resolvedSymbol) };
      }
      case 'STOCK_PRICE':
      case 'BARS':
      default: {
        const db = await trySource(() => getDatabentoIntraday({ symbol: resolvedSymbol, range }));
        if (db.ok) return db;
        const poly = await trySource(() => fetchPolygonSeries({ symbol: resolvedSymbol, range }));
        if (poly.ok) return poly;
        const alpha = await trySource(() => fetchAlphaSeries({ symbol: resolvedSymbol, range }));
        if (alpha.ok) return alpha;
        return { ok: true, source: 'fallback', data: stubSeries(resolvedSymbol) };
      }
    }
  };

  const chosen = await pickSeries();
  const data = (chosen.data ?? stubSeries(resolvedSymbol)) as TimeSeriesPoint[];

  const meta: OrchestratorResponse['meta'] = {
    sourceUsed: chosen.source,
    attemptedSources,
    failures,
  };

  return { data, meta };
}
