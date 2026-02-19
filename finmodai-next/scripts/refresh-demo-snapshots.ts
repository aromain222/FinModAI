import { createClient } from '@supabase/supabase-js';
import { DEMO_TICKERS, DEMO_COMPANY_META } from '../lib/demo/demoUniverse';
import { fetchNormalizedFundamentals, fetchNormalizedQuote } from '../lib/data/normalized';
import { fetchSecEdgarAnnualFundamentals } from '../lib/data/providers/secEdgar';

type DemoSnapshotRow = {
  ticker: string;
  company_name?: string | null;
  sector?: string | null;
  revenue_ltm?: number | null;
  ebitda_ltm?: number | null;
  net_income_ltm?: number | null;
  cash?: number | null;
  total_debt?: number | null;
  shares_outstanding?: number | null;
  share_price?: number | null;
  market_cap?: number | null;
  updated_at?: string;
  source_map?: Record<string, string>;
};

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // Ensure demo mode is off for live refresh
  process.env.NEXT_PUBLIC_DEMO_MODE = 'false';

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabase = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

  if (!supabase) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to refresh demo snapshots.');
  }

  const snapshots: Record<string, DemoSnapshotRow> = {};
  const missing: Record<string, string[]> = {};

  for (const ticker of DEMO_TICKERS) {
    const meta = DEMO_COMPANY_META[ticker] || {};
    const warnings: string[] = [];

    const [
      { fundamentals, missingFields: missingFundamentals },
      { quote, missingFields: missingQuote },
      annualResult,
    ] = await Promise.all([
      fetchNormalizedFundamentals(ticker),
      fetchNormalizedQuote(ticker),
      fetchSecEdgarAnnualFundamentals(ticker),
    ]);

    const annual = annualResult.ok ? annualResult.data : null;
    const annualTag = annual?.fiscalYear ? `sec_edgar_fy${annual.fiscalYear}` : 'sec_edgar_fy';
    const useAnnualRevenue = typeof annual?.revenueFY === 'number' && annual.revenueFY > 0;
    const useAnnualNetIncome = typeof annual?.netIncomeFY === 'number' && annual.netIncomeFY > 0;
    const useAnnualCash = typeof annual?.cash === 'number' && annual.cash > 0;
    const useAnnualDebt = typeof annual?.totalDebt === 'number' && annual.totalDebt > 0;

    missing[ticker] = [...missingFundamentals, ...missingQuote];

    const row: DemoSnapshotRow = {
      ticker,
      company_name: meta.name || ticker,
      sector: meta.sector || null,
      revenue_ltm: useAnnualRevenue ? annual!.revenueFY : fundamentals.revenueLTM ?? null,
      ebitda_ltm: fundamentals.ebitdaLTM ?? null,
      net_income_ltm: useAnnualNetIncome ? annual!.netIncomeFY : fundamentals.netIncomeLTM ?? null,
      cash: useAnnualCash ? annual!.cash : fundamentals.cash ?? null,
      total_debt: useAnnualDebt ? annual!.totalDebt : fundamentals.totalDebt ?? null,
      shares_outstanding: quote.sharesOutstanding ?? null,
      share_price: quote.price ?? null,
      market_cap: quote.marketCap ?? null,
      updated_at: new Date().toISOString(),
      source_map: {
        ...fundamentals.provenance,
        ...quote.provenance,
        ...(useAnnualRevenue ? { revenueLTM: annualTag } : {}),
        ...(useAnnualNetIncome ? { netIncomeLTM: annualTag } : {}),
        ...(useAnnualCash ? { cash: annualTag } : {}),
        ...(useAnnualDebt ? { totalDebt: annualTag } : {}),
        ...(annual?.period ? { fiscalPeriod: String(annual.period) } : {}),
      },
    };

    snapshots[ticker] = row;
    console.log(`[demo-refresh] ${ticker} ok. Missing fields: ${missing[ticker].join(', ') || 'none'}`);

    await sleep(250);
  }

  const payload = Object.values(snapshots);

  const { error } = await supabase.from('demo_company_snapshots').upsert(payload, {
    onConflict: 'ticker',
  });
  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
  console.log('[demo-refresh] Supabase upsert complete.');
}

main().catch((err) => {
  console.error('[demo-refresh] failed', err);
  process.exit(1);
});
