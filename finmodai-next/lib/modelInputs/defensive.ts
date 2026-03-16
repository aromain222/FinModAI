import type { ModelInputs } from '@/types/modelInputs';

export const LIVE_DATA_FALLBACK_NOTICE =
  'Live market pull unavailable — using cached company data and fallback assumptions where needed.';

type ValidationCode = 'required' | 'invalid';

export type ModelInputValidationIssue = {
  field: string;
  code: ValidationCode;
  message: string;
};

export type NormalizeModelInputsResult = {
  ok: boolean;
  value?: ModelInputs;
  warnings: string[];
  issues: ModelInputValidationIssue[];
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const normalizeRatioLike = (value: unknown, fallback: number): number => {
  const base = isFiniteNumber(value) ? value : fallback;
  if (!isFiniteNumber(base)) return fallback;
  return Math.abs(base) > 1 ? base / 100 : base;
};

const sanitizeNumber = (
  value: unknown,
  fallback: number,
  min?: number,
  max?: number
): number => {
  const base = isFiniteNumber(value) ? value : fallback;
  if (!isFiniteNumber(base)) return fallback;
  if (typeof min === 'number' && base < min) return min;
  if (typeof max === 'number' && base > max) return max;
  return base;
};

const sanitizePositive = (value: unknown): number | undefined => {
  if (!isFiniteNumber(value) || value <= 0) return undefined;
  return value;
};

export const safeDivide = (numerator: unknown, denominator: unknown, fallback = 0): number => {
  if (!isFiniteNumber(numerator) || !isFiniteNumber(denominator) || denominator === 0) return fallback;
  return numerator / denominator;
};

export function normalizeModelInputs(
  raw: ModelInputs | null | undefined,
  options?: { modelType?: string }
): NormalizeModelInputsResult {
  const warnings: string[] = [];
  const issues: ModelInputValidationIssue[] = [];

  if (!raw || typeof raw !== 'object') {
    issues.push({
      field: 'modelInputs',
      code: 'required',
      message: 'Model inputs are required.',
    });
    return { ok: false, warnings, issues };
  }

  const revenue = Array.isArray(raw.historicals?.revenue)
    ? raw.historicals.revenue.filter((value) => isFiniteNumber(value) && value > 0)
    : [];

  if (revenue.length === 0) {
    issues.push({
      field: 'historicals.revenue',
      code: 'required',
      message: 'At least one positive revenue value is required.',
    });
  }

  const normalizedRevenue = revenue.length > 0 ? revenue : [1_000];
  if (revenue.length === 0) {
    warnings.push('Revenue history was missing; fallback revenue series was injected.');
  }

  const currentYear = new Date().getUTCFullYear();
  const years =
    Array.isArray(raw.historicals?.years) &&
    raw.historicals.years.length === normalizedRevenue.length &&
    raw.historicals.years.every((value) => Number.isInteger(value))
      ? raw.historicals.years
      : Array.from({ length: normalizedRevenue.length }, (_, idx) => currentYear - normalizedRevenue.length + idx);

  const growth = sanitizeNumber(normalizeRatioLike(raw.assumptions?.growth, 0.08), 0.08, -0.95, 3);
  const margin = sanitizeNumber(normalizeRatioLike(raw.assumptions?.margin, 0.2), 0.2, -0.5, 0.9);
  const taxRate = sanitizeNumber(normalizeRatioLike(raw.assumptions?.taxRate, 0.25), 0.25, 0, 0.6);
  const capexPctRevenue = sanitizeNumber(normalizeRatioLike(raw.assumptions?.capexPctRevenue, 0.04), 0.04, -1, 1);
  const nwcPctRevenue = sanitizeNumber(normalizeRatioLike(raw.assumptions?.nwcPctRevenue, 0.02), 0.02, -1, 1);
  const daPctRevenue =
    raw.assumptions?.daPctRevenue === undefined
      ? undefined
      : sanitizeNumber(normalizeRatioLike(raw.assumptions.daPctRevenue, 0.04), 0.04, -1, 1);

  const growthSeries =
    Array.isArray(raw.assumptions?.growthSeries) && raw.assumptions.growthSeries.length > 0
      ? raw.assumptions.growthSeries.map((value) => sanitizeNumber(normalizeRatioLike(value, growth), growth, -0.95, 3))
      : Array.from({ length: 5 }, () => growth);

  const forecastRevenue =
    Array.isArray(raw.assumptions?.forecastRevenue) && raw.assumptions.forecastRevenue.length > 0
      ? raw.assumptions.forecastRevenue.filter((value) => isFiniteNumber(value) && value > 0)
      : undefined;

  const pricingAnchor = {
    marketCap: sanitizePositive(raw.pricingAnchor?.marketCap),
    sharePrice: sanitizePositive(raw.pricingAnchor?.sharePrice),
    sharesOutstanding: sanitizePositive(raw.pricingAnchor?.sharesOutstanding),
  };

  if (options?.modelType === 'reverse-dcf') {
    const hasMarketCap = !!pricingAnchor.marketCap;
    const hasSharePair = !!pricingAnchor.sharePrice && !!pricingAnchor.sharesOutstanding;
    if (!hasMarketCap && !hasSharePair) {
      issues.push({
        field: 'pricingAnchor',
        code: 'required',
        message: 'Reverse DCF requires market cap OR share price + shares outstanding.',
      });
    }
  }

  const value: ModelInputs = {
    company: {
      name: String(raw.company?.name || '').trim() || 'Private Company',
      currency: String(raw.company?.currency || 'USD').trim() || 'USD',
      ticker: raw.company?.ticker ? String(raw.company.ticker).trim().toUpperCase() : undefined,
    },
    historicals: {
      revenue: normalizedRevenue,
      years,
    },
    assumptions: {
      growth,
      margin,
      taxRate,
      capexPctRevenue,
      nwcPctRevenue,
      daPctRevenue,
      growthSeries,
      forecastRevenue,
    },
    capitalStructure: {
      netDebt: isFiniteNumber(raw.capitalStructure?.netDebt) ? raw.capitalStructure?.netDebt : undefined,
      sharesOutstanding: sanitizePositive(raw.capitalStructure?.sharesOutstanding),
    },
    pricingAnchor,
    metadata: {
      source: raw.metadata?.source === 'manual' ? 'manual' : 'ticker',
      asOfDate:
        typeof raw.metadata?.asOfDate === 'string' && raw.metadata.asOfDate.trim().length > 0
          ? raw.metadata.asOfDate
          : new Date().toISOString().slice(0, 10),
      liveDataFallback: raw.metadata?.liveDataFallback === true,
      liveDataStatus: raw.metadata?.liveDataStatus || undefined,
    },
  };

  return {
    ok: issues.length === 0,
    value,
    warnings,
    issues,
  };
}
