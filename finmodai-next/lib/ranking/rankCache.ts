import { createClient } from '@supabase/supabase-js';
import type { RankedStock } from './types';

function serviceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const TABLE = 'ranked_stocks';

export type CachedRow = {
  ticker: string;
  data: RankedStock;
  scored_at: string;
};

/** Read all cached stocks, optionally filtered by max age. */
export async function readCache(maxAgeMs = 4 * 60 * 60 * 1000): Promise<RankedStock[]> {
  const sb = serviceClient();
  if (!sb) return [];

  const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

  const { data, error } = await sb
    .from(TABLE)
    .select('ticker, data, scored_at')
    .gte('scored_at', cutoff)
    .order('scored_at', { ascending: false });

  if (error || !Array.isArray(data)) return [];

  // One row per ticker — deduplicate in case of dupes, take freshest
  const seen = new Set<string>();
  const stocks: RankedStock[] = [];
  for (const row of data as CachedRow[]) {
    if (!seen.has(row.ticker)) {
      seen.add(row.ticker);
      stocks.push(row.data as RankedStock);
    }
  }
  return stocks.sort((a, b) => b.score - a.score);
}

/** Upsert a batch of scored stocks. */
export async function writeCache(stocks: RankedStock[]): Promise<void> {
  const sb = serviceClient();
  if (!sb || stocks.length === 0) return;

  const rows = stocks.map(s => ({
    ticker:    s.ticker,
    data:      s,
    scored_at: s.meta.scoredAt ?? new Date().toISOString(),
  }));

  const { error } = await sb
    .from(TABLE)
    .upsert(rows, { onConflict: 'ticker' });

  if (error) {
    console.error('[rankCache] upsert error:', error.message);
  }
}

/** Read the current cron offset (which slice of the watchlist to score next). */
export async function readCronOffset(): Promise<number> {
  const sb = serviceClient();
  if (!sb) return 0;
  const { data } = await sb
    .from('rank_cron_state')
    .select('offset')
    .eq('id', 1)
    .maybeSingle();
  return (data as { offset?: number } | null)?.offset ?? 0;
}

/** Advance the cron offset, wrapping at totalTickers. */
export async function writeCronOffset(next: number): Promise<void> {
  const sb = serviceClient();
  if (!sb) return;
  await sb
    .from('rank_cron_state')
    .upsert({ id: 1, offset: next }, { onConflict: 'id' });
}
