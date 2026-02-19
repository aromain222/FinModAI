import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

type CompanyListingRow = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  industry: string | null;
  updated_at: string | null;
  as_of_date: string | null;
  revenue_ltm: number | null;
  market_cap: number | null;
};

function getSupabaseClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('Supabase is not configured for demo_company_snapshots.');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function GET(req: NextRequest) {
  const limitParam = Number(req.nextUrl.searchParams.get('limit') || '50');
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(100, limitParam)) : 50;
  const debug = req.nextUrl.searchParams.get('debug') === '1';

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('demo_company_snapshots')
      .select('ticker, company_name, sector, industry, updated_at, as_of_date, revenue_ltm, market_cap')
      .not('ticker', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(
        { companies: [], count: 0, source: 'demo_company_snapshots', error: error.message },
        { status: 200 }
      );
    }

    const rows = (data ?? [])
      .map((row: CompanyListingRow) => ({
        ticker: String(row.ticker ?? '').trim().toUpperCase(),
        company_name: row.company_name ?? null,
        sector: row.sector ?? null,
        industry: row.industry ?? null,
        updated_at: row.updated_at ?? null,
        as_of_date: row.as_of_date ?? null,
        revenue_ltm: row.revenue_ltm ?? null,
        market_cap: row.market_cap ?? null,
      }))
      .filter((row) => row.ticker.length > 0);

    if (process.env.NODE_ENV !== 'production') {
      console.log(`[market-brief/companies] returned ${rows.length} rows`);
    }

    if (debug) {
      return NextResponse.json(
        { companies: rows, count: rows.length, source: 'demo_company_snapshots', debug: true },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { companies: rows, count: rows.length, source: 'demo_company_snapshots' },
      { status: 200 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load demo companies.';
    return NextResponse.json(
      { companies: [], count: 0, source: 'demo_company_snapshots', error: message },
      { status: 200 }
    );
  }
}
