import type { LTMFinancials } from '@/lib/getLTMFinancials';

const SEEDED_TICKER_FALLBACKS: Record<string, Partial<LTMFinancials>> = {
  AAPL: {
    companyName: 'Apple Inc.',
    revenue: 435620,
    ebitda: 152900,
    netIncome: 117780,
    cash: 144800,
    totalDebt: 90510,
    sharesOutstanding: 14680,
    marketCap: 2862600,
  },
  MSFT: {
    companyName: 'Microsoft Corporation',
    revenue: 261800,
    ebitda: 133100,
    netIncome: 94100,
    cash: 111700,
    totalDebt: 65800,
    sharesOutstanding: 7430,
    marketCap: 3070000,
  },
  GOOGL: {
    companyName: 'Alphabet Inc.',
    revenue: 347900,
    ebitda: 123000,
    netIncome: 100100,
    cash: 110900,
    totalDebt: 25000,
    sharesOutstanding: 12330,
    marketCap: 2230000,
  },
  AMZN: {
    companyName: 'Amazon.com, Inc.',
    revenue: 637900,
    ebitda: 129000,
    netIncome: 59200,
    cash: 93000,
    totalDebt: 158000,
    sharesOutstanding: 10600,
    marketCap: 2060000,
  },
};

function deterministicSeedFromTicker(ticker: string): number {
  return ticker.split('').reduce((acc, char, idx) => acc + char.charCodeAt(0) * (idx + 7), 0);
}

export function buildSeededFallbackLtm(ticker: string): LTMFinancials {
  const normalizedTicker = ticker.toUpperCase().trim();
  const seeded = SEEDED_TICKER_FALLBACKS[normalizedTicker];
  if (seeded?.revenue && seeded.revenue > 0) {
    return {
      ticker: normalizedTicker,
      revenue: seeded.revenue,
      ebitda: seeded.ebitda,
      netIncome: seeded.netIncome,
      cash: seeded.cash,
      totalDebt: seeded.totalDebt,
      sharesOutstanding: seeded.sharesOutstanding,
      marketCap: seeded.marketCap,
      companyName: seeded.companyName || normalizedTicker,
      sector: seeded.sector || undefined,
      dataSource: 'demo_seed_fallback',
      fiscalPeriod: 'LTM',
      lastUpdated: new Date().toISOString(),
    };
  }

  const seed = deterministicSeedFromTicker(normalizedTicker);
  const revenue = 25000 + (seed % 85000);
  const ebitdaMargin = 0.18 + ((seed % 12) / 100);
  const netMargin = 0.08 + ((seed % 7) / 100);
  const sharesOutstanding = 1500 + (seed % 10000);
  const sharePrice = 25 + (seed % 260);
  const marketCap = sharesOutstanding * sharePrice;
  const cash = revenue * 0.12;
  const totalDebt = revenue * 0.22;

  return {
    ticker: normalizedTicker,
    companyName: normalizedTicker,
    revenue,
    ebitda: revenue * ebitdaMargin,
    netIncome: revenue * netMargin,
    cash,
    totalDebt,
    sharesOutstanding,
    marketCap,
    dataSource: 'demo_seed_fallback',
    fiscalPeriod: 'LTM',
    lastUpdated: new Date().toISOString(),
  };
}
