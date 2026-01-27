import 'server-only';

/**
 * Market flow metrics with graceful fallbacks.
 * Uses DataBento intraday bars when available, otherwise falls back to the unified market provider chain.
 */

import { ENV } from '@/lib/env/server';
import { fetchWithTimeout, toErrorText } from '@/lib/providers/utils';
import { getMarketSeries } from './provider';
import { limit } from '@/lib/utils/limit';
import { get, set, marketCacheKey } from '@/lib/utils/cache';

type Bar = { t: number; o?: number; h?: number; l?: number; c?: number; v?: number };
type Snapshot = {
  symbol: string;
  last: number | null;
  changePct: number | null;
  volumeShock: number | null;
  realizedVol: number | null;
  spreadProxy?: number | null;
};

type Cached<T> = { value: T; expires: number; stale?: boolean };

const CACHE: Record<string, Cached<any>> = {};
const TTL_SHORT = 15 * 1000;
const TTL_MED = 5 * 60 * 1000;

const BASE_URL = ENV.DATABENTO_BASE_URL || 'https://hist.databento.com/v0';
const EQUITIES_DATASET = ENV.DATABENTO_EQUITIES_DATASET;

const isConfigured = () => Boolean(ENV.DATABENTO_API_KEY && EQUITIES_DATASET);

async function fetchDatabento(path: string, params: Record<string, any>, ttl = TTL_SHORT) {
  const search = new URLSearchParams(params as Record<string, string>).toString();
  const key = `${path}:${search}`;
  const now = Date.now();
  const cached = CACHE[key];
  if (cached && cached.expires > now) {
    return { ok: true, data: cached.value, meta: { sourceUsed: 'databento', stale: cached.stale ?? false } };
  }

  if (!isConfigured()) {
    return {
      ok: false,
      data: null,
      meta: { sourceUsed: 'fallback', stale: true },
      error: ENV.DATABENTO_API_KEY ? 'Missing DATABENTO_EQUITIES_DATASET' : 'Missing DATABENTO_API_KEY',
    };
  }

  try {
    const res = await fetchWithTimeout(
      `${BASE_URL}/${path}?${search}`,
      {
      headers: {
          'X-Api-Key': ENV.DATABENTO_API_KEY as string,
      },
      next: { revalidate: 0 },
      },
      4000
    );

    const bodyText = await res.text().catch(() => '');
    const json = (() => {
      try {
        return bodyText ? JSON.parse(bodyText) : null;
      } catch {
        return null;
      }
    })();
    if (!res.ok) {
      const message = json?.message || bodyText.slice(0, 300) || `HTTP ${res.status}`;
      return { ok: false, data: null, meta: { sourceUsed: 'databento', stale: true }, error: message };
    }

    CACHE[key] = { value: json, expires: now + ttl };
    return { ok: true, data: json, meta: { sourceUsed: 'databento', stale: false } };
  } catch (error: any) {
    return {
      ok: false,
      data: null,
      meta: { sourceUsed: 'databento', stale: true },
      error: toErrorText(error) || 'Unknown error',
    };
  }
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const toNum = (value: unknown) => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : undefined;
};

const toBars = (rows: any[]): Bar[] =>
  (rows || []).map((row) => {
    const t = row.t || row.ts || row.time || row.timestamp;
    return {
      t: typeof t === 'number' ? t : new Date(t).getTime(),
      o: toNum(row.o ?? row.open),
      h: toNum(row.h ?? row.high),
      l: toNum(row.l ?? row.low),
      c: toNum(row.c ?? row.close ?? row.p),
      v: toNum(row.v ?? row.volume),
    };
  });

export async function getDailyBars(symbol: string) {
  const res = await fetchDatabento(
    'timeseries',
    { dataset: EQUITIES_DATASET ?? '', symbols: symbol, schema: 'ohlcv-1d', limit: 200 },
    TTL_MED
  );
  if (!res.ok) return { data: [] as Bar[], meta: res.meta, error: res.error };
  const data = toBars(res.data?.data || res.data?.bars || res.data || []);
  return { data, meta: res.meta };
}

export async function getIntradayBars(symbol: string) {
  const res = await fetchDatabento(
    'timeseries',
    { dataset: EQUITIES_DATASET ?? '', symbols: symbol, schema: 'ohlcv-1m', limit: 300 },
    TTL_SHORT
  );
  if (!res.ok) return { data: [] as Bar[], meta: res.meta, error: res.error };
  const data = toBars(res.data?.data || res.data?.bars || res.data || []);
  return { data, meta: res.meta };
}

const realizedVolFromCloses = (closes: number[]) => {
  if (closes.length < 2) return null;
  const mean = closes.reduce((sum, v) => sum + v, 0) / closes.length;
  const variance = closes.reduce((sum, v) => sum + (v - mean) ** 2, 0) / Math.max(1, closes.length - 1);
  const vol = Math.sqrt(variance);
  return Number.isFinite(vol) ? vol : null;
};

const volumeShockFromVolumes = (volumes: number[], lastVolume?: number) => {
  if (volumes.length < 2) return null;
  const avg = volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
  const last = isFiniteNumber(lastVolume) ? lastVolume : volumes[volumes.length - 1];
  if (!avg || !last) return null;
  const shock = (last - avg) / avg;
  return Number.isFinite(shock) ? shock : null;
};

export async function getIndexSnapshot(
  symbol: string,
  range: '1D' | '1W' | '1M' = '1D',
  traceId = 'sector-momentum'
): Promise<{ snapshot: Snapshot; meta: any }> {
  if (range === '1D') {
    const intraday = await getIntradayBars(symbol);
    const bars = Array.isArray(intraday.data) ? intraday.data.slice() : [];
    bars.sort((a, b) => a.t - b.t);

    const closes = bars.map((b) => b.c).filter(isFiniteNumber);
    const volumes = bars.map((b) => b.v).filter(isFiniteNumber);

    const firstClose = closes[0] ?? null;
    const lastClose = closes.length ? closes[closes.length - 1] : null;
    const lastVolume = bars.length ? bars[bars.length - 1]?.v : undefined;

    if (firstClose != null && lastClose != null && closes.length >= 2) {
      const changePct = firstClose ? ((lastClose - firstClose) / firstClose) * 100 : null;
      return {
        snapshot: {
          symbol,
          last: lastClose,
          changePct: typeof changePct === 'number' && Number.isFinite(changePct) ? changePct : null,
          volumeShock: volumeShockFromVolumes(volumes, lastVolume),
          realizedVol: realizedVolFromCloses(closes),
          spreadProxy: null,
        },
        meta: intraday.meta,
      };
    }
  }

  // Fallback to the unified market provider chain (Polygon/FMP/Marketstack → Stooq → yfinance, etc.)
  const series = await getMarketSeries({ ticker: symbol, range, traceId });
  const seriesCloses = series.points.map((p) => p.close).filter(isFiniteNumber);
  const seriesVolumes = series.points.map((p) => p.volume).filter(isFiniteNumber);
  const seriesLast = seriesCloses.length ? seriesCloses[seriesCloses.length - 1] : null;

  return {
    snapshot: {
      symbol,
      last: seriesLast,
      changePct: typeof series.stats.pctChange === 'number' && Number.isFinite(series.stats.pctChange) ? series.stats.pctChange : null,
      volumeShock: volumeShockFromVolumes(seriesVolumes),
      realizedVol: realizedVolFromCloses(seriesCloses),
      spreadProxy: null,
    },
    meta: {
      sourceUsed: series.source,
      stale: series.source === 'fallback',
      reason: series.source === 'fallback' ? 'no_data' : undefined,
    },
  };
}

export async function getFlowMetrics(
  symbols: string[],
  opts?: { range?: '1D' | '1W' | '1M'; traceId?: string }
) {
  const range = opts?.range ?? '1D';
  const traceId = opts?.traceId ?? 'sector-momentum';
  const uniqueSymbols = Array.from(new Set(symbols.map((s) => s.trim()).filter(Boolean)));
  
  // Use concurrency limiter (8 for HTTP providers)
  const limiter = limit(8);
  const ttlMs = process.env.NODE_ENV === 'production' ? 5 * 60 * 1000 : 60 * 1000; // 5m prod, 60s dev

  const results = await Promise.allSettled(
    uniqueSymbols.map((sym) =>
      limiter(async () => {
        // Check cache first
        const cacheKey = marketCacheKey(sym, range, 'flow');
        const cached = get<any>(cacheKey);
        if (cached) {
          return { symbol: sym, ...cached.snapshot, meta: { ...cached.meta, cacheHit: true } };
        }

        // Fetch fresh data
        const snap = await getIndexSnapshot(sym, range, traceId);
        const result = { symbol: sym, ...snap.snapshot, meta: snap.meta };
        
        // Cache successful results
        if (snap.snapshot.changePct != null || snap.snapshot.last != null) {
          set(cacheKey, { snapshot: snap.snapshot, meta: snap.meta }, ttlMs);
        }
        
        return result;
      })
    )
  );

  // Extract successful results and filter nulls
  return results
    .map((r, idx) => {
      if (r.status === 'fulfilled') return r.value;
      // Log errors but don't throw - return null for this ticker
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[getFlowMetrics] Failed for ${uniqueSymbols[idx]}:`, r.reason?.message || r.reason);
      }
      return null;
    })
    .filter((r): r is any => r !== null);
}

export const staleFallback = <T>(data: T, reason: string) => ({
  data,
  meta: { sourceUsed: 'fallback', stale: true, reason },
});
