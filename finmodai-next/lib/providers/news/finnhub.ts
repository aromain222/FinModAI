import { MarketHeadline } from '@/lib/schemas/market';
import { notConfigured, providerFailure } from '@/lib/providers/errors';
import { ENV, keysPresent } from '@/lib/env/server';
import { toErrorText } from '@/lib/providers/utils';
import type { HeadlinesResult, HeadlineItem } from '@/lib/providers/types';

const sentimentFromTitle = (title: string): 'pos' | 'neg' | 'neu' => {
  const lower = title.toLowerCase();
  if (lower.includes('rally') || lower.includes('surge') || lower.includes('gain')) return 'pos';
  if (lower.includes('drop') || lower.includes('decline') || lower.includes('fall') || lower.includes('recession')) return 'neg';
  return 'neu';
};

export async function fetchFinnhubHeadlines(params: {
  limit: number;
  traceId: string;
}): Promise<MarketHeadline[]> {
  const apiKey = ENV.FINNHUB_API_KEY;
  if (!apiKey) throw notConfigured('finnhub');
  const url = `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw providerFailure('finnhub', `HTTP ${res.status}`, res.status);
  const json = await res.json();
  const items = Array.isArray(json) ? json : [];
  return items.slice(0, params.limit).map((item: any) => ({
    title: item.headline || 'Untitled',
    source: item.source || 'Finnhub',
    url: item.url,
    publishedAt: item.datetime ? new Date(item.datetime * 1000).toISOString() : new Date().toISOString(),
    sentiment: sentimentFromTitle(item.headline || ''),
    summary: item.summary || undefined,
  }));
}

const mapSentiment = (sentiment: MarketHeadline['sentiment']) => {
  if (sentiment === 'pos') return 'bullish';
  if (sentiment === 'neg') return 'bearish';
  return 'neutral';
};

export async function getHeadlines(params: {
  range: '1D' | '1W' | '1M';
  region: string;
  sentiment?: 'all' | 'bullish' | 'neutral' | 'bearish';
  traceId: string;
}): Promise<HeadlinesResult> {
  if (!keysPresent.finnhub) {
    return {
      status: 'missing_key',
      source: 'Finnhub',
      asOf: new Date().toISOString(),
      data: { items: [] },
      errors: ['FINNHUB_API_KEY missing'],
    };
  }

  try {
    const items = await fetchFinnhubHeadlines({ limit: 25, traceId: params.traceId });
    const mapped: HeadlineItem[] = items.map((item, idx) => ({
      id: `${item.source}-${idx}-${item.publishedAt}`,
      title: item.title,
      source: item.source,
      url: item.url,
      publishedAt: item.publishedAt,
      sentiment: mapSentiment(item.sentiment),
      summary: item.summary,
    }));

    const sentiment = params.sentiment && params.sentiment !== 'all' ? params.sentiment : null;
    const filtered = sentiment ? mapped.filter((item) => item.sentiment === sentiment) : mapped;

    if (!filtered.length) {
      return {
        status: 'error',
        source: 'Finnhub',
        asOf: new Date().toISOString(),
        data: { items: [] },
        errors: ['Finnhub returned no headlines'],
      };
    }

    return {
      status: 'ok',
      source: 'Finnhub',
      asOf: filtered[0]?.publishedAt ?? new Date().toISOString(),
      data: { items: filtered },
    };
  } catch (error) {
    return {
      status: 'error',
      source: 'Finnhub',
      asOf: new Date().toISOString(),
      data: { items: [] },
      errors: [toErrorText(error)],
    };
  }
}
