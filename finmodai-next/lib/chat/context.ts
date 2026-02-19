import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  companySnapshotSchema,
  macroEventSchema,
  marketSnapshotSchema,
  newsHeadlineSchema,
  type CompanySnapshot,
  type MacroEvent,
  type MarketSnapshot,
  type NewsHeadline,
  type ChatWindow,
} from '@/lib/chat/schemas';

const WINDOW_DAYS: Record<ChatWindow, number> = {
  '1d': 1,
  '3d': 3,
  '1w': 7,
  '1m': 30,
};

const WINDOW_ORDER: ChatWindow[] = ['1d', '3d', '1w', '1m'];

type MarketSnapshotCache = {
  data: MarketSnapshot;
  expiresAt: number;
};

let marketSnapshotCache: MarketSnapshotCache | null = null;

const rawHeadlineRowSchema = z.object({
  title: z.string().min(1),
  source: z.string().min(1),
  published_at: z.string().datetime(),
  url: z.string().url(),
});
type RawHeadlineRow = z.infer<typeof rawHeadlineRowSchema>;

const rawMacroEventRowSchema = z.object({
  title: z.string().min(1),
  bias: z.enum(['Risk-On', 'Risk-Off', 'Hawkish', 'Dovish', 'Neutral']),
  confidence: z.enum(['low', 'medium', 'high']),
  one_line: z.string().min(1),
  what_happened: z.array(z.string().min(1)).length(2),
  why_it_matters: z.string().min(1),
  impacted_assets: z.array(z.object({ label: z.string().min(1), dir: z.enum(['up', 'down', 'mixed']) })),
  impacted_sectors: z.array(z.object({ label: z.string().min(1), dir: z.enum(['up', 'down', 'mixed']) })),
  source_urls: z.array(z.string().url()),
  window: z.enum(['1d', '3d', '1w', '1m']),
  created_at: z.string().datetime(),
});
type RawMacroEventRow = z.infer<typeof rawMacroEventRowSchema>;

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('Supabase service credentials are not configured.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function getCutoffDate(window: ChatWindow): Date {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() - WINDOW_DAYS[window]);
  return dt;
}

function resolveBaseUrl(origin?: string): string {
  if (origin) return origin;
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

function normalizeHeadlineRow(row: RawHeadlineRow): NewsHeadline {
  return newsHeadlineSchema.parse({
    title: row.title,
    source: row.source,
    publishedAt: new Date(row.published_at).toISOString(),
    url: row.url,
  });
}

function normalizeMacroEventRow(row: RawMacroEventRow): MacroEvent {
  return macroEventSchema.parse({
    title: row.title,
    bias: row.bias,
    confidence: row.confidence,
    oneLine: row.one_line,
    whatHappened: row.what_happened,
    whyItMatters: row.why_it_matters,
    impactedAssets: row.impacted_assets,
    impactedSectors: row.impacted_sectors,
    sourceUrls: row.source_urls,
  });
}

function nextWindowWithData(requested: ChatWindow, itemsByWindow: Record<ChatWindow, number>): ChatWindow | null {
  const startIdx = WINDOW_ORDER.indexOf(requested);
  for (let idx = startIdx; idx < WINDOW_ORDER.length; idx += 1) {
    const candidate = WINDOW_ORDER[idx];
    if (itemsByWindow[candidate] > 0) return candidate;
  }
  return null;
}

function tokenizeQuery(query: string): string[] {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'what', 'why', 'this', 'that', 'from', 'into', 'market']);
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3 && !stopWords.has(part));
}

function scoreHeadline(headline: NewsHeadline, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const title = headline.title.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 2;
  }
  return score;
}

export async function fetchMarketSnapshot(origin?: string): Promise<MarketSnapshot> {
  const now = Date.now();
  if (marketSnapshotCache && marketSnapshotCache.expiresAt > now) {
    return marketSnapshotCache.data;
  }

  const baseUrl = resolveBaseUrl(origin);
  const response = await fetch(`${baseUrl}/api/market/snapshot`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Market snapshot fetch failed (${response.status}).`);
  }

  const payload = await response.json();
  const snapshot = marketSnapshotSchema.parse(payload);
  marketSnapshotCache = {
    data: snapshot,
    expiresAt: now + 45_000,
  };
  return snapshot;
}

export async function fetchCompanySnapshots(tickers: string[]): Promise<CompanySnapshot[]> {
  if (tickers.length === 0) return [];
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('demo_company_snapshots')
    .select('ticker, company_name, sector, as_of_date, revenue_ltm, ebitda_ltm, net_income_ltm, cash, total_debt, shares_outstanding, share_price, market_cap, currency, units')
    .in('ticker', tickers.map((ticker) => ticker.toUpperCase()));

  if (error) {
    throw new Error(`Company snapshot query failed: ${error.message}`);
  }

  return z.array(companySnapshotSchema).parse(data ?? []);
}

export type RecentNewsContext = {
  events: MacroEvent[];
  headlines: NewsHeadline[];
  requestedWindow: ChatWindow;
  usedWindow: ChatWindow | null;
  hasSources: boolean;
};

export async function fetchRecentNewsContext(params: {
  window: ChatWindow;
  query: string;
}): Promise<RecentNewsContext> {
  const supabase = getSupabaseClient();
  const requestedWindow = params.window;

  const [eventsResult, headlinesResult] = await Promise.all([
    supabase
      .from('macro_events')
      .select(
        'title, bias, confidence, one_line, what_happened, why_it_matters, impacted_assets, impacted_sectors, source_urls, window, created_at'
      )
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('news_headlines')
      .select('title, source, published_at, url')
      .order('published_at', { ascending: false })
      .limit(120),
  ]);

  if (eventsResult.error) {
    throw new Error(`Macro events query failed: ${eventsResult.error.message}`);
  }
  if (headlinesResult.error) {
    throw new Error(`Headlines query failed: ${headlinesResult.error.message}`);
  }

  const rawEvents = z.array(rawMacroEventRowSchema).parse(eventsResult.data ?? []);
  const allHeadlines = z.array(rawHeadlineRowSchema).parse(headlinesResult.data ?? []).map(normalizeHeadlineRow);

  const headlineCounts: Record<ChatWindow, number> = {
    '1d': 0,
    '3d': 0,
    '1w': 0,
    '1m': 0,
  };

  const headlinesByWindow: Record<ChatWindow, NewsHeadline[]> = {
    '1d': [],
    '3d': [],
    '1w': [],
    '1m': [],
  };

  for (const window of WINDOW_ORDER) {
    const cutoff = getCutoffDate(window);
    const items = allHeadlines.filter((item) => new Date(item.publishedAt) >= cutoff);
    headlinesByWindow[window] = items;
    headlineCounts[window] = items.length;
  }

  const eventCounts: Record<ChatWindow, number> = {
    '1d': 0,
    '3d': 0,
    '1w': 0,
    '1m': 0,
  };
  for (const window of WINDOW_ORDER) {
    eventCounts[window] = rawEvents.filter((row) => row.window === window).length;
  }

  const chosenHeadlinesWindow = nextWindowWithData(requestedWindow, headlineCounts);
  const chosenEventsWindow = nextWindowWithData(requestedWindow, eventCounts);
  const usedWindow = chosenHeadlinesWindow || chosenEventsWindow;

  const queryTokens = tokenizeQuery(params.query);
  const candidateHeadlines = chosenHeadlinesWindow ? headlinesByWindow[chosenHeadlinesWindow] : [];
  const scoredHeadlines = candidateHeadlines
    .map((item) => ({ item, score: scoreHeadline(item, queryTokens) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Date.parse(b.item.publishedAt) - Date.parse(a.item.publishedAt);
    })
    .slice(0, 10)
    .map((entry) => entry.item);

  const events = rawEvents
    .filter((row) => row.window === (chosenEventsWindow ?? requestedWindow))
    .slice(0, 7)
    .map(normalizeMacroEventRow);

  const hasSources =
    scoredHeadlines.some((item) => item.url) || events.some((event) => event.sourceUrls.length > 0);

  return {
    events,
    headlines: scoredHeadlines.slice(0, Math.max(5, Math.min(10, scoredHeadlines.length))),
    requestedWindow,
    usedWindow,
    hasSources,
  };
}
