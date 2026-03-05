import type { ModelInputs } from '@/src/core/contracts/modelInputs';
import type { ValidationResult } from '@/src/core/contracts/modelOutputs';
import { issue } from '@/src/core/engine/errors';

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const sanitizeNumber = (value: unknown, fallback: number, min?: number, max?: number): number => {
  const base = isFiniteNumber(value) ? value : fallback;
  const boundedMin = typeof min === 'number' ? Math.max(base, min) : base;
  return typeof max === 'number' ? Math.min(boundedMin, max) : boundedMin;
};

const sanitizePositive = (value: unknown): number | undefined => {
  if (!isFiniteNumber(value) || value <= 0) return undefined;
  return value;
};

const sanitizeSeries = (values: unknown, fallback: number[]): number[] => {
  if (!Array.isArray(values)) return [...fallback];
  const clean = values.filter((value) => isFiniteNumber(value)).map((value) => value as number);
  return clean.length > 0 ? clean : [...fallback];
};

export function validateAndSanitizeInputs(
  raw: ModelInputs,
  options?: { templateId?: string }
): ValidationResult {
  const warnings: string[] = [];
  const issues = [] as ValidationResult['issues'];

  if (!raw || typeof raw !== 'object') {
    issues.push(issue('model_inputs_missing', 'Model inputs are required.', 'error', 'modelInputs'));
    return { ok: false, warnings, issues };
  }

  const revenue = sanitizeSeries(raw.historicals?.revenue, [1_000]);
  if (!Array.isArray(raw.historicals?.revenue) || raw.historicals?.revenue.length === 0) {
    warnings.push('Revenue history missing. Injected deterministic fallback revenue series.');
  }
  if (!revenue.some((value) => value > 0)) {
    issues.push(issue('revenue_invalid', 'At least one positive revenue value is required.', 'error', 'historicals.revenue'));
  }

  const projectionYears = sanitizeNumber(raw.assumptions?.projectionYears, 5, 3, 10);
  const growthDefault = sanitizeNumber(raw.assumptions?.growth, 0.08, -0.95, 3);
  const marginDefault = sanitizeNumber(raw.assumptions?.margins, 0.2, -0.7, 0.9);

  const safe: ModelInputs = {
    company: {
      name: String(raw.company?.name || '').trim() || 'Private Company',
      currency: String(raw.company?.currency || 'USD').trim() || 'USD',
      ticker: raw.company?.ticker ? String(raw.company.ticker).trim().toUpperCase() : undefined,
    },
    historicals: {
      years:
        Array.isArray(raw.historicals?.years) && raw.historicals?.years.length === revenue.length
          ? raw.historicals.years.filter((year): year is number => Number.isInteger(year))
          : undefined,
      revenue,
      ebit: sanitizeSeries(raw.historicals?.ebit, []),
      ebitMargin: sanitizeSeries(raw.historicals?.ebitMargin, []),
      fcf: sanitizeSeries(raw.historicals?.fcf, []),
    },
    assumptions: {
      growth: Array.isArray(raw.assumptions?.growth)
        ? sanitizeSeries(raw.assumptions?.growth, Array.from({ length: projectionYears }, () => growthDefault)).map(
            (value) => sanitizeNumber(value, growthDefault, -0.95, 3)
          )
        : growthDefault,
      margins: Array.isArray(raw.assumptions?.margins)
        ? sanitizeSeries(raw.assumptions?.margins, Array.from({ length: projectionYears }, () => marginDefault)).map(
            (value) => sanitizeNumber(value, marginDefault, -0.7, 0.9)
          )
        : marginDefault,
      taxRate: sanitizeNumber(raw.assumptions?.taxRate, 0.25, 0, 0.6),
      capexPct: sanitizeNumber(raw.assumptions?.capexPct, 0.04, -1, 1),
      nwcPct: sanitizeNumber(raw.assumptions?.nwcPct, 0.02, -1, 1),
      daPct: sanitizeNumber(raw.assumptions?.daPct, 0.04, -1, 1),
      wacc: sanitizeNumber(raw.assumptions?.wacc, 0.1, 0.04, 0.3),
      terminalGrowth: sanitizeNumber(raw.assumptions?.terminalGrowth, 0.025, -0.02, 0.08),
      terminalMultiple: raw.assumptions?.terminalMultiple,
      projectionYears,
    },
    capitalStructure: {
      netDebt: isFiniteNumber(raw.capitalStructure?.netDebt) ? raw.capitalStructure?.netDebt : 0,
      sharesOutstanding: sanitizePositive(raw.capitalStructure?.sharesOutstanding),
    },
    pricingAnchor: {
      marketCap: sanitizePositive(raw.pricingAnchor?.marketCap),
      sharePrice: sanitizePositive(raw.pricingAnchor?.sharePrice),
      sharesOutstanding: sanitizePositive(raw.pricingAnchor?.sharesOutstanding),
    },
    metadata: {
      source: raw.metadata?.source === 'manual' ? 'manual' : 'ticker',
      asOfDate:
        typeof raw.metadata?.asOfDate === 'string' && raw.metadata.asOfDate.trim().length > 0
          ? raw.metadata.asOfDate
          : new Date().toISOString().slice(0, 10),
      scenarioId: raw.metadata?.scenarioId,
      liveDataFallback: raw.metadata?.liveDataFallback === true,
      liveDataStatus: raw.metadata?.liveDataStatus,
    },
  };

  if (options?.templateId === 'reverse-dcf') {
    const hasMarketCap = !!safe.pricingAnchor?.marketCap;
    const shares = safe.pricingAnchor?.sharesOutstanding ?? safe.capitalStructure?.sharesOutstanding;
    const hasShareAnchor = !!safe.pricingAnchor?.sharePrice && !!shares;
    if (!hasMarketCap && !hasShareAnchor) {
      issues.push(
        issue(
          'reverse_dcf_anchor_missing',
          'Reverse DCF requires market cap OR share price + shares outstanding.',
          'error',
          'pricingAnchor'
        )
      );
    }
  }

  if ((safe.assumptions.wacc ?? 0.1) <= (safe.assumptions.terminalGrowth ?? 0.025)) {
    issues.push(
      issue(
        'wacc_terminal_invalid',
        'WACC must be greater than terminal growth for stable valuation math.',
        'error',
        'assumptions.wacc'
      )
    );
  }

  return {
    ok: issues.length === 0,
    value: safe,
    warnings,
    issues,
  };
}
