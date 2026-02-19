import { serverEnv } from '@/lib/env/server';
import { fetchJsonWithRetry } from './shared';
import type { ProviderResult } from './types';

type SecFundamentals = {
  revenueLTM: number | null;
  netIncomeLTM: number | null;
  cash: number | null;
  totalDebt: number | null;
};

export type SecAnnualFundamentals = {
  revenueFY: number | null;
  netIncomeFY: number | null;
  cash: number | null;
  totalDebt: number | null;
  fiscalYear: number | null;
  period: string | null;
};

const cikCache = new Map<string, string>();

async function fetchCikForTicker(ticker: string): Promise<string | null> {
  if (cikCache.has(ticker)) return cikCache.get(ticker) || null;
  const res = await fetchJsonWithRetry<any>({
    provider: 'sec_edgar',
    url: 'https://www.sec.gov/files/company_tickers.json',
    cacheKey: 'sec_edgar:ticker_map',
    ttlMs: 24 * 60 * 60 * 1000,
    options: {
      headers: {
        'User-Agent': serverEnv.SEC_UA_EMAIL || 'capitalbase/unknown',
      },
    },
  });
  if (!res.ok) return null;

  const map = res.data || {};
  const entries = Object.values(map) as Array<any>;
  const match = entries.find((entry) => String(entry?.ticker).toUpperCase() === ticker.toUpperCase());
  if (!match?.cik_str) return null;
  const cik = String(match.cik_str).padStart(10, '0');
  cikCache.set(ticker, cik);
  return cik;
}

function pickLatestUsdEntry(
  facts: any,
  tags: string[],
  predicate?: (item: any) => boolean
): any | null {
  for (const tag of tags) {
    const node = facts?.[tag]?.units?.USD || facts?.[tag]?.units?.usd;
    if (!Array.isArray(node)) continue;
    const filtered = predicate ? node.filter((item) => predicate(item)) : node;
    const sorted = [...filtered].sort(
      (a, b) =>
        new Date(b.end || b.filed || 0).getTime() - new Date(a.end || a.filed || 0).getTime()
    );
    const entry = sorted.find((item) => typeof item?.val === 'number');
    if (entry?.val !== undefined && entry?.val !== null) return entry;
  }
  return null;
}

function pickLatestUsdValue(facts: any, tags: string[]): number | null {
  const entry = pickLatestUsdEntry(facts, tags);
  return entry?.val !== undefined && entry?.val !== null ? Number(entry.val) : null;
}

function isAnnualEntry(item: any): boolean {
  const fp = String(item?.fp || '').toUpperCase();
  const form = String(item?.form || '').toUpperCase();
  return fp === 'FY' || form === '10-K' || form === '20-F';
}

function deriveFiscalYear(entry: any): number | null {
  if (typeof entry?.fy === 'number') return entry.fy;
  const end = entry?.end || entry?.filed;
  if (end) {
    const year = new Date(end).getFullYear();
    return Number.isFinite(year) ? year : null;
  }
  return null;
}

export async function fetchSecEdgarFundamentals(ticker: string): Promise<ProviderResult<SecFundamentals>> {
  const userAgent = serverEnv.SEC_UA_EMAIL;
  if (!userAgent) {
    return { ok: false, error: { provider: 'sec_edgar', message: 'SEC_UA_EMAIL missing' } };
  }

  const cik = await fetchCikForTicker(ticker);
  if (!cik) {
    return { ok: false, error: { provider: 'sec_edgar', message: `CIK not found for ${ticker}` } };
  }

  const res = await fetchJsonWithRetry<any>({
    provider: 'sec_edgar',
    url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
    cacheKey: `sec_edgar:companyfacts:${cik}`,
    ttlMs: 24 * 60 * 60 * 1000,
    options: {
      headers: { 'User-Agent': userAgent },
    },
  });
  if (!res.ok) return res;

  const facts = res.data?.facts?.['us-gaap'];
  const revenueLTM = pickLatestUsdValue(facts, [
    'Revenues',
    'SalesRevenueNet',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
  ]);
  const netIncomeLTM = pickLatestUsdValue(facts, ['NetIncomeLoss']);
  const cash = pickLatestUsdValue(facts, [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
  ]);

  const shortDebt = pickLatestUsdValue(facts, ['DebtCurrent', 'ShortTermBorrowings']);
  const longDebt = pickLatestUsdValue(facts, ['LongTermDebtNoncurrent', 'LongTermDebt']);
  const totalDebt = Number.isFinite(shortDebt) || Number.isFinite(longDebt)
    ? (Number(shortDebt || 0) + Number(longDebt || 0))
    : null;

  return {
    ok: true,
    data: {
      revenueLTM: Number.isFinite(revenueLTM) ? revenueLTM : null,
      netIncomeLTM: Number.isFinite(netIncomeLTM) ? netIncomeLTM : null,
      cash: Number.isFinite(cash) ? cash : null,
      totalDebt: Number.isFinite(totalDebt) ? totalDebt : null,
    },
    raw: res.data,
    latencyMs: res.latencyMs,
  };
}

export async function fetchSecEdgarAnnualFundamentals(
  ticker: string
): Promise<ProviderResult<SecAnnualFundamentals>> {
  const userAgent = serverEnv.SEC_UA_EMAIL;
  if (!userAgent) {
    return { ok: false, error: { provider: 'sec_edgar', message: 'SEC_UA_EMAIL missing' } };
  }

  const cik = await fetchCikForTicker(ticker);
  if (!cik) {
    return { ok: false, error: { provider: 'sec_edgar', message: `CIK not found for ${ticker}` } };
  }

  const res = await fetchJsonWithRetry<any>({
    provider: 'sec_edgar',
    url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
    cacheKey: `sec_edgar:companyfacts:${cik}`,
    ttlMs: 24 * 60 * 60 * 1000,
    options: {
      headers: { 'User-Agent': userAgent },
    },
  });
  if (!res.ok) return res as ProviderResult<SecAnnualFundamentals>;

  const facts = res.data?.facts?.['us-gaap'];
  const revenueEntry =
    pickLatestUsdEntry(facts, [
      'Revenues',
      'SalesRevenueNet',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
    ], isAnnualEntry) ||
    pickLatestUsdEntry(facts, [
      'Revenues',
      'SalesRevenueNet',
      'RevenueFromContractWithCustomerExcludingAssessedTax',
    ]);
  const netIncomeEntry =
    pickLatestUsdEntry(facts, ['NetIncomeLoss'], isAnnualEntry) ||
    pickLatestUsdEntry(facts, ['NetIncomeLoss']);
  const cashEntry =
    pickLatestUsdEntry(facts, [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    ], isAnnualEntry) ||
    pickLatestUsdEntry(facts, [
      'CashAndCashEquivalentsAtCarryingValue',
      'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    ]);
  const shortDebtEntry =
    pickLatestUsdEntry(facts, ['DebtCurrent', 'ShortTermBorrowings'], isAnnualEntry) ||
    pickLatestUsdEntry(facts, ['DebtCurrent', 'ShortTermBorrowings']);
  const longDebtEntry =
    pickLatestUsdEntry(facts, ['LongTermDebtNoncurrent', 'LongTermDebt'], isAnnualEntry) ||
    pickLatestUsdEntry(facts, ['LongTermDebtNoncurrent', 'LongTermDebt']);

  const revenueFY = revenueEntry?.val !== undefined ? Number(revenueEntry.val) : null;
  const netIncomeFY = netIncomeEntry?.val !== undefined ? Number(netIncomeEntry.val) : null;
  const cash = cashEntry?.val !== undefined ? Number(cashEntry.val) : null;
  const totalDebt = Number.isFinite(shortDebtEntry?.val) || Number.isFinite(longDebtEntry?.val)
    ? (Number(shortDebtEntry?.val || 0) + Number(longDebtEntry?.val || 0))
    : null;

  const fiscalYear = deriveFiscalYear(revenueEntry ?? netIncomeEntry ?? cashEntry ?? shortDebtEntry ?? longDebtEntry);
  const period = (revenueEntry?.fp || netIncomeEntry?.fp || cashEntry?.fp || shortDebtEntry?.fp || longDebtEntry?.fp || null) as string | null;

  return {
    ok: true,
    data: {
      revenueFY: Number.isFinite(revenueFY) ? revenueFY : null,
      netIncomeFY: Number.isFinite(netIncomeFY) ? netIncomeFY : null,
      cash: Number.isFinite(cash) ? cash : null,
      totalDebt: Number.isFinite(totalDebt) ? totalDebt : null,
      fiscalYear: Number.isFinite(fiscalYear as number) ? (fiscalYear as number) : null,
      period,
    },
    raw: res.data,
    latencyMs: res.latencyMs,
  };
}
