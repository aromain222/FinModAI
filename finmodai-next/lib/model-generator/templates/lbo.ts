import type { LboInputs } from '@/lib/lboEngine';
import { runLboModel } from '@/lib/lboEngine';
import { generateLBOWorkbook } from '@/lib/models/lbo/excel';
import type { LboModelInputs } from '@/lib/model-generator/extractInputs';

export function getPreview(inputs: LboModelInputs) {
  return {
    title: `${inputs.companyName} LBO Underwriting`,
    tabs: ['LBO Summary', 'Assumptions', 'Sources & Uses', 'Operating Forecast', 'Debt Schedule', 'Returns', 'Sensitivities', 'Checks', 'Sources & Notes'],
  };
}

export async function buildWorkbook(inputs: LboModelInputs) {
  const lboInputs: LboInputs = {
    ticker: inputs.ticker || inputs.companyName.slice(0, 5).toUpperCase(),
    companyName: inputs.companyName,
    revenue: inputs.revenue,
    ebitda: inputs.ebitda,
    netDebt: inputs.netDebt,
    entryMultiple: inputs.entryMultiple,
    exitMultiple: inputs.exitMultiple,
    transactionFeesPercent: 0.02,
    exitFeesPercent: 0.01,
    debtPercent: inputs.debtPercent,
    equityPercent: inputs.equityPercent,
    interestRate: inputs.interestRate,
    amortizationPercent: inputs.amortizationPercent,
    cashSweepPercent: inputs.cashSweepPercent,
    revenueGrowth: inputs.revenueGrowth,
    ebitdaMargin: inputs.ebitdaMargin,
    capexPctRevenue: inputs.capexPctRevenue,
    deltaNwcPctRevenue: inputs.deltaNwcPctRevenue,
    taxRate: inputs.taxRate,
    depreciationPctRevenue: 0.02,
    holdingPeriodYears: inputs.holdingPeriodYears,
  };

  const output = runLboModel(lboInputs);
  return generateLBOWorkbook(output, {
    ticker: lboInputs.ticker,
    companyName: inputs.companyName,
    revenue: inputs.revenue,
    ebitda: inputs.ebitda,
    revenueGrowth: inputs.revenueGrowth,
    ebitdaMargin: inputs.ebitdaMargin,
    capexPctRevenue: inputs.capexPctRevenue,
    taxRate: inputs.taxRate,
    entryMultiple: inputs.entryMultiple,
    exitMultiple: inputs.exitMultiple,
    leverageMultiple: inputs.ebitda > 0 ? (inputs.debtPercent * inputs.entryMultiple * inputs.ebitda) / inputs.ebitda : undefined,
    holdPeriod: inputs.holdingPeriodYears,
    sharesOutstanding: inputs.sharesOutstanding ?? undefined,
    marketSharePrice: inputs.sharePrice ?? undefined,
    notes: [`Source: ${inputs.source}`, 'Generated from CapitalBase LBO workflow defaults and cached company data.'],
  });
}
