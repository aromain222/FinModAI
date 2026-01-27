import { MarketHeadline } from '@/lib/schemas/market';
import { providerFailure } from '@/lib/providers/errors';

const USER_AGENT = 'CapitalBase/1.0';

const sentimentFromTitle = (title: string): 'pos' | 'neg' | 'neu' => {
  const lower = title.toLowerCase();
  if (lower.includes('rally') || lower.includes('surge') || lower.includes('gain')) return 'pos';
  if (lower.includes('drop') || lower.includes('decline') || lower.includes('fall') || lower.includes('recession')) return 'neg';
  return 'neu';
};

export async function fetchGdeltHeadlines(params: {
  query: string;
  limit: number;
  traceId: string;
}): Promise<MarketHeadline[]> {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(
    params.query
  )}&mode=artlist&maxrecords=${params.limit}&format=json&sort=datedesc`;

  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, cache: 'no-store' });
  if (!res.ok) throw providerFailure('gdelt', `HTTP ${res.status}`, res.status);
  const text = await res.text();
  if (!text.startsWith('{')) {
    throw providerFailure('gdelt', 'Invalid response from GDELT');
  }
  const json = JSON.parse(text);
  const articles = Array.isArray(json?.articles) ? json.articles : [];
  return articles.slice(0, params.limit).map((article: any) => ({
    title: article.title || 'Untitled',
    source: article.domain || article.source || 'GDELT',
    url: article.url,
    publishedAt: article.seendate ? new Date(article.seendate).toISOString() : new Date().toISOString(),
    sentiment: sentimentFromTitle(article.title || ''),
    summary: article.summary || undefined,
  }));
}
