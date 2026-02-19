import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

export const newsWindowSchema = z.enum(['1d', '3d', '1w', '1m']);
export type NewsWindow = z.infer<typeof newsWindowSchema>;

export const headlineSchema = z.object({
  id: z.string().uuid().or(z.string().min(1)),
  publishedAt: z.string().datetime(),
  title: z.string().min(1),
  source: z.string().min(1),
  url: z.string().url(),
  summary: z.string().nullable(),
  tickers: z.array(z.string()).nullable(),
  tags: z.array(z.string()),
});

export type HeadlineItem = z.infer<typeof headlineSchema>;

const headlineRowSchema = z.object({
  id: z.string().uuid(),
  published_at: z.string().datetime(),
  title: z.string().min(1),
  source: z.string().min(1),
  url: z.string().url(),
  summary: z.string().nullable(),
  tickers: z.array(z.string()).nullable(),
  tags: z.array(z.string()).nullable(),
});

const WINDOW_DAYS: Record<NewsWindow, number> = {
  '1d': 1,
  '3d': 3,
  '1w': 7,
  '1m': 30,
};

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!url || !key) {
    throw new Error('Supabase service credentials are not configured.');
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

export function startIsoForWindow(window: NewsWindow): string {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() - WINDOW_DAYS[window]);
  return dt.toISOString();
}

export async function fetchHeadlinesFromSupabase(window: NewsWindow, limit = 50): Promise<HeadlineItem[]> {
  const supabase = getSupabaseClient();
  const startIso = startIsoForWindow(window);

  const { data, error } = await supabase
    .from('news_headlines')
    .select('id, published_at, title, source, url, summary, tickers, tags')
    .gte('published_at', startIso)
    .order('published_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, limit)));

  if (error) {
    throw new Error(`Supabase headlines query failed: ${error.message}`);
  }

  const rows = z.array(headlineRowSchema).parse(data ?? []);
  return rows.map((row) =>
    headlineSchema.parse({
      id: row.id,
      publishedAt: new Date(row.published_at).toISOString(),
      title: row.title,
      source: row.source,
      url: row.url,
      summary: row.summary,
      tickers: row.tickers,
      tags: row.tags ?? [],
    })
  );
}
