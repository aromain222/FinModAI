export type Company = {
  id: string;
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  exchange: string | null;
  companyType: string | null;
  isSaas: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CompanyIdentifier = {
  id: string;
  companyId: string;
  ticker: string | null;
  compositeFigi: string | null;
  shareClassFigi: string | null;
  cik: string | null;
  isin: string | null;
  cusip: string | null;
  source: string;
  createdAt: string;
};

export type CompanySnapshot = {
  id: string;
  companyId: string;
  asOfDate: string;
  periodType: string;
  currency: string;
  revenueLtm: number | null;
  grossProfitLtm: number | null;
  ebitdaLtm: number | null;
  ebitLtm: number | null;
  netIncomeLtm: number | null;
  cash: number | null;
  totalDebt: number | null;
  sharesOutstanding: number | null;
  marketCap: number | null;
  source: string;
  sourcePriority: number;
  createdAt: string;
};

export type CompanyPrice = {
  id: string;
  companyId: string;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  source: string;
  createdAt: string;
};

export type CompanyKpi = {
  id: string;
  companyId: string;
  asOfDate: string;
  arr: number | null;
  netRetention: number | null;
  grossRetention: number | null;
  customers: number | null;
  arpu: number | null;
  grossMargin: number | null;
  source: string;
  confidence: string | null;
  createdAt: string;
};

export type ResolvedCompanyProfile = {
  company: Company;
  identifiers: CompanyIdentifier[];
  snapshot: CompanySnapshot | null;
  latestPrice: CompanyPrice | null;
  kpis: CompanyKpi[];
};

export type CompanyQuery = {
  prompt?: string;
  ticker?: string;
  companyName?: string;
};
