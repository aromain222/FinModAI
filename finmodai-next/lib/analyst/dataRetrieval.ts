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
import { fetchPolygonQuote } from '@/lib/data/providers/polygon';
import { fetchAlphaVantageFundamentals, fetchAlphaVantageQuote } from '@/lib/data/providers/alphavantage';
import { fetchTiingoFundamentals, fetchTiingoQuote } from '@/lib/data/providers/tiingo';
import { fetchTwelveDataQuote } from '@/lib/data/providers/twelvedata';

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
  sharesOutstanding?: number | null;
  provenance?: Record<string, string>;
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
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

type ProviderCompanySnapshot = {
  price: number | null;
  marketCap: number | null;
  sharesOutstanding: number | null;
  latestQuarter: CompanyFinancials['latestQuarter'];
  latestAnnual: CompanyFinancials['latestAnnual'];
  provenance: Record<string, string>;
};

async function fetchProviderBackedFinancials(ticker: string): Promise<ProviderCompanySnapshot | null> {
  const [polygonQuote, tiingoQuote, twelveQuote, alphaQuote, tiingoFundamentals, alphaFundamentals] =
    await Promise.all([
      fetchPolygonQuote(ticker),
      fetchTiingoQuote(ticker),
      fetchTwelveDataQuote(ticker),
      fetchAlphaVantageQuote(ticker),
      fetchTiingoFundamentals(ticker),
      fetchAlphaVantageFundamentals(ticker),
    ]);

  const provenance: Record<string, string> = {};

  const priceCandidates = [
    { provider: 'polygon', result: polygonQuote, pick: (data: any) => toNum(data?.price), asOf: (data: any) => data?.asOf ?? null },
    { provider: 'tiingo', result: tiingoQuote, pick: (data: any) => toNum(data?.price), asOf: (data: any) => data?.asOf ?? null },
    { provider: 'twelvedata', result: twelveQuote, pick: (data: any) => toNum(data?.price), asOf: (data: any) => data?.asOf ?? null },
    { provider: 'alphavantage', result: alphaQuote, pick: (data: any) => toNum(data?.price), asOf: (data: any) => data?.asOf ?? null },
  ];

  let price: number | null = null;
  let quoteAsOf: string | null = null;
  for (const candidate of priceCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        price = value;
        quoteAsOf = candidate.asOf(candidate.result.data);
        provenance.price = candidate.provider;
        break;
      }
    }
  }

  const sharesCandidates = [
    { provider: 'alphavantage', result: alphaFundamentals, pick: (data: any) => toNum(data?.sharesOutstanding) },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (data: any) => toNum(data?.sharesOutstanding) },
    { provider: 'alphavantage_quote', result: alphaQuote, pick: (data: any) => toNum(data?.sharesOutstanding) },
  ];
  let sharesOutstanding: number | null = null;
  for (const candidate of sharesCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        sharesOutstanding = value;
        provenance.sharesOutstanding = candidate.provider;
        break;
      }
    }
  }

  const marketCapCandidates = [
    { provider: 'alphavantage', result: alphaFundamentals, pick: (data: any) => toNum(data?.marketCap) },
    { provider: 'alphavantage_quote', result: alphaQuote, pick: (data: any) => toNum(data?.marketCap) },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (data: any) => toNum(data?.marketCap) },
  ];
  let marketCap: number | null = null;
  for (const candidate of marketCapCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        marketCap = value;
        provenance.marketCap = candidate.provider;
        break;
      }
    }
  }
  if (marketCap === null && price !== null && sharesOutstanding !== null) {
    marketCap = price * sharesOutstanding;
    provenance.marketCap = provenance.price || 'derived';
  }

  const revenueCandidates = [
    { provider: 'alphavantage', result: alphaFundamentals, pick: (data: any) => toNum(data?.revenueLTM) },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (data: any) => toNum(data?.revenueLTM) },
  ];
  const ebitdaCandidates = [
    { provider: 'alphavantage', result: alphaFundamentals, pick: (data: any) => toNum(data?.ebitdaLTM) },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (data: any) => toNum(data?.ebitdaLTM) },
  ];
  const netIncomeCandidates = [
    { provider: 'alphavantage', result: alphaFundamentals, pick: (data: any) => toNum(data?.netIncomeLTM) },
    { provider: 'tiingo', result: tiingoFundamentals, pick: (data: any) => toNum(data?.netIncomeLTM) },
  ];

  let revenueLTM: number | null = null;
  let ebitdaLTM: number | null = null;
  let netIncomeLTM: number | null = null;

  for (const candidate of revenueCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        revenueLTM = value;
        provenance.revenue = candidate.provider;
        break;
      }
    }
  }
  for (const candidate of ebitdaCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        ebitdaLTM = value;
        provenance.ebitda = candidate.provider;
        break;
      }
    }
  }
  for (const candidate of netIncomeCandidates) {
    if (candidate.result.ok) {
      const value = candidate.pick(candidate.result.data);
      if (value !== null) {
        netIncomeLTM = value;
        provenance.netIncome = candidate.provider;
        break;
      }
    }
  }

  const hasAny =
    price !== null || marketCap !== null || sharesOutstanding !== null || revenueLTM !== null || ebitdaLTM !== null || netIncomeLTM !== null;
  if (!hasAny) return null;

  return {
    price,
    marketCap,
    sharesOutstanding,
    latestQuarter: {
      date: quoteAsOf,
      revenue: revenueLTM,
      ebitda: ebitdaLTM,
      netIncome: netIncomeLTM,
      eps: sharesOutstanding && netIncomeLTM ? netIncomeLTM / sharesOutstanding : null,
    },
    latestAnnual: {
      date: quoteAsOf,
      revenue: revenueLTM,
      ebitda: ebitdaLTM,
      netIncome: netIncomeLTM,
    },
    provenance,
  };
}

export async function fetchCompanyFinancials(ticker: string): Promise<CompanyFinancials | null> {
  const apiKey = process.env.FMP_API_KEY;
  const providerFallbackPromise = fetchProviderBackedFinancials(ticker);
  if (!apiKey) {
    const providerFallback = await providerFallbackPromise;
    if (!providerFallback) return null;
    return {
      ticker: ticker.toUpperCase(),
      companyName: ticker.toUpperCase(),
      price: providerFallback.price,
      marketCap: providerFallback.marketCap,
      sharesOutstanding: providerFallback.sharesOutstanding,
      provenance: providerFallback.provenance,
      latestQuarter: providerFallback.latestQuarter,
      latestAnnual: providerFallback.latestAnnual,
    };
  }

  const [quoteJson, quarterJson, annualJson] = await Promise.all([
    fetchJson(`https://financialmodelingprep.com/api/v3/quote/${ticker}?apikey=${apiKey}`),
    fetchJson(`https://financialmodelingprep.com/api/v3/income-statement/${ticker}?period=quarter&limit=2&apikey=${apiKey}`),
    fetchJson(`https://financialmodelingprep.com/api/v3/income-statement/${ticker}?limit=1&apikey=${apiKey}`),
  ]);

  const q = Array.isArray(quoteJson) ? (quoteJson[0] as any) : null;
  const qr = Array.isArray(quarterJson) ? (quarterJson[0] as any) : null;
  const ar = Array.isArray(annualJson) ? (annualJson[0] as any) : null;

  const providerFallback = await providerFallbackPromise;
  if (!q && !qr && !ar && !providerFallback) return null;

  const quotePrice = toNum(q?.price) ?? providerFallback?.price ?? null;
  const quoteMarketCap = toNum(q?.marketCap) ?? providerFallback?.marketCap ?? null;
  const quarterlyRevenue = toNum(qr?.revenue) ?? providerFallback?.latestQuarter.revenue ?? null;
  const quarterlyEbitda = toNum(qr?.ebitda) ?? providerFallback?.latestQuarter.ebitda ?? null;
  const quarterlyNetIncome = toNum(qr?.netIncome) ?? providerFallback?.latestQuarter.netIncome ?? null;
  const quarterlyEps = toNum(qr?.eps) ?? providerFallback?.latestQuarter.eps ?? null;
  const annualRevenue = toNum(ar?.revenue) ?? providerFallback?.latestAnnual.revenue ?? null;
  const annualEbitda = toNum(ar?.ebitda) ?? providerFallback?.latestAnnual.ebitda ?? null;
  const annualNetIncome = toNum(ar?.netIncome) ?? providerFallback?.latestAnnual.netIncome ?? null;
  const provenance: Record<string, string> = { ...(providerFallback?.provenance ?? {}) };
  if (toNum(q?.price) !== null) provenance.price = 'fmp';
  if (toNum(q?.marketCap) !== null) provenance.marketCap = 'fmp';
  if (toNum(qr?.revenue) !== null) provenance.revenue = 'fmp';
  if (toNum(qr?.ebitda) !== null) provenance.ebitda = 'fmp';
  if (toNum(qr?.netIncome) !== null) provenance.netIncome = 'fmp';
  if (toNum(qr?.eps) !== null) provenance.eps = 'fmp';

  return {
    ticker: (q?.symbol || ticker).toUpperCase(),
    companyName: q?.name?.trim() || ticker.toUpperCase(),
    price: quotePrice,
    marketCap: quoteMarketCap,
    sharesOutstanding: providerFallback?.sharesOutstanding ?? null,
    provenance,
    latestQuarter: {
      date: qr?.date ?? providerFallback?.latestQuarter.date ?? null,
      revenue: quarterlyRevenue,
      ebitda: quarterlyEbitda,
      netIncome: quarterlyNetIncome,
      eps: quarterlyEps,
    },
    latestAnnual: {
      date: ar?.date ?? providerFallback?.latestAnnual.date ?? null,
      revenue: annualRevenue,
      ebitda: annualEbitda,
      netIncome: annualNetIncome,
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
    const sourceLabels = Object.entries(f.provenance ?? {})
      .map(([field, provider]) => `${field}:${provider}`)
      .slice(0, 6)
      .join(', ');
    allSources.push(`Company data providers — ${f.ticker}${sourceLabels ? ` (${sourceLabels})` : ''}`);
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
