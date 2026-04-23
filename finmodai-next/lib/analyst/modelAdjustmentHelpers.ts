import type { AnalystGeneratedModelPayload } from '@/lib/analyst/types';

export type GeneratedModelAssumptionSnapshot = {
  revenue_growth: number | null;
  operating_margin: number | null;
  wacc: number | null;
  terminal_growth_rate: number | null;
};

export type SmartAssumptionRequestPayload = {
  company: {
    companyName: string;
    ticker: string | null;
  };
  currentAssumptions: GeneratedModelAssumptionSnapshot;
  modelType: AnalystGeneratedModelPayload['modelType'];
};

function firstNumericValue(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (Array.isArray(value)) {
    const firstNumber = value.find((item): item is number => typeof item === 'number');
    return typeof firstNumber === 'number' ? firstNumber : null;
  }
  return null;
}

export function buildCurrentAssumptionsFromGeneratedModel(
  payload: AnalystGeneratedModelPayload,
): GeneratedModelAssumptionSnapshot {
  const extracted = payload.extractedInputs as Record<string, unknown>;
  return {
    revenue_growth: firstNumericValue(extracted.revenueGrowth),
    operating_margin: firstNumericValue(extracted.ebitMargin ?? extracted.ebitdaMargin),
    wacc: typeof extracted.wacc === 'number' ? extracted.wacc : null,
    terminal_growth_rate: typeof extracted.terminalGrowth === 'number' ? extracted.terminalGrowth : null,
  };
}

export function getGeneratedModelIdentity(payload: AnalystGeneratedModelPayload): {
  companyName: string;
  ticker: string | null;
} {
  const extracted = payload.extractedInputs as Record<string, unknown>;
  const companyName =
    typeof extracted.companyName === 'string' && extracted.companyName.trim().length > 0
      ? extracted.companyName.trim()
      : payload.title;
  const ticker =
    typeof extracted.ticker === 'string' && extracted.ticker.trim().length > 0
      ? extracted.ticker.trim().toUpperCase()
      : null;
  return { companyName, ticker };
}

export function buildSmartAssumptionRequestFromGeneratedModel(
  payload: AnalystGeneratedModelPayload,
): SmartAssumptionRequestPayload {
  const { companyName, ticker } = getGeneratedModelIdentity(payload);
  return {
    company: { companyName, ticker },
    currentAssumptions: buildCurrentAssumptionsFromGeneratedModel(payload),
    modelType: payload.modelType,
  };
}

export function supportsSmartAssumptionAdjustment(payload: AnalystGeneratedModelPayload): boolean {
  const extracted = payload.extractedInputs as Record<string, unknown>;
  return (
    'revenueGrowth' in extracted ||
    'ebitMargin' in extracted ||
    'ebitdaMargin' in extracted ||
    'wacc' in extracted ||
    'terminalGrowth' in extracted
  );
}
