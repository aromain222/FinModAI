import { NextRequest, NextResponse } from 'next/server';

export const dynamic    = 'force-dynamic';
export const runtime    = 'nodejs';
export const revalidate = 0;

const FMP = 'https://financialmodelingprep.com/api/v3';

function fmpKey(): string {
  return process.env.FMP_API_KEY ?? '';
}

async function fmpGet<T>(path: string): Promise<T> {
  const key = fmpKey();
  const sep = path.includes('?') ? '&' : '?';
  const url = `${FMP}${path}${key ? `${sep}apikey=${key}` : ''}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'CapitalBase/1.0' },
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`FMP ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// Mapped to same shape as dexter/client types so DexterPanel works unchanged

type IncomeStatement = {
  ticker: string; period: string; calendar_year: number;
  revenue: number | null; gross_profit: number | null;
  operating_income: number | null; net_income: number | null;
  eps_diluted: number | null;
};

type CashFlowStatement = {
  ticker: string; period: string; calendar_year: number;
  operating_cash_flow: number | null;
  capital_expenditures: number | null;
  free_cash_flow: number | null;
};

type KeyMetrics = {
  ticker: string; period: string; calendar_year: number;
  pe_ratio: number | null; price_to_book: number | null;
  ev_to_ebitda: number | null;
  gross_profit_margin: number | null; net_profit_margin: number | null;
  return_on_equity: number | null; debt_to_equity: number | null;
};

type SecFiling = {
  ticker: string; filing_date: string; form_type: string;
  description: string; url: string;
};

type InsiderTransaction = {
  ticker: string; transaction_date: string;
  name: string; title: string | null;
  transaction_type: string; shares: number | null;
  price: number | null; total_value: number | null;
};

// FMP raw response shapes
type FmpIncome = Record<string, unknown>;
type FmpCashFlow = Record<string, unknown>;
type FmpMetrics = Record<string, unknown>;
type FmpFiling = { filingDate?: string; type?: string; description?: string; link?: string };
type FmpInsider = { transactionDate?: string; reportingName?: string; typeOfOwner?: string; transactionType?: string; securitiesTransacted?: number; price?: number; value?: number };

function num(v: unknown): number | null {
  return typeof v === 'number' && isFinite(v) ? v : null;
}
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

async function getIncomeStatements(ticker: string, limit: number): Promise<IncomeStatement[]> {
  const rows = await fmpGet<FmpIncome[]>(`/income-statement/${ticker}?period=annual&limit=${limit}`);
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    ticker,
    period: str(r.period),
    calendar_year: typeof r.calendarYear === 'number' ? r.calendarYear : Number(r.calendarYear ?? 0),
    revenue: num(r.revenue),
    gross_profit: num(r.grossProfit),
    operating_income: num(r.operatingIncome),
    net_income: num(r.netIncome),
    eps_diluted: num(r.epsdiluted),
  }));
}

async function getCashFlowStatements(ticker: string, limit: number): Promise<CashFlowStatement[]> {
  const rows = await fmpGet<FmpCashFlow[]>(`/cash-flow-statement/${ticker}?period=annual&limit=${limit}`);
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    ticker,
    period: str(r.period),
    calendar_year: typeof r.calendarYear === 'number' ? r.calendarYear : Number(r.calendarYear ?? 0),
    operating_cash_flow: num(r.operatingCashFlow),
    capital_expenditures: num(r.capitalExpenditure),
    free_cash_flow: num(r.freeCashFlow),
  }));
}

async function getKeyMetrics(ticker: string, limit: number): Promise<KeyMetrics[]> {
  const [metricsRaw, ratiosRaw] = await Promise.all([
    fmpGet<FmpMetrics[]>(`/key-metrics/${ticker}?period=annual&limit=${limit}`),
    fmpGet<FmpMetrics[]>(`/ratios/${ticker}?period=annual&limit=${limit}`),
  ]);
  const metrics = Array.isArray(metricsRaw) ? metricsRaw : [];
  const ratios  = Array.isArray(ratiosRaw)  ? ratiosRaw  : [];
  return metrics.map((m, i) => {
    const r = ratios[i] ?? {};
    return {
      ticker,
      period: str(m.period),
      calendar_year: typeof m.calendarYear === 'number' ? m.calendarYear : Number(m.calendarYear ?? 0),
      pe_ratio: num(r.priceEarningsRatio ?? m.peRatio),
      price_to_book: num(r.priceToBookRatio ?? m.pbRatio),
      ev_to_ebitda: num(m.enterpriseValueOverEBITDA),
      gross_profit_margin: num(r.grossProfitMargin),
      net_profit_margin: num(r.netProfitMargin),
      return_on_equity: num(r.returnOnEquity),
      debt_to_equity: num(r.debtEquityRatio),
    };
  });
}

async function getFilings(ticker: string, formType: string | undefined, limit: number): Promise<SecFiling[]> {
  const typeParam = formType ? `&type=${formType}` : '';
  const rows = await fmpGet<FmpFiling[]>(`/sec_filings/${ticker}?limit=${limit}${typeParam}`);
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    ticker,
    filing_date: r.filingDate ?? '',
    form_type: r.type ?? '',
    description: r.description ?? r.type ?? '',
    url: r.link ?? '',
  }));
}

async function getInsiderTransactions(ticker: string, limit: number): Promise<InsiderTransaction[]> {
  const rows = await fmpGet<FmpInsider[]>(`/insider-trading?symbol=${ticker}&limit=${limit}`);
  if (!Array.isArray(rows)) return [];
  return rows.map(r => ({
    ticker,
    transaction_date: r.transactionDate ?? '',
    name: r.reportingName ?? '',
    title: r.typeOfOwner ?? null,
    transaction_type: r.transactionType ?? '',
    shares: typeof r.securitiesTransacted === 'number' ? r.securitiesTransacted : null,
    price: typeof r.price === 'number' ? r.price : null,
    total_value: typeof r.value === 'number' ? r.value : null,
  }));
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const action = searchParams.get('action');
  const ticker = searchParams.get('ticker')?.toUpperCase();
  const limit  = Math.min(Number(searchParams.get('limit') ?? '4'), 12);

  if (!ticker) return NextResponse.json({ error: 'ticker required' }, { status: 400 });

  try {
    switch (action) {
      case 'income':
        return NextResponse.json(await getIncomeStatements(ticker, limit));
      case 'cashflow':
        return NextResponse.json(await getCashFlowStatements(ticker, limit));
      case 'metrics':
        return NextResponse.json(await getKeyMetrics(ticker, limit));
      case 'filings': {
        const formType = searchParams.get('form_type') ?? undefined;
        return NextResponse.json(await getFilings(ticker, formType, limit));
      }
      case 'insider':
        return NextResponse.json(await getInsiderTransactions(ticker, limit));
      case 'overview': {
        const [income, cashflow, metrics, filings, insider] = await Promise.allSettled([
          getIncomeStatements(ticker, 4),
          getCashFlowStatements(ticker, 4),
          getKeyMetrics(ticker, 4),
          getFilings(ticker, undefined, 6),
          getInsiderTransactions(ticker, 8),
        ]);
        return NextResponse.json({
          income:   income.status   === 'fulfilled' ? income.value   : [],
          cashflow: cashflow.status === 'fulfilled' ? cashflow.value : [],
          metrics:  metrics.status  === 'fulfilled' ? metrics.value  : [],
          filings:  filings.status  === 'fulfilled' ? filings.value  : [],
          insider:  insider.status  === 'fulfilled' ? insider.value  : [],
        });
      }
      default:
        return NextResponse.json({ error: 'invalid action' }, { status: 400 });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
