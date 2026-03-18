import { NextResponse } from 'next/server';
import { getDemoUniverseTickers } from '@/lib/supabase/demoUniverse';
import { getMarketCompanyUniverse } from '@/lib/data/company/companyUniverse';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scenarioReadyParam = (url.searchParams.get('scenarioReady') ?? '').toLowerCase();
  const scenarioReady = scenarioReadyParam === '1' || scenarioReadyParam === 'true' || scenarioReadyParam === 'yes';

  if (!scenarioReady) {
    const cachedCompanies = await getMarketCompanyUniverse(750);
    if (cachedCompanies.length > 0) {
      const companies = cachedCompanies.map((row) => ({
        ticker: row.ticker,
        company_name: row.companyName,
        sector: row.sector,
      }));
      const tickers = companies.map((c) => c.ticker);
      const res = NextResponse.json({ tickers, companies, source: 'company_cache' });
      res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      return res;
    }
  }

  const rows = await getDemoUniverseTickers({ scenarioReady });
  const companies = rows.map((r) => ({
    ticker: r.ticker,
    company_name: r.company_name,
    sector: r.sector,
  }));
  const tickers = companies.map((c) => c.ticker);
  const res = NextResponse.json({ tickers, companies, source: 'demo_company_snapshots' });
  res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  return res;
}
