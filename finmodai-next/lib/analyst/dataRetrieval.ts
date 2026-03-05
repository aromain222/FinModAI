/**
 * Analyst Chat Data Retrieval Layer
 *
 * Orchestrates multiple data sources based on the question route:
 *   1. Perigon News API   – verified news coverage, event sourcing
 *   2. FMP Financial API  – company fundamentals, quotes, earnings
 *   3. DuckDuckGo scrape  – supplementary web context
 *
 * Each retrieval function returns normalized data that feeds into the
 * facts extraction layer. All calls run in parallel where possible.
 */

import type { AnalystRoute } from './router';
import { filterHeadlines, type CuratedHeadline } from '@/lib/headlineFilter';

/* ────────── Types ────────── */

export type NewsArticle = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: string | null;
};

export type CompanyFinancials = {
  ticker: string;
  companyName: string;
  price: number | null;
  marketCap: number | null;
  latestQuarter: {
    date: string | null;
    revenue: number | null;
    ebitda: number | null;
    netIncome: number | null;
    eps: number | null;
  };
  latestAnnual: {
    date: string | null;
    revenue: number | null;
    ebitda: number | null;
    netIncome: number | null;
  };
};

export type WebSnippet = {
  title: string;
  url: string;
  snippet: string;
};

export type RetrievedData = {
  news: NewsArticle[];
  financials: CompanyFinancials[];
  webSnippets: WebSnippet[];
  curatedHeadlines: CuratedHeadline[];
  sources: string[];
  warnings: string[];
};

/* ────────── Perigon News Retrieval ────────── */

async function fetchPerigonNews(query: string, limit = 8): Promise<NewsArticle[]> {
  const apiKey = process.env.PERIGON_API_KEY;
  if (!apiKey) return [];

  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - 7);

  const params = new URLSearchParams({
    apiKey,
    q: query,
    from: fromDate.toISOString(),
    sortBy: 'date',
    size: String(limit),
    language: 'en',
  });

  try {
    const response = await fetch(`https://api.goperigon.com/v1/all?${params.toString()}`, {
      next: { revalidate: 300 },
    });
    if (!response.ok) return [];

    const json = await response.json();
    const articles = Array.isArray(json?.articles) ? json.articles : [];

    return articles
      .map((a: any) => ({
        title: a?.title?.trim() || '',
        source: a?.source?.name || a?.source?.domain || a?.source || 'Perigon',
        url: a?.url?.trim() || '',
        publishedAt: a?.publishedAt || a?.pubDate || new Date().toISOString(),
        summary: a?.summary || a?.description || null,
      }))
      .filter((a: NewsArticle) => a.title && a.url)
      .slice(0, limit);
  } catch {
    return [];
  }
}

function buildNewsQuery(route: AnalystRoute, userMessage: string): string {
  const base = userMessage.replace(/[?!.]+$/, '').trim();

  if (route.intent === 'event_intelligence') {
    return `${base} market-moving events economy`;
  }
  if (route.intent === 'market_question') {
    return `${base} financial markets`;
  }
  if (route.intent === 'company_question' && route.tickers.length > 0) {
    return `${route.tickers[0]} ${base}`;
  }
  return base;
}

/* ────────── FMP Financial Data Retrieval ────────── */

async function fetchJson(url: string, timeoutMs = 5000): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'user-agent': 'CapitalBase Analyst/1.0' },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function toNum(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return null;
}

async function fetchCompanyFinancials(ticker: string): Promise<CompanyFinancials | null> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) return null;

  const [quoteJson, quarterJson, annualJson] = await Promise.all([
    fetchJson(`https://financialmodelingprep.com/api/v3/quote/${ticker}?apikey=${apiKey}`),
    fetchJson(`https://financialmodelingprep.com/api/v3/income-statement/${ticker}?period=quarter&limit=2&apikey=${apiKey}`),
    fetchJson(`https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=1&apikey=${apiKey}`),
  ]);

  const q = Array.isArray(quoteJson) ? (quoteJson[0] as any) : null;
  const qr = Array.isArray(quarterJson) ? (quarterJson[0] as any) : null;
  const ar = Array.isArray(annualJson) ? (annualJson[0] as any) : null;

  if (!q && !qr && !ar) return null;

  return {
    ticker: (q?.symbol || ticker).toUpperCase(),
    companyName: q?.name?.trim() || ticker.toUpperCase(),
    price: toNum(q?.price),
    marketCap: toNum(q?.marketCap),
    latestQuarter: {
      date: qr?.date ?? null,
      revenue: toNum(qr?.revenue),
      ebitda: toNum(qr?.ebitda),
      netIncome: toNum(qr?.netIncome),
      eps: toNum(qr?.eps),
    },
    latestAnnual: {
      date: ar?.date ?? null,
      revenue: toNum(ar?.revenue),
      ebitda: toNum(ar?.ebitda),
      netIncome: toNum(ar?.netIncome),
    },
  };
}

/* ────────── DuckDuckGo Web Scraping (supplementary) ────────── */

async function fetchTextWithTimeout(url: string, timeoutMs = 4500): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      headers: { 'user-agent': 'CapitalBase AnalystBot/1.0' },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDdgUrl(url: string): string {
  if (!url.startsWith('/l/?')) return url;
  try {
    const resolved = new URLSearchParams(url.slice(4)).get('uddg');
    return resolved ? decodeURIComponent(resolved) : url;
  } catch {
    return url;
  }
}

async function scrapeWebSnippets(query: string, limit = 5): Promise<WebSnippet[]> {
  const html = await fetchTextWithTimeout(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
  if (!html) return [];

  const titleMatches = Array.from(html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g));
  const snippetMatches = Array.from(html.matchAll(/<(?:a|div)[^>]*class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/g));

  const items: WebSnippet[] = [];
  for (let i = 0; i < Math.min(titleMatches.length, limit); i++) {
    const url = parseDdgUrl(titleMatches[i]?.[1] ?? '');
    const title = stripHtml(titleMatches[i]?.[2] ?? '');
    const snippet = stripHtml(snippetMatches[i]?.[1] ?? '');
    if (!/^https?:\/\//i.test(url) || !title || !snippet) continue;
    items.push({ title, url, snippet: snippet.length > 240 ? snippet.slice(0, 240) + '...' : snippet });
  }
  return items;
}

/* ────────── Main Orchestrator ────────── */

export async function retrieveDataForRoute(
  route: AnalystRoute,
  userMessage: string
): Promise<RetrievedData> {
  const warnings: string[] = [];
  const allSources: string[] = [];

  const promises: {
    news: Promise<NewsArticle[]>;
    financials: Promise<(CompanyFinancials | null)[]>;
    web: Promise<WebSnippet[]>;
  } = {
    news: Promise.resolve([]),
    financials: Promise.resolve([]),
    web: Promise.resolve([]),
  };

  if (route.requiresNews) {
    const newsQuery = buildNewsQuery(route, userMessage);
    promises.news = fetchPerigonNews(newsQuery).then(articles => {
      if (articles.length === 0 && process.env.PERIGON_API_KEY) {
        warnings.push('Perigon returned no articles for this query.');
      } else if (!process.env.PERIGON_API_KEY) {
        warnings.push('PERIGON_API_KEY not configured; news retrieval skipped.');
      }
      return articles;
    });
  }

  if (route.requiresFinancials && route.tickers.length > 0) {
    const tickerSlice = route.tickers.slice(0, 3);
    promises.financials = Promise.all(tickerSlice.map(t => fetchCompanyFinancials(t))).then(results => {
      if (results.every(r => r === null) && process.env.FMP_API_KEY) {
        warnings.push('FMP returned no data for the requested tickers.');
      } else if (!process.env.FMP_API_KEY) {
        warnings.push('FMP_API_KEY not configured; financial data retrieval skipped.');
      }
      return results;
    });
  }

  if (route.requiresLiveData) {
    const webQuery = route.tickers.length > 0
      ? `${route.tickers[0]} ${userMessage.slice(0, 60)}`
      : userMessage.slice(0, 80);
    promises.web = scrapeWebSnippets(webQuery, 4);
  }

  const [news, financialsRaw, webSnippets] = await Promise.all([
    promises.news,
    promises.financials,
    promises.web,
  ]);

  const financials = financialsRaw.filter((f): f is CompanyFinancials => f !== null);

  let curatedHeadlines: CuratedHeadline[] = [];
  if (route.intent === 'event_intelligence' && news.length > 0) {
    try {
      curatedHeadlines = await filterHeadlines(
        news.map((a) => ({
          title: a.title,
          source: a.source,
          publishedAt: a.publishedAt,
          summary: a.summary ?? undefined,
        })),
        { maxResults: 10 }
      );
    } catch {
      warnings.push('Headline curation unavailable; using raw news feed.');
    }
  }

  for (const article of news) {
    allSources.push(`${article.source}: ${article.title} — ${article.url}`);
  }
  for (const f of financials) {
    allSources.push(`FinancialModelingPrep API — ${f.ticker} quote + income statement`);
  }
  for (const s of webSnippets) {
    allSources.push(`${s.title} — ${s.url}`);
  }

  return {
    news,
    financials,
    webSnippets,
    curatedHeadlines,
    sources: allSources.slice(0, 12),
    warnings,
  };
}
