/**
 * Thin X (Twitter) v2 search client. Read-only via Bearer token.
 * Gracefully returns null when no token is configured so the brief generator
 * can fall back to news-pipeline-only mode without crashing.
 */

export type XTweetSample = {
  id: string;
  text: string;
  createdAt: string;
  likeCount: number;
  retweetCount: number;
  replyCount: number;
  url: string;
};

export type XSearchResult = {
  query: string;
  tweets: XTweetSample[];
  totalReturned: number;
};

const X_SEARCH_ENDPOINT = 'https://api.x.com/2/tweets/search/recent';

export function isXConfigured(): boolean {
  return Boolean(process.env.X_BEARER_TOKEN);
}

export async function searchX(query: string, maxResults = 10): Promise<XSearchResult | null> {
  const token = process.env.X_BEARER_TOKEN;
  if (!token) return null;
  const params = new URLSearchParams({
    query,
    max_results: String(Math.min(Math.max(maxResults, 10), 100)),
    'tweet.fields': 'public_metrics,created_at,author_id',
  });
  try {
    const res = await fetch(`${X_SEARCH_ENDPOINT}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      console.warn('[x-client] search failed', { query, status: res.status });
      return null;
    }
    type RawTweet = { id: string; text: string; created_at?: string; author_id?: string; public_metrics?: { like_count?: number; retweet_count?: number; reply_count?: number } };
    const data = await res.json() as { data?: RawTweet[] };
    const tweets: XTweetSample[] = (data.data ?? []).map((t) => ({
      id: t.id,
      text: t.text,
      createdAt: t.created_at ?? '',
      likeCount: t.public_metrics?.like_count ?? 0,
      retweetCount: t.public_metrics?.retweet_count ?? 0,
      replyCount: t.public_metrics?.reply_count ?? 0,
      url: t.author_id ? `https://x.com/i/web/status/${t.id}` : `https://x.com/i/web/status/${t.id}`,
    }));
    return { query, tweets, totalReturned: tweets.length };
  } catch (err) {
    console.warn('[x-client] search threw', { query, error: (err as Error).message });
    return null;
  }
}

/** Build search queries that bias toward high-signal financial chatter. */
export function tickerQuery(ticker: string): string {
  return `($${ticker} OR ${ticker}) -is:retweet -is:reply lang:en`;
}
export function sectorQuery(sector: string): string {
  return `${JSON.stringify(sector)} (market OR stocks OR earnings OR sector) -is:retweet -is:reply lang:en`;
}
export function macroQuery(theme: string): string {
  return `${JSON.stringify(theme)} (markets OR Fed OR economy OR rates) -is:retweet -is:reply lang:en`;
}
