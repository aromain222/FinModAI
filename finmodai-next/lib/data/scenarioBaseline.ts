import { getSupabaseServerClient } from '@/lib/supabaseClient';

export type ScenarioBaseline = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  revenue_ltm: number;
  ebitda_ltm: number;
  net_income_ltm: number;
  cash: number;
  total_debt: number;
  shares_outstanding: number;
  ebitda_margin: number;
  net_margin: number;
  net_debt: number;
};

export type ScenarioBaselineErrorCode =
  | 'SUPABASE_NOT_CONFIGURED'
  | 'NOT_FOUND'
  | 'MISSING_REQUIRED_FIELD'
  | 'QUERY_FAILED';

export class ScenarioBaselineError extends Error {
  code: ScenarioBaselineErrorCode;
  detail?: string;
  constructor(code: ScenarioBaselineErrorCode, message: string, detail?: string) {
    super(message);
    this.name = 'ScenarioBaselineError';
    this.code = code;
    this.detail = detail;
  }
}

type DemoSnapshotRow = {
  ticker: string;
  company_name: string | null;
  sector: string | null;
  revenue_ltm: number | null;
  ebitda_ltm: number | null;
  net_income_ltm: number | null;
  cash: number | null;
  total_debt: number | null;
  shares_outstanding: number | null;
};

function requireNumber(field: string, value: number | null): number {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    throw new ScenarioBaselineError(
      'MISSING_REQUIRED_FIELD',
      `Required field missing: ${field}`,
      field
    );
  }
  return value;
}

export async function loadScenarioBaseline(tickerRaw: string): Promise<ScenarioBaseline> {
  const supabase = getSupabaseServerClient();
  if (!supabase) {
    throw new ScenarioBaselineError(
      'SUPABASE_NOT_CONFIGURED',
      'Supabase server client is not configured.'
    );
  }

  const ticker = tickerRaw.trim().toUpperCase();
  if (!ticker) {
    throw new ScenarioBaselineError('NOT_FOUND', 'Ticker is required.');
  }

  const { data, error } = await supabase
    .from('demo_company_snapshots')
    .select('ticker, company_name, sector, revenue_ltm, ebitda_ltm, net_income_ltm, cash, total_debt, shares_outstanding')
    .eq('ticker', ticker)
    .maybeSingle();

  if (error) {
    throw new ScenarioBaselineError('QUERY_FAILED', 'Scenario baseline query failed.', error.message);
  }
  if (!data) {
    throw new ScenarioBaselineError('NOT_FOUND', `Ticker not found in demo_company_snapshots: ${ticker}`);
  }

  const row = data as DemoSnapshotRow;
  const revenue_ltm = requireNumber('revenue_ltm', row.revenue_ltm);
  const ebitda_ltm = requireNumber('ebitda_ltm', row.ebitda_ltm);
  const net_income_ltm = requireNumber('net_income_ltm', row.net_income_ltm);
  const cash = requireNumber('cash', row.cash);
  const total_debt = requireNumber('total_debt', row.total_debt);
  const shares_outstanding = requireNumber('shares_outstanding', row.shares_outstanding);

  if (revenue_ltm === 0) {
    throw new ScenarioBaselineError(
      'MISSING_REQUIRED_FIELD',
      'revenue_ltm must be non-zero to compute margins',
      'revenue_ltm'
    );
  }

  const ebitda_margin = ebitda_ltm / revenue_ltm;
  const net_margin = net_income_ltm / revenue_ltm;
  const net_debt = total_debt - cash;

  return {
    ticker: row.ticker,
    company_name: row.company_name ?? null,
    sector: row.sector ?? null,
    revenue_ltm,
    ebitda_ltm,
    net_income_ltm,
    cash,
    total_debt,
    shares_outstanding,
    ebitda_margin,
    net_margin,
    net_debt,
  };
}

