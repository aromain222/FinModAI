import { SourceResult, TimeSeriesPoint } from './types';

type AlphaParams = {
  symbol: string;
  range?: string;
};

const logPrefix = '[alphaVantageAdapter]';

export async function fetchAlphaSeries(params: AlphaParams): Promise<SourceResult> {
  const { symbol, range = '1M' } = params;
  try {
    const res = await fetch(`/api/market/alpha?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`);
    if (!res.ok) {
      const message = `HTTP ${res.status}`;
      console.warn(`${logPrefix} fail`, { symbol, range, status: res.status });
      return { ok: false, source: 'alpha', error: { status: res.status, message } };
    }
    const payload = await res.json();
    if (payload?.Note || payload?.Information) {
      console.warn(`${logPrefix} rate limit`, { symbol, note: payload.Note || payload.Information });
      return {
        ok: false,
        source: 'alpha',
        error: { message: payload.Note || payload.Information || 'Rate limited' }
      };
    }
    const points: TimeSeriesPoint[] = Array.isArray(payload?.points) ? payload.points : payload?.data ?? [];
    return { ok: true, source: 'alpha', data: points };
  } catch (error: any) {
    console.error(`${logPrefix} exception`, { symbol, range, error });
    return { ok: false, source: 'alpha', error: { message: error?.message || 'Unknown error', raw: error } };
  }
}
