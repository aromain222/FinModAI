import { NextResponse } from 'next/server';
import { featureFlags } from '@/lib/env/server';
import { fetchPolygonQuote } from '@/lib/data/providers/polygon';
import { fetchFinnhubQuote } from '@/lib/data/providers/finnhub';
import { fetchTwelveDataQuote } from '@/lib/data/providers/twelvedata';
import { fetchMarketstackQuote } from '@/lib/data/providers/marketstack';
import { fetchTiingoQuote } from '@/lib/data/providers/tiingo';
import { fetchNasdaqDatalinkQuote } from '@/lib/data/providers/nasdaqDatalink';
import { fetchSecEdgarFundamentals } from '@/lib/data/providers/secEdgar';
import { fetchFredSeries } from '@/lib/data/providers/fred';
import { fetchScrapeDoStatus } from '@/lib/data/providers/scrapeDo';
import { fetchWebzStatus } from '@/lib/data/providers/webz';
import { fetchMassiveStatus } from '@/lib/data/providers/massive';
import { fetchDatabentoStatus } from '@/lib/data/providers/databento';
import { fetchFasttrackQuote } from '@/lib/data/providers/fasttrack';

type ProviderHealth = {
  enabled: boolean;
  ok: boolean;
  latencyMs?: number;
  error?: string;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = url.searchParams.get('ticker') || 'AAPL';

  const tests: Array<[string, boolean, () => Promise<any>]> = [
    ['polygon', featureFlags.ENABLE_POLYGON, () => fetchPolygonQuote(ticker)],
    ['finnhub', featureFlags.ENABLE_FINNHUB, () => fetchFinnhubQuote(ticker)],
    ['twelvedata', featureFlags.ENABLE_TWELVEDATA, () => fetchTwelveDataQuote(ticker)],
    ['marketstack', featureFlags.ENABLE_MARKETSTACK, () => fetchMarketstackQuote(ticker)],
    ['tiingo', featureFlags.ENABLE_TIINGO, () => fetchTiingoQuote(ticker)],
    ['nasdaq_datalink', featureFlags.ENABLE_NASDAQ_DATALINK, () => fetchNasdaqDatalinkQuote(ticker)],
    ['sec_edgar', featureFlags.ENABLE_SEC, () => fetchSecEdgarFundamentals(ticker)],
    ['fred', featureFlags.ENABLE_FRED, () => fetchFredSeries('DGS10')],
    ['scrape_do', featureFlags.ENABLE_SCRAPEDO, () => fetchScrapeDoStatus(ticker)],
    ['webz', featureFlags.ENABLE_WEBZ, () => fetchWebzStatus(ticker)],
    ['massive', featureFlags.ENABLE_MASSIVE, () => fetchMassiveStatus(ticker)],
    ['databento', featureFlags.ENABLE_DATABENTO, () => fetchDatabentoStatus(ticker)],
    ['fasttrack', featureFlags.ENABLE_FASTTRACK, () => fetchFasttrackQuote(ticker)],
  ];

  const results: Record<string, ProviderHealth> = {};

  for (const [name, enabled, fn] of tests) {
    if (!enabled) {
      results[name] = { enabled: false, ok: false, error: 'disabled' };
      continue;
    }
    const start = Date.now();
    const res = await fn();
    const latencyMs = res?.latencyMs ?? Date.now() - start;
    results[name] = res?.ok
      ? { enabled: true, ok: true, latencyMs }
      : { enabled: true, ok: false, latencyMs, error: res?.error?.message || 'request failed' };
  }

  return NextResponse.json({ ticker, providers: results });
}
