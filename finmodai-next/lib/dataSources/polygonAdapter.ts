import { SourceResult, TimeSeriesPoint } from './types';

type PolygonSeriesParams = {
  symbol: string;
  range?: string;
};

const logPrefix = '[polygonAdapter]';

export async function fetchPolygonSeries(params: PolygonSeriesParams): Promise<SourceResult> {
  const { symbol, range = '1M' } = params;
  try {
    const res = await fetch(`/api/market/indices?symbols=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}`);
    if (!res.ok) {
      const message = `HTTP ${res.status}`;
      console.warn(`${logPrefix} fail`, { symbol, range, status: res.status });
      return { ok: false, source: 'polygon', error: { status: res.status, message } };
    }
    const payload = await res.json();
    const firstItem = Array.isArray(payload?.data) ? payload.data[0] : null;
    const points: TimeSeriesPoint[] = firstItem?.points ?? [];
    return { ok: true, source: 'polygon', data: points };
  } catch (error: any) {
    console.error(`${logPrefix} exception`, { symbol, range, error });
    return { ok: false, source: 'polygon', error: { message: error?.message || 'Unknown error', raw: error } };
  }
}
