import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { newsWindowSchema, type NewsWindow } from '@/lib/news/fetchHeadlines';

export const dynamic = 'force-dynamic';

const providerArticleSchema = z.object({
  title: z.string().min(1),
  url: z.string().url(),
  publishedAt: z.string().datetime(),
  source: z.object({ name: z.string().min(1) }).optional(),
  description: z.string().nullable().optional(),
});

const providerPayloadSchema = z.object({
  status: z.string(),
  articles: z.array(providerArticleSchema),
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

function fromIsoForWindow(window: NewsWindow): string {
  const dt = new Date();
  dt.setUTCDate(dt.getUTCDate() - WINDOW_DAYS[window]);
  return dt.toISOString();
}

function inferTags(title: string): string[] {
  const text = title.toLowerCase();
  const tags = [
    'rates',
    'inflation',
    'growth',
    'credit',
    'energy',
    'fx',
    'geopolitics',
    'policy',
    'earnings',
    'markets',
  ].filter((tag) => text.includes(tag));
  return tags;
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsedWindow = newsWindowSchema.safeParse((searchParams.get('window') || '1d').toLowerCase());

    if (!parsedWindow.success) {
      return NextResponse.json({ ok: false, error: 'Invalid window. Use 1d|3d|1w|1m.' }, { status: 400 });
    }

    const window = parsedWindow.data;
    const from = fromIsoForWindow(window);
    const to = new Date().toISOString();

    const newsApiKey = process.env.NEWS_API_KEY;
    if (!newsApiKey) {
      return NextResponse.json({ ok: false, error: 'NEWS_API_KEY is not configured.' }, { status: 500 });
    }

    const query = [
      'markets',
      'economy',
      'federal reserve',
      'inflation',
      'interest rates',
      'treasury',
      'credit',
      'energy',
      'fx',
      'geopolitics',
      'policy',
    ].join(' OR ');

    const params = new URLSearchParams({
      q: query,
      language: 'en',
      sortBy: 'publishedAt',
      from,
      to,
      pageSize: '100',
      apiKey: newsApiKey,
    });

    const providerResponse = await fetch(`https://newsapi.org/v2/everything?${params.toString()}`, {
      cache: 'no-store',
    });

    if (!providerResponse.ok) {
      const body = await providerResponse.text();
      return NextResponse.json(
        { ok: false, error: `News provider request failed (${providerResponse.status}): ${body}` },
        { status: 500 }
      );
    }

    const providerJson = providerPayloadSchema.parse(await providerResponse.json());

    const normalized = providerJson.articles.map((article) => ({
      published_at: new Date(article.publishedAt).toISOString(),
      title: article.title,
      source: article.source?.name ?? 'Unknown',
      url: article.url,
      summary: article.description ?? null,
      tickers: null,
      tags: inferTags(article.title),
    }));

    const supabase = getSupabaseClient();

    const urls = normalized.map((row) => row.url);
    const { data: existingRows, error: existingError } = await supabase
      .from('news_headlines')
      .select('url')
      .in('url', urls);

    if (existingError) {
      throw new Error(`Supabase pre-check failed: ${existingError.message}`);
    }

    const existingUrlSet = new Set((existingRows ?? []).map((row: { url: string }) => row.url));

    const { error: upsertError } = await supabase
      .from('news_headlines')
      .upsert(normalized, { onConflict: 'url' });

    if (upsertError) {
      throw new Error(`Supabase upsert failed: ${upsertError.message}`);
    }

    const updated = normalized.filter((row) => existingUrlSet.has(row.url)).length;
    const inserted = normalized.length - updated;

    return NextResponse.json({
      ok: true,
      window,
      fetched: normalized.length,
      inserted,
      updated,
    });
  } catch (error: any) {
    const message = error instanceof Error ? error.message : 'Headline ingestion failed.';
    console.error('[ingest/headlines] Error:', error);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
