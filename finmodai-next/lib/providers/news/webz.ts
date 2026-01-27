import 'server-only';

import { ProviderError, notConfigured, providerFailure, providerTimeout } from '@/lib/providers/errors';
import type { NewsItem } from '@/lib/schemas/news';
import { ENV } from '@/lib/env/server';
import { fetchWithTimeout, toErrorText } from '@/lib/providers/utils';

const WEBZ_KEY = ENV.WEBZ_API_KEY ?? '';

const toString = (value: unknown) => {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  return String(value);
};

const toArray = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.map((item) => toString(item)).filter(Boolean);
};

const hashId = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return `webz-${Math.abs(hash)}`;
};

const normalizeDate = (value: unknown) => {
  const raw = toString(value);
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
};

export async function fetchWebzNews(params: {
  query: string;
  size: number;
  traceId: string;
}): Promise<NewsItem[]> {
  if (!WEBZ_KEY) throw notConfigured('webz');

  const url = `https://api.webz.io/filterWebContent?token=${encodeURIComponent(
    WEBZ_KEY
  )}&q=${encodeURIComponent(params.query)}&size=${params.size}&format=json`;
  try {
    const res = await fetchWithTimeout(url, { cache: 'no-store' }, 5000);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const snippet = text.replace(/\s+/g, ' ').trim().slice(0, 300);
      throw providerFailure('webz', snippet ? `HTTP ${res.status}: ${snippet}` : `HTTP ${res.status}`, res.status);
    }

    const json = await res.json().catch(() => {
      throw providerFailure('webz', 'Invalid JSON response');
    });
    const posts = Array.isArray(json?.posts) ? json.posts : Array.isArray(json?.articles) ? json.articles : [];

    return posts.map((post: any) => {
      const title = toString(post?.title);
      const urlStr = toString(post?.url);
      const source = toString(post?.thread?.site || post?.source || post?.source_title);
      const summary = toString(post?.text || post?.summary || post?.snippet || post?.excerpt);
      const publishedAt = normalizeDate(post?.published || post?.published_at || post?.created || post?.updated);
      const topics = toArray(post?.topics || post?.thread?.site_section);
      const tickers = toArray(post?.symbols || post?.tickers);
      const id = toString(post?.uuid) || (urlStr ? hashId(urlStr) : hashId(title || publishedAt));

      return {
        id,
        title: title || 'Untitled',
        url: urlStr || '',
        source: source || 'Webz.io',
        publishedAt,
        summary,
        topics,
        tickers,
      };
    });
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw providerTimeout('webz');
    throw providerFailure('webz', toErrorText(error));
  }
}
