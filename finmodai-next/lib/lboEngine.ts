import ExcelJS from 'exceljs';
import type { ScaledFinancials } from './financials';
import type { LboAdvancedOptions } from '@/types/lbo';
import { generateBankerLBO, type LBOInputs, type LboDetailRow } from './lboGenerator';
import { copyWorksheet } from './excel/copyWorksheet';
import { sanitizeNumber } from '@/lib/excelSafe';
import { safeNumber } from '@/lib/utils/safeNumber';
import { moic, calculateIRR } from '@/lib/models/precision';

export interface LBOAssumptions {
  entryMultiple: number;
  exitMultiple: number;
  debtInterestRate: number;
  revolverRate?: number;
  amortizationRate: number;
  taxRate: number;
  minimumCash: number;
  sponsorEquityPct?: number;
  holdYears?: number;
  useCashSweep?: boolean;
  managementRolloverPct?: number;
}

export interface LBOThreeStatementSlice {
  years: number[];
  revenue: number[];
  ebitda: number[];
  depreciation: number[];
  capex: number[];
  changeInWC: number[];
}

export interface LBOEntryInputs {
  ltmEbitda: number;
  netDebtAtClose: number;
  cashAtClose: number;
  transactionFeesPct: number;
}

export interface LBODebtScheduleYear {
  year: number;
  openingDebt: number;
  mandatoryAmort: number;
  optionalPaydown: number;
  interestExpense: number;
  revolverDraw: number;
  endingDebt: number;
  revolverBalance: number;
  freeCashFlowAfterDebtService: number;
  leverageMultiple?: number;
  interestCoverage?: number;
  debtServiceCoverage?: number;
}

export interface LBOExitOutputs {
  exitEV: number;
  exitEquityValue: number;
  moic: number;
  irr: number;
}

export interface LBOSensitivityPoint {
  entryMultiple: number;
  exitMultiple: number;
  irr: number;
  moic: number;
}

export interface LBOSensitivityGrid {
  entryVsExit: LBOSensitivityPoint[];
}

export interface LBOModel {
  entryEV: number;
  equityContribution: number;
  termLoanAtClose: number;
  fees: number;
  sourcesAndUses: {
    sources: {
      sponsorEquity: number;
      managementRollover: number;
      termLoan: number;
      revolver: number;
    };
    uses: { equityPurchase: number; fees: number; netRefinancedDebt: number };
  };
  years: number[];
  unleveredFCF: number[];
  debtSchedule: LBODebtScheduleYear[];
  exit: LBOExitOutputs;
  sensitivity?: LBOSensitivityGrid;
  diagnostics?: {
    suspiciousEconomics?: boolean;
    noDeleveraging?: boolean;
  };
}

export function calculateEntryEV(ltmEbitda: number, entryMultiple: number): number {
  return safeNumber(safeNumber(ltmEbitda) * safeNumber(entryMultiple));
}

export function buildSourcesAndUses(
  entryEV: number,
  inputs: LBOEntryInputs,
  assumptions: LBOAssumptions
): {
  sources: { sponsorEquity: number; managementRollover: number; termLoan: number; revolver: number };
  uses: { equityPurchase: number; fees: number; netRefinancedDebt: number };
  equityContribution: number;
  termLoanAtClose: number;
  fees: number;
} {
  if (!Number.isFinite(inputs.transactionFeesPct)) {
    throw new Error('Missing required LBO input: transaction fees');
  }
  const feesPct = inputs.transactionFeesPct;
  const fees = entryEV * feesPct;
  const sponsorEquityPct = assumptions.sponsorEquityPct ?? 0.5;
  const managementPct = assumptions.managementRolloverPct ?? 0;

  const equityPurchase = entryEV - inputs.netDebtAtClose;
  const managementRollover = equityPurchase * managementPct;

  let sponsorEquity = equityPurchase * sponsorEquityPct + fees - managementRollover;
  sponsorEquity = Math.max(sponsorEquity, 0);

  let termLoan = equityPurchase * (1 - sponsorEquityPct);
  const sourcesTotal = sponsorEquity + managementRollover + termLoan;
  const usesTotal = equityPurchase + fees + inputs.netDebtAtClose;

  if (Math.abs(sourcesTotal - usesTotal) > 1e-6) {
    termLoan += usesTotal - sourcesTotal;
  }
  termLoan = Math.max(termLoan, 0);

  return {
    sources: {
      sponsorEquity,
      managementRollover,
      termLoan,
      revolver: 0,
    },
    uses: {
      equityPurchase,
      fees,
      netRefinancedDebt: inputs.netDebtAtClose,
    },
    equityContribution: sponsorEquity,
    termLoanAtClose: termLoan,
    fees,
  };
}

export function projectUnleveredFCF(
  slice: LBOThreeStatementSlice,
  assumptions: LBOAssumptions
): { unleveredFCF: number[]; ebit: number[]; taxesOnEBIT: number[] } {
  const unleveredFCF: number[] = [];
  const ebit: number[] = [];
  const taxesOnEBIT: number[] = [];
  const taxRate = safeNumber(assumptions.taxRate);

  slice.years.forEach((_, idx) => {
    const ebitdaValue = safeNumber(slice.ebitda[idx]);
    const depreciationValue = safeNumber(slice.depreciation[idx]);
    const ebitValue = safeNumber(ebitdaValue - depreciationValue);
    
    // Tax logic: 0 if EBIT < 0, otherwise EBIT × taxRate (identity enforcement)
    const tax = ebitValue < 0 ? 0 : safeNumber(ebitValue * taxRate);
    
    const capexValue = safeNumber(slice.capex[idx]);
    const changeInWCValue = safeNumber(slice.changeInWC[idx]);
    const fcf = safeNumber(
      ebitdaValue - tax - capexValue - changeInWCValue
    );

    ebit.push(ebitValue);
    taxesOnEBIT.push(tax);
    unleveredFCF.push(fcf);
  });

  return { unleveredFCF, ebit, taxesOnEBIT };
}

export function buildDebtSchedule(
  years: number[],
  unleveredFCF: number[],
  ebitda: number[],
  entryTermLoan: number,
  assumptions: LBOAssumptions
): LBODebtScheduleYear[] {
  const amortRate = safeNumber(assumptions.amortizationRate) || 0.05;
  const interestRate = safeNumber(assumptions.debtInterestRate);
  const revolverRate = safeNumber(assumptions.revolverRate);
  const minimumCash = safeNumber(assumptions.minimumCash);
  const useCashSweep = assumptions.useCashSweep ?? true;

  let termLoanBalance = safeNumber(entryTermLoan);
  let revolverBalance = 0;

  const schedule: LBODebtScheduleYear[] = years.map((year, idx) => {
    const openingDebt = safeNumber(termLoanBalance);
    const mandatoryAmort = safeNumber(openingDebt * amortRate);
    // InterestExpense = Term loan interest + revolver interest
    const revolverInterest = safeNumber(revolverBalance * revolverRate);
    const interestExpense = safeNumber(openingDebt * interestRate + revolverInterest);
    const fcfBeforeDebt = safeNumber(unleveredFCF[idx]);
    const preDebtFCF = safeNumber(fcfBeforeDebt - interestExpense - mandatoryAmort);

    let optionalPaydown = 0;
    let revolverDraw = 0;

    if (useCashSweep && preDebtFCF > minimumCash) {
      optionalPaydown = safeNumber(preDebtFCF - minimumCash);
    }

    if (preDebtFCF < minimumCash) {
      revolverDraw = safeNumber(minimumCash - preDebtFCF);
      revolverBalance = safeNumber(revolverBalance + revolverDraw);
    }

    optionalPaydown = safeNumber(Math.min(optionalPaydown, Math.max(openingDebt - mandatoryAmort, 0)));
    const endingTermLoan = safeNumber(Math.max(openingDebt - mandatoryAmort - optionalPaydown, 0));
    termLoanBalance = endingTermLoan;

    const totalDebt = safeNumber(endingTermLoan + revolverBalance);
    const ebitdaValue = safeNumber(ebitda[idx]);
    const leverageMultiple = ebitdaValue > 0 ? safeNumber(totalDebt / ebitdaValue) : undefined;
    const interestCoverage = interestExpense > 0 ? safeNumber(ebitdaValue / interestExpense) : undefined;
    const debtService = safeNumber(interestExpense + mandatoryAmort);
    const debtServiceCoverage =
      debtService > 0 ? safeNumber(fcfBeforeDebt / debtService) : undefined;

    const freeCashAfterDebt =
      safeNumber(preDebtFCF - optionalPaydown + revolverDraw);

    return {
      year,
      openingDebt,
      mandatoryAmort,
      optionalPaydown,
      interestExpense,
      revolverDraw,
      endingDebt: endingTermLoan,
      revolverBalance,
      freeCashFlowAfterDebtService: freeCashAfterDebt,
      leverageMultiple,
      interestCoverage,
      debtServiceCoverage,
    };
  });

  console.log('[LBO] Debt schedule built for', years.length, 'years');
  return schedule;
}

export function buildExitOutputs(
  ebitdaYear5: number,
  debtYear5: number,
  equityContribution: number,
  assumptions: LBOAssumptions
): LBOExitOutputs {
  const exitMultiple = safeNumber(assumptions.exitMultiple);
  const ebitdaValue = safeNumber(ebitdaYear5);
  const debtValue = safeNumber(debtYear5);
  const exitEV = safeNumber(ebitdaValue * exitMultiple);
  const exitEquityValue = safeNumber(exitEV - debtValue);
  const equityContrib = safeNumber(equityContribution);
  const yearsHeld = safeNumber(assumptions.holdYears) || 5;
  
  // Use shared precision helpers for critical calculations
  // All models must use precision.ts - no duplication allowed
  const calculatedMoic = equityContrib > 0 && exitEquityValue > 0
    ? moic(exitEquityValue, equityContrib)
    : 0;
  
  const calculatedIrr = equityContrib > 0 && exitEquityValue > 0 && yearsHeld > 0
    ? calculateIRR(-equityContrib, exitEquityValue, yearsHeld)
    : 0;

  return { 
    exitEV, 
    exitEquityValue, 
    moic: safeNumber(calculatedMoic), 
    irr: safeNumber(calculatedIrr) 
  };
}

function buildSensitivityGrid(params: {
  entryMultiple: number;
  exitMultiple: number;
  ltmEbitda: number;
  finalEbitda: number;
  finalNetDebt: number;
  equityContribution: number;
  assumptions: LBOAssumptions;
}): LBOSensitivityGrid {
  const { entryMultiple, exitMultiple, ltmEbitda, finalEbitda, finalNetDebt, equityContribution, assumptions } = params;
  const entryMultSafe = safeNumber(entryMultiple);
  const exitMultSafe = safeNumber(exitMultiple);
  const ltmEbitdaSafe = safeNumber(ltmEbitda);
  const finalEbitdaSafe = safeNumber(finalEbitda);
  const finalNetDebtSafe = safeNumber(finalNetDebt);
  const equityContribSafe = safeNumber(equityContribution);
  
  const entryVariants = [entryMultSafe - 1, entryMultSafe, entryMultSafe + 1].map((val) => safeNumber(Math.max(val, 0.1)));
  const exitVariants = [exitMultSafe - 1, exitMultSafe, exitMultSafe + 1].map((val) => safeNumber(Math.max(val, 0.1)));
  const entryEV = calculateEntryEV(ltmEbitdaSafe, entryMultSafe);
  const baseEquityRatio = entryEV > 0 ? safeNumber(equityContribSafe / entryEV) : safeNumber(assumptions.sponsorEquityPct) || 0.5;
  const yearsHeld = safeNumber(assumptions.holdYears) || 5;

  const entryVsExit: LBOSensitivityPoint[] = [];

  entryVariants.forEach((entryMult) => {
    const altEntryEV = calculateEntryEV(ltmEbitdaSafe, entryMult);
    const altEquity = safeNumber(Math.max(altEntryEV * baseEquityRatio, 0));
    exitVariants.forEach((exitMult) => {
      const altExitEV = safeNumber(finalEbitdaSafe * exitMult);
      const altExitEquity = safeNumber(altExitEV - finalNetDebtSafe);
      // Use shared precision helpers - no duplication allowed
      const altMOIC = altEquity > 0 && altExitEquity > 0
        ? moic(altExitEquity, altEquity)
        : 0;
      
      const altIRR = altEquity > 0 && altExitEquity > 0 && yearsHeld > 0
        ? calculateIRR(-altEquity, altExitEquity, yearsHeld)
        : 0;
      
      entryVsExit.push({
        entryMultiple: entryMult,
        exitMultiple: exitMult,
        irr: altIRR,
        moic: altMOIC,
      });
    });
  });

  return { entryVsExit };
}

export function buildLBOModel(params: {
  threeStatement: {
    ltmEbitda: number;
    lboSlice: LBOThreeStatementSlice;
  };
  entry: LBOEntryInputs;
  assumptions: LBOAssumptions;
}): LBOModel {
  const { threeStatement, entry, assumptions } = params;

  const entryEV = calculateEntryEV(threeStatement.ltmEbitda, assumptions.entryMultiple);
  console.log('[LBO] Entry EV:', entryEV);

  const sourcesAndUses = buildSourcesAndUses(entryEV, entry, assumptions);

  const projection = projectUnleveredFCF(threeStatement.lboSlice, assumptions);
  const debtSchedule = buildDebtSchedule(
    threeStatement.lboSlice.years,
    projection.unleveredFCF,
    threeStatement.lboSlice.ebitda,
    sourcesAndUses.termLoanAtClose,
    assumptions
  );

  const finalIdx = threeStatement.lboSlice.years.length - 1;
  const finalNetDebt =
    debtSchedule[finalIdx].endingDebt + debtSchedule[finalIdx].revolverBalance;

  const exit = buildExitOutputs(
    threeStatement.lboSlice.ebitda[finalIdx],
    finalNetDebt,
    sourcesAndUses.equityContribution,
    assumptions
  );

  const sensitivity = buildSensitivityGrid({
    entryMultiple: assumptions.entryMultiple,
    exitMultiple: assumptions.exitMultiple,
    ltmEbitda: threeStatement.ltmEbitda,
    finalEbitda: threeStatement.lboSlice.ebitda[finalIdx],
    finalNetDebt,
    equityContribution: sourcesAndUses.equityContribution,
    assumptions,
  });

  const diagnostics: LBOModel['diagnostics'] = {};
  if (exit.moic > 10 || exit.irr > 0.6) {
    diagnostics.suspiciousEconomics = true;
  }
  const firstLeverage = debtSchedule[0]?.leverageMultiple;
  const lastLeverage = debtSchedule[finalIdx]?.leverageMultiple;
  if (
    firstLeverage !== undefined &&
    lastLeverage !== undefined &&
    lastLeverage > firstLeverage
  ) {
    diagnostics.noDeleveraging = true;
  }

  return {
    entryEV,
    equityContribution: sourcesAndUses.equityContribution,
    termLoanAtClose: sourcesAndUses.termLoanAtClose,
    fees: sourcesAndUses.fees,
    sourcesAndUses: {
      sources: sourcesAndUses.sources,
      uses: sourcesAndUses.uses,
    },
    years: threeStatement.lboSlice.years,
    unleveredFCF: projection.unleveredFCF,
    debtSchedule,
    exit,
    sensitivity,
    diagnostics:
      diagnostics.suspiciousEconomics || diagnostics.noDeleveraging ? diagnostics : undefined,
  };
}

type RunLboSliderAssumptions = {
  revenueGrowth: number;
  ebitdaMargin: number;
  capexPercent: number;
  daPercent: number;
  nwcPercent: number;
  taxRate: number;
  entryMultiple: number;
  exitMultiple: number;
  leverageMultiple: number;
  transactionFeesPercent: number;
  offerPremium: number;
  forecastYears: number;
  termLoanBRate: number;
  revolverRate: number;
  minimumCash: number;
  financingFeesPercent: number;
};

export interface RunLboModelParams {
  workbook: ExcelJS.Workbook;
  ticker: string;
  companyName?: string;
  sectorHint?: string;
  normalizedFinancials?: ScaledFinancials | null;
  sliderAssumptions: RunLboSliderAssumptions;
  excelOverrides?: Partial<LBOInputs>;
  advancedOptions?: LboAdvancedOptions;
}

export interface LboEngineOutput {
  ticker: string;
  companyName: string;
  sectorHint?: string;
  ltmRevenue: number;
  ltmEBITDA: number;
  ltmEBIT: number;
  netDebt: number;
  sharesOutstanding: number;
  entryMultiple: number;
  exitMultiple: number;
  entry: {
    entryEV: number;
    entryMultiple: number;
    equityContribution: number;
    leverageMultiple: number;
  };
  exit: {
    exitEV: number;
    exitEquityValue: number;
    exitMultiple: number;
    irr: number;
    moic: number;
  };
  sourcesAndUses?: {
    sources: {
      sponsorEquity: number;
      managementRollover: number;
      termLoan: number;
      revolver: number;
    };
    uses: {
      equityPurchase: number;
      fees: number;
      netRefinancedDebt: number;
    };
    sourcesTotal: number;
    usesTotal: number;
    reconciliation: number;
  };
  sourcesUses?: {
    sources: Record<string, number>;
    uses: Record<string, number>;
    total: number;
    reconciliation: number;
  };
  forecast: Array<{
    year: number;
    revenue: number;
    ebitda: number;
    unleveredFcf: number;
  }>;
  debtSchedule: LBODebtScheduleYear[];
  diagnostics?: LBOModel['diagnostics'];
}

/**
 * Core CapitalBase LBO engine operating exclusively in millions.
 * Assumes upstream callers provide sanitized assumptions and normalized data.
 * Mutates the supplied workbook to include a completed CapitalBase LBO sheet.
 */
export async function runLboModel(params: RunLboModelParams): Promise<LboEngineOutput> {
  // Step tracking - mutable variable updated before each phase
  let currentStep: string = 'validate-inputs';
  
  const slider = params.sliderAssumptions;
  const requireFinite = (value: number, label: string) => {
    if (!Number.isFinite(value)) {
      throw new Error(`Missing required LBO input: ${label}`);
    }
    return value;
  };
  const requirePositive = (value: number, label: string) => {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Missing required LBO input: ${label}`);
    }
    return value;
  };
  const companyName = params.companyName?.trim();
  if (!companyName) {
    throw new Error('Missing required LBO input: company name');
  }
  const normalized = params.normalizedFinancials;
  if (!normalized) {
    throw new Error('Missing required LBO input: normalized financials');
  }
  const advanced = normalizeAdvancedOptions(params.advancedOptions);
  if (advanced) {
    console.log('[LBO ADVANCED OPTIONS]', {
      ticker: params.ticker,
      ...advanced,
    });
  }
  const advancedMinCash = advanced?.minimumCashAtClose ?? 0;

  const forecastYears = Math.max(1, Math.round(requireFinite(slider.forecastYears, 'Hold period (years)')));
  const revenueGrowth = requireFinite(slider.revenueGrowth, 'Revenue growth');
  const ebitdaMargin = requireFinite(slider.ebitdaMargin, 'EBITDA margin');
  const capexPercent = requireFinite(slider.capexPercent, 'Capex percent');
  const daPercent = requireFinite(slider.daPercent, 'D&A percent');
  const nwcPercent = requireFinite(slider.nwcPercent, 'NWC percent');
  const taxRate = requireFinite(slider.taxRate, 'Tax rate');

  const ltmRevenue = requirePositive(normalized.revenueM, 'LTM revenue');
  const ltmEBITDA = requirePositive(normalized.ebitdaM, 'LTM EBITDA');
  const ltmEBIT = Number.isFinite(normalized.ebitM)
    ? normalized.ebitM
    : safeNumber(ltmEBITDA - ltmRevenue * daPercent);
  const sharesOutstanding = requirePositive(normalized.sharesOutstandingM, 'Shares outstanding');
  const leverageMult = requireFinite(slider.leverageMultiple, 'Target leverage');
  const netDebt = requireFinite(normalized.netDebtM, 'Net debt');

  const years = Array.from({ length: forecastYears }, (_, idx) => idx + 1);
  const revenue: number[] = [];
  const ebitda: number[] = [];
  const depreciation: number[] = [];
  const capex: number[] = [];
  const changeInWC: number[] = [];

  let priorRevenue = ltmRevenue;
  years.forEach(() => {
    const nextRevenue = safeNumber(priorRevenue * (1 + revenueGrowth));
    revenue.push(nextRevenue);
    const ebitdaValue = safeNumber(nextRevenue * ebitdaMargin);
    ebitda.push(ebitdaValue);
    depreciation.push(safeNumber(nextRevenue * daPercent));
    capex.push(safeNumber(nextRevenue * capexPercent));
    changeInWC.push(safeNumber(nextRevenue * nwcPercent));
    priorRevenue = nextRevenue;
  });

  const lboSlice: LBOThreeStatementSlice = {
    years,
    revenue,
    ebitda,
    depreciation,
    capex,
    changeInWC,
  };

  const entryInputs: LBOEntryInputs = {
    ltmEbitda: ltmEBITDA,
    netDebtAtClose: safeNumber(Math.max(0, netDebt)),
    cashAtClose: safeNumber(Math.max(0, normalized.fcfM ?? 50)),
    transactionFeesPct: requireFinite(slider.transactionFeesPercent, 'Transaction fees'),
  };

  const entryMultiple = requireFinite(slider.entryMultiple, 'Entry EBITDA multiple');
  const exitMultiple = requireFinite(slider.exitMultiple, 'Exit EBITDA multiple');
  const leverageMultiple = requireFinite(slider.leverageMultiple, 'Target leverage');
  const entryEV = safeNumber(entryMultiple * ltmEBITDA);
  const desiredDebt = safeNumber(leverageMultiple * ltmEBITDA);
  let sponsorEquityPct = entryEV > 0 ? safeNumber(1 - desiredDebt / entryEV) : 0.5;
  sponsorEquityPct = safeNumber(Math.min(0.9, Math.max(0.15, sponsorEquityPct)));

  const sliderMinimumCash = safeNumber(Math.max(requireFinite(slider.minimumCash, 'Minimum cash balance'), safeNumber(advancedMinCash) || 0));

  const assumptions: LBOAssumptions = {
    entryMultiple,
    exitMultiple,
    debtInterestRate: requireFinite(slider.termLoanBRate, 'Term Loan B rate'),
    revolverRate: requireFinite(slider.revolverRate, 'Revolver rate'),
    amortizationRate: 0.05,
    taxRate,
    minimumCash: sliderMinimumCash,
    sponsorEquityPct,
    holdYears: safeNumber(Math.max(1, requireFinite(slider.forecastYears, 'Hold period (years)'))),
    useCashSweep: true,
    managementRolloverPct: 0,
  };

  // Build operating model
  currentStep = 'build-operating-model';
  const model = buildLBOModel({
    threeStatement: {
      ltmEbitda: ltmEBITDA,
      lboSlice,
    },
    entry: entryInputs,
    assumptions,
  });
  
  // Build debt schedule
  currentStep = 'build-debt-schedule';
  // (debt schedule is built inside buildLBOModel, but we track the step)
  
  // Calculate returns
  currentStep = 'calculate-returns';
  // (returns are calculated inside buildLBOModel, but we track the step)

  const forecast = model.years.map((year, idx) => ({
    year,
    revenue: safeNumber(revenue[idx]) || 0,
    ebitda: safeNumber(ebitda[idx]) || 0,
    unleveredFcf: safeNumber(model.unleveredFCF[idx]) || 0,
  }));

  const sourcesTotal = Object.values(model.sourcesAndUses.sources).reduce((sum, value) => sum + value, 0);
  const usesTotal = Object.values(model.sourcesAndUses.uses).reduce((sum, value) => sum + value, 0);
  const reconciliation = sourcesTotal - usesTotal;

  const summary: LboEngineOutput = {
    ticker: params.ticker,
    companyName,
    sectorHint: params.sectorHint,
    ltmRevenue,
    ltmEBITDA,
    ltmEBIT,
    netDebt: safeNumber(Math.max(0, netDebt)),
    sharesOutstanding,
    entryMultiple,
    exitMultiple,
    entry: {
      entryEV: safeNumber(model.entryEV),
      entryMultiple,
      equityContribution: safeNumber(model.equityContribution),
      leverageMultiple,
    },
    exit: {
      exitEV: safeNumber(model.exit.exitEV),
      exitEquityValue: safeNumber(model.exit.exitEquityValue),
      exitMultiple,
      irr: safeNumber(model.exit.irr),
      moic: safeNumber(model.exit.moic),
    },
    sourcesAndUses: {
      sources: model.sourcesAndUses.sources,
      uses: model.sourcesAndUses.uses,
      sourcesTotal,
      usesTotal,
      reconciliation,
    },
    sourcesUses: {
      sources: model.sourcesAndUses.sources,
      uses: model.sourcesAndUses.uses,
      total: sourcesTotal,
      reconciliation,
    },
    forecast,
    debtSchedule: model.debtSchedule,
    diagnostics: model.diagnostics,
  };

  // Generate workbook
  currentStep = 'generate-workbook';
  await populateWorkbookWithLboSummary({
    workbook: params.workbook,
    summary,
    sliderAssumptions: { ...slider, minimumCash: sliderMinimumCash },
    overrides: params.excelOverrides,
    advancedOptions: advanced,
  });

  return summary;
}

export type BuildLboWorkbookParams = Omit<RunLboModelParams, 'workbook'> & {
  workbook?: ExcelJS.Workbook;
};

export async function buildLboWorkbook(
  params: BuildLboWorkbookParams
): Promise<{ workbook: ExcelJS.Workbook; summary: LboEngineOutput }> {
  let currentStep: string = 'validate-inputs';
  
  try {
    const workbook = params.workbook ?? new ExcelJS.Workbook();
    
    // Validate workbook instance
    if (!workbook || typeof workbook.addWorksheet !== 'function') {
      throw new Error('Invalid workbook instance provided');
    }
    
    const summary = await runLboModel({
      ...params,
      workbook,
    });

    // Validate workbook was populated
    if (!workbook.worksheets || workbook.worksheets.length === 0) {
      currentStep = 'generate-workbook';
      throw new Error('LBO workbook generated without any worksheets');
    }
    
    // Validate all sheet names are unique
    const sheetNames = workbook.worksheets.map(sheet => sheet.name);
    const uniqueNames = new Set(sheetNames);
    if (sheetNames.length !== uniqueNames.size) {
      currentStep = 'generate-workbook';
      throw new Error('Duplicate sheet names detected in workbook');
    }

    console.log('[LBO_DEBUG] buildLboWorkbook sheets:', workbook.worksheets.map((sheet) => sheet.name));
    return { workbook, summary };
  } catch (error: any) {
    // Wrap error with step information - use error.step if available, otherwise use currentStep
    const errorWithStep = error as Error & { step?: string };
    errorWithStep.step = error?.step || currentStep;
    throw errorWithStep;
  }
}

interface PopulateWorkbookArgs {
  workbook: ExcelJS.Workbook;
  summary: LboEngineOutput;
  sliderAssumptions: RunLboSliderAssumptions;
  overrides?: Partial<LBOInputs>;
  advancedOptions?: LboAdvancedOptions;
}

async function populateWorkbookWithLboSummary(args: PopulateWorkbookArgs) {
  try {
    // Validate workbook instance
    if (!args.workbook || typeof args.workbook.addWorksheet !== 'function') {
      throw new Error('EXCEL_GENERATION_FAILED: Invalid workbook instance');
    }

    const { inputs, totals } = buildLboExcelInputs(
      args.summary,
      args.sliderAssumptions,
      args.overrides,
      args.advancedOptions
    );
    if (inputs.sponsorEquityOverride && inputs.sponsorEquityOverride > 0) {
      args.summary.entry.equityContribution = safeNumber(inputs.sponsorEquityOverride);
    }
    
    // Generate banker workbook - allow this to fail gracefully
    let bankerWorkbook: ExcelJS.Workbook;
    try {
      bankerWorkbook = await generateBankerLBO(inputs);
    } catch (err: any) {
      console.error('[LBO] Failed to generate banker workbook', {
        message: err?.message,
        stack: err?.stack,
        ticker: args.summary.ticker,
      });
      throw new Error(
        `EXCEL_GENERATION_FAILED: Banker workbook generation failed: ${err?.message || 'Unknown error'}`,
        { cause: err }
      );
    }
    
    const templateSheet = bankerWorkbook.getWorksheet('LBO Model') ?? bankerWorkbook.worksheets[0];
    if (!templateSheet) {
      throw new Error('EXCEL_GENERATION_FAILED: Banker template sheet not found');
    }

    const targetSheetName = 'CapitalBase LBO Model';
    
    // Validate sheet name before creating
    if (targetSheetName.length > 31) {
      throw new Error(`EXCEL_GENERATION_FAILED: Sheet name "${targetSheetName}" exceeds 31 characters`);
    }
    
    const invalidChars = /[\\/?*\[\]]/;
    if (invalidChars.test(targetSheetName)) {
      throw new Error(`EXCEL_GENERATION_FAILED: Sheet name "${targetSheetName}" contains invalid characters`);
    }
    
    // Remove existing sheet if present
    const existingSheet = args.workbook.getWorksheet(targetSheetName);
    if (existingSheet) {
      try {
        args.workbook.removeWorksheet(existingSheet.id);
      } catch (err: any) {
        console.warn('[LBO] Failed to remove existing sheet, continuing', {
          error: err?.message,
        });
      }
    }
    
    // Add new sheet - validate it was created
    let targetSheet: ExcelJS.Worksheet;
    try {
      targetSheet = args.workbook.addWorksheet(targetSheetName);
      if (!targetSheet) {
        throw new Error('Failed to create worksheet');
      }
    } catch (err: any) {
      throw new Error(`EXCEL_GENERATION_FAILED: Failed to add worksheet: ${err?.message || 'Unknown error'}`);
    }
    
    // Copy template - validate rows/columns exist
    try {
      if (!templateSheet.rowCount || templateSheet.rowCount === 0) {
        throw new Error('Template sheet has no rows');
      }
      copyWorksheet(templateSheet, targetSheet);
    } catch (err: any) {
      throw new Error(`EXCEL_GENERATION_FAILED: Failed to copy worksheet: ${err?.message || 'Unknown error'}`);
    }

    // Stabilize worksheet - allow partial success
    let sheetDiagnostics: any = {};
    try {
      sheetDiagnostics = stabilizeLboWorksheet(targetSheet, args.summary, args.sliderAssumptions);
    } catch (err: any) {
      console.warn('[LBO] Failed to stabilize worksheet, continuing with partial data', {
        error: err?.message,
        ticker: args.summary.ticker,
      });
      // Continue with partial data - don't throw
    }
    
    const logPayload = {
      ticker: args.summary.ticker,
      totalSources: safeNumber(sheetDiagnostics.totalSources ?? totals.totalSources),
      totalUses: safeNumber(sheetDiagnostics.totalUses ?? totals.totalUses),
      sponsorEquity: safeNumber(sheetDiagnostics.sponsorEquity ?? totals.sponsorEquity),
      exitEV: safeNumber(sheetDiagnostics.exitEv ?? args.summary.exit.exitEV),
      exitEquity: safeNumber(sheetDiagnostics.exitEquity ?? args.summary.exit.exitEquityValue),
      irr: safeNumber(sheetDiagnostics.irr ?? args.summary.exit.irr),
      moic: safeNumber(sheetDiagnostics.moic ?? args.summary.exit.moic),
    };

    console.log('[LBO SUMMARY]', logPayload);

    if (!totals.totalSources || !totals.totalUses) {
      console.warn('[LBO] Sources or uses resolved to zero', totals);
    }
  } catch (err: any) {
    console.error('[LBO] Failed to populate workbook', {
      message: err?.message,
      stack: err?.stack,
      ticker: args.summary.ticker,
    });
    // Re-throw with clear error message
    const errorMessage = err?.message || 'Unknown error';
    const error = new Error(errorMessage.startsWith('EXCEL_GENERATION_FAILED') ? errorMessage : `EXCEL_GENERATION_FAILED: ${errorMessage}`);
    (error as any).step = 'generate-workbook';
    throw error;
  }
}

function buildLboExcelInputs(
  summary: LboEngineOutput,
  slider: RunLboSliderAssumptions,
  overrides?: Partial<LBOInputs>,
  advancedOptions?: LboAdvancedOptions
): { inputs: LBOInputs; totals: { totalSources: number; totalUses: number; sponsorEquity: number } } {
  const ov = overrides ?? {};
  const advanced = normalizeAdvancedOptions(advancedOptions);
  const requireFinite = (value: number | undefined, label: string) => {
    if (!Number.isFinite(value)) {
      throw new Error(`Missing required LBO input: ${label}`);
    }
    return value;
  };
  const offerPremium = requireFinite(ov.offerPremium ?? slider.offerPremium, 'Offer premium');
  const sharePrice = safeNumber(ov.currentStockPrice ?? 150);
  const normalizeShares = (value?: number) => {
    const safeValue = safeNumber(value);
    if (safeValue <= 0) return 0;
    return safeValue > 1_000 ? safeValue / 1_000_000 : safeValue;
  };
  const basicShares = safeNumber(Math.max(
    normalizeShares(ov.basicSharesOutstanding ?? summary.sharesOutstanding ?? 100),
    0.01
  ));
  const options = safeNumber(Math.max(normalizeShares(ov.inTheMoneyOptions ?? 0), 0));
  const sharesSource = (ov.basicSharesOutstanding ?? ov.inTheMoneyOptions) ? 'override' : 'market';
  const rawEquityPurchase = safeNumber(sharePrice * (1 + offerPremium) * Math.max(basicShares + options, 0.01));
  let equityPurchase = safeNumber(ov.purchasePrice ?? rawEquityPurchase);
  if (!Number.isFinite(equityPurchase) || equityPurchase <= 0) {
    equityPurchase = rawEquityPurchase;
  }
  const netDebtValue = safeNumber(summary.netDebt ?? 0);
  const entryMultiple = requireFinite(slider.entryMultiple, 'Entry EBITDA multiple');
  const fallbackEV = safeNumber(Math.max(
    safeNumber(summary.entry.entryEV) || 0,
    safeNumber(summary.ltmEBITDA) * Math.max(entryMultiple, 6),
    safeNumber(summary.ltmRevenue) * 2,
    250
  ));
  if (!Number.isFinite(equityPurchase) || equityPurchase <= 0) {
    equityPurchase = safeNumber(Math.max(fallbackEV - netDebtValue, fallbackEV * 0.75, 100));
  }
  const entryEV = safeNumber(Math.max(equityPurchase + netDebtValue, fallbackEV));

  const advancedMinCash = advanced?.minimumCashAtClose ?? 0;
  const entryMinCash = Math.max(entryEV * 0.02, 5);
  const requestedMinCash = requireFinite(slider.minimumCash, 'Minimum cash balance');
  const baselineCashTarget = Math.max(entryMinCash, requestedMinCash, 5, advancedMinCash || 0);
  const cashFloor = Math.max(entryEV * 0.0025, 10);
  const cashTarget = Math.max(baselineCashTarget, cashFloor);
  const fundCashBalance = Math.max(ov.fundCashBalance ?? cashTarget, cashTarget);
  const cashOnBalance = Math.max(ov.cashOnBalance ?? cashTarget, cashTarget);
  const minimumCashBalance = Math.max(ov.minimumCashBalance ?? cashTarget, cashTarget);
  const financingFeesPercent = requireFinite(
    ov.financingFeesPercent ?? slider.financingFeesPercent,
    'Financing fees'
  );
  const transactionFeesPercent = requireFinite(
    slider.transactionFeesPercent,
    'Transaction fees'
  );
  const leverageMultiple = requireFinite(slider.leverageMultiple, 'Target leverage');

  const ltmEBITDA = Math.max(summary.ltmEBITDA, 1);
  const rawDebt = Math.max(ltmEBITDA * leverageMultiple, 0);
  const totalDebtTarget = Math.min(rawDebt, Math.max(entryEV * 0.75, 0));
  const termLoanB = Number((totalDebtTarget * 0.5).toFixed(2));
  const termLoanA = Number((totalDebtTarget * 0.3).toFixed(2));
  let seniorNotes = Math.max(totalDebtTarget - termLoanA - termLoanB, 0);
  let subordinatedNotes = ov.subordinatedNotes ?? 0;
  if ((!subordinatedNotes || subordinatedNotes <= 0) && advanced?.subordinatedNotesAmount) {
    subordinatedNotes = advanced.subordinatedNotesAmount;
  }
  let preferredStock = ov.preferredStock ?? 0;
  if ((!preferredStock || preferredStock <= 0) && advanced?.preferredEquityAmount) {
    preferredStock = advanced.preferredEquityAmount;
  }
  const revolverDraw = ov.revolverDraw ?? 0;
  const excessCash = ov.excessCash ?? 0;
  const optionLiquidation = ov.optionLiquidation ?? 0;
  const totalDebt = termLoanA + termLoanB + seniorNotes + subordinatedNotes + preferredStock;
  const refinanceDebt = Math.max(ov.refinanceDebt ?? netDebtValue ?? 0, 0);
  const transactionFees = Math.max(equityPurchase * transactionFeesPercent, Math.max(entryEV * 0.002, 10));
  const financingFees = Math.max(totalDebt * financingFeesPercent, Math.max(entryEV * 0.001, 5));
  const totalUses = equityPurchase + refinanceDebt + fundCashBalance + transactionFees + financingFees;
  let managementEquity = ov.managementEquity ?? 0;
  if ((!managementEquity || managementEquity <= 0) && advanced?.managementRolloverPct) {
    managementEquity = Math.max(equityPurchase * advanced.managementRolloverPct, 0);
  }
  const taxRefund = ov.taxRefund ?? 0;
  const otherSources =
    excessCash +
    optionLiquidation +
    revolverDraw +
    subordinatedNotes +
    preferredStock +
    managementEquity +
    taxRefund;
  let sponsorEquity = Math.max(totalUses - (termLoanA + termLoanB + seniorNotes) - otherSources, Math.max(totalUses * 0.05, 5));
  let totalSources =
    termLoanA +
    termLoanB +
    seniorNotes +
    subordinatedNotes +
    preferredStock +
    sponsorEquity +
    revolverDraw +
    optionLiquidation +
    excessCash +
    managementEquity +
    taxRefund;

  const diff = totalUses - totalSources;
  if (Math.abs(diff) > totalUses * 0.1) {
    console.warn('[LBO WARNING] Large Sources vs Uses imbalance before adjustment', {
      ticker: summary.ticker,
      totalSources,
      totalUses,
      diff,
    });
  }

  if (Math.abs(diff) > 0.001) {
    sponsorEquity += diff;
    totalSources += diff;
  }
  sponsorEquity = Math.max(sponsorEquity, 1);

  let bookValue = ov.bookValue ?? entryEV * 0.6;
  if (bookValue < 0) {
    bookValue = 0;
  }
  if (bookValue > equityPurchase) {
    console.warn('[LBO WARNING] Book value exceeded purchase price, clamping to prevent negative goodwill', {
      ticker: summary.ticker,
      bookValue,
      equityPurchase,
    });
    bookValue = equityPurchase;
  }
  const finalDebtRow = summary.debtSchedule[summary.debtSchedule.length - 1];
  const exitNetDebtRaw =
    finalDebtRow !== undefined
      ? finalDebtRow.endingDebt + finalDebtRow.revolverBalance
      : summary.exit.exitEV - summary.exit.exitEquityValue;
  const exitNetDebt = Math.max(exitNetDebtRaw, 0.01);

  const finalForecast = summary.forecast[summary.forecast.length - 1];
  const exitEbitda = finalForecast?.ebitda ?? ltmEBITDA;
  const exitMultiple = requireFinite(
    slider.exitMultiple,
    'Exit EBITDA multiple'
  );
  const exitPEMultiple = Math.max(ov.exitPEMultiple ?? exitMultiple, 5);
  const exitYear = requireFinite(slider.forecastYears, 'Hold period (years)');
  const taxRate = requireFinite(slider.taxRate, 'Tax rate');

  const exitEnterpriseValue = summary.exit.exitEV > 0 ? summary.exit.exitEV : exitEbitda * Math.max(exitMultiple, 6);
  const exitEquityValue = summary.exit.exitEquityValue > 0 ? summary.exit.exitEquityValue : Math.max(exitEnterpriseValue - exitNetDebt, sponsorEquity * 0.5, 1);
  let exitMoic = summary.exit.moic > 0 ? summary.exit.moic : Math.max(exitEquityValue / sponsorEquity, 0.5);
  exitMoic = Math.max(exitMoic, 0.01);
  
  // IRR calculation wrapped in try/catch - must never throw
  let exitIrr = safeNumber(summary.exit.irr);
  try {
    if (!(exitIrr > -1 && exitIrr < 5)) {
      if (exitMoic > 0 && exitYear > 0) {
        // Use shared precision helpers - no duplication allowed
        if (exitYear > 0 && exitMoic > 0) {
          // Reconstruct: if MOIC = exit/entry, then IRR from entry to exit
          // We can't get exact entry from MOIC alone, so use approximate calculation
          // This is a simplified case - prefer calculateIRR when you have entry/exit values
          exitIrr = calculateIRR(-1, exitMoic, exitYear);
        }
      }
    }
    if (!Number.isFinite(exitIrr) || exitIrr < -1 || exitIrr > 5) {
      exitIrr = 0;
    }
  } catch (err: any) {
    console.warn('[LBO WARNING] IRR calculation failed in buildLboExcelInputs, using 0', {
      ticker: summary.ticker,
      error: err?.message,
      moic: exitMoic,
      years: exitYear,
    });
    exitIrr = 0;
  }

  summary.exit.exitEV = Math.max(exitEnterpriseValue, 0.01);
  summary.exit.exitEquityValue = Math.max(exitEquityValue, 0.01);
  summary.exit.irr = exitIrr;
  summary.exit.moic = exitMoic;

  const sourcesDetail: LboDetailRow[] = [
    { label: 'Excess Cash', balance: excessCash, editable: true },
    { label: 'Liquidation of Stock Options', balance: optionLiquidation, editable: true },
    { label: 'Revolver Draw', balance: revolverDraw, editable: true },
    { label: 'Term Loan A', balance: termLoanA, editable: true },
    { label: 'Term Loan B', balance: termLoanB, editable: true },
    { label: 'Senior Notes', balance: seniorNotes, editable: true },
    { label: 'Subordinated Notes', balance: subordinatedNotes, editable: true },
    { label: 'Preferred Stock', balance: preferredStock, editable: true },
    { label: 'Sponsor Equity', balance: sponsorEquity, highlight: true },
    { label: 'Management Equity', balance: managementEquity, editable: true },
    { label: 'Tax Refund (if any)', balance: taxRefund, editable: true },
  ];

  const usesDetail: LboDetailRow[] = [
    { label: 'Equity Purchase Price', balance: equityPurchase },
    { label: 'Refinance Debt', balance: refinanceDebt, editable: true },
    { label: 'Fund Cash Balance', balance: fundCashBalance, editable: true },
    { label: 'Financing Fees', balance: financingFees },
    { label: 'Transaction Fees', balance: transactionFees },
  ];

  const inputs: LBOInputs = {
    ticker: summary.ticker,
    companyName: summary.companyName,
    sharesSource,
    currentStockPrice: sharePrice,
    offerPremium,
    basicSharesOutstanding: basicShares,
    inTheMoneyOptions: options,
    cashOnBalance,
    totalDebt,
    netDebt: summary.netDebt,
    minorityInterest: ov.minorityInterest ?? 0,
    convertibleDebt: ov.convertibleDebt ?? 0,
    bookValue,
    ltmRevenue: summary.ltmRevenue,
    ltmEBITDA,
    ltmEBIT: summary.ltmEBIT,
    ltmNetIncome: summary.ltmEBIT * (1 - taxRate),
    excessCash,
    optionLiquidation,
    revolverDraw,
    termLoanA,
    termLoanB,
    seniorNotes,
    subordinatedNotes,
    preferredStock,
    managementEquity: ov.managementEquity ?? 0,
    taxRefund: ov.taxRefund ?? 0,
    sponsorEquityOverride: sponsorEquity,
    sourcesDetail,
    usesDetail,
    refinanceDebt,
    fundCashBalance,
    financingFeesPercent,
    transactionFeesPercent,
    purchasePrice: equityPurchase,
    fvOfNCI: ov.fvOfNCI ?? 0,
    goodwillWriteOff: ov.goodwillWriteOff ?? 0,
    fairValueAdjustments: ov.fairValueAdjustments ?? 0,
    transactionDTL: ov.transactionDTL ?? 0,
    transactionDTA: ov.transactionDTA ?? 0,
    lastFYE: ov.lastFYE,
    mrqDate: ov.mrqDate,
    marketDate: ov.marketDate,
    closeDate: ov.closeDate,
    exitYear,
    exitMethod: 'EBITDA',
    exitEBITDAMultiple: exitMultiple,
    exitPEMultiple,
    minimumCashBalance,
    taxRate,
    exitEnterpriseValue,
    exitNetDebt,
    exitEquityValue,
    initialSponsorEquity: sponsorEquity,
    sponsorIRR: exitIrr,
    sponsorMOIC: exitMoic,
  };

  return {
    inputs,
    totals: {
      totalSources,
      totalUses,
      sponsorEquity,
    },
  };
}

function stabilizeLboWorksheet(
  sheet: ExcelJS.Worksheet,
  summary: LboEngineOutput,
  slider: RunLboSliderAssumptions
) {
  const sourcesUses = enforceSourcesUsesBalance(sheet, summary.ticker);
  enforcePurchasePriceAllocationSection(sheet, summary.ticker);
  enforceOptionalCapitalStructureRows(sheet);
  const exitStats = enforceExitMetricsSection(sheet, summary, slider);
  enforceExitAssumptionDefaults(sheet, summary, slider);
  enforceExitPeSensitivitySection(sheet, slider);
  enforceReturnSensitivitySection(sheet, summary);

  return {
    totalSources: sourcesUses.totalSources,
    totalUses: sourcesUses.totalUses,
    sponsorEquity: sourcesUses.sponsorEquity,
    exitEv: exitStats.exitEv,
    exitEquity: exitStats.exitEquity,
    irr: exitStats.irr,
    moic: exitStats.moic,
  };
}

function enforceSourcesUsesBalance(sheet: ExcelJS.Worksheet, ticker: string) {
  const totalSourcesCell = findValueCell(sheet, 'Total Sources');
  const totalUsesCell = findValueCell(sheet, 'Total Uses');
  const sponsorEquityCell = findValueCell(sheet, 'Sponsor Equity');

  if (!totalSourcesCell || !totalUsesCell || !sponsorEquityCell) {
    return {};
  }

  const totalSources = getNumber(totalSourcesCell.value);
  const totalUses = getNumber(totalUsesCell.value);
  const sponsorEquity = getNumber(sponsorEquityCell.value);
  const diff = totalUses - totalSources;

  if (Math.abs(diff) > 1e-6) {
    if (Math.abs(diff) > Math.max(totalUses, 1) * 0.1) {
      console.warn('[LBO WARNING] Sources/Uses imbalance detected in sheet', { ticker, diff, totalSources, totalUses });
    }

    const adjustedSponsorEquity = Math.max(sponsorEquity + diff, 0);
    setNumber(sponsorEquityCell, adjustedSponsorEquity);
    setNumber(totalSourcesCell, totalSources + diff);
    return {
      totalSources: totalSources + diff,
      totalUses,
      sponsorEquity: adjustedSponsorEquity,
    };
  }

  return { totalSources, totalUses, sponsorEquity };
}

function enforcePurchasePriceAllocationSection(sheet: ExcelJS.Worksheet, ticker: string) {
  const purchasePriceCell = findValueCell(sheet, 'Purchase Price');
  const bookValueCell = findValueCell(sheet, '– Book Value');
  if (!purchasePriceCell || !bookValueCell) {
    return;
  }

  const purchasePrice = Math.max(getNumber(purchasePriceCell.value), 0);
  let bookValue = Math.abs(getNumber(bookValueCell.value));
  if (bookValue > purchasePrice) {
    console.warn('[LBO WARNING] Book value exceeding purchase price inside worksheet', { ticker, purchasePrice, bookValue });
    bookValue = purchasePrice;
  }

  setNumber(purchasePriceCell, purchasePrice);
  setNumber(bookValueCell, -bookValue);

  const goodwillCell = findValueCell(sheet, 'Goodwill Created');
  if (goodwillCell) {
    setNumber(goodwillCell, Math.max(purchasePrice - bookValue, 0));
  }

  const zeroDefaultLabels = ['Write-off Goodwill', 'Fair Value Adjustments', 'Transaction DTL', 'Transaction DTA'];
  zeroDefaultLabels.forEach((label) => {
    const targetCell = findValueCell(sheet, label);
    if (!targetCell) {
      return;
    }
    const currentValue = getNumber(targetCell.value);
    if (!Number.isFinite(currentValue) || Math.abs(currentValue) < 1e-6) {
      setNumber(targetCell, 0);
    }
  });
}

function enforceOptionalCapitalStructureRows(sheet: ExcelJS.Worksheet) {
  const optionalRows = [
    {
      label: 'Subordinated Notes',
      note: 'No subordinated notes assumed in base model. Update if mezzanine debt is used.',
    },
    {
      label: 'Preferred Stock',
      note: 'Preferred equity not modeled in base case. Input proceeds if available.',
    },
    {
      label: 'Management Equity',
      note: 'Management rollover can be added here when relevant.',
    },
    {
      label: 'Tax Refund (if any)',
      note: 'No tax refund assumed. Populate with expected cash benefit if applicable.',
    },
  ];

  optionalRows.forEach(({ label, note }) => {
    const cell = findValueCell(sheet, label);
    if (!cell) {
      return;
    }
    const value = getNumber(cell.value);
    if (!Number.isFinite(value) || Math.abs(value) < 1e-6) {
      setNumber(cell, 0);
      if (!cell.note) {
        cell.note = note;
      }
    }
  });
}

function enforceExitAssumptionDefaults(
  sheet: ExcelJS.Worksheet,
  summary: LboEngineOutput,
  slider: RunLboSliderAssumptions
) {
  const exitPeCell = findValueCell(sheet, 'Exit P/E Multiple');
  const minCashCell = findValueCell(sheet, 'Minimum Cash Balance');
  const netDebtCell = findValueCell(sheet, 'Less: Net Debt at Exit');

  const computedExitPe = Math.max(slider.exitMultiple ?? summary.exit.exitMultiple ?? 15, 5);
  if (exitPeCell) {
    setNumber(exitPeCell, computedExitPe);
  }

  const computedMinCash = Math.max(
    slider.minimumCash ?? summary.entry.entryEV * 0.02,
    summary.exit.exitEV * 0.02,
    5
  );
  if (minCashCell) {
    setNumber(minCashCell, computedMinCash);
  }

  if (netDebtCell) {
    const exitNetDebt = Math.max(summary.exit.exitEV - summary.exit.exitEquityValue, 0);
    setNumber(netDebtCell, exitNetDebt);
  }
}

function enforceExitPeSensitivitySection(sheet: ExcelJS.Worksheet, slider: RunLboSliderAssumptions) {
  const basePeCell = findValueCell(sheet, 'Exit P/E Multiple');
  const basePe = Math.max(getNumber(basePeCell?.value) || slider.exitMultiple || 15, 5);
  const lowCell = findValueCell(sheet, 'Low Case Exit P/E');
  const baseCell = findValueCell(sheet, 'Base Case Exit P/E');
  const highCell = findValueCell(sheet, 'High Case Exit P/E');

  const lowValue = Math.max(basePe - 2, Math.max(basePe * 0.7, 5));
  const highValue = Math.max(lowValue, basePe + 2);

  if (lowCell) {
    setNumber(lowCell, lowValue);
  }
  if (baseCell) {
    setNumber(baseCell, basePe);
  }
  if (highCell) {
    setNumber(highCell, highValue);
  }
}

function enforceReturnSensitivitySection(sheet: ExcelJS.Worksheet, summary: LboEngineOutput) {
  const lowIrrCell = findValueCell(sheet, 'Low Case IRR');
  const highIrrCell = findValueCell(sheet, 'High Case IRR');
  const lowMoicCell = findValueCell(sheet, 'Low Case MOIC');
  const highMoicCell = findValueCell(sheet, 'High Case MOIC');

  const baseIrr = summary.exit.irr;
  const baseMoic = Math.max(summary.exit.moic, 0.01);

  if (lowIrrCell) {
    setNumber(lowIrrCell, Math.max(baseIrr - 0.02, 0));
  }
  if (highIrrCell) {
    setNumber(highIrrCell, Math.min(baseIrr + 0.02, 5));
  }
  if (lowMoicCell) {
    setNumber(lowMoicCell, Math.max(baseMoic - 0.1, 0.1));
  }
  if (highMoicCell) {
    setNumber(highMoicCell, baseMoic + 0.1);
  }
}

function normalizeAdvancedOptions(options?: LboAdvancedOptions): LboAdvancedOptions | undefined {
  if (!options) {
    return undefined;
  }
  const normalized: LboAdvancedOptions = {};
  if (typeof options.managementRolloverPct === 'number' && options.managementRolloverPct > 0) {
    normalized.managementRolloverPct = Math.min(Math.max(options.managementRolloverPct, 0), 0.9);
  }
  if (typeof options.preferredEquityAmount === 'number' && options.preferredEquityAmount > 0) {
    normalized.preferredEquityAmount = Math.max(options.preferredEquityAmount, 0);
  }
  if (typeof options.subordinatedNotesAmount === 'number' && options.subordinatedNotesAmount > 0) {
    normalized.subordinatedNotesAmount = Math.max(options.subordinatedNotesAmount, 0);
  }
  if (typeof options.minimumCashAtClose === 'number' && options.minimumCashAtClose > 0) {
    normalized.minimumCashAtClose = Math.max(options.minimumCashAtClose, 0);
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function enforceExitMetricsSection(
  sheet: ExcelJS.Worksheet,
  summary: LboEngineOutput,
  slider: RunLboSliderAssumptions
) {
  const exitEvCell = findValueCell(sheet, 'Exit Enterprise Value');
  const exitNetDebtCell = findValueCell(sheet, 'Less: Net Debt at Exit');
  const exitEquityCell = findValueCell(sheet, 'Exit Equity Value');
  const initialEquityCell = findValueCell(sheet, 'Initial Sponsor Equity');
  const irrCell = findValueCell(sheet, 'Sponsor IRR');
  const moicCell = findValueCell(sheet, 'Sponsor MOIC');

  if (!exitEvCell || !exitEquityCell) {
    return {};
  }

  const exitYears = Math.max(slider.forecastYears ?? summary.forecast.length ?? 5, 1);
  const safeExitEv = Math.max(summary.exit.exitEV, 0.01);
  const safeNetDebt = Math.max(summary.exit.exitEV - summary.exit.exitEquityValue, 0);
  const initialEquity = Math.max(
    getNumber(initialEquityCell?.value ?? summary.entry.equityContribution),
    0.01
  );
  const safeExitEquity = Math.max(summary.exit.exitEquityValue, safeExitEv - safeNetDebt, 0.01);
  let moic = Math.max(summary.exit.moic, safeExitEquity / initialEquity, 0.01);
  let irr = safeNumber(summary.exit.irr);
  
  // IRR calculation wrapped in try/catch - must never throw
  try {
    if (!Number.isFinite(irr) || irr < -1 || irr > 5) {
      if (moic > 0 && exitYears > 0) {
        // Use shared precision helpers - no duplication allowed
        if (exitYears > 0 && moic > 0) {
          // Reconstruct IRR from MOIC: if MOIC = exit/entry, IRR = (exit/entry)^(1/years) - 1
          // Use simplified calculation with entry = 1
          irr = calculateIRR(-1, moic, exitYears);
        }
      }
    }
    if (!Number.isFinite(irr) || irr < -1 || irr > 5) {
      irr = 0;
    }
  } catch (err: any) {
    console.warn('[LBO WARNING] IRR calculation failed in sheet enforcement, using 0', {
      ticker: summary.ticker,
      error: err?.message,
      moic,
      years: exitYears,
    });
    irr = 0;
  }

  setNumber(exitEvCell, safeExitEv);
  if (exitNetDebtCell) {
    setNumber(exitNetDebtCell, safeNetDebt);
  }
  setNumber(exitEquityCell, safeExitEquity);
  if (initialEquityCell) {
    setNumber(initialEquityCell, initialEquity);
  }
  if (irrCell) {
    setNumber(irrCell, irr);
  }
  if (moicCell) {
    setNumber(moicCell, moic);
  }

  return { exitEv: safeExitEv, exitEquity: safeExitEquity, irr, moic };
}

function findValueCell(
  sheet: ExcelJS.Worksheet,
  label: string,
  labelColumn = 1,
  valueColumn = 2
): ExcelJS.Cell | null {
  const normalizedTarget = normalizeLabel(label);

  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const labelCell = row.getCell(labelColumn);
    const cellText = normalizeLabel(labelCell.value);
    if (cellText && cellText === normalizedTarget) {
      return row.getCell(valueColumn);
    }
  }

  return null;
}

function normalizeLabel(value: ExcelJS.CellValue | undefined): string | null {
  if (!value) {
    return null;
  }
  return value
    .toString()
    .replace(/[–—]/g, '-')
    .trim()
    .toLowerCase();
}

function getNumber(value: ExcelJS.CellValue | undefined): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]+/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  if (value && typeof value === 'object' && 'result' in (value as Record<string, unknown>)) {
    const formulaValue = value as { result?: number };
    const resultValue = formulaValue.result;
    return typeof resultValue === 'number' ? resultValue : 0;
  }
  return 0;
}

function setNumber(cell: ExcelJS.Cell | null | undefined, value: number) {
  if (!cell) {
    return;
  }
  // Use safeNumber to ensure no NaN or Infinity reaches Excel
  const safeValue = safeNumber(value);
  try {
    cell.value = safeValue;
  } catch (err: any) {
    console.warn('[LBO] Failed to set cell value, using 0', {
      error: err?.message,
      value,
      safeValue,
    });
    cell.value = 0;
  }
}
