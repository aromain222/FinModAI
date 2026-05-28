/**
 * Universal Screener
 *
 * Fetches the full Alpaca tradeable US equity universe (~8 000 assets),
 * applies liquidity/quality filters, then uses Alpaca's batch snapshot
 * endpoint to rank survivors by 30-day average volume and returns the
 * top N tickers for the scoring pipeline.
 *
 * Filter criteria (proxy for established, liquid equities):
 *   - tradable, fractionable, marginable (Alpaca flags for large/mid-caps)
 *   - symbol is simple: letters only, 1–5 chars (no warrants, preferreds, ETNs)
 *   - asset name does not indicate an ETF, bond fund, or index product
 *   - latest price ≥ $5 (exclude micro-caps / penny stocks)
 *   - 30-day avg daily volume ≥ 500 000 shares
 *
 * Falls back to the default 20-stock watchlist if Alpaca credentials are
 * not configured or any fetch step fails.
 */

import { alpacaPaperCredentials } from '@/lib/execution/alpacaPaper';
import type { UserIntent } from '@/lib/execution/userIntent';

const DEFAULT_WATCHLIST = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA',
  'JPM', 'GS', 'BAC', 'V', 'MA',
  'UNH', 'LLY', 'ABBV',
  'XOM', 'CVX',
  'UBER', 'ABNB', 'SHOP',
];

const SNAPSHOT_BATCH = 1_000;
const MIN_PRICE      = 5;
const MIN_AVG_VOLUME = 500_000;

// Name-based blocklist — any asset whose name contains one of these terms
// is a fund/ETF/note, not a common equity.
const FUND_NAME_KEYWORDS = [
  'ETF', 'FUND', 'TRUST', 'ISHARES', 'SPDR', 'VANGUARD', 'INVESCO',
  'PROSHARES', 'DIREXION', 'WISDOMTREE', 'VANECK', 'FIRST TRUST',
  'GLOBAL X', 'ARK ', 'INDEX', 'NOTES', 'BOND', 'TREASURY',
];

type AlpacaAsset = {
  symbol:      string;
  name:        string;
  exchange:    string;   // e.g. "NASDAQ", "NYSE", "ARCA", "BATS"
  tradable:    boolean;
  fractionable: boolean;
  marginable:  boolean;
  status:      string;
  asset_class: string;
};

type AlpacaSnapshot = {
  latestTrade?: { p: number };
  dailyBar?:    { v: number };
};

function alpacaHeaders(): Record<string, string> {
  const creds = alpacaPaperCredentials();
  return {
    'APCA-API-KEY-ID':     creds.keyId,
    'APCA-API-SECRET-KEY': creds.secretKey,
    accept:                'application/json',
  };
}

async function fetchAllAssets(): Promise<AlpacaAsset[]> {
  const creds = alpacaPaperCredentials();
  if (!creds.configured) return [];

  const url = `${creds.baseUrl}/v2/assets?status=active&asset_class=us_equity&tradable=true`;
  const res = await fetch(url, {
    headers: alpacaHeaders(),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  if (!res.ok) return [];
  return res.json() as Promise<AlpacaAsset[]>;
}

function isETFOrFund(a: AlpacaAsset): boolean {
  // Structural check: NYSE Arca is the primary listing venue for ETFs/ETPs
  if (a.exchange === 'ARCA') return true;
  // Name-keyword check covers ETFs on other exchanges (BATS, NYSE, NASDAQ)
  if (a.name) {
    const upper = a.name.toUpperCase();
    if (FUND_NAME_KEYWORDS.some(kw => upper.includes(kw))) return true;
  }
  return false;
}

function isSPAC(a: AlpacaAsset): boolean {
  if (!a.name) return false;
  const upper = a.name.toUpperCase();
  return upper.includes('ACQUISITION CORP') || upper.includes('ACQUISITION CO.') || upper.includes('BLANK CHECK');
}

function isQualifiedAsset(a: AlpacaAsset, intent: UserIntent): boolean {
  if (!a.tradable || !a.fractionable || !a.marginable) return false;
  if (a.status !== 'active') return false;
  // Simple ticker: A-Z only, 1–5 chars (excludes warrants like X.WS, units like AAPL.U)
  if (!/^[A-Z]{1,5}$/.test(a.symbol)) return false;
  // Reject ETFs/funds unless user explicitly asked for them
  if (intent.asset_class === 'common_stock' && isETFOrFund(a)) return false;
  // Reject SPACs — shell companies with no operating business
  if (isSPAC(a)) return false;
  return true;
}

async function fetchSnapshots(symbols: string[]): Promise<Record<string, AlpacaSnapshot>> {
  const creds = alpacaPaperCredentials();
  if (!creds.configured) return {};

  const dataUrl = 'https://data.alpaca.markets';
  const results: Record<string, AlpacaSnapshot> = {};

  for (let i = 0; i < symbols.length; i += SNAPSHOT_BATCH) {
    const batch = symbols.slice(i, i + SNAPSHOT_BATCH);
    const url = `${dataUrl}/v2/stocks/snapshots?symbols=${batch.join(',')}&feed=iex`;
    try {
      const res = await fetch(url, {
        headers: alpacaHeaders(),
        signal: AbortSignal.timeout(20_000),
        cache: 'no-store',
      });
      if (!res.ok) continue;
      const data = await res.json() as Record<string, AlpacaSnapshot>;
      Object.assign(results, data);
    } catch {
      // partial failure — keep what we have
    }
  }
  return results;
}

export type ScreenerResult = {
  tickers: string[];
  names: Record<string, string>;
  source: 'alpaca' | 'fallback';
  total: number;
  filtered: number;
};

export async function screenUniverse(intent: UserIntent, maxTickers = 75): Promise<ScreenerResult> {
  try {
    const assets = await fetchAllAssets();
    if (assets.length === 0) {
      return { tickers: DEFAULT_WATCHLIST, names: {}, source: 'fallback', total: 0, filtered: 0 };
    }

    const qualifiedAssets = assets.filter(a => isQualifiedAsset(a, intent));
    const qualified = qualifiedAssets.map(a => a.symbol);
    const nameMap: Record<string, string> = {};
    for (const a of qualifiedAssets) nameMap[a.symbol] = a.name ?? a.symbol;

    const snapshots = await fetchSnapshots(qualified);

    type Ranked = { symbol: string; price: number; volume: number };
    const ranked: Ranked[] = [];

    for (const symbol of qualified) {
      const snap = snapshots[symbol];
      if (!snap) continue;
      const price  = snap.latestTrade?.p  ?? 0;
      const volume = snap.dailyBar?.v     ?? 0;
      if (price < MIN_PRICE || volume < MIN_AVG_VOLUME) continue;
      ranked.push({ symbol, price, volume });
    }

    ranked.sort((a, b) => b.volume - a.volume);
    const tickers = ranked.slice(0, maxTickers).map(r => r.symbol);
    const names: Record<string, string> = {};
    for (const t of tickers) names[t] = nameMap[t] ?? t;

    if (tickers.length === 0) {
      return { tickers: DEFAULT_WATCHLIST, names: {}, source: 'fallback', total: assets.length, filtered: 0 };
    }

    return { tickers, names, source: 'alpaca', total: assets.length, filtered: ranked.length };
  } catch {
    return { tickers: DEFAULT_WATCHLIST, names: {}, source: 'fallback', total: 0, filtered: 0 };
  }
}
