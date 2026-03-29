import { NextResponse } from 'next/server';
import { getDemoUniverseTickers } from '@/lib/supabase/demoUniverse';
import { getQualityPublicCompanyUniverse } from '@/lib/data/company/companyUniverse';
import { DEMO_TICKERS, DEMO_COMPANY_META } from '@/lib/demo/demoUniverse';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const scenarioReadyParam = (url.searchParams.get('scenarioReady') ?? '').toLowerCase();
  const scenarioReady = scenarioReadyParam === '1' || scenarioReadyParam === 'true' || scenarioReadyParam === 'yes';

  // Prefer demo_company_snapshots first so the picker can show the full S&P 500 universe.
  // (Quality-filtered company_cache is a small subset and must not short-circuit this list.)
  let rows: Awaited<ReturnType<typeof getDemoUniverseTickers>> = [];
  try {
    rows = await getDemoUniverseTickers({ scenarioReady });
  } catch {
    rows = [];
  }

  if (rows.length > 0) {
    const companies = rows.map((r) => ({
      ticker: r.ticker,
      company_name: r.company_name,
      sector: r.sector,
    }));
    const tickers = companies.map((c) => c.ticker);
    const res = NextResponse.json({
      tickers,
      companies,
      count: companies.length,
      source: 'demo_company_snapshots',
    });
    res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
    return res;
  }

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

  const companies = DEMO_TICKERS.map((ticker) => ({
    ticker,
    company_name: DEMO_COMPANY_META[ticker]?.name ?? ticker,
    sector: DEMO_COMPANY_META[ticker]?.sector ?? null,
  }));
  const tickers = companies.map((c) => c.ticker);
  const res = NextResponse.json({ tickers, companies, count: companies.length, source: 'curated_demo_universe' });
  res.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=120');
  return res;
}
