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
export async function findTrendingCandidates(input: {
  origin: string;
  sector: string | null;
  limit?: number;
  requestHeaders?: Headers;
}): Promise<TrendingCandidate[]> {
  const limit = input.limit ?? 5;
  const sectorKey = input.sector ? normalizeSector(input.sector) : null;

  // 1. Recent events
  const res = await fetch(`${input.origin}/api/events?range=today`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json().catch(() => null) as { events?: EventItem[]; items?: EventItem[] } | null;
  const events = data?.events ?? data?.items ?? [];

  // 2. Filter by sector if requested
  const filteredEvents = sectorKey
    ? events.filter(e =>
        (e.impacted_sectors ?? []).some(s => normalizeSector(s.sector).includes(sectorKey) || sectorKey.includes(normalizeSector(s.sector))),
      )
    : events;

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
  return [...counts.values()]
    .filter(c => !recentlyUsed.has(c.ticker))
    .sort((a, b) => {
      if (b.mentionCount !== a.mentionCount) return b.mentionCount - a.mentionCount;
      return Math.abs(b.bullishCount - b.bearishCount) - Math.abs(a.bullishCount - a.bearishCount);
    })
    .slice(0, limit);
}
