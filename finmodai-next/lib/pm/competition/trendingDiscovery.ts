import type { EventItem } from '@/lib/news/api/shared';
import { listPMRecords } from '@/lib/pm/persistence/store';

export type TrendingCandidate = {
  ticker: string;
  mentionCount: number;
  bullishCount: number;
  bearishCount: number;
  netDirection: 'up' | 'down' | 'flat';
  sampleHeadlines: string[];
  sectorsMatched: string[];
};

type StoredRoundLite = {
  id: string;
  winnerTicker?: string | null;
  candidateTickers?: string[] | null;
  createdAt?: string;
};

const DEDUPE_WINDOW_DAYS = 7;

function ageDays(iso: string): number {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return (Date.now() - t) / 86_400_000;
}

function normalizeSector(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

/**
 * Pull trending tickers for a sector from the FinModAI events pipeline.
 *
 *  1. Fetch events for the day from /api/events.
 *  2. Optionally filter to events whose impacted_sectors match the requested sector.
 *  3. Tally impacted_tickers across events (count + bullish/bearish split).
 *  4. Skip tickers picked as a competition winner or candidate within the dedupe window.
 *  5. Return top N by mention count.
 */
// Liquid large-cap fallback per sector — used when the news pipeline returns too few
// sector-tagged tickers to populate a round. These are the names a PM would actually
// research first in each sector anyway.
const SECTOR_FALLBACK_UNIVERSE: Record<string, string[]> = {
  technology:             ['NVDA', 'MSFT', 'AAPL', 'GOOGL', 'AMD', 'PLTR', 'AVGO', 'CRM'],
  healthcare:             ['UNH', 'LLY', 'JNJ', 'ABBV', 'MRK', 'NVO', 'VRTX', 'TMO'],
  financials:             ['JPM', 'BAC', 'V', 'MA', 'GS', 'MS', 'SCHW', 'AXP'],
  consumerdiscretionary:  ['AMZN', 'TSLA', 'HD', 'LOW', 'NKE', 'SBUX', 'MCD', 'BKNG'],
  consumerstaples:        ['WMT', 'COST', 'PG', 'KO', 'PEP', 'PM', 'CL', 'MO'],
  energy:                 ['XOM', 'CVX', 'COP', 'OXY', 'EOG', 'SLB', 'MPC', 'PSX'],
  industrials:            ['CAT', 'UNP', 'HON', 'GE', 'BA', 'RTX', 'LMT', 'DE'],
  materials:              ['LIN', 'SHW', 'FCX', 'APD', 'ECL', 'NEM', 'DOW', 'NUE'],
  utilities:              ['NEE', 'SO', 'DUK', 'AEP', 'D', 'EXC', 'XEL', 'SRE'],
  realestate:             ['PLD', 'AMT', 'EQIX', 'CCI', 'O', 'WELL', 'PSA', 'SPG'],
  communicationservices:  ['META', 'NFLX', 'GOOGL', 'DIS', 'TMUS', 'VZ', 'T', 'CMCSA'],
};

export async function findTrendingCandidates(input: {
  origin: string;
  sector: string | null;
  limit?: number;
  requestHeaders?: Headers;
}): Promise<TrendingCandidate[]> {
  const limit = input.limit ?? 5;
  const sectorKey = input.sector ? normalizeSector(input.sector) : null;

  // 1. Recent events — /api/events accepts range 1D|3D|1W|1M|3M (anything else 400s).
  //    Try wider windows so a quiet news day still gives us material.
  let events: EventItem[] = [];
  for (const range of ['1W', '1M'] as const) {
    const res = await fetch(`${input.origin}/api/events?range=${range}&limit=80`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    if (!res?.ok) continue;
    const data = (await res.json().catch(() => null)) as { events?: EventItem[]; items?: EventItem[] } | null;
    const items = data?.events ?? data?.items ?? [];
    if (items.length > 0) { events = items; break; }
  }

  // 2. Filter by sector if requested. Keep BOTH the sector-tight set and the unfiltered set
  //    so we can fall back when sector-tagged events are sparse.
  const sectorFiltered = sectorKey
    ? events.filter(e =>
        (e.impacted_sectors ?? []).some(s => normalizeSector(s.sector).includes(sectorKey) || sectorKey.includes(normalizeSector(s.sector))),
      )
    : events;
  const filteredEvents = sectorFiltered.length >= 3 ? sectorFiltered : events;

  // 3. Tally
  const counts = new Map<string, TrendingCandidate>();
  for (const ev of filteredEvents) {
    for (const tk of ev.impacted_tickers ?? []) {
      const ticker = tk.ticker?.toUpperCase().trim();
      if (!ticker || ticker.length > 6) continue;
      const cur = counts.get(ticker) ?? {
        ticker,
        mentionCount: 0,
        bullishCount: 0,
        bearishCount: 0,
        netDirection: 'flat' as const,
        sampleHeadlines: [],
        sectorsMatched: [],
      };
      cur.mentionCount += 1;
      if (tk.direction === 'up') cur.bullishCount += 1;
      if (tk.direction === 'down') cur.bearishCount += 1;
      if (cur.sampleHeadlines.length < 3 && ev.title) cur.sampleHeadlines.push(ev.title);
      const sectorsMatched = (ev.impacted_sectors ?? []).map(s => s.sector);
      for (const sec of sectorsMatched) {
        if (!cur.sectorsMatched.includes(sec)) cur.sectorsMatched.push(sec);
      }
      counts.set(ticker, cur);
    }
  }

  for (const c of counts.values()) {
    c.netDirection = c.bullishCount > c.bearishCount ? 'up' : c.bearishCount > c.bullishCount ? 'down' : 'flat';
  }

  // 4. Memory: exclude tickers we've recently picked or had as candidates
  const recentRounds = await listPMRecords<StoredRoundLite & { createdAt: string }>('pm_competition_rounds', { limit: 50 });
  const recentlyUsed = new Set<string>();
  for (const r of recentRounds) {
    const createdAt = r.createdAt ?? '';
    if (!createdAt || ageDays(createdAt) > DEDUPE_WINDOW_DAYS) continue;
    if (r.winnerTicker) recentlyUsed.add(r.winnerTicker.toUpperCase());
    for (const t of r.candidateTickers ?? []) recentlyUsed.add(t.toUpperCase());
  }

  // 5. Rank
  const ranked = [...counts.values()]
    .filter(c => !recentlyUsed.has(c.ticker))
    .sort((a, b) => {
      if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;
      return Math.abs(b.bullishCount - b.bearishCount) - Math.abs(a.bullishCount - a.bearishCount);
    })
    .slice(0, limit);

  // 6. Final fallback: if news pipeline gave fewer than 2 actionable names (quiet day,
  //    missing API keys, dedupe drained the pool), top up from the sector's liquid
  //    large-cap universe so a round can always run.
  if (ranked.length >= 2) return ranked;
  if (!sectorKey) return ranked;
  const universe = SECTOR_FALLBACK_UNIVERSE[sectorKey] ?? [];
  const existing = new Set(ranked.map(r => r.ticker));
  for (const ticker of universe) {
    if (ranked.length >= limit) break;
    const upper = ticker.toUpperCase();
    if (existing.has(upper) || recentlyUsed.has(upper)) continue;
    ranked.push({
      ticker: upper,
      mentionCount: 0,
      bullishCount: 0,
      bearishCount: 0,
      netDirection: 'flat',
      sampleHeadlines: [`Sector watchlist: ${input.sector}`],
      sectorsMatched: input.sector ? [input.sector] : [],
    });
    existing.add(upper);
  }
  return ranked;
}
