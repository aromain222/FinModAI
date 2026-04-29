import { headers } from 'next/headers';
import type { NewsRange, NewsTopic } from '@/lib/news/types';

export type ServerHeadlineItem = {
  id: string;
  title: string;
  description: string | null;
  url: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
};

export type ServerHeadlinesPayload = {
  items: ServerHeadlineItem[];
  provider?: 'perigon' | 'polygon' | 'alphavantage' | 'benzinga' | 'eodhd' | 'newsapi' | 'finnhub' | 'supabase' | 'demo' | 'none';
  error?: { error: string; details?: Record<string, unknown> };
};

function resolveBaseUrl() {
  const requestHeaders = headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host') ?? 'localhost:3000';
  const proto = requestHeaders.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function fetchHeadlinesServer(params: {
  range: NewsRange;
  topic: NewsTopic;
  limit?: number;
}): Promise<ServerHeadlinesPayload> {
  const baseUrl = resolveBaseUrl();
  const limit = params.limit ?? 20;
  const url = `${baseUrl}/api/news?range=${params.range}&topic=${params.topic}&limit=${limit}`;

  try {
    const response = await fetch(url, {
      next: { revalidate: 300 },
      headers: {
        'x-capitalbase-internal': 'news-page',
      },
    });
    const raw = await response.json();
    if (!response.ok || typeof raw?.error === 'string') {
      return {
        items: [],
        provider: raw?.provider,
        error: {
          error: typeof raw?.error === 'string' ? raw.error : 'request_failed',
          details: raw?.details && typeof raw.details === 'object' ? raw.details : undefined,
        },
      };
    }

    const items = Array.isArray(raw?.items)
      ? raw.items
          .map((item: any) => {
            if (!item || typeof item !== 'object') return null;
            if (
              typeof item.id !== 'string' ||
              typeof item.title !== 'string' ||
              typeof item.url !== 'string' ||
              typeof item.source !== 'string' ||
              typeof item.publishedAt !== 'string'
            ) {
              return null;
            }
            return {
              id: item.id,
              title: item.title,
              description: typeof item.description === 'string' ? item.description : null,
              url: item.url,
              source: item.source,
              publishedAt: item.publishedAt,
              imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : undefined,
            } satisfies ServerHeadlineItem;
          })
          .filter(Boolean)
      : [];

    return {
      items,
      provider:
        raw?.provider === 'perigon' ||
        raw?.provider === 'polygon' ||
        raw?.provider === 'alphavantage' ||
        raw?.provider === 'benzinga' ||
        raw?.provider === 'eodhd' ||
        raw?.provider === 'newsapi' ||
        raw?.provider === 'finnhub' ||
        raw?.provider === 'supabase' ||
        raw?.provider === 'demo' ||
        raw?.provider === 'none'
          ? raw.provider
          : undefined,
    };
  } catch (error) {
    return {
      items: [],
      error: {
        error: error instanceof Error ? error.message : 'Failed to load headlines',
      },
    };
  }
}
