export type NormalizedQuote = {
  ticker: string;
  price: number | null;
  asOf: string | null;
  currency: 'USD' | string;
  marketCap?: number | null;
  sharesOutstanding?: number | null;
  units?: 'millions' | 'actual' | string;
  provenance: Record<string, string>;
  source?: string;
};

export type NormalizedFundamentals = {
  ticker: string;
  revenueLTM: number | null;
  ebitdaLTM: number | null;
  netIncomeLTM: number | null;
  cash: number | null;
  totalDebt: number | null;
  companyName?: string | null;
  sector?: string | null;
  currency?: 'USD' | string;
  units?: 'millions' | 'actual' | string;
  sharesOutstanding?: number | null;
  revenueSeries?: number[];
  provenance: Record<string, string>;
  source?: string;
};

export type NormalizedComps = {
  ticker: string;
  peers: Array<{
    ticker: string;
    companyName?: string | null;
    marketCap: number | null;
    enterpriseValue: number | null;
    revenueLTM: number | null;
    ebitdaLTM: number | null;
    netIncomeLTM: number | null;
    multiples: {
      evToRevenue: number | null;
      evToEbitda: number | null;
      pe: number | null;
    };
    provenance: Record<string, string>;
  }>;
};
