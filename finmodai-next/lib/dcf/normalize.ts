import type { DcfAssumptions, QualityTier, UnitsSpec } from '@/types/dcfContracts';
import { DEFAULT_UNITS_SPEC } from '@/types/dcfContracts';

const MEGACAP_TICKERS = new Set(['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'NVDA', 'TSLA']);
const RAW_DOLLAR_THRESHOLD = 100_000_000;
const RAW_SHARES_THRESHOLD = 1_000_000;

function parseNumber(value: any): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,\s%]/g, '');
    const parsed = Number(cleaned);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  throw new Error(`Unable to parse numeric value: ${value}`);
}

function normalizePercent(value: any, label: string): number {
  const numeric = parseNumber(value);
  if (Math.abs(numeric) > 1 && Math.abs(numeric) <= 100) {
    return numeric / 100;
  }
  return numeric;
}

function normalizeMoney(value: any): { amount: number; note?: string } {
  const numeric = parseNumber(value);
  if (Math.abs(numeric) >= RAW_DOLLAR_THRESHOLD) {
    return { amount: numeric / 1_000_000, note: 'converted from raw dollars' };
  }
  return { amount: numeric, note: undefined };
}

function normalizeShares(value: any): { amount: number; note?: string } {
  const numeric = parseNumber(value);
  if (Math.abs(numeric) >= RAW_SHARES_THRESHOLD) {
    return { amount: numeric / 1_000_000, note: 'converted from raw shares' };
  }
  return { amount: numeric, note: undefined };
}

export function scaleSanityCheck(ticker: string, revenueBase: number, tier: QualityTier): string[] {
  const notes: string[] = [];
  if (tier === 'institutional' && MEGACAP_TICKERS.has(ticker) && revenueBase < 10_000) {
    notes.push(
      'Mega-cap assumption detected: revenue base below $10B in USD millions for institutional tier.'
    );
  }
  return notes;
}

export function normalizeDcfAssumptions(
  raw: Record<string, any>,
  ticker: string,
  tier: QualityTier
): { assumptions: DcfAssumptions; units: UnitsSpec; notes: string[] } {
  const notes: string[] = [];
  const yearsRaw = raw.years || raw.projectionYears;
  if (!Array.isArray(yearsRaw) || yearsRaw.length === 0) {
    throw new Error('Forecast years are required for DCF assumptions');
  }
  const years = yearsRaw.map((yr) => Number(yr));
  if (years.some((yr) => !Number.isFinite(yr))) {
    throw new Error('Forecast years must be numeric');
  }

  const revenueSeries = raw.revenueByYear || raw.revenue;
  if (!Array.isArray(revenueSeries) || revenueSeries.length !== years.length) {
    throw new Error('Revenue series must align with projection years');
  }

  const netDebtRaw = raw.netDebtMillions ?? raw.netDebt;
  const { amount: netDebt, note: netDebtNote } = normalizeMoney(netDebtRaw);
  if (netDebtNote) notes.push(`Net debt ${netDebtNote}`);
  const sharesRaw = raw.sharesOutstandingMillions ?? raw.sharesOutstanding;
  const { amount: shares, note: sharesNote } = normalizeShares(sharesRaw);
  if (sharesNote) notes.push(`Shares ${sharesNote}`);

  const revenueByYear = revenueSeries.map((value, idx) => {
    const { amount, note } = normalizeMoney(value);
    if (note) {
      notes.push(`Revenue[${idx}] ${note}`);
    }
    return amount;
  });

  const scaleWarnings = scaleSanityCheck(ticker, revenueByYear[0], tier);
  notes.push(...scaleWarnings);

  console.log('[DCFNORMALIZE]', {
    ticker,
    rawRevenue: revenueSeries,
    normalizedRevenue: revenueByYear,
    netDebtRaw,
    netDebtMillions: netDebt,
    sharesRaw,
    sharesMillions: shares,
  });

  const assumptions: DcfAssumptions = {
    ticker,
    companyName: raw.companyName || raw.company_name || undefined,
    qualityTier: tier,
    years,
    revenueByYear,
    ebitMargin: normalizePercent(raw.ebitMargin ?? raw.ebitdaMargin ?? raw.opexMargin, 'EBIT margin'),
    taxRate: normalizePercent(raw.taxRate, 'Tax rate'),
    daPercentOfRevenue: normalizePercent(raw.daPercentOfRevenue ?? raw.daPct, 'D&A %'),
    changeInWCPercentOfRevenue: normalizePercent(
      raw.changeInWCPercentOfRevenue ?? raw.workingCapitalPct,
      'ΔWC %'
    ),
    capexPercentOfRevenue: normalizePercent(raw.capexPercentOfRevenue ?? raw.capexPctRevenue, 'Capex %'),
    wacc: normalizePercent(raw.wacc, 'WACC'),
    terminalGrowth: normalizePercent(raw.terminalGrowth ?? raw.exitGrowth ?? 0, 'Terminal growth'),
    netDebtMillions: netDebt,
    sharesOutstandingMillions: shares,
    unitNotes: notes.length > 0 ? [...notes] : undefined,
  };

  return {
    assumptions,
    units: DEFAULT_UNITS_SPEC,
    notes,
  };
}
