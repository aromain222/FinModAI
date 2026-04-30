import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export type CompanyInfoResponse = {
  ticker: string;
  description: string | null;
  website: string | null;
  employees: number | null;
  founded: string | null;
  news: Array<{ title: string; url: string; source: string; publishedAt: string }>;
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
  const url = `https://financialmodelingprep.com/api/v3/stock_news?tickers=${ticker}&limit=5&apikey=${apiKey}`;
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(6000) });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    title?: string;
    url?: string;
    site?: string;
    publishedDate?: string;
  }>;
  if (!Array.isArray(data)) return [];
  return data.slice(0, 5).map((item) => ({
    title: item.title ?? '',
    url: item.url ?? '',
    source: item.site ?? '',
    publishedAt: item.publishedDate ?? '',
  }));
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

  const result: CompanyInfoResponse = { ticker, description, website, employees, founded, news };
  return NextResponse.json(result, {
    headers: { 'Cache-Control': 's-maxage=900, stale-while-revalidate=3600' },
  });
}
