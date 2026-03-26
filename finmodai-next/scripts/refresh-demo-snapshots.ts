import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { DEMO_COMPANY_META, DEMO_TICKERS } from '../lib/demo/demoUniverse';
import { getQualityPublicTickers } from '../lib/data/company/companyUniverse';
import { syncCompanyFromFmp } from '../lib/integrations/fmp/syncCompany';
import { syncPricesFromPolygon } from '../lib/integrations/polygon/syncPrices';
import { syncCompanyFactsFromSec } from '../lib/integrations/sec/syncCompanyFacts';

type RefreshOptions = {
  source: 'demo' | 'sp500' | 'quality-public' | 'tickers';
  tickers: string[];
  limit: number | null;
  offset: number;
  sleepMs: number;
  skipSec: boolean;
  skipSync: boolean;
  flushEvery: number;
};

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
  enterprise_value?: number | null;
  currency?: string | null;
  units?: string | null;
  as_of_date?: string | null;
  updated_at?: string | null;
  source_map?: Record<string, string>;
};

type CompanyRow = {
  id: string;
  ticker: string;
  name: string | null;
  sector: string | null;
};

type SnapshotRow = {
  as_of_date: string | null;
  currency: string | null;
  revenue_ltm: number | string | null;
  ebitda_ltm: number | string | null;
  net_income_ltm: number | string | null;
  cash: number | string | null;
  total_debt: number | string | null;
  shares_outstanding: number | string | null;
  market_cap: number | string | null;
  source: string | null;
};

type PriceRow = {
  date: string | null;
  close: number | string | null;
  source: string | null;
};

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function pickFirstNumber(rows: SnapshotRow[], key: keyof SnapshotRow): { value: number | null; source: string | null } {
  for (const row of rows) {
    const value = parseNumber(row[key]);
    if (value !== null) {
      return { value, source: row.source ?? null };
    }
  }
  return { value: null, source: null };
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeTicker(value: string): string | null {
  const cleaned = value.trim().toUpperCase().replace(/\./g, '-');
  if (!cleaned) return null;
  return /^[A-Z.-]{1,10}$/.test(cleaned) ? cleaned : null;
}

function parseArgs(argv: string[]): RefreshOptions {
  let source: RefreshOptions['source'] = 'demo';
  let tickers: string[] = [];
  let limit: number | null = null;
  let offset = 0;
  let sleepMs = 1200;
  let skipSec = false;
  let skipSync = false;
  let flushEvery = 25;

  for (const arg of argv) {
    if (arg === '--source=sp500') source = 'sp500';
    else if (arg === '--source=quality-public') source = 'quality-public';
    else if (arg === '--source=demo') source = 'demo';
    else if (arg === '--skip-sec') skipSec = true;
    else if (arg === '--skip-sync') skipSync = true;
    else if (arg.startsWith('--tickers=')) {
      source = 'tickers';
      tickers = arg
        .slice('--tickers='.length)
        .split(',')
        .map((value) => normalizeTicker(value))
        .filter((value): value is string => Boolean(value));
    } else if (arg.startsWith('--limit=')) {
      const parsed = Number(arg.slice('--limit='.length));
      limit = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : null;
    } else if (arg.startsWith('--offset=')) {
      const parsed = Number(arg.slice('--offset='.length));
      offset = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
    } else if (arg.startsWith('--sleep-ms=')) {
      const parsed = Number(arg.slice('--sleep-ms='.length));
      sleepMs = Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : sleepMs;
    } else if (arg.startsWith('--flush-every=')) {
      const parsed = Number(arg.slice('--flush-every='.length));
      flushEvery = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : flushEvery;
    }
  }

  return { source, tickers, limit, offset, sleepMs, skipSec, skipSync, flushEvery };
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#160;|&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

async function fetchSp500Tickers(): Promise<string[]> {
  const response = await fetch('https://en.wikipedia.org/wiki/List_of_S%26P_500_companies', {
    headers: {
      'User-Agent': 'CapitalBase/1.0 (market universe refresh; contact: support@capital-base.com)',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch S&P 500 constituents: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();
  const tableMatch = html.match(/<table[^>]*id="constituents"[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    throw new Error('Unable to locate S&P 500 constituents table.');
  }

  const tickers = Array.from(tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi))
    .map((rowMatch) => {
      const cells = Array.from(rowMatch[0].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi));
      if (cells.length === 0) return null;
      return normalizeTicker(stripTags(cells[0][1] ?? ''));
    })
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(tickers));
}

async function resolveUniverse(options: RefreshOptions, supabase: SupabaseClient): Promise<string[]> {
  let tickers: string[] = [];

  if (options.source === 'sp500') {
    tickers = await fetchSp500Tickers();
  } else if (options.source === 'quality-public') {
    void supabase;
    tickers = await getQualityPublicTickers(options.limit ?? 1000);
  } else if (options.source === 'tickers') {
    tickers = options.tickers;
  } else {
    tickers = DEMO_TICKERS;
  }

  if (options.limit !== null) {
    tickers = tickers.slice(options.offset, options.offset + options.limit);
  } else if (options.offset > 0) {
    tickers = tickers.slice(options.offset);
  }

  return tickers;
}

function getSupabaseAdminClient(): SupabaseClient {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required to refresh demo snapshots.');
  }
  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false },
  });
}

async function buildDemoSnapshotRow(
  supabase: SupabaseClient,
  ticker: string
): Promise<DemoSnapshotRow> {
  const normalizedTicker = ticker.trim().toUpperCase();
  const alternateTicker = normalizedTicker.includes('-') ? normalizedTicker.replace(/-/g, '.') : normalizedTicker.replace(/\./g, '-');
  const meta = DEMO_COMPANY_META[normalizedTicker] || {};

  let companyResult = await supabase
    .from('companies')
    .select('id, ticker, name, sector')
    .eq('ticker', normalizedTicker)
    .maybeSingle();
  if ((companyResult.error || !companyResult.data) && alternateTicker !== normalizedTicker) {
    companyResult = await supabase
      .from('companies')
      .select('id, ticker, name, sector')
      .eq('ticker', alternateTicker)
      .maybeSingle();
  }
  if (companyResult.error || !companyResult.data) {
    throw new Error(`No cached company row found for ${normalizedTicker}`);
  }

  const company = companyResult.data as CompanyRow;
  const [snapshotResult, priceResult] = await Promise.all([
    supabase
      .from('company_snapshots')
      .select('as_of_date, currency, revenue_ltm, ebitda_ltm, net_income_ltm, cash, total_debt, shares_outstanding, market_cap, source')
      .eq('company_id', company.id)
      .order('as_of_date', { ascending: false })
      .order('source_priority', { ascending: false })
      .limit(8),
    supabase
      .from('company_prices')
      .select('date, close, source')
      .eq('company_id', company.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const snapshots = (Array.isArray(snapshotResult.data) ? snapshotResult.data : []) as SnapshotRow[];
  const price = (priceResult.data as PriceRow | null) ?? null;
  const snapshot = snapshots[0] ?? null;
  if (!snapshot && !price) {
    throw new Error(`No cached snapshot or price found for ${normalizedTicker}`);
  }

  const revenueField = pickFirstNumber(snapshots, 'revenue_ltm');
  const ebitdaField = pickFirstNumber(snapshots, 'ebitda_ltm');
  const netIncomeField = pickFirstNumber(snapshots, 'net_income_ltm');
  const cashField = pickFirstNumber(snapshots, 'cash');
  const debtField = pickFirstNumber(snapshots, 'total_debt');
  const sharesField = pickFirstNumber(snapshots, 'shares_outstanding');
  const marketCapField = pickFirstNumber(snapshots, 'market_cap');

  const revenueLtm = revenueField.value;
  const ebitdaLtm = ebitdaField.value;
  const netIncomeLtm = netIncomeField.value;
  const cash = cashField.value;
  const totalDebt = debtField.value;
  const sharesOutstanding = sharesField.value;
  const marketCap = marketCapField.value;
  const sharePrice =
    parseNumber(price?.close) ??
    (marketCap !== null && sharesOutstanding !== null && sharesOutstanding > 0 ? marketCap / sharesOutstanding : null);
  const enterpriseValue =
    marketCap !== null && totalDebt !== null && cash !== null ? marketCap + totalDebt - cash : null;

  const priceSource =
    price?.source ??
    (marketCap !== null && sharesOutstanding !== null && sharesOutstanding > 0 ? 'derived_from_market_cap_and_shares' : 'company_prices');

  return {
    ticker: normalizedTicker,
    company_name: company.name ?? meta.name ?? normalizedTicker,
    sector: company.sector ?? meta.sector ?? null,
    revenue_ltm: revenueLtm,
    ebitda_ltm: ebitdaLtm,
    net_income_ltm: netIncomeLtm,
    cash,
    total_debt: totalDebt,
    shares_outstanding: sharesOutstanding,
    share_price: sharePrice,
    market_cap: marketCap,
    enterprise_value: enterpriseValue,
    currency: snapshot?.currency ?? 'USD',
    units: 'millions',
    as_of_date: snapshot?.as_of_date ?? price?.date ?? null,
    updated_at: new Date().toISOString(),
    source_map: {
      companyName: 'companies',
      sector: 'companies',
      ...(revenueLtm !== null ? { revenueLTM: revenueField.source ?? 'company_snapshots' } : {}),
      ...(ebitdaLtm !== null ? { ebitdaLTM: ebitdaField.source ?? 'company_snapshots' } : {}),
      ...(netIncomeLtm !== null ? { netIncomeLTM: netIncomeField.source ?? 'company_snapshots' } : {}),
      ...(cash !== null ? { cash: cashField.source ?? 'company_snapshots' } : {}),
      ...(totalDebt !== null ? { totalDebt: debtField.source ?? 'company_snapshots' } : {}),
      ...(sharesOutstanding !== null ? { sharesOutstanding: sharesField.source ?? 'company_snapshots' } : {}),
      ...(marketCap !== null ? { marketCap: marketCapField.source ?? 'company_snapshots' } : {}),
      ...(sharePrice !== null ? { sharePrice: priceSource } : {}),
    },
  };
}

async function flushSnapshots(supabase: SupabaseClient, snapshots: DemoSnapshotRow[]): Promise<void> {
  if (snapshots.length === 0) return;
  const { error } = await supabase.from('demo_company_snapshots').upsert(snapshots, {
    onConflict: 'ticker',
  });
  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const supabase = getSupabaseAdminClient();
  const snapshots: DemoSnapshotRow[] = [];
  const failures: Record<string, string> = {};
  const universe = await resolveUniverse(options, supabase);

  if (universe.length === 0) {
    throw new Error('No tickers resolved for refresh.');
  }

  console.log(
    `[demo-refresh] starting universe refresh. source=${options.source} tickers=${universe.length} offset=${options.offset} sleepMs=${options.sleepMs} skipSec=${options.skipSec} skipSync=${options.skipSync} flushEvery=${options.flushEvery}`
  );

  for (const [index, ticker] of universe.entries()) {
    const warnings: string[] = [];
    console.log(`[demo-refresh] ${index + 1}/${universe.length} ${ticker}`);

    if (!options.skipSync) {
      try {
        const fmp = await syncCompanyFromFmp(ticker);
        if (fmp.warnings.length > 0) warnings.push(...fmp.warnings);
      } catch (error) {
        warnings.push(`FMP sync failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }

      try {
        const polygon = await syncPricesFromPolygon(ticker);
        if (polygon.warnings.length > 0) warnings.push(...polygon.warnings);
      } catch (error) {
        warnings.push(`Polygon sync failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      }

      if (!options.skipSec) {
        try {
          const sec = await syncCompanyFactsFromSec(ticker);
          if (sec.warnings.length > 0) warnings.push(...sec.warnings);
        } catch (error) {
          warnings.push(`SEC sync failed: ${error instanceof Error ? error.message : 'unknown error'}`);
        }
      }
    }

    try {
      const row = await buildDemoSnapshotRow(supabase, ticker);
      if (warnings.length > 0) {
        row.source_map = {
          ...(row.source_map ?? {}),
          syncWarnings: warnings.join(' | '),
        };
      }
      snapshots.push(row);
      console.log(`[demo-refresh] ${ticker} ok. ${warnings.length > 0 ? `Warnings: ${warnings.join('; ')}` : 'No warnings.'}`);
      if (snapshots.length % options.flushEvery === 0) {
        await flushSnapshots(supabase, snapshots);
        console.log(`[demo-refresh] checkpoint upsert complete for ${snapshots.length} tickers.`);
      }
    } catch (error) {
      failures[ticker] = error instanceof Error ? error.message : 'unknown error';
      console.error(`[demo-refresh] ${ticker} failed: ${failures[ticker]}`);
    }

    await sleep(options.sleepMs);
  }

  if (snapshots.length === 0) {
    throw new Error('No demo snapshot rows were built from cached company data.');
  }

  await flushSnapshots(supabase, snapshots);

  console.log(`[demo-refresh] Supabase upsert complete for ${snapshots.length} tickers.`);
  const failedTickers = Object.keys(failures);
  if (failedTickers.length > 0) {
    console.warn(`[demo-refresh] failures: ${failedTickers.map((ticker) => `${ticker}: ${failures[ticker]}`).join(' | ')}`);
  }
}

main().catch((err) => {
  console.error('[demo-refresh] failed', err);
  process.exit(1);
});
