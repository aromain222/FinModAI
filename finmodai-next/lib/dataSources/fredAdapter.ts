import { SourceResult, TimeSeriesPoint } from './types';

type FredParams = {
  series: string;
  range?: string;
};

const logPrefix = '[fredAdapter]';

export async function fetchFredSeries(params: FredParams): Promise<SourceResult> {
  const { series, range = '1Y' } = params;
  try {
    const res = await fetch(`/api/macro/fred?series=${encodeURIComponent(series)}&range=${encodeURIComponent(range)}`);
    if (!res.ok) {
      const message = `HTTP ${res.status}`;
      console.warn(`${logPrefix} fail`, { series, range, status: res.status });
      return { ok: false, source: 'fred', error: { status: res.status, message } };
    }
    const payload = await res.json();
    const points: TimeSeriesPoint[] = Array.isArray(payload?.points) ? payload.points : payload?.data ?? [];
    return { ok: true, source: 'fred', data: points };
  } catch (error: any) {
    console.error(`${logPrefix} exception`, { series, range, error });
    return { ok: false, source: 'fred', error: { message: error?.message || 'Unknown error', raw: error } };
  }
}
