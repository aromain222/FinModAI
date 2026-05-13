import { getMarketCompanyUniverse, type MarketCompanyListing } from '@/lib/data/company/companyUniverse';
import { WATCHLIST } from '@/lib/ranking/watchlist';
import { classifyTicker, type TickerClassification } from '@/lib/ranking/tickerClassification';
import type { RankedStock } from '@/lib/ranking/types';

export const DEFAULT_RANK_UNIVERSE_SIZE = 2500;
export const MAX_RANK_UNIVERSE_SIZE = 3000;

export type RankUniverse = {
  tickers: string[];
  metaByTicker: Map<string, TickerClassification>;
  source: 'watchlist' | 'company-universe';
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

export async function buildRankUniverse(limit?: number | null): Promise<RankUniverse> {
  const target = targetSize(limit);
  const rows = await getMarketCompanyUniverse(target, { qualityOnly: false }).catch(() => []);
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

  return {
    tickers,
    metaByTicker,
    source: rows.length > 0 ? 'company-universe' : 'watchlist',
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
