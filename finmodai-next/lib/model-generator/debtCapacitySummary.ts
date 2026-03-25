import { buildDebtCapacityLiteSummary } from '@/lib/models/debtCapacityLite';

type DebtCapacityPreviewInputs = {
  ebitda: number | null;
  currentNetDebt: number | null;
  maxLeverage: number;
  minInterestCoverage: number;
  interestRate: number;
};

export function calculateDebtCapacityPreview(inputs: DebtCapacityPreviewInputs) {
  if (typeof inputs.ebitda !== 'number' || !Number.isFinite(inputs.ebitda) || inputs.ebitda <= 0) {
    return null;
  }

  return buildDebtCapacityLiteSummary({
    ebitda: inputs.ebitda,
    currentNetDebt: inputs.currentNetDebt,
    inputs: {
      maxLeverage: inputs.maxLeverage,
      minInterestCoverage: inputs.minInterestCoverage,
      interestRate: inputs.interestRate,
    },
  });
}
