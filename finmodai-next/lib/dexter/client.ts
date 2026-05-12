const BASE = 'https://api.financialdatasets.ai';

function apiKey(): string {
  return process.env.FINANCIAL_DATASETS_API_KEY ?? '';
}

function fmpApiKey(): string {
  return process.env.FMP_API_KEY ?? '';
}

async function get<T>(path: string): Promise<T> {
  const key = apiKey();
  const res = await fetch(`${BASE}${path}`, {
    headers: key ? { 'X-API-KEY': key } : {},
    next: { revalidate: 3600 },
  });
  if (!res.ok) {
    const detail = res.status === 402
      ? 'provider access/payment required'
      : `status ${res.status}`;
    throw new Error(`financialdatasets.ai ${path} -> ${detail}`);
  }
  return res.json() as Promise<T>;
}

async function fmpGet<T>(path: string): Promise<T> {
  const key = fmpApiKey();
  if (!key) throw new Error('FMP_API_KEY not configured');
  const separator = path.includes('?') ? '&' : '?';
  const res = await fetch(`https://financialmodelingprep.com/api/v3${path}${separator}apikey=${encodeURIComponent(key)}`, {
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`FMP ${path} -> status ${res.status}`);
  return res.json() as Promise<T>;
}

async function withFmpFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> {
  try {
    return await primary();
  } catch (primaryError) {
    try {
      return await fallback();
    } catch {
      throw primaryError;
    }
  }
}

// ── Types (minimal subset we display) ────────────────────────────────────────

export type IncomeStatement = {
  ticker: string; period: string; calendar_year: number;
  revenue: number | null; gross_profit: number | null;
  operating_income: number | null; net_income: number | null;
  eps_diluted: number | null;
};
export type CashFlowStatement = {
  ticker: string; period: string; calendar_year: number;
  operating_cash_flow: number | null;
  capital_expenditures: number | null;
  free_cash_flow: number | null;
};
export type KeyMetrics = {
  ticker: string; period: string; calendar_year: number;
  pe_ratio: number | null; price_to_book: number | null;
  ev_to_ebitda: number | null;
  gross_profit_margin: number | null; net_profit_margin: number | null;
  return_on_equity: number | null; debt_to_equity: number | null;
};
export type SecFiling = {
  ticker: string; filing_date: string; form_type: string;
  description: string; url: string;
};
export type InsiderTransaction = {
  ticker: string; transaction_date: string;
  name: string; title: string | null;
  transaction_type: string; shares: number | null;
  price: number | null; total_value: number | null;
};

type FmpIncomeStatement = {
  symbol?: string;
  period?: string;
  calendarYear?: string | number;
  revenue?: number | null;
  grossProfit?: number | null;
  operatingIncome?: number | null;
  netIncome?: number | null;
  epsdiluted?: number | null;
  epsDiluted?: number | null;
};

type FmpCashFlowStatement = {
  symbol?: string;
  period?: string;
  calendarYear?: string | number;
  operatingCashFlow?: number | null;
  capitalExpenditure?: number | null;
  freeCashFlow?: number | null;
};

type FmpKeyMetric = {
  symbol?: string;
  period?: string;
  calendarYear?: string | number;
  peRatio?: number | null;
  pbRatio?: number | null;
  enterpriseValueOverEBITDA?: number | null;
  grossProfitMargin?: number | null;
  netProfitMargin?: number | null;
  roe?: number | null;
  debtToEquity?: number | null;
};

function year(value: string | number | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function getIncomeStatements(ticker: string, limit = 4) {
  return withFmpFallback(
    async () => {
      const d = await get<{ income_statements: IncomeStatement[] }>(
        `/financials/income-statements/?ticker=${ticker}&period=annual&limit=${limit}`
      );
      return d.income_statements ?? [];
    },
    async () => {
      const rows = await fmpGet<FmpIncomeStatement[]>(
        `/income-statement/${encodeURIComponent(ticker)}?period=annual&limit=${limit}`
      );
      return (Array.isArray(rows) ? rows : []).map((r): IncomeStatement => ({
        ticker,
        period: String(r.period ?? 'FY'),
        calendar_year: year(r.calendarYear),
        revenue: r.revenue ?? null,
        gross_profit: r.grossProfit ?? null,
        operating_income: r.operatingIncome ?? null,
        net_income: r.netIncome ?? null,
        eps_diluted: r.epsdiluted ?? r.epsDiluted ?? null,
      }));
    },
  );
}

export async function getCashFlowStatements(ticker: string, limit = 4) {
  return withFmpFallback(
    async () => {
      const d = await get<{ cash_flow_statements: CashFlowStatement[] }>(
        `/financials/cash-flow-statements/?ticker=${ticker}&period=annual&limit=${limit}`
      );
      return d.cash_flow_statements ?? [];
    },
    async () => {
      const rows = await fmpGet<FmpCashFlowStatement[]>(
        `/cash-flow-statement/${encodeURIComponent(ticker)}?period=annual&limit=${limit}`
      );
      return (Array.isArray(rows) ? rows : []).map((r): CashFlowStatement => ({
        ticker,
        period: String(r.period ?? 'FY'),
        calendar_year: year(r.calendarYear),
        operating_cash_flow: r.operatingCashFlow ?? null,
        capital_expenditures: r.capitalExpenditure ?? null,
        free_cash_flow: r.freeCashFlow ?? null,
      }));
    },
  );
}

export async function getKeyMetrics(ticker: string, limit = 4) {
  return withFmpFallback(
    async () => {
      const d = await get<{ key_metrics: KeyMetrics[] }>(
        `/financials/key-metrics/?ticker=${ticker}&period=annual&limit=${limit}`
      );
      return d.key_metrics ?? [];
    },
    async () => {
      const rows = await fmpGet<FmpKeyMetric[]>(
        `/key-metrics/${encodeURIComponent(ticker)}?period=annual&limit=${limit}`
      );
      return (Array.isArray(rows) ? rows : []).map((r): KeyMetrics => ({
        ticker,
        period: String(r.period ?? 'FY'),
        calendar_year: year(r.calendarYear),
        pe_ratio: r.peRatio ?? null,
        price_to_book: r.pbRatio ?? null,
        ev_to_ebitda: r.enterpriseValueOverEBITDA ?? null,
        gross_profit_margin: r.grossProfitMargin ?? null,
        net_profit_margin: r.netProfitMargin ?? null,
        return_on_equity: r.roe ?? null,
        debt_to_equity: r.debtToEquity ?? null,
      }));
    },
  );
}

export async function getFilings(ticker: string, formType?: string, limit = 5) {
  const typeParam = formType ? `&form_type=${formType}` : '';
  const d = await get<{ filings: SecFiling[] }>(
    `/filings/?ticker=${ticker}${typeParam}&limit=${limit}`
  );
  return d.filings ?? [];
}

export async function getInsiderTransactions(ticker: string, limit = 10) {
  const d = await get<{ insider_transactions: InsiderTransaction[] }>(
    `/insider-transactions/?ticker=${ticker}&limit=${limit}`
  );
  return d.insider_transactions ?? [];
}
