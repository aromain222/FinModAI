import { SourceResult, TimeSeriesPoint } from './types';

type BarParams = {
  symbol: string;
  start?: string;
  end?: string;
  interval?: string;
};

const logPrefix = '[databentoAdapter]';

const hasKey = () => Boolean(process.env.DATABENTO_API_KEY || process.env.NEXT_PUBLIC_DATABENTO_API_KEY);

function normalizeBars(payload: any): TimeSeriesPoint[] {
  if (!payload) return [];
  const rows = payload.data || payload.bars || payload;
  if (!Array.isArray(rows)) return [];
  return rows
    .map((row: any) => {
      const t = row.t || row.time || row.timestamp || row.ts;
      const v = row.c ?? row.close ?? row.price ?? row.v;
      return t ? { t: new Date(t).getTime(), v } : null;
    })
    .filter(Boolean) as TimeSeriesPoint[];
}

async function fetchDatabento(path: string, params: Record<string, any>): Promise<SourceResult> {
  if (!hasKey()) {
    return { ok: false, source: 'databento', error: { message: 'Missing DATABENTO_API_KEY' } };
  }

  const search = new URLSearchParams(params as Record<string, string>).toString();
  try {
    const res = await fetch(`/api/databento/${path}?${search}`);
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      // leave json null
    }

    if (!res.ok) {
      const message = json?.message || json?.error || `HTTP ${res.status}`;
      console.warn(`${logPrefix} fail`, { path, status: res.status, message });
      return { ok: false, source: 'databento', error: { status: res.status, message, raw: json || text } };
    }

    const data = normalizeBars(json);
    return { ok: true, source: 'databento', data };
  } catch (error: any) {
    console.error(`${logPrefix} exception`, { path, error });
    return { ok: false, source: 'databento', error: { message: error?.message || 'Unknown error', raw: error } };
  }
}

export async function getDailyBars(params: BarParams): Promise<SourceResult> {
  const { symbol, start, end } = params;
  return fetchDatabento('daily', { symbol, start, end });
}

export async function getIntradayBars(params: BarParams): Promise<SourceResult> {
  const { symbol, start, end, interval = '5m' } = params;
  return fetchDatabento('intraday', { symbol, start, end, interval });
}
