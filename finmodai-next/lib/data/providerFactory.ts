import type { NormalizedFundamentals, NormalizedQuote } from '@/lib/data/types';
import { fetchNormalizedFundamentals, fetchNormalizedQuote } from '@/lib/data/normalized';
import { identifyPeers } from '@/lib/identifyPeers';
import { isDemoMode } from '@/lib/demo/isDemoMode';
import { getDemoFundamentals, getDemoQuote, getDemoTickers } from '@/lib/data/providers/demoProvider';

export type CompanyDataProvider = {
  getCompanyFundamentals: (ticker: string) => Promise<NormalizedFundamentals>;
  getCompanyQuote: (ticker: string) => Promise<NormalizedQuote>;
  getPeers: (ticker: string) => Promise<string[]>;
};

const liveProvider: CompanyDataProvider = {
  async getCompanyFundamentals(ticker: string) {
    const { fundamentals } = await fetchNormalizedFundamentals(ticker);
    return fundamentals;
  },
  async getCompanyQuote(ticker: string) {
    const { quote } = await fetchNormalizedQuote(ticker);
    return quote;
  },
  async getPeers(ticker: string) {
    const result = await identifyPeers(ticker);
    return result?.peers || [];
  },
};

const demoProvider: CompanyDataProvider = {
  async getCompanyFundamentals(ticker: string) {
    const fundamentals = await getDemoFundamentals(ticker);
    return fundamentals ?? {
      ticker: ticker.toUpperCase(),
      revenueLTM: null,
      ebitdaLTM: null,
      netIncomeLTM: null,
      cash: null,
      totalDebt: null,
      provenance: {},
      source: 'demo_snapshots',
    };
  },
  async getCompanyQuote(ticker: string) {
    const quote = await getDemoQuote(ticker);
    return quote ?? {
      ticker: ticker.toUpperCase(),
      price: null,
      asOf: null,
      currency: 'USD',
      marketCap: null,
      sharesOutstanding: null,
      provenance: {},
      source: 'demo_snapshots',
    };
  },
  async getPeers(ticker: string) {
    const tickers = await getDemoTickers();
    const clean = ticker.toUpperCase();
    return tickers.filter((item) => item !== clean);
  },
};

export function getCompanyDataProvider(): CompanyDataProvider {
  if (!isDemoMode()) {
    throw new Error('Demo mode is required; live data providers are disabled.');
  }
  return demoProvider;
}
