import { resolveCompanyProfile } from '@/lib/data/company/resolveCompanyProfile';
import type { ResolvedCompanyProfile } from '@/lib/data/company/types';
import { syncCompanyFromFmp } from '@/lib/integrations/fmp/syncCompany';
import { syncIdentifiersFromOpenFigi } from '@/lib/integrations/openfigi/syncIdentifiers';
import { syncPricesFromPolygon } from '@/lib/integrations/polygon/syncPrices';
import { syncCompanyFactsFromSec } from '@/lib/integrations/sec/syncCompanyFacts';

export type DataRefreshStatus = 'cached' | 'rerun_attempted' | 'rerun_succeeded' | 'rerun_failed';

export type CatalogRefreshResult = {
  attempted: boolean;
  status: Extract<DataRefreshStatus, 'rerun_succeeded' | 'rerun_failed'>;
  profile: ResolvedCompanyProfile | null;
  warnings: string[];
};

export type CatalogRefreshValues = {
  companyName: string | null;
  revenue: number | null;
  grossProfit: number | null;
  ebitda: number | null;
  ebit: number | null;
  netIncome: number | null;
  cash: number | null;
  totalDebt: number | null;
  netDebt: number | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
  price: number | null;
};

export async function refreshCatalogCompanyProfile(ticker: string): Promise<CatalogRefreshResult> {
  const normalizedTicker = ticker.trim().toUpperCase();
  const warnings: string[] = [];
  let refreshedProfile: ResolvedCompanyProfile | null = null;

  const steps: Array<() => Promise<{ warnings?: string[] } | void>> = [
    () => syncCompanyFromFmp(normalizedTicker),
    () => syncIdentifiersFromOpenFigi(normalizedTicker),
    () => syncPricesFromPolygon(normalizedTicker),
    () => syncCompanyFactsFromSec(normalizedTicker),
  ];

  for (const step of steps) {
    try {
      const result = await step();
      if (Array.isArray(result?.warnings) && result.warnings.length > 0) {
        warnings.push(...result.warnings.filter(Boolean));
      }
    } catch (error: any) {
      const message = typeof error?.message === 'string' ? error.message : 'Unknown refresh failure';
      warnings.push(message);
    }
  }

  try {
    refreshedProfile = await resolveCompanyProfile({ ticker: normalizedTicker });
  } catch (error: any) {
    const message = typeof error?.message === 'string' ? error.message : 'Unable to resolve refreshed company profile';
    warnings.push(message);
  }

  const hasResolvedCompany = Boolean(refreshedProfile?.company?.ticker);
  return {
    attempted: true,
    status: hasResolvedCompany ? 'rerun_succeeded' : 'rerun_failed',
    profile: refreshedProfile,
    warnings,
  };
}

export function extractCatalogRefreshValues(profile: ResolvedCompanyProfile | null): CatalogRefreshValues {
  const snapshot = profile?.snapshot ?? null;
  const latestPrice = profile?.latestPrice ?? null;

  const cash = snapshot?.cash ?? null;
  const totalDebt = snapshot?.totalDebt ?? null;

  return {
    companyName: profile?.company?.name ?? null,
    revenue: snapshot?.revenueLtm ?? null,
    grossProfit: snapshot?.grossProfitLtm ?? null,
    ebitda: snapshot?.ebitdaLtm ?? null,
    ebit: snapshot?.ebitLtm ?? null,
    netIncome: snapshot?.netIncomeLtm ?? null,
    cash,
    totalDebt,
    netDebt: cash !== null && totalDebt !== null ? totalDebt - cash : null,
    sharesOutstanding: snapshot?.sharesOutstanding ?? null,
    marketCap: snapshot?.marketCap ?? null,
    price: latestPrice?.close ?? null,
  };
}
