import type { MergerModelInputs } from '@/lib/model-generator/extractInputs';
import { generateMergerWorkbook } from '@/lib/models/merger/excel';

export function getPreview(inputs: MergerModelInputs) {
  return {
    title: `${inputs.acquirerName} / ${inputs.targetName} Accretion-Dilution`,
    tabs: [
      'M&A Summary',
      'Assumptions',
      'Deal Terms (Consideration)',
      'Pro Forma IS',
      'Synergies & Integration Costs',
      'Accretion - Dilution',
      'Sensitivities',
      'Checks',
      'Sources & Notes',
    ],
  };
}

export async function buildWorkbook(inputs: MergerModelInputs) {
  return generateMergerWorkbook({
    acquirerTicker: inputs.acquirerTicker ?? inputs.acquirerName.slice(0, 5).toUpperCase(),
    acquirerName: inputs.acquirerName,
    acquirerRevenue: inputs.acquirerRevenue ?? undefined,
    acquirerEBITDA: inputs.acquirerEbitda ?? undefined,
    acquirerEBIT: inputs.acquirerEbit ?? undefined,
    acquirerNetIncome: inputs.acquirerNetIncome ?? undefined,
    acquirerShares: inputs.acquirerShares ?? undefined,
    acquirerMarketCap: inputs.acquirerMarketCap ?? undefined,
    acquirerPrice: inputs.acquirerPrice ?? undefined,
    targetTicker: inputs.targetTicker ?? inputs.targetName.slice(0, 5).toUpperCase(),
    targetName: inputs.targetName,
    targetRevenue: inputs.targetRevenue ?? undefined,
    targetEBITDA: inputs.targetEbitda ?? undefined,
    targetEBIT: inputs.targetEbit ?? undefined,
    targetNetIncome: inputs.targetNetIncome ?? undefined,
    targetShares: inputs.targetShares ?? undefined,
    targetMarketCap: inputs.targetMarketCap ?? undefined,
    targetPrice: inputs.targetPrice ?? undefined,
    purchasePrice: inputs.purchasePrice ?? undefined,
    dealValue: inputs.purchasePrice ?? undefined,
    cashPct: inputs.cashPct,
    stockPct: inputs.stockPct,
    debtPct: inputs.debtPct,
    newDebt: inputs.newDebt || undefined,
    newDebtRate: inputs.newDebtRate,
    synergies: inputs.synergies || undefined,
    oneTimeCosts: inputs.oneTimeCosts || undefined,
    taxRate: inputs.taxRate,
  });
}
