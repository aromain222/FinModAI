import { NextResponse } from 'next/server';
import { getDemoUniverseTickers } from '@/lib/supabase/demoUniverse';
import { getQualityPublicCompanyUniverse } from '@/lib/data/company/companyUniverse';
import { DEMO_TICKERS, DEMO_COMPANY_META } from '@/lib/demo/demoUniverse';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scenarioReadyParam = (url.searchParams.get('scenarioReady') ?? '').toLowerCase();
  const scenarioReady = scenarioReadyParam === '1' || scenarioReadyParam === 'true' || scenarioReadyParam === 'yes';

  if (!scenarioReady) {
    const cachedCompanies = await getQualityPublicCompanyUniverse(1000);
    if (cachedCompanies.length > 0) {
      const companies = cachedCompanies.map((row) => ({
        ticker: row.ticker,
        company_name: row.companyName,
        sector: row.sector,
      }));
      const tickers = companies.map((c) => c.ticker);
      const res = NextResponse.json({ tickers, companies, count: companies.length, source: 'quality_company_cache' });
      res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
      return res;
    }
  }

  const rows = await getDemoUniverseTickers({ scenarioReady });
  const companies =
    rows.length > 0
      ? rows.map((r) => ({
          ticker: r.ticker,
          company_name: r.company_name,
          sector: r.sector,
        }))
      : DEMO_TICKERS.map((ticker) => ({
          ticker,
          company_name: DEMO_COMPANY_META[ticker]?.name ?? ticker,
          sector: DEMO_COMPANY_META[ticker]?.sector ?? null,
        }));
  const tickers = companies.map((c) => c.ticker);
  const source = rows.length > 0 ? 'demo_company_snapshots' : 'curated_demo_universe';
  const res = NextResponse.json({ tickers, companies, count: companies.length, source });
  res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  return res;
}
