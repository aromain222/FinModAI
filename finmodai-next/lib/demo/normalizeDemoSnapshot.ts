import { coerceToMillions } from '@/lib/models/shared/unitNormalization';

type RawDemoSnapshot = Record<string, any>;

export type NormalizedDemoFundamentals = {
  ticker: string;
  companyName: string;
  sector: string | null;
  currency: 'USD';
  units: 'millions';
  revenueLtm: number;
  revenueSeries: number[];
  sharesOutstanding: number; // in millions of shares
  netIncomeLtm: number;
  ebitdaLtm: number;
  cash: number;
  totalDebt: number;
  source: 'demo_snapshots';
  provenance: Record<string, string>;
};

type ParsedNumber = {
  value: number;
  usedSuffix: boolean;
};

const NUM_SUFFIX_RE = /^-?\d+(\.\d+)?([a-zA-Z]+)?$/;

const pickFirst = (row: RawDemoSnapshot, keys: string[]): unknown => {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
  }
  return null;
};

const parseNumeric = (value: unknown): ParsedNumber | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return { value, usedSuffix: false };
  }
  if (typeof value !== 'string') return null;

  let cleaned = value.trim();
  if (!cleaned) return null;

  cleaned = cleaned.replace(/[$,\s]/g, '');

  let negative = false;
  if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
    negative = true;
    cleaned = cleaned.slice(1, -1);
  }

  const match = cleaned.match(NUM_SUFFIX_RE);
  if (!match) return null;

  const numericPart = match[0].replace(/[a-zA-Z]+$/g, '');
  const suffix = cleaned.slice(numericPart.length).toUpperCase();
  const base = Number(numericPart);
  if (!Number.isFinite(base)) return null;

  let multiplier = 1;
  if (suffix.startsWith('T')) multiplier = 1e12;
  else if (suffix.startsWith('B')) multiplier = 1e9;
  else if (suffix.startsWith('M')) multiplier = 1e6;
  else if (suffix.startsWith('K')) multiplier = 1e3;

  const signed = (negative ? -1 : 1) * base * multiplier;
  return { value: signed, usedSuffix: suffix.length > 0 };
};

const toMillions = (value: unknown, referenceMillions?: number | null): number | null => {
  const parsed = parseNumeric(value);
  if (!parsed) return null;
  if (parsed.usedSuffix) {
    return parsed.value / 1_000_000;
  }
  return coerceToMillions(parsed.value, {
    unitHint: 'auto',
    referenceMillions: referenceMillions ?? null,
  });
};

const toNumber = (value: unknown): number | null => {
  const parsed = parseNumeric(value);
  if (!parsed) return null;
  return parsed.value;
};

export function normalizeDemoSnapshot(row: RawDemoSnapshot): NormalizedDemoFundamentals {
  const ticker = String(row.ticker ?? row.symbol ?? '').toUpperCase();
  const companyName =
    (row.company_name ?? row.companyName ?? row.name ?? row.company ?? null) || ticker;
  const sector = (row.sector ?? row.industry ?? null) as string | null;

  const revenueRaw = pickFirst(row, ['revenue_ltm', 'revenueLtm', 'ltm_revenue', 'revenueLTM', 'revenue', 'ltmRevenue']);
  const revenueLtm = toMillions(revenueRaw) ?? 0;
  const baseRevenue = revenueLtm;

  const ebitdaRaw = pickFirst(row, ['ebitda_ltm', 'ebitdaLtm', 'ltm_ebitda', 'ebitdaLTM', 'ebitda']);
  const netIncomeRaw = pickFirst(row, ['net_income_ltm', 'netIncomeLtm', 'ltm_net_income', 'netIncomeLTM', 'net_income', 'netIncome']);
  const cashRaw = pickFirst(row, ['cash', 'cash_equivalents', 'cashAndEquivalents']);
  const totalDebtRaw = pickFirst(row, ['total_debt', 'totalDebt', 'debt']);
  const sharesRaw = pickFirst(row, ['shares_outstanding', 'sharesOutstanding', 'shares']);

  const ebitdaLtm = toMillions(ebitdaRaw, baseRevenue) ?? 0;
  const netIncomeLtm = toMillions(netIncomeRaw, baseRevenue) ?? 0;
  const cash = toMillions(cashRaw, baseRevenue) ?? 0;
  const totalDebt = toMillions(totalDebtRaw, baseRevenue) ?? 0;
  const sharesOutstanding = toMillions(sharesRaw) ?? 0;

  const revenueSeries = Array(5).fill(baseRevenue);

  const normalized: NormalizedDemoFundamentals = {
    ticker,
    companyName,
    sector,
    currency: 'USD',
    units: 'millions',
    revenueLtm: baseRevenue,
    revenueSeries,
    sharesOutstanding,
    netIncomeLtm,
    ebitdaLtm,
    cash,
    totalDebt,
    source: 'demo_snapshots',
    provenance: {
      revenueLtm: 'demo_snapshots',
      ebitdaLtm: 'demo_snapshots',
      netIncomeLtm: 'demo_snapshots',
      cash: 'demo_snapshots',
      totalDebt: 'demo_snapshots',
      sharesOutstanding: 'demo_snapshots',
    },
  };

  console.log('[DEMO] fundamentals normalized', {
    ticker: normalized.ticker,
    revenueLtm: normalized.revenueLtm,
    cash: normalized.cash,
    totalDebt: normalized.totalDebt,
    sharesOutstanding: normalized.sharesOutstanding,
    units: normalized.units,
  });

  return normalized;
}

export function normalizeDemoQuote(row: RawDemoSnapshot, fundamentals?: NormalizedDemoFundamentals) {
  const ticker = (fundamentals?.ticker ?? row.ticker ?? row.symbol ?? '').toUpperCase();
  const priceRaw = pickFirst(row, ['share_price', 'sharePrice', 'price', 'last_price', 'lastPrice']);
  const marketCapRaw = pickFirst(row, ['market_cap', 'marketCap', 'market_capitalization', 'mktCap']);
  const sharesRaw = pickFirst(row, ['shares_outstanding', 'sharesOutstanding', 'shares']);

  const price = toNumber(priceRaw);
  const sharesOutstanding = fundamentals?.sharesOutstanding ?? toMillions(sharesRaw);
  const marketCap =
    toMillions(marketCapRaw, fundamentals?.revenueLtm ?? null) ??
    (price && sharesOutstanding ? price * sharesOutstanding : null);

  return {
    ticker,
    price: typeof price === 'number' && Number.isFinite(price) ? price : null,
    asOf: (row.updated_at ?? row.updatedAt ?? null) as string | null,
    currency: 'USD',
    marketCap: typeof marketCap === 'number' && Number.isFinite(marketCap) ? marketCap : null,
    sharesOutstanding: typeof sharesOutstanding === 'number' && Number.isFinite(sharesOutstanding) ? sharesOutstanding : null,
    provenance: {
      price: 'demo_snapshots',
      marketCap: marketCapRaw ? 'demo_snapshots' : 'demo_derived',
      sharesOutstanding: 'demo_snapshots',
    },
    source: 'demo_snapshots',
    units: 'millions',
  };
}
