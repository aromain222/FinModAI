import type { DebtCapacityLiteModelInputs } from '@/lib/model-generator/extractInputs';
import { calculateDebtCapacityPreview } from '@/lib/model-generator/debtCapacitySummary';
import { generateDebtCapacityLiteWorkbook } from '@/lib/models/debtCapacityLite/excel';

export function getPreview(inputs: DebtCapacityLiteModelInputs) {
  return {
    title: `${inputs.companyName} Debt Capacity`,
    tabs: ['Debt Capacity'],
  };
}

export async function buildWorkbook(inputs: DebtCapacityLiteModelInputs) {
  const summary = calculateDebtCapacityPreview(inputs);
  if (!summary) {
    throw new Error('Debt Capacity Lite requires positive EBITDA.');
  }

  return generateDebtCapacityLiteWorkbook({
    ticker: inputs.ticker || inputs.companyName.slice(0, 5).toUpperCase(),
    summary,
  });
}
