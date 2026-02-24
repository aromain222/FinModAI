/**
 * LBO Engine
 * Generates Leveraged Buyout models with debt schedules and returns calculations
 */

import ExcelJS from 'exceljs';

export interface LboInputs {
  ticker: string;
  companyName?: string;

  // Baseline financials (USD millions)
  revenue: number;
  ebitda: number;
  netDebt?: number;

  // Entry / exit assumptions
  entryMultiple: number; // EV / EBITDA
  exitMultiple: number; // EV / EBITDA
  transactionFeesPercent: number; // % of entry EV
  exitFeesPercent: number; // % of exit EV

  // Financing mix
  debtPercent: number;
  equityPercent: number;
  interestRate: number; // blended interest rate
  amortizationPercent: number; // % of debt per year
  cashSweepPercent: number; // % of excess cash

  // Operating assumptions
  revenueGrowth: number | number[];
  ebitdaMargin: number;
  capexPctRevenue: number;
  deltaNwcPctRevenue: number;
  taxRate: number;
  depreciationPctRevenue?: number;
  nwcPctRevenue?: number;
  daPctRevenue?: number;

  // Exit timing
  holdingPeriodYears: number;

  // Optional buffers
  minimumCashBalance?: number;

  // Legacy compatibility fields (optional)
  debtToEquity?: number;
  leverageMultiple?: number;
  seniorDebtPct?: number;
  subordinatedDebtPct?: number;
  seniorRate?: number;
  subRate?: number;
  holdPeriod?: number;
}

export interface LboEngineOutput {
  ticker: string;
  companyName: string;
  inputs: LboInputs;
  sourcesAndUses: {
    sources: {
      seniorDebt: number;
      subordinatedDebt: number;
      sponsorEquity: number;
      total: number;
    };
    uses: {
      purchasePrice: number;
      transactionFees: number;
      total: number;
    };
  };
  returns: {
    entryEV: number;
    exitEV: number;
    exitEquityValue: number;
    exitExcessCash?: number;
    moic: number; // Multiple of Invested Capital
    irr: number; // Internal Rate of Return
  };
  debtSchedule: Array<{
    year: number;
    beginningBalance: number;
    interest: number;
    cashAvailableForDebt: number;
    mandatoryAmortizationRequired: number;
    mandatoryAmortization: number;
    cashSweep: number;
    totalDebtRepayment: number;
    principalPayment: number;
    endingBalance: number;
    excessCash: number;
  }>;
  projections: Array<{
    year: number;
    revenue: number;
    ebitda: number;
    ebitdaMargin: number;
    depreciation: number;
    ebit: number;
    taxes: number;
    nopat: number;
    capex: number;
    nwcChange: number;
    freeCashFlow: number;
  }>;
  warnings: string[];
}

/**
 * Calculate IRR using Newton-Raphson method
 */
function calculateIRR(cashFlows: number[], guess: number = 0.1): number {
  const maxIterations = 100;
  const tolerance = 0.0001;
  let rate = guess;
  
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0;
    
    for (let t = 0; t < cashFlows.length; t++) {
      npv += cashFlows[t] / Math.pow(1 + rate, t);
      dnpv -= t * cashFlows[t] / Math.pow(1 + rate, t + 1);
    }
    
    const newRate = rate - npv / dnpv;
    
    if (Math.abs(newRate - rate) < tolerance) {
      return newRate;
    }
    
    rate = newRate;
  }
  
  return rate;
}

/**
 * Run LBO model calculations
 */
export function runLboModel(inputs: LboInputs): LboEngineOutput {
  const warnings: string[] = [];

  const requireNumber = (value: number | undefined, label: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${label} is required for LBO calculation`);
    }
    return value;
  };

  const requirePercent = (value: number | undefined, label: string): number => {
    const num = requireNumber(value, label);
    if (num < 0 || num > 1) {
      throw new Error(`${label} must be expressed as a decimal between 0 and 1`);
    }
    return num;
  };

  const entryMultiple = requireNumber(inputs.entryMultiple, 'Entry multiple');
  const exitMultiple = requireNumber(inputs.exitMultiple, 'Exit multiple');
  const revenue0 = requireNumber(inputs.revenue, 'Revenue (LTM)');
  const ebitda0 = requireNumber(inputs.ebitda, 'EBITDA (LTM)');
  if (ebitda0 <= 0) {
    throw new Error('EBITDA must be positive at entry');
  }

  const debtPercent = requirePercent(inputs.debtPercent, 'Debt %');
  const equityPercent = requirePercent(inputs.equityPercent, 'Equity %');
  if (Math.abs(debtPercent + equityPercent - 1) > 0.01) {
    throw new Error('Debt % and Equity % must sum to 100%');
  }

  const transactionFeesPercent = requirePercent(inputs.transactionFeesPercent, 'Transaction fees %');
  const exitFeesPercent = requirePercent(inputs.exitFeesPercent, 'Exit fees %');
  const interestRate = requirePercent(inputs.interestRate, 'Interest rate');
  const amortizationPercent = requirePercent(inputs.amortizationPercent, 'Mandatory amortization %');
  const cashSweepPercent = requirePercent(inputs.cashSweepPercent, 'Cash sweep %');
  const revenueGrowth = requireNumber(
    Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth[0] : inputs.revenueGrowth,
    'Revenue growth'
  );
  const ebitdaMargin = requirePercent(inputs.ebitdaMargin, 'EBITDA margin');
  const capexPctRevenue = requirePercent(inputs.capexPctRevenue, 'Capex % of revenue');
  const deltaNwcPctRevenue = requirePercent(inputs.deltaNwcPctRevenue, 'ΔNWC % of revenue');
  const taxRate = requirePercent(inputs.taxRate, 'Tax rate');

  const holdingPeriodYears = Math.round(requireNumber(inputs.holdingPeriodYears, 'Holding period'));
  if (holdingPeriodYears < 1) {
    throw new Error('Holding period must be at least 1 year');
  }

  const depreciationPctRevenue =
    typeof inputs.depreciationPctRevenue === 'number'
      ? inputs.depreciationPctRevenue
      : 0;
  if (inputs.depreciationPctRevenue === undefined) {
    warnings.push('Depreciation % of revenue missing; assuming 0 for EBIT/taxes.');
  }

  // Entry valuation
  const entryEV = entryMultiple * ebitda0;
  const transactionFees = entryEV * transactionFeesPercent;
  const totalUses = entryEV + transactionFees;

  // Sources of funds
  const totalDebt = totalUses * debtPercent;
  const sponsorEquity = totalUses * equityPercent;

  const sourcesAndUses = {
    sources: {
      seniorDebt: totalDebt,
      subordinatedDebt: 0,
      sponsorEquity,
      total: totalDebt + sponsorEquity,
    },
    uses: {
      purchasePrice: entryEV,
      transactionFees,
      total: totalUses,
    },
  };

  // Projections
  const projections: LboEngineOutput['projections'] = [];
  let currentRevenue = revenue0;
  const revenueGrowthSeries = Array.isArray(inputs.revenueGrowth)
    ? inputs.revenueGrowth
    : Array(holdingPeriodYears).fill(inputs.revenueGrowth);

  for (let year = 1; year <= holdingPeriodYears; year++) {
    const growth = revenueGrowthSeries[year - 1] ?? revenueGrowthSeries[revenueGrowthSeries.length - 1] ?? 0;
    currentRevenue = currentRevenue * (1 + growth);

    const ebitda = currentRevenue * ebitdaMargin;
    const depreciation = currentRevenue * depreciationPctRevenue;
    const ebit = ebitda - depreciation;
    const taxes = Math.max(ebit, 0) * taxRate;
    const nopat = ebit - taxes;
    const capex = currentRevenue * capexPctRevenue;
    const nwcChange = currentRevenue * deltaNwcPctRevenue;
    const freeCashFlow = nopat + depreciation - capex - nwcChange;

    projections.push({
      year,
      revenue: currentRevenue,
      ebitda,
      ebitdaMargin,
      depreciation,
      ebit,
      taxes,
      nopat,
      capex,
      nwcChange,
      freeCashFlow,
    });
  }

  // Debt schedule
  const debtSchedule: LboEngineOutput['debtSchedule'] = [];
  let remainingDebt = totalDebt;
  let excessCashBalance = 0;
  const minimumCashBalance = inputs.minimumCashBalance ?? 0;
  let warnedInsufficientCash = false;
  let warnedDebtFullyRepaid = false;
  let warnedExcessCash = false;
  let warnedCashDeficit = false;

  for (let year = 1; year <= holdingPeriodYears; year++) {
    const beginningBalance = remainingDebt;
    const interest = beginningBalance * interestRate;
    const rawCashAvailable = (projections[year - 1]?.freeCashFlow ?? 0) - interest - minimumCashBalance;
    if (rawCashAvailable < 0 && !warnedCashDeficit) {
      warnings.push(`Cash deficit in year ${year}; cash available for debt service is zero after minimum cash.`);
      warnedCashDeficit = true;
    }
    const cashAvailableForDebt = Math.max(rawCashAvailable, 0);
    const mandatoryAmortizationRequired = beginningBalance * amortizationPercent;
    let mandatoryAmortizationActual = Math.min(mandatoryAmortizationRequired, cashAvailableForDebt, beginningBalance);

    if (cashAvailableForDebt < mandatoryAmortizationRequired && !warnedInsufficientCash) {
      warnings.push(`Insufficient cash to meet mandatory amortization in year ${year}.`);
      warnedInsufficientCash = true;
    }

    let cashSweep = 0;
    if (beginningBalance <= mandatoryAmortizationActual) {
      mandatoryAmortizationActual = Math.min(beginningBalance, cashAvailableForDebt);
      cashSweep = 0;
      if (!warnedDebtFullyRepaid) {
        warnings.push(`Debt fully repaid early in year ${year}.`);
        warnedDebtFullyRepaid = true;
      }
    } else {
      cashSweep = cashSweepPercent * Math.max(cashAvailableForDebt - mandatoryAmortizationActual, 0);
    }

    const totalDebtRepayment = Math.min(
      beginningBalance,
      mandatoryAmortizationActual + cashSweep
    );
    if (totalDebtRepayment - cashAvailableForDebt > 1e-6) {
      throw new Error(`Debt repayment exceeds cash available in year ${year}`);
    }

    const endingBalance = Math.max(beginningBalance - totalDebtRepayment, 0);
    remainingDebt = endingBalance;
    let excessCash = 0;
    if (endingBalance <= 0) {
      excessCash = Math.max(cashAvailableForDebt - totalDebtRepayment, 0);
      excessCashBalance += excessCash;
      if (excessCash > 0 && !warnedExcessCash) {
        warnings.push('Excess cash retained post-deleveraging.');
        warnedExcessCash = true;
      }
    }

    debtSchedule.push({
      year,
      beginningBalance,
      interest,
      cashAvailableForDebt,
      mandatoryAmortizationRequired,
      mandatoryAmortization: mandatoryAmortizationActual,
      cashSweep,
      totalDebtRepayment,
      principalPayment: totalDebtRepayment,
      endingBalance,
      excessCash,
    });
  }

  // Exit valuation
  const exitEbitda = projections[projections.length - 1]?.ebitda ?? ebitda0;
  const exitEV = exitEbitda * exitMultiple;
  const exitFees = exitEV * exitFeesPercent;
  const exitDebt = debtSchedule[debtSchedule.length - 1]?.endingBalance ?? totalDebt;
  const exitEquityValue = exitEV - exitDebt - exitFees + excessCashBalance;

  if (exitDebt > 0) {
    warnings.push('Debt not fully repaid at exit.');
  }
  if (exitEquityValue < 0) {
    warnings.push('Exit equity value is negative.');
  }

  // Returns
  const moic = exitEquityValue / sponsorEquity;
  const cashFlows = [-sponsorEquity, ...Array(Math.max(holdingPeriodYears - 1, 0)).fill(0), exitEquityValue];
  const irr = calculateIRR(cashFlows);
  if (moic < 1) {
    warnings.push('MOIC below 1.0x.');
  }
  if (irr < 0) {
    warnings.push('IRR is negative.');
  }

  return {
    ticker: inputs.ticker,
    companyName: inputs.companyName || inputs.ticker,
    inputs: {
      ...inputs,
      revenueGrowth: revenueGrowthSeries,
      nwcPctRevenue: deltaNwcPctRevenue,
      daPctRevenue: depreciationPctRevenue,
      debtToEquity: debtPercent,
      leverageMultiple: totalDebt / ebitda0,
      seniorDebtPct: 1,
      subordinatedDebtPct: 0,
      seniorRate: interestRate,
      subRate: interestRate,
      holdPeriod: holdingPeriodYears,
    },
    sourcesAndUses,
    returns: {
      entryEV,
      exitEV,
      exitEquityValue,
      exitExcessCash: excessCashBalance,
      moic,
      irr,
    },
    debtSchedule,
    projections,
    warnings,
  };
}

/**
 * Build LBO workbook using ExcelJS
 * Redirects to new comprehensive LBO Excel generator
 */
export async function buildLboWorkbook(
  output: LboEngineOutput,
  inputs?: import('./models/lbo/excel').LBOExcelInputs
): Promise<ExcelJS.Workbook> {
  // Use the new comprehensive LBO Excel generator
  const { generateLBOWorkbook } = await import('./models/lbo/excel');
  return generateLBOWorkbook(output, inputs);
}
