/**
 * Fetch Macro News from Perigon (primary) with NewsAPI fallback.
 */

export interface MacroNewsItem {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary?: string;
  // Routing metadata (added by newsRouter)
  routing?: {
    lane: 'market' | 'world' | 'drop';
    market_relevance_score: number;
    world_relevance_score: number;
    topics: string[];
    confidence: 'low' | 'medium' | 'high';
  };
}

const newsCache = new Map<string, { data: MacroNewsItem[]; timestamp: number }>();
const NEWS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

/** Well-known US business/finance outlets for American-centric market news */
const US_MARKET_DOMAINS = [
  'reuters.com',
  'bloomberg.com',
  'cnbc.com',
  'wsj.com',
  'marketwatch.com',
  'apnews.com',
  'businesswire.com',
  'prnewswire.com',
  'finance.yahoo.com',
  'nytimes.com',
  'washingtontimes.com',
  'usatoday.com',
  'thestreet.com',
].join(',');

export interface FetchMacroNewsOptions {
  /** Restrict to US sources. */
  country?: 'us';
  /** Prefer US market domains/sources. */
  preferUsDomains?: boolean;
}

function parseDateToIso(input: unknown): string {
  if (typeof input !== 'string' || !input) return new Date().toISOString();
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function normalizePerigonArticles(raw: any[], limit: number): MacroNewsItem[] {
  const now = Date.now();
  const maxAge = 7 * 24 * 60 * 60 * 1000;

  return raw
    .map((article: any) => {
      const title = article?.title || article?.headline || '';
      const url = article?.url || article?.link || '';
      const publishedAt = parseDateToIso(
        article?.pubDate || article?.publishedAt || article?.published || article?.date
      );
      const source =
        article?.source?.title ||
        article?.source?.name ||
        article?.source?.domain ||
        article?.source ||
        'Unknown';
      const summary =
        article?.summary || article?.description || article?.snippet || article?.content || undefined;

      return { title, source, url, publishedAt, summary };
    })
    .filter((article) => {
      if (!article.title || !article.url || article.url === 'https://removed.com') return false;
      const publishedTime = new Date(article.publishedAt).getTime();
      if (Number.isNaN(publishedTime)) return false;
      const age = now - publishedTime;
      return age >= 0 && age <= maxAge;
    })
    .slice(0, limit);
}

async function fetchFromPerigon(limit: number, options?: FetchMacroNewsOptions): Promise<MacroNewsItem[]> {
  const apiKey = process.env.PERIGON_API_KEY;
  if (!apiKey) return [];

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 7);
  const toDateStr = toDate.toISOString().split('T')[0];
  const fromDateStr = fromDate.toISOString().split('T')[0];

  const query =
    'economy OR fed OR inflation OR unemployment OR market OR GDP OR Federal Reserve OR interest rates';
  const size = Math.min(Math.max(limit * 2, 20), 100);
  const params = new URLSearchParams({
    q: query,
    from: fromDateStr,
    to: toDateStr,
    size: String(size),
    sortBy: 'date',
    language: 'en',
  });

  if (options?.country === 'us' || options?.preferUsDomains) {
    params.set('sourceCountry', 'us');
  }

  const url = `https://api.goperigon.com/v1/articles/all?${params.toString()}`;

  try {
    const response = await fetch(url, {
      headers: {
        'x-api-key': apiKey,
        Authorization: `Bearer ${apiKey}`,
        Accept: 'application/json',
      },
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[fetchMacroNews] Perigon error ${response.status}:`, errorText);
      return [];
    }

    const json = await response.json();
    const articles = Array.isArray(json?.articles)
      ? json.articles
      : Array.isArray(json?.data)
      ? json.data
      : [];

    const normalized = normalizePerigonArticles(articles, limit);
    console.log(`[fetchMacroNews] Perigon returned ${normalized.length} valid articles`);
    return normalized;
  } catch (error) {
    console.error('[fetchMacroNews] Perigon fetch failed:', error);
    return [];
  }
}

async function fetchFromNewsApi(limit: number, options?: FetchMacroNewsOptions): Promise<MacroNewsItem[]> {
  const country = options?.country;
  const preferUsDomains = options?.preferUsDomains ?? false;
  const apiKey = process.env.NEWS_API_KEY;

  if (!apiKey) {
    console.warn('[fetchMacroNews] NEWS_API_KEY not found, returning empty array');
    return [];
  }

  const toDate = new Date();
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 7);
  const toDateStr = toDate.toISOString().split('T')[0];
  const fromDateStr = fromDate.toISOString().split('T')[0];
  const query =
    'economy OR fed OR inflation OR unemployment OR market OR GDP OR Federal Reserve OR interest rates';

  try {
    let url: string;
    if (country === 'us') {
      url = `https://newsapi.org/v2/top-headlines?country=us&q=${encodeURIComponent(
        query
      )}&apiKey=${apiKey}&pageSize=${limit}&language=en`;
      console.log('[fetchMacroNews] Fetching US headlines from News API (top-headlines country=us)');
    } else if (preferUsDomains) {
      url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
        query
      )}&domains=${US_MARKET_DOMAINS}&apiKey=${apiKey}&sortBy=publishedAt&pageSize=${limit}&language=en&from=${fromDateStr}&to=${toDateStr}`;
      console.log('[fetchMacroNews] Fetching US-centric market news (domains filter)');
    } else {
      url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
        query
      )}&apiKey=${apiKey}&sortBy=publishedAt&pageSize=${limit}&language=en&from=${fromDateStr}&to=${toDateStr}`;
      console.log(`[fetchMacroNews] Fetching from News API (${fromDateStr} to ${toDateStr})`);
    }

    const response = await fetch(url, {
      next: { revalidate: 600 },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[fetchMacroNews] News API error ${response.status}:`, errorText);
      return [];
    }

    const json = await response.json();
    const articles = json.articles || [];

    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000;

    const news: MacroNewsItem[] = articles
      .filter((article: any) => {
        if (!article.title || !article.url || article.url === 'https://removed.com') {
          return false;
        }

        if (article.publishedAt) {
          const publishedTime = new Date(article.publishedAt).getTime();
          const age = now - publishedTime;
          if (age > maxAge || age < 0) {
            return false;
          }
        }

        return true;
      })
      .slice(0, limit)
      .map((article: any) => ({
        title: article.title,
        source: article.source?.name || 'Unknown',
        url: article.url,
        publishedAt: article.publishedAt || new Date().toISOString(),
        summary: article.description || undefined,
      }));

    console.log(`[fetchMacroNews] News API returned ${news.length} valid articles`);
    return news;
  } catch (error) {
    console.error('[fetchMacroNews] News API fetch failed:', error);
    return [];
  }
}

export async function fetchMacroNews(
  limit: number = 10,
  options?: FetchMacroNewsOptions
): Promise<MacroNewsItem[]> {
  const country = options?.country;
  const preferUsDomains = options?.preferUsDomains ?? false;
  const cacheKey = `news-${limit}-${country ?? (preferUsDomains ? 'us-domains' : 'all')}`;
  const cached = newsCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < NEWS_CACHE_TTL) {
    return cached.data;
  }

  const perigonNews = await fetchFromPerigon(limit, options);
  if (perigonNews.length > 0) {
    newsCache.set(cacheKey, { data: perigonNews, timestamp: Date.now() });
    return perigonNews;
  }

  const newsApiNews = await fetchFromNewsApi(limit, options);
  newsCache.set(cacheKey, { data: newsApiNews, timestamp: Date.now() });
  return newsApiNews;
}
