import { SourceResult, TimeSeriesPoint } from './types';

type FmpParams = {
  symbol: string;
  range?: string;
};

const logPrefix = '[fmpAdapter]';

export async function fetchFmpSeries(params: FmpParams): Promise<SourceResult> {
  const { symbol, range = '1M' } = params;
  const apiKey = process.env.NEXT_PUBLIC_FMP_API_KEY || process.env.FMP_API_KEY;
  if (!apiKey) {
    const message = 'Missing FMP_API_KEY';
    console.warn(`${logPrefix} ${message}`);
    return { ok: false, source: 'fmp', error: { message } };
  }

  try {
    const res = await fetch(`/api/market/fmp?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}&apikey=${apiKey}`);
    if (res.status === 401) {
      const message = 'FMP unauthorized (check FMP_API_KEY)';
      console.warn(`${logPrefix} ${message}`);
      return { ok: false, source: 'fmp', error: { status: 401, message } };
    }
    if (!res.ok) {
      const message = `HTTP ${res.status}`;
      console.warn(`${logPrefix} fail`, { symbol, range, status: res.status });
      return { ok: false, source: 'fmp', error: { status: res.status, message } };
    }
    const payload = await res.json();
    const points: TimeSeriesPoint[] = Array.isArray(payload?.points) ? payload.points : payload?.data ?? [];
    return { ok: true, source: 'fmp', data: points };
  } catch (error: any) {
    console.error(`${logPrefix} exception`, { symbol, range, error });
    return { ok: false, source: 'fmp', error: { message: error?.message || 'Unknown error', raw: error } };
  }
}
