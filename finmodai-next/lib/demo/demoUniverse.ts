export const DEMO_TICKERS = [
  'AAPL',
  'MSFT',
  'NVDA',
  'AMZN',
  'GOOGL',
  'META',
  'TSLA',
  'JPM',
  'XOM',
  'UNH',
  'V',
  'MA',
  'AVGO',
  'COST',
  'PEP',
  'KO',
  'WMT',
  'DIS',
  'NFLX',
  'ORCL',
];

export const DEMO_COMPANY_META: Record<string, { name: string; sector: string }> = {
  AAPL: { name: 'Apple Inc.', sector: 'Technology' },
  MSFT: { name: 'Microsoft Corporation', sector: 'Technology' },
  NVDA: { name: 'NVIDIA Corporation', sector: 'Technology' },
  AMZN: { name: 'Amazon.com, Inc.', sector: 'Consumer Discretionary' },
  GOOGL: { name: 'Alphabet Inc.', sector: 'Communication Services' },
  META: { name: 'Meta Platforms, Inc.', sector: 'Communication Services' },
  TSLA: { name: 'Tesla, Inc.', sector: 'Consumer Discretionary' },
  JPM: { name: 'JPMorgan Chase & Co.', sector: 'Financials' },
  XOM: { name: 'Exxon Mobil Corporation', sector: 'Energy' },
  UNH: { name: 'UnitedHealth Group Incorporated', sector: 'Health Care' },
  V: { name: 'Visa Inc.', sector: 'Financials' },
  MA: { name: 'Mastercard Incorporated', sector: 'Financials' },
  AVGO: { name: 'Broadcom Inc.', sector: 'Technology' },
  COST: { name: 'Costco Wholesale Corporation', sector: 'Consumer Staples' },
  PEP: { name: 'PepsiCo, Inc.', sector: 'Consumer Staples' },
  KO: { name: 'The Coca-Cola Company', sector: 'Consumer Staples' },
  WMT: { name: 'Walmart Inc.', sector: 'Consumer Staples' },
  DIS: { name: 'The Walt Disney Company', sector: 'Communication Services' },
  NFLX: { name: 'Netflix, Inc.', sector: 'Communication Services' },
  ORCL: { name: 'Oracle Corporation', sector: 'Technology' },
};

export function isDemoTicker(ticker: string): boolean {
  return DEMO_TICKERS.includes(ticker.toUpperCase());
}
