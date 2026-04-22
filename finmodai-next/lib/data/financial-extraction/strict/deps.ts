import { resolveFinancialExtractionCompany } from '@/lib/data/financial-extraction/companyResolver';
import { fetchJsonWithRetry } from '@/lib/data/providers/shared';
import { serverEnv } from '@/lib/env/server';
import type { StrictFinancialPeriodType } from '@/lib/data/financial-extraction/strict/types';

function normalizeTicker(value: string): string {
  return value.trim().toUpperCase();
}

async function fetchSecTickerMap() {
  return fetchJsonWithRetry<Record<string, { ticker?: string; cik_str?: number | string }>>({
    provider: 'sec_edgar',
    url: 'https://www.sec.gov/files/company_tickers.json',
    cacheKey: 'strict_financial_pipeline:sec_ticker_map',
    ttlMs: 24 * 60 * 60 * 1000,
    options: {
      headers: {
        'User-Agent': serverEnv.SEC_UA_EMAIL || 'capitalbase/unknown',
      },
    },
  });
}

async function fetchCikForTicker(ticker: string): Promise<string | null> {
  const res = await fetchSecTickerMap();
  if (!res.ok) return null;
  const match = Object.values(res.data ?? {}).find(
    (entry) => String(entry?.ticker ?? '').toUpperCase() === normalizeTicker(ticker),
  );
  const cik = match?.cik_str;
  if (typeof cik === 'number' && Number.isFinite(cik)) return String(cik).padStart(10, '0');
  if (typeof cik === 'string' && cik.trim()) return cik.replace(/\D/g, '').padStart(10, '0');
  return null;
}

export const strictFinancialPipelineDeps = {
  resolvePublicCompany: async (input: { ticker: string; companyIdentifier: string | null }) => {
    return resolveFinancialExtractionCompany({
      lane: 'public',
      ticker: input.ticker,
      companyIdentifier: input.companyIdentifier ?? undefined,
    });
  },

  fetchSecCompanyFactsRaw: async (ticker: string, cikHint?: string | null) => {
    const cik = cikHint || (await fetchCikForTicker(ticker));
    if (!cik || !serverEnv.SEC_UA_EMAIL) {
      return { ok: false as const, error: 'SEC identity or user agent unavailable.' };
    }

    const result = await fetchJsonWithRetry<any>({
      provider: 'sec_edgar',
      url: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
      cacheKey: `strict_financial_pipeline:sec_companyfacts:${cik}`,
      ttlMs: 24 * 60 * 60 * 1000,
      options: {
        headers: {
          'User-Agent': serverEnv.SEC_UA_EMAIL,
        },
      },
    });

    if (!result.ok) {
      return {
        ok: false as const,
        error: result.error.message,
        sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
      };
    }

    return {
      ok: true as const,
      cik,
      sourceUrl: `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
      data: result.data,
    };
  },

  fetchFmpRawBundle: async (ticker: string, periodType: StrictFinancialPeriodType) => {
    const apiKey = serverEnv.FMP_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: 'FMP_API_KEY missing.' };
    }

    const normalizedTicker = normalizeTicker(ticker);
    const incomePath =
      periodType === 'ltm'
        ? `https://financialmodelingprep.com/stable/income-statement-ttm?symbol=${normalizedTicker}&apikey=${apiKey}`
        : `https://financialmodelingprep.com/stable/income-statement?symbol=${normalizedTicker}${periodType === 'quarterly' ? '&period=quarter' : ''}&limit=1&apikey=${apiKey}`;
    const cashFlowPath =
      periodType === 'ltm'
        ? `https://financialmodelingprep.com/stable/cash-flow-statement-ttm?symbol=${normalizedTicker}&apikey=${apiKey}`
        : `https://financialmodelingprep.com/stable/cash-flow-statement?symbol=${normalizedTicker}${periodType === 'quarterly' ? '&period=quarter' : ''}&limit=1&apikey=${apiKey}`;
    const balancePath = `https://financialmodelingprep.com/stable/balance-sheet-statement?symbol=${normalizedTicker}${periodType === 'quarterly' ? '&period=quarter' : ''}&limit=1&apikey=${apiKey}`;

    const [income, cashFlow, balance] = await Promise.all([
      fetchJsonWithRetry<any>({
        provider: 'fmp',
        url: incomePath,
        cacheKey: `strict_financial_pipeline:fmp:income:${normalizedTicker}:${periodType}`,
        ttlMs: 30 * 60 * 1000,
      }),
      fetchJsonWithRetry<any>({
        provider: 'fmp',
        url: cashFlowPath,
        cacheKey: `strict_financial_pipeline:fmp:cashflow:${normalizedTicker}:${periodType}`,
        ttlMs: 30 * 60 * 1000,
      }),
      fetchJsonWithRetry<any>({
        provider: 'fmp',
        url: balancePath,
        cacheKey: `strict_financial_pipeline:fmp:balance:${normalizedTicker}:${periodType}`,
        ttlMs: 30 * 60 * 1000,
      }),
    ]);

    if (!income.ok && !cashFlow.ok && !balance.ok) {
      return { ok: false as const, error: 'FMP endpoints returned no usable payloads.' };
    }

    return {
      ok: true as const,
      urls: {
        income: incomePath,
        cashFlow: cashFlowPath,
        balance: balancePath,
      },
      data: {
        income: income.ok ? income.data : null,
        cashFlow: cashFlow.ok ? cashFlow.data : null,
        balance: balance.ok ? balance.data : null,
      },
    };
  },
};
