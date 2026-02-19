import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { EventItem, NewsRange, NewsTopic, NormalizedNewsItem } from '@/lib/news/types';

const RANGE_HOURS: Record<NewsRange, number> = {
  '1D': 24,
  '3D': 72,
  '1W': 24 * 7,
  '1M': 24 * 30,
};

const headlineRowSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  description: z.string().nullable().optional(),
  summary: z.string().nullable().optional(),
  url: z.string().url().optional(),
  published_at: z.string().datetime().optional(),
  tags: z.array(z.string()).optional(),
  ai_summary: z.string().nullable().optional(),
  affected_tickers: z.array(z.string()).nullable().optional(),
  affected_sectors: z.array(z.string()).nullable().optional(),
  tickers: z.array(z.string()).nullable().optional(),
});

const macroEventRowSchema = z.object({
  id: z.string().optional(),
  title: z.string().optional(),
  one_line: z.string().optional(),
  why_it_matters: z.string().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  source_urls: z.array(z.string()).optional(),
  created_at: z.string().datetime().optional(),
  impacted_sectors: z.any().optional(),
  impacted_assets: z.any().optional(),
});

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) throw new Error('SUPABASE_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false } });
}

function fromDate(range: NewsRange): string {
  const dt = new Date();
  dt.setHours(dt.getHours() - RANGE_HOURS[range]);
  return dt.toISOString();
}

function fromDateOnly(range: NewsRange): string {
  return fromDate(range).slice(0, 10);
}

function tagMatches(tags: string[] | undefined, topic: NewsTopic): boolean {
  if (topic === 'all') return true;
  if (!tags || tags.length === 0) return false;
  return tags.map((t) => t.toLowerCase()).includes(topic);
}

function ensureArray<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value as T[];
}

export async function fetchFallbackHeadlines(params: {
  range: NewsRange;
  topic: NewsTopic;
  limit: number;
}): Promise<NormalizedNewsItem[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('news_headlines')
    .select('*')
    .gte('published_at', fromDate(params.range))
    .order('published_at', { ascending: false })
    .limit(Math.max(params.limit * 2, 40));

  if (error) {
    console.error('[news/fallback] headlines query failed', error.message);
    return [];
  }

  const out: NormalizedNewsItem[] = [];
  const seen = new Set<string>();
  for (const raw of data ?? []) {
    const row = headlineRowSchema.safeParse(raw);
    if (!row.success) continue;
    const url = row.data.url || '';
    const title = row.data.title || '';
    if (!url || !title || seen.has(url)) continue;
    if (!tagMatches(row.data.tags, params.topic)) continue;

    seen.add(url);
    out.push({
      id: row.data.id || url,
      source: row.data.source || 'Supabase',
      title,
      description: row.data.description ?? row.data.summary ?? null,
      url,
      published_at: row.data.published_at || new Date().toISOString(),
      tags: row.data.tags ?? undefined,
      ai_summary: row.data.ai_summary ?? null,
      affected_tickers:
        row.data.affected_tickers ??
        row.data.tickers ??
        null,
      affected_sectors: row.data.affected_sectors ?? null,
    });
    if (out.length >= params.limit) break;
  }
  return out;
}

export async function fetchFallbackEvents(params: {
  range: NewsRange;
  topic: NewsTopic;
  limit: number;
}): Promise<EventItem[]> {
  const supabase = getSupabaseClient();
  const dateColsByTable: Array<{ table: 'news_events' | 'macro_events'; cols: string[] }> = [
    { table: 'news_events', cols: ['published_at', 'created_at'] },
    { table: 'macro_events', cols: ['event_date', 'created_at'] },
  ];

  for (const { table, cols } of dateColsByTable) {
    let data: unknown[] | null = null;
    let queryError: { message?: string } | null = null;

    for (const dateCol of cols) {
      const threshold = dateCol === 'event_date' ? fromDateOnly(params.range) : fromDate(params.range);
      const query = await supabase
        .from(table)
        .select('*')
        .gte(dateCol, threshold)
        .order(dateCol, { ascending: false })
        .limit(Math.max(params.limit * 2, 30));
      if (!query.error) {
        data = query.data ?? [];
        queryError = null;
        break;
      }
      queryError = query.error;
    }

    if (queryError || !data) continue;

    const events: EventItem[] = [];
    for (const raw of data) {
      const row = macroEventRowSchema.safeParse(raw);
      if (!row.success) continue;
      const sectors = ensureArray<{ sector?: string; direction?: 'up' | 'down' | 'mixed' | 'unknown'; rationale?: string }>(row.data.impacted_sectors);
      const assets = ensureArray<{ label?: string; dir?: 'up' | 'down' | 'mixed' }>(row.data.impacted_assets);
      const tags = ensureArray<string>((raw as any).tags);
      if (params.topic !== 'all' && !tags.map((t) => t.toLowerCase()).includes(params.topic)) continue;

      const record = raw as Record<string, unknown>;
      const publishedAt =
        (typeof record.published_at === 'string' && record.published_at) ||
        (typeof record.event_date === 'string' && `${record.event_date}T00:00:00.000Z`) ||
        row.data.created_at ||
        new Date().toISOString();

      const sources = ensureArray<string>(row.data.source_urls)
        .slice(0, 4)
        .map((url) => ({
          source: 'Supabase',
          title: row.data.title || 'Source',
          url,
          published_at: publishedAt,
        }));
      if (sources.length === 0) continue;

      events.push({
        id: row.data.id || `${table}-${events.length}`,
        title: row.data.title || 'Macro Event',
        what_happened: row.data.one_line || 'Key market development observed.',
        ai_summary: row.data.one_line || 'Market development summary unavailable.',
        why_it_matters: row.data.why_it_matters || 'No additional detail available.',
        impacted_sectors: sectors
          .filter((s) => typeof s.sector === 'string')
          .map((s) => ({
            sector: (s.sector || 'Technology') as any,
            direction: s.direction || 'unknown',
            rationale: s.rationale,
          })),
        impacted_tickers: assets
          .filter((a) => typeof a.label === 'string')
          .map((a) => ({
            ticker: String(a.label),
            direction: a.dir || 'unknown',
          })),
        watch_items: [
          'Track follow-through in rates and index breadth.',
          'Monitor credit and volatility signals for confirmation.',
          'Watch sector leadership changes over the next sessions.',
        ],
        sources,
        confidence: row.data.confidence || 'medium',
        published_at: publishedAt,
        tags,
      });
      if (events.length >= params.limit) break;
    }
    return events;
  }

  return [];
}
