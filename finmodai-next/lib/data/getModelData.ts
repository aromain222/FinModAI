import type { MacroNewsArticle } from '@/types/macro';
import type { CompanyFinancials } from '@/types/compsModel';
import type { EventItem } from '@/lib/market_data/providers/types';
import type { MarketSeries, MarketRange } from '@/lib/market/provider';
import { getMarketSeries } from '@/lib/market/provider';
import { fetchCompanyFinancials } from '@/lib/financialDataFetcher';
import { resolveSharesOutstanding, type SharesResult } from '@/lib/data/sharesOutstanding';
import { fetchMacroNews } from '@/lib/newsData';
import { getSecFilings } from '@/lib/market_data/events/sec';
import { getCache, setCache } from '@/lib/cache/memory';
import { identifyPeers, mergePeerSets, cleanTickerArray, type PeerSelectionDiagnostics } from '@/lib/identifyPeers';
import { getSmokeModelData } from '@/lib/data/smokeModelData';
import type {
  GetModelDataParams,
  ModelDataPeerOptions,
  ModelDataRange,
  ModelDataResult,
} from '@/lib/data/modelDataTypes';

const DEFAULT_RANGE: MarketRange = '1Y';
const DEFAULT_DAYS = 365;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

type PeerSource = 'auto' | 'custom';

function buildDateString(date: Date) {
  return date.toISOString().split('T')[0];
}

function computeRange(range?: Partial<ModelDataRange>): ModelDataRange {
  const now = new Date();
  const end = range?.end ? new Date(range.end) : now;
  const start =
    range?.start && !isNaN(new Date(range.start).getTime())
      ? new Date(range.start)
      : new Date(end.getTime() - DEFAULT_DAYS * 24 * 60 * 60 * 1000);
  const marketRange = range?.marketRange ?? DEFAULT_RANGE;
  return {
    start: buildDateString(start),
    end: buildDateString(end),
    marketRange,
  };
}

function buildCacheKey(params: GetModelDataParams, resolvedTickers: string[], range: ModelDataRange, bucket: number): string {
  const tickersKey = resolvedTickers.join(',');
  const peerFlag = params.peerOptions
    ? `custom:${(params.peerOptions.customPeers ?? []).join(',')}:onlyCustom:${params.peerOptions.useOnlyCustom ? '1' : '0'}:auto:${params.peerOptions.allowAuto !== false ? '1' : '0'}`
    : 'no-peers';
  return `modelload:${params.modelType}:${params.primaryTicker}:${tickersKey}:${range.start}:${range.end}:${range.marketRange}:${peerFlag}:bucket:${bucket}`;
}

async function fetchPrices(tickers: string[], range: ModelDataRange, traceId?: string): Promise<Record<string, MarketSeries>> {
  const entries: [string, MarketSeries][] = [];
  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const series = await getMarketSeries({ ticker, range: range.marketRange, traceId });
        entries.push([ticker, series]);
      } catch (error) {
        console.warn('[getModelData] Failed to fetch prices for', ticker, error);
      }
    })
  );
  return Object.fromEntries(entries);
}

async function fetchFinancials(
  tickers: string[],
  sourceMap: Map<string, PeerSource>,
  sharesMap: Record<string, SharesResult>
): Promise<Record<string, CompanyFinancials>> {
  const entries: [string, CompanyFinancials][] = [];
  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const financial = await fetchCompanyFinancials(
          ticker,
          sourceMap.get(ticker) === 'custom' ? 'custom' : 'auto'
        );
        const sharesResult = sharesMap[ticker];
        const shares = sharesResult?.sharesOutstandingMm ?? financial.shares ?? 0;
        const safeShares = Math.max(shares, 0.001);
        const netDebt = typeof financial.netDebt === 'number' ? financial.netDebt : 0;
        const revenue = financial.revenue ?? 0;
        const ebitda = financial.ebitda ?? 0;
        const ebit = financial.ebit ?? 0;
        const netIncome = financial.netIncome ?? 0;
        const enterpriseValue = financial.enterpriseValue ?? Math.max(financial.marketCap ?? 0 + netDebt, 0);
        const evToRevenue = revenue > 0 ? enterpriseValue / revenue : 0;
        const evToEbitda = ebitda > 0 ? enterpriseValue / ebitda : 0;
        const evToEbit = ebit > 0 ? enterpriseValue / ebit : 0;
        const pe = netIncome > 0 ? (financial.marketCap ?? 0) / netIncome : 0;
        entries.push([
          ticker,
          {
            name: financial.name ?? ticker,
            ticker,
            marketCap: financial.marketCap ?? enterpriseValue,
            enterpriseValue,
            cash: financial.cash ?? 0,
            revenue,
            ebitda,
            ebit,
            netIncome,
            shares: safeShares,
            price: financial.price ?? 0,
            netDebt,
            evToRevenue,
            evToEbitda,
            evToEbit,
            pe,
            source: sourceMap.get(ticker) === 'custom' ? 'custom' : 'auto',
            aiEstimated: [],
          },
        ]);
      } catch (error) {
        console.warn('[getModelData] Financials load failed for', ticker, error);
      }
    })
  );
  return Object.fromEntries(entries);
}

async function fetchShares(tickers: string[]): Promise<Record<string, SharesResult>> {
  const entries: [string, SharesResult][] = [];
  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const result = await resolveSharesOutstanding(ticker);
        entries.push([ticker, result]);
      } catch (error) {
        console.warn('[getModelData] Shares load failed for', ticker, error);
      }
    })
  );
  return Object.fromEntries(entries);
}

async function fetchFilings(tickers: string[], range: ModelDataRange, news: MacroNewsArticle[]): Promise<Record<string, EventItem[]>> {
  const entries: [string, EventItem[]][] = [];
  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const filings = await getSecFilings(ticker, range.start, range.end, news);
        entries.push([ticker, filings]);
      } catch (error) {
        console.warn('[getModelData] Filings load failed for', ticker, error);
      }
    })
  );
  return Object.fromEntries(entries);
}

export async function getModelData(params: GetModelDataParams): Promise<ModelDataResult> {
  const normalizedPrimary = params.primaryTicker.trim().toUpperCase();
  if (process.env.MODEL_SMOKE_TEST === '1') {
    return getSmokeModelData(params);
  }
  const range = computeRange(params.dateRange);
  const combinedTickers = cleanTickerArray([
    normalizedPrimary,
    ...(params.tickers ?? []),
  ]);

  const peerSourceMap = new Map<string, PeerSource>();
  const resolvedTickers = new Set<string>();
  resolvedTickers.add(normalizedPrimary);
  peerSourceMap.set(normalizedPrimary, 'auto');

  let peerDiagnostics: PeerSelectionDiagnostics | null = null;
  const peersList: string[] = [];

  if (params.peerOptions) {
    const customPeers = cleanTickerArray(params.peerOptions.customPeers ?? []);
    let autoResult: Awaited<ReturnType<typeof identifyPeers>> | null = null;
    let autoPeers: string[] = [];
    if (params.peerOptions.allowAuto !== false) {
      autoResult = await identifyPeers(normalizedPrimary);
      autoPeers = autoResult.peers.filter((peer) => peer !== normalizedPrimary);
      peerDiagnostics = autoResult.diagnostics;
    }

    const merged = mergePeerSets(autoPeers, customPeers, Boolean(params.peerOptions.useOnlyCustom));
    if (merged.length === 0) {
      throw new Error('No comparable companies found');
    }
    for (const entry of merged) {
      const ticker = entry.ticker;
      if (!resolvedTickers.has(ticker)) {
        resolvedTickers.add(ticker);
        peerSourceMap.set(ticker, entry.source);
        peersList.push(ticker);
      }
    }
  }

  combinedTickers.forEach((ticker) => {
    if (!resolvedTickers.has(ticker)) {
      resolvedTickers.add(ticker);
      peerSourceMap.set(ticker, 'custom');
    }
  });

  const finalTickers = Array.from(resolvedTickers);
  const bucket = Math.floor(Date.now() / CACHE_TTL_MS);
  const cacheKey = buildCacheKey(params, finalTickers, range, bucket);
  const cached = getCache<ModelDataResult>(cacheKey);
  if (cached && !cached.stale) {
    return cached.value;
  }

  // Use Promise.allSettled for resilient data fetching
  const newsWindow = '1M';
  const dataFetchResults = await Promise.allSettled([
    fetchMacroNews(newsWindow).catch((err) => {
      console.warn('[getModelData] News fetch failed:', err);
      return [];
    }),
    fetchShares(finalTickers).catch((err) => {
      console.warn('[getModelData] Shares fetch failed:', err);
      return {};
    }),
    fetchPrices(finalTickers, range, params.traceId).catch((err) => {
      console.warn('[getModelData] Prices fetch failed:', err);
      return {};
    }),
  ]);
  
  const news = dataFetchResults[0].status === 'fulfilled' ? dataFetchResults[0].value : [];
  const sharesMap = dataFetchResults[1].status === 'fulfilled' ? dataFetchResults[1].value : {};
  
  // Fetch financials and filings with error handling
  const [financials, filings] = await Promise.allSettled([
    fetchFinancials(finalTickers, peerSourceMap, sharesMap).catch((err) => {
      console.warn('[getModelData] Financials fetch failed:', err);
      return {};
    }),
    fetchFilings(finalTickers, range, news).catch((err) => {
      console.warn('[getModelData] Filings fetch failed:', err);
      return {};
    }),
  ]);
  
  const prices = dataFetchResults[2].status === 'fulfilled' ? dataFetchResults[2].value : {};
  const resolvedFinancials = financials.status === 'fulfilled' ? financials.value : {};
  const resolvedFilings = filings.status === 'fulfilled' ? filings.value : {};

  const result: ModelDataResult = {
    resolvedTickers: finalTickers,
    range,
    prices,
    financials: resolvedFinancials,
    shares: sharesMap,
    filings: resolvedFilings,
    news,
    peers:
      peersList.length > 0
        ? { list: peersList, diagnostics: peerDiagnostics }
        : undefined,
  };

  setCache(cacheKey, result, CACHE_TTL_MS);
  return result;
}
