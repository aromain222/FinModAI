import { NextResponse } from 'next/server';
import { isDemoModeFromRequest } from '@/lib/demo/isDemoMode';
import { getDemoUniverseTickers } from '@/lib/supabase/demoUniverse';

export async function GET(req: Request) {
  if (!isDemoModeFromRequest(req)) {
    return NextResponse.json({ tickers: [], companies: [] });
  }

  const rows = await getDemoUniverseTickers();
  const companies = rows.map((r) => ({
    ticker: r.ticker,
    company_name: r.company_name,
    sector: r.sector,
  }));
  const tickers = companies.map((c) => c.ticker);
  const res = NextResponse.json({ tickers, companies });
  res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  return res;
}
