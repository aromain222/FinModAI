import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type CompanyInfoResponse = {
  ticker: string;
  description: string | null;
  website: string | null;
  employees: number | null;
  founded: string | null;
  news: Array<{
    title: string;
    url: string;
    source: string;
    publishedAt: string;
    description?: string | null;
    provider?: string;
  }>;
};

async function fetchFmpProfile(ticker: string, apiKey: string) {
  const url = `https://financialmodelingprep.com/api/v3/profile/${ticker}?apikey=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{
    description?: string;
    website?: string;
    fullTimeEmployees?: string | number;
    ipoDate?: string;
  }>;
  return Array.isArray(data) && data[0] ? data[0] : null;
}

async function fetchFmpNews(ticker: string, apiKey: string) {
  const url = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${ticker}&limit=12&apikey=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    title?: string;
    url?: string;
    site?: string;
    publishedDate?: string;
  }>;
  if (!Array.isArray(data)) return [];
  return data.slice(0, 12).map((item) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    source: item.site ?? '',
    publishedAt: item.publishedDate ?? '',
    provider: 'fmp',
  }));
}

function companyAliasesForTicker(ticker: string): string[] {
  const aliases: Record<string, string[]> = {
    GOOGL: ['Alphabet', 'Google', 'GOOGL', 'GOOG', 'Gemini', 'YouTube', 'Google Cloud'],
    GOOG: ['Alphabet', 'Google', 'GOOG', 'GOOGL', 'Gemini', 'YouTube', 'Google Cloud'],
    NVDA: ['Nvidia', 'NVDA', 'Blackwell', 'CUDA', 'GPU'],
    UBER: ['Uber', 'UBER', 'ride-sharing', 'rideshare'],
    TSLA: ['Tesla', 'TSLA', 'FSD', 'robotaxi'],
    AMZN: ['Amazon', 'AMZN', 'AWS'],
    META: ['Meta', 'META', 'Facebook', 'Instagram'],
    MSFT: ['Microsoft', 'MSFT', 'Azure', 'Copilot'],
    AAPL: ['Apple', 'AAPL', 'iPhone'],
  };
  return aliases[ticker] ?? [ticker];
}

async function fetchPerigonNews(ticker: string, apiKey: string) {
  const aliases = companyAliasesForTicker(ticker)
    .slice(0, 6)
    .map((alias) => `"${alias.replace(/"/g, '')}"`);
  const q = aliases.length > 0 ? aliases.join(' OR ') : ticker;
  const from = new Date();
  from.setDate(from.getDate() - 30);
  const params = new URLSearchParams({
    apiKey,
    q,
    from: from.toISOString(),
    sortBy: 'date',
    size: '12',
    language: 'en',
  });
  const res = await fetch(`https://api.goperigon.com/v1/all?${params.toString()}`, {
    cache: 'no-store',
    signal: AbortSignal.timeout(6000),
  });
  if (!res.ok) return [];
  const payload = (await res.json()) as { articles?: unknown[] };
  const rows = Array.isArray(payload.articles) ? payload.articles : [];
  return rows
    .map((row): CompanyInfoResponse['news'][number] | null => {
      if (!row || typeof row !== 'object') return null;
      const item = row as Record<string, unknown>;
      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const url = typeof item.url === 'string' ? item.url.trim() : '';
      if (!title || !url) return null;
      const source =
        typeof item.source === 'string' ? item.source :
        typeof item.sourceDomain === 'string' ? item.sourceDomain :
        'Perigon';
      return {
        title,
        url,
        source,
        publishedAt: typeof item.publishedAt === 'string' ? item.publishedAt : new Date().toISOString(),
        description:
          typeof item.summary === 'string' ? item.summary :
          typeof item.description === 'string' ? item.description :
          null,
        provider: 'perigon',
      };
    })
    .filter((item): item is CompanyInfoResponse['news'][number] => item !== null);
}

function dedupeNews(items: CompanyInfoResponse['news']): CompanyInfoResponse['news'] {
  const seen = new Set<string>();
  const output: CompanyInfoResponse['news'] = [];
  for (const item of items) {
    const key = item.url || item.title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }
  return output.slice(0, 12);
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')?.toUpperCase().trim();
  if (!ticker) {
    return NextResponse.json({ error: 'ticker required' }, { status: 400 });
  }

  const apiKey = process.env.FMP_API_KEY;

  let description: string | null = null;
  let website: string | null = null;
  let employees: number | null = null;
  let founded: string | null = null;
  let news: CompanyInfoResponse['news'] = [];

  if (apiKey) {
    const [profile, newsItems] = await Promise.allSettled([
      fetchFmpProfile(ticker, apiKey),
      fetchFmpNews(ticker, apiKey),
    ]);

    if (profile.status === 'fulfilled' && profile.value) {
      const p = profile.value;
      description = p.description?.trim() || null;
      website = p.website?.trim() || null;
      const emp = Number(p.fullTimeEmployees);
      employees = Number.isFinite(emp) && emp > 0 ? emp : null;
      founded = p.ipoDate?.slice(0, 4) ?? null;
    }

    if (newsItems.status === 'fulfilled') {
      news = newsItems.value.filter((n) => n.title && n.url);
    }
  }

  if (process.env.PERIGON_API_KEY) {
    const perigonNews = await fetchPerigonNews(ticker, process.env.PERIGON_API_KEY).catch(() => []);
    news = dedupeNews([...perigonNews, ...news]);
  }

  const result: CompanyInfoResponse = { ticker, description, website, employees, founded, news };
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=3600' },
  });
}
