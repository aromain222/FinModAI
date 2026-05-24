import {
  getMarketCompanyUniverse,
  getPublicCompanyListingUniverse,
  type MarketCompanyListing,
} from '@/lib/data/company/companyUniverse';
import { WATCHLIST } from '@/lib/ranking/watchlist';
import { classifyTicker, type TickerClassification } from '@/lib/ranking/tickerClassification';
import type { RankedStock } from '@/lib/ranking/types';

export const DEFAULT_RANK_UNIVERSE_SIZE = 5000;
export const MAX_RANK_UNIVERSE_SIZE = 8000;

export type RankUniverse = {
  tickers: string[];
  metaByTicker: Map<string, TickerClassification>;
  source: 'watchlist' | 'company-universe' | 'public-listings' | 'company-universe-plus-public-listings';
};

function normalizeTicker(value: string): string | null {
  const cleaned = value.trim().toUpperCase().replace(/-/g, '.');
  if (!cleaned) return null;
  return /^[A-Z.]{1,10}$/.test(cleaned) ? cleaned : null;
}

function targetSize(input?: number | null): number {
  const envTarget = Number(process.env.RANK_UNIVERSE_SIZE ?? '');
  const raw = input ?? (Number.isFinite(envTarget) && envTarget > 0 ? envTarget : DEFAULT_RANK_UNIVERSE_SIZE);
  return Math.max(1000, Math.min(MAX_RANK_UNIVERSE_SIZE, Math.floor(raw)));
}

function listingMap(rows: MarketCompanyListing[]): Map<string, MarketCompanyListing> {
  const map = new Map<string, MarketCompanyListing>();
  for (const row of rows) {
    const ticker = normalizeTicker(row.ticker);
    if (ticker && !map.has(ticker)) map.set(ticker, row);
  }
  return map;
}

function mergeListings(primary: MarketCompanyListing[], fallback: MarketCompanyListing[]): MarketCompanyListing[] {
  const byTicker = new Map<string, MarketCompanyListing>();
  for (const row of primary) {
    const ticker = normalizeTicker(row.ticker);
    if (ticker && !byTicker.has(ticker)) byTicker.set(ticker, row);
  }
  for (const row of fallback) {
    const ticker = normalizeTicker(row.ticker);
    if (ticker && !byTicker.has(ticker)) byTicker.set(ticker, row);
  }
  return [...byTicker.values()];
}

export async function buildRankUniverse(limit?: number | null): Promise<RankUniverse> {
  const target = targetSize(limit);
  const cachedRows = await getMarketCompanyUniverse(target, { qualityOnly: false }).catch(() => []);
  const usePublicListings = process.env.RANK_PUBLIC_LISTINGS_ENABLED !== 'false';
  const publicRows = usePublicListings && cachedRows.length < target
    ? await getPublicCompanyListingUniverse(target * 2).catch(() => [])
    : [];
  const rows = mergeListings(cachedRows, publicRows);
  const byListingTicker = listingMap(rows);
  const seen = new Set<string>();
  const tickers: string[] = [];

  for (const ticker of WATCHLIST) {
    const normalized = normalizeTicker(ticker);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    tickers.push(normalized);
  }

  for (const row of rows) {
    const ticker = normalizeTicker(row.ticker);
    if (!ticker || seen.has(ticker)) continue;
    seen.add(ticker);
    tickers.push(ticker);
    if (tickers.length >= target) break;
  }

  const metaByTicker = new Map<string, TickerClassification>();
  for (const ticker of tickers) {
    metaByTicker.set(ticker, classifyTicker(ticker, byListingTicker.get(ticker)));
  }

  let source: RankUniverse['source'] = 'watchlist';
  if (cachedRows.length > 0 && publicRows.length > 0) source = 'company-universe-plus-public-listings';
  else if (cachedRows.length > 0) source = 'company-universe';
  else if (publicRows.length > 0) source = 'public-listings';

  return {
    tickers,
    metaByTicker,
    source,
  };
}

export function attachClassification(
  stocks: RankedStock[],
  metaByTicker: Map<string, TickerClassification>,
): RankedStock[] {
  return stocks.map((stock) => {
    const meta = metaByTicker.get(stock.ticker.toUpperCase()) ?? classifyTicker(stock.ticker);
    return {
      ...stock,
      meta: {
        ...stock.meta,
        sector: stock.meta.sector ?? meta.sector,
        subsector: stock.meta.subsector ?? meta.subsector,
        companyName: stock.meta.companyName ?? meta.companyName ?? null,
        exchange: stock.meta.exchange ?? meta.exchange ?? null,
      },
    };
  });
}
