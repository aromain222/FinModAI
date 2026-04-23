import type { AttachmentStatementSnapshot } from '@/lib/analyst/pdfFinancialStatements';
import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import type { ExtractedModelInputs } from '@/lib/model-generator/extractInputs';

export function applyInputOverrides<T extends ExtractedModelInputs>(inputs: T, overrides: Record<string, unknown>): T {
  const merged = { ...inputs } as Record<string, unknown>;
  for (const [key, value] of Object.entries(overrides)) {
    if (!(key in merged)) continue;
    merged[key] = value;
  }
  return merged as T;
}

export function usesMillionModelUnits(modelType: ModelGeneratorType): boolean {
  return modelType === 'DCF' || modelType === 'THREE_STATEMENT' || modelType === 'LBO';
}

export function normalizeCurrencyToModelMillions(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value / 1_000_000;
}

export function normalizeSharesToModelMillions(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value / 1_000_000;
}

function attachmentFlowAnnualizationMultiplier(snapshot: AttachmentStatementSnapshot): number {
  return snapshot.periodType === 'quarter' && snapshot.annualizedFromQuarter !== true ? 4 : 1;
}

export function normalizeAttachmentStatementSnapshotForModel(
  modelType: ModelGeneratorType,
  snapshot: AttachmentStatementSnapshot | null,
): AttachmentStatementSnapshot | null {
  if (!snapshot || !usesMillionModelUnits(modelType)) return snapshot;

  const flowMultiplier = attachmentFlowAnnualizationMultiplier(snapshot);
  const normalizeFlow = (value: number | null | undefined): number | null =>
    normalizeCurrencyToModelMillions(typeof value === 'number' ? value * flowMultiplier : value);

  return {
    ...snapshot,
    annualizedFromQuarter: snapshot.annualizedFromQuarter || flowMultiplier !== 1,
    revenue: normalizeFlow(snapshot.revenue),
    grossProfit: normalizeFlow(snapshot.grossProfit),
    operatingIncome: normalizeFlow(snapshot.operatingIncome),
    ebitda: normalizeFlow(snapshot.ebitda),
    netIncome: normalizeFlow(snapshot.netIncome),
    cash: normalizeCurrencyToModelMillions(snapshot.cash),
    totalDebt: normalizeCurrencyToModelMillions(snapshot.totalDebt),
    sharesOutstanding: normalizeSharesToModelMillions(snapshot.sharesOutstanding),
    capex: normalizeFlow(snapshot.capex),
    depreciationAndAmortization: normalizeFlow(snapshot.depreciationAndAmortization),
  };
}

export function normalizeInputOverridesForModel(
  modelType: ModelGeneratorType,
  overrides: Record<string, unknown> | undefined,
  attachmentDriven: boolean,
): Record<string, unknown> | undefined {
  if (!overrides || Object.keys(overrides).length === 0) return overrides;
  if (!attachmentDriven || !usesMillionModelUnits(modelType)) return overrides;

  const next = { ...overrides };
  const currencyKeys =
    modelType === 'DCF'
      ? ['baseRevenue', 'cash', 'debt', 'marketCap']
      : modelType === 'THREE_STATEMENT'
        ? ['baseRevenue', 'cash', 'debt']
        : ['revenue', 'ebitda', 'netDebt'];

  for (const key of currencyKeys) {
    if (typeof next[key] === 'number' && Number.isFinite(next[key])) {
      next[key] = normalizeCurrencyToModelMillions(next[key] as number);
    }
  }

  if (typeof next.sharesOutstanding === 'number' && Number.isFinite(next.sharesOutstanding)) {
    next.sharesOutstanding = normalizeSharesToModelMillions(next.sharesOutstanding);
  }

  return next;
}
