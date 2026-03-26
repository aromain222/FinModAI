import { getSupabaseServiceClient } from '@/lib/events/store';
import { fetchJsonWithRetry } from '@/lib/data/providers/shared';
import { serverEnv } from '@/lib/env/server';
import { fetchSecEdgarAnnualFundamentals } from '@/lib/data/providers/secEdgar';

export type SecSyncSummary = {
  ticker: string;
  companyId: string | null;
  cik: string | null;
  snapshotDate: string | null;
  warnings: string[];
};

type SecTickerMapRow = {
  ticker?: string;
  cik_str?: number | string;
};

function toPaddedCik(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value).padStart(10, '0');
  if (typeof value === 'string' && value.trim().length > 0) {
    const digits = value.replace(/\D/g, '');
    return digits ? digits.padStart(10, '0') : null;
  }
  return null;
}

function toMillions(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value / 1_000_000 : null;
}

function pickNumber(value: number | null | undefined, fallback: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : typeof fallback === 'number' && Number.isFinite(fallback) ? fallback : null;
}

function normalizeSnapshotDate(value: string | null | undefined): string {
  const today = new Date().toISOString().slice(0, 10);
  if (!value) return today;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return today;
  const isoDate = new Date(parsed).toISOString().slice(0, 10);
  return isoDate > today ? today : isoDate;
}

export async function syncCompanyFactsFromSec(ticker: string): Promise<SecSyncSummary> {
  const supabase = getSupabaseServiceClient();
  if (!supabase) throw new Error('Supabase service client is not configured');
  if (!serverEnv.SEC_UA_EMAIL) {
    return { ticker: ticker.toUpperCase(), companyId: null, cik: null, snapshotDate: null, warnings: ['SEC_UA_EMAIL is not configured.'] };
  }

  const normalizedTicker = ticker.trim().toUpperCase();
  const companyRow = await supabase.from('companies').select('id').eq('ticker', normalizedTicker).maybeSingle();
  if (!companyRow.data?.id) throw new Error(`Company ${normalizedTicker} must exist before SEC sync`);

  const tickerMapResult = await fetchJsonWithRetry<Record<string, SecTickerMapRow>>({
    provider: 'sec_edgar',
    url: 'https://www.sec.gov/files/company_tickers.json',
    cacheKey: 'sec_edgar:company_tickers',
    ttlMs: 24 * 60 * 60 * 1000,
    options: {
      headers: {
        'User-Agent': serverEnv.SEC_UA_EMAIL,
      },
    },
  });

  let cik: string | null = null;
  if (tickerMapResult.ok) {
    const entry = Object.values(tickerMapResult.data ?? {}).find((row) => String(row?.ticker ?? '').toUpperCase() === normalizedTicker);
    cik = toPaddedCik(entry?.cik_str);
  }

  if (cik) {
    const identifierUpsert = await (supabase.from('company_identifiers') as any)
      .upsert({ company_id: companyRow.data.id, ticker: normalizedTicker, cik, source: 'sec_edgar' }, { onConflict: 'company_id,source' })
      .select('id')
      .single();
    if (identifierUpsert.error) {
      return {
        ticker: normalizedTicker,
        companyId: companyRow.data.id,
        cik,
        snapshotDate: null,
        warnings: [`Failed to upsert SEC identifier: ${identifierUpsert.error.message}`],
      };
    }
  }

  const fundamentals = await fetchSecEdgarAnnualFundamentals(normalizedTicker);
  if (!fundamentals.ok) {
    return {
      ticker: normalizedTicker,
      companyId: companyRow.data.id,
      cik,
      snapshotDate: null,
      warnings: [fundamentals.error.message],
    };
  }

  const asOfDate = normalizeSnapshotDate(
    fundamentals.data.reportEndDate ?? (fundamentals.data.fiscalYear ? `${fundamentals.data.fiscalYear}-12-31` : null)
  );
  const existingSnapshot = await supabase
    .from('company_snapshots')
    .select('*')
    .eq('company_id', companyRow.data.id)
    .order('as_of_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshotPayload = {
    company_id: companyRow.data.id,
    as_of_date: asOfDate,
    period_type: 'FY',
    currency: 'USD',
    revenue_ltm: pickNumber(toMillions(fundamentals.data.revenueFY), existingSnapshot.data?.revenue_ltm),
    gross_profit_ltm: pickNumber(
      toMillions(fundamentals.data.grossProfitFY),
      existingSnapshot.data?.gross_profit_ltm
    ),
    ebitda_ltm: pickNumber(
      toMillions(fundamentals.data.ebitdaFY),
      existingSnapshot.data?.ebitda_ltm
    ),
    ebit_ltm: pickNumber(toMillions(fundamentals.data.ebitFY), existingSnapshot.data?.ebit_ltm),
    net_income_ltm: pickNumber(toMillions(fundamentals.data.netIncomeFY), existingSnapshot.data?.net_income_ltm),
    cash: pickNumber(toMillions(fundamentals.data.cash), existingSnapshot.data?.cash),
    total_debt: pickNumber(toMillions(fundamentals.data.totalDebt), existingSnapshot.data?.total_debt),
    shares_outstanding: existingSnapshot.data?.shares_outstanding ?? null,
    market_cap: existingSnapshot.data?.market_cap ?? null,
    source: 'sec_edgar',
    source_priority: 80,
  };

  const snapshotUpsert = await (supabase.from('company_snapshots') as any)
    .upsert(snapshotPayload, { onConflict: 'company_id,as_of_date,period_type,source' })
    .select('id')
    .single();

  return {
    ticker: normalizedTicker,
    companyId: companyRow.data.id,
    cik,
    snapshotDate: asOfDate,
    warnings: snapshotUpsert.error ? [snapshotUpsert.error.message] : [],
  };
}
