import type { RawNewsItem } from './worldBrief';

const WORLD_QUERY =
  'geopolitics OR sanctions OR ceasefire OR missile OR summit OR embassy OR tariff OR export control OR election OR coup OR refugee OR cyberattack OR ransomware OR hurricane OR wildfire OR outbreak';

export async function fetchWorldNews(rangeDays: number = 3): Promise<RawNewsItem[]> {
  const apiKey = process.env.NEWS_API_KEY;
  if (!apiKey) {
    console.warn('[worldNewsFetcher] NEWS_API_KEY missing; returning empty list');
    return [];
  }

  const fromDate = new Date(Date.now() - rangeDays * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(
    WORLD_QUERY
  )}&language=en&sortBy=publishedAt&from=${fromDate}&pageSize=80&apiKey=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`NewsAPI status ${res.status}`);
    const json = await res.json();
    const articles = json.articles || [];

    return articles
      .filter((a: any) => a.title && a.url)
      .map((a: any) => ({
        title: a.title,
        description: a.description || '',
        url: a.url,
        source: a.source?.name || 'unknown',
        publishedAt: a.publishedAt || new Date().toISOString(),
      }));
  } catch (err) {
    console.error('[worldNewsFetcher] fetch failed', err);
    return [];
  }
}
