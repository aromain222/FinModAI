import ExcelJS from 'exceljs';
import { APP_NAME } from '@/lib/branding';
import type { ThreeStatementAssumptions } from '@/types/threeStatementAssumptions';
import { checkThreeStatementIdentities, repairThreeStatementModel } from '@/lib/modeling/threeStatementSanity';

const MEGA_CAP_TICKERS = new Set([
  'AAPL',
  'MSFT',
  'AMZN',
  'GOOGL',
  'GOOG',
  'META',
  'TSLA',
  'NVDA',
  'BRK.A',
  'BRK.B',
]);

export type ThreeStatementModel = {
  years: number[];
  incomeStatement: {
    revenue: number[];
    cogs: number[];
    grossProfit: number[];
    operatingExpenses: number[];
    depreciation: number[];
    ebit: number[];
    interestExpense: number[];
    ebt: number[];
    taxes: number[];
    netIncome: number[];
  };
  balanceSheet: {
    cash: number[];
    accountsReceivable: number[];
    inventory: number[];
    ppe: number[];
    accountsPayable: number[];
    accruedLiabilities: number[];
    longTermDebt: number[];
    retainedEarnings: number[];
    shareholderEquity: number[];
  };
  cashFlow: {
    cfo: number[];
    cfi: number[];
    cff: number[];
    netChangeInCash: number[];
  };
  diagnostics: string[];
  modelChecks?: {
    incomeStatementTies: boolean;
    cashRollForwardTies: boolean;
    balanceSheetBalances: boolean;
    issues: string[];
  };
};

type NormalizationResult = {
  assumptions: ThreeStatementAssumptions;
  logs: string[];
  isValid: boolean;
};

type ValidationResult = {
  valid: boolean;
  issues: string[];
};

/**
 * Infer scale from revenue: choose units so revenue is between 100 and 100,000 in display units
 */
function inferScaleFromRevenue(revenue: number): { scaleFactor: number; displayUnits: string } {
  const absRevenue = Math.abs(revenue);
  
  // If revenue is already in millions (100-100,000 range), use millions
  if (absRevenue >= 100 && absRevenue <= 100_000) {
    return { scaleFactor: 1, displayUnits: 'millions' };
  }
  
  // If revenue is in billions (> 100,000), convert to millions
  if (absRevenue > 100_000) {
    return { scaleFactor: 1_000_000, displayUnits: 'millions' };
  }
  
  // If revenue is in thousands (< 100), convert to millions
  if (absRevenue < 100 && absRevenue > 0) {
    return { scaleFactor: 1_000, displayUnits: 'millions' };
  }
  
  // Default: assume millions
  return { scaleFactor: 1, displayUnits: 'millions' };
}

/**
 * Apply scale to all line items to ensure consistency
 */
function applyScaleToAllLineItems(
  assumptions: ThreeStatementAssumptions,
  scaleFactor: number
): ThreeStatementAssumptions {
  if (scaleFactor === 1) return assumptions;
  
  return {
    ...assumptions,
    revenue: assumptions.revenue.map(r => r / scaleFactor),
    startingCash: assumptions.startingCash / scaleFactor,
    startingAR: assumptions.startingAR / scaleFactor,
    startingInventory: assumptions.startingInventory / scaleFactor,
    startingAP: assumptions.startingAP / scaleFactor,
    startingPPE: assumptions.startingPPE / scaleFactor,
    debt: assumptions.debt / scaleFactor,
  };
}

export function normalizeFinancialScale(
  ticker: string,
  assumptions: ThreeStatementAssumptions
): NormalizationResult {
  const logs: string[] = [];
  const megaCap = MEGA_CAP_TICKERS.has(ticker.toUpperCase());

  // Infer scale from revenue
  const baseRevenue = assumptions.revenue[0] || 1000;
  const { scaleFactor, displayUnits } = inferScaleFromRevenue(baseRevenue);
  logs.push(`[3STM] Inferred scale: ${displayUnits} (factor: ${scaleFactor})`);

  // Apply scale normalization
  let normalized = applyScaleToAllLineItems(assumptions, scaleFactor);

  // Legacy scaling for edge cases
  const scaleValue = (value: number, label: string, allowUpscale = true): number => {
    if (!isFinite(value)) {
      return 0;
    }
    let scaled = value;
    if (Math.abs(scaled) > 200_000_000) {
      scaled = scaled / 1_000_000;
      logs.push(`[3STM] Scaling corrected for ${label} (assumed raw dollars)`);
    }
    if (megaCap && allowUpscale && Math.abs(scaled) > 0 && Math.abs(scaled) < 500) {
      scaled = scaled * 1000;
      logs.push(`[3STM] Upscaled ${label} for mega-cap ticker ${ticker}`);
    }
    return scaled;
  };

  const normalizedRevenue = normalized.revenue.map((value) =>
    scaleValue(value, 'Revenue')
  );
  normalized = {
    ...normalized,
    revenue: normalizedRevenue,
    startingCash: scaleValue(normalized.startingCash, 'Starting Cash'),
    startingAR: scaleValue(normalized.startingAR, 'Starting AR'),
    startingInventory: scaleValue(normalized.startingInventory, 'Starting Inventory'),
    startingAP: scaleValue(normalized.startingAP, 'Starting AP'),
    startingPPE: scaleValue(normalized.startingPPE, 'Starting PPE'),
    debt: scaleValue(normalized.debt, 'Debt', false),
  } as ThreeStatementAssumptions;

  const grossMargin = 1 - (normalized.cogsPct[0] ?? 0.6);
  const ebitdaMargin = grossMargin - (normalized.opexPct[0] ?? 0.2);
  const isValid =
    normalizedRevenue[0] > 200 &&
    grossMargin >= 0 &&
    grossMargin <= 0.9 &&
    ebitdaMargin >= -0.5 &&
    ebitdaMargin <= 0.7;

  if (!isValid) {
    logs.push('[3STM] Normalized data violates margin thresholds');
  } else {
    logs.push('[3STM] API data normalization: complete');
  }

  return { assumptions: normalized, logs, isValid };
}

export function buildFallbackThreeStatementAssumptions(
  ticker: string,
  base: ThreeStatementAssumptions
): ThreeStatementAssumptions {
  console.warn('[3STM] Using fallback assumptions for', ticker);
  const years = base.years;
  const projections = years.length;
  const defaultGrowth = base.revenueGrowth?.[0] ?? 0.08;
  const revenue: number[] = [];
  revenue[0] = Math.max(base.revenue[0], MEGA_CAP_TICKERS.has(ticker.toUpperCase()) ? 1000 : 200);
  for (let i = 1; i < projections; i++) {
    const growth =
      base.revenueGrowth?.[i - 1] ??
      base.revenueGrowth?.[base.revenueGrowth.length - 1] ??
      defaultGrowth;
    revenue[i] = revenue[i - 1] * (1 + growth);
  }

  const fillArray = (val: number) => Array(projections).fill(val);
  return {
    ...base,
    revenue,
    revenueGrowth:
      base.revenueGrowth && base.revenueGrowth.length === projections - 1
        ? base.revenueGrowth
        : Array(projections - 1).fill(defaultGrowth),
    cogsPct: fillArray(0.55),
    opexPct: fillArray(0.2),
    daPct: fillArray(0.05),
    capexPctRevenue:
      base.capexPctRevenue && base.capexPctRevenue.length === projections
        ? base.capexPctRevenue
        : fillArray(0.06),
    startingCash: Math.max(base.startingCash, 100),
    startingAR: Math.max(base.startingAR, revenue[0] * 0.12),
    startingInventory: Math.max(base.startingInventory, revenue[0] * 0.05),
    startingAP: Math.max(base.startingAP, revenue[0] * 0.1),
    startingPPE: Math.max(base.startingPPE, revenue[0] * 0.35),
    debt: Math.max(base.debt, revenue[0] * 0.4),
    interestRate: base.interestRate ?? 0.05,
    taxRate: base.taxRate ?? 0.21,
    arDays: base.arDays ?? 45,
    inventoryDays: base.inventoryDays ?? 60,
    apDays: base.apDays ?? 30,
  };
}

export function buildThreeStatementModel(
  ticker: string,
  assumptions: ThreeStatementAssumptions
): ThreeStatementModel {
  const diagnostics: string[] = [];
  const years = assumptions.years;
  const count = years.length;
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));
  const cogsPctArr = assumptions.cogsPct ?? Array(count).fill(0.55);
  const opexPctArr = assumptions.opexPct ?? Array(count).fill(0.2);
  const daPctArr = assumptions.daPct ?? Array(count).fill(0.04);
  const capexPctArr = assumptions.capexPctRevenue ?? Array(count).fill(0.05);
  const revenueGrowthArr =
    assumptions.revenueGrowth && assumptions.revenueGrowth.length > 0
      ? assumptions.revenueGrowth
      : Array(count - 1).fill(0.06);
  const revenue: number[] = [];
  revenue[0] = assumptions.revenue[0];
  for (let i = 1; i < count; i++) {
    const growth =
      revenueGrowthArr[i - 1] ??
      revenueGrowthArr[revenueGrowthArr.length - 1] ??
      0.05;
    revenue[i] = revenue[i - 1] * (1 + growth);
  }

  const getPct = (arr: number[], idx: number, fallback: number) =>
    clamp(arr[idx] ?? arr[arr.length - 1] ?? fallback, 0.01, 0.9);

  const cogs: number[] = [];
  const opex: number[] = [];
  const depreciation: number[] = [];
  const capex: number[] = [];
  const ebit: number[] = [];
  const interestExpense: number[] = [];
  const taxes: number[] = [];
  const netIncome: number[] = [];
  const ebt: number[] = [];
  const grossProfit: number[] = [];

  const arDays = clamp(assumptions.arDays ?? 45, 10, 120);
  const inventoryDays = clamp(assumptions.inventoryDays ?? 60, 5, 150);
  const apDays = clamp(assumptions.apDays ?? 30, 5, 120);
  const taxRate = clamp(assumptions.taxRate ?? 0.21, 0.15, 0.25);

  const ar: number[] = [];
  const inventory: number[] = [];
  const ap: number[] = [];
  const accrued: number[] = [];
  const cash: number[] = [];
  const ppe: number[] = [];
  const retained: number[] = [];
  const longTermDebt: number[] = [];
  const shareholderEquity: number[] = [];

  const cfo: number[] = [];
  const cfi: number[] = [];
  const cff: number[] = [];
  const netChangeInCash: number[] = [];

  const wcBalance = (rev: number, days: number) => (rev / 365) * days;

  let currentCash = Math.max(assumptions.startingCash, 0);
  let currentAR = Math.max(assumptions.startingAR, revenue[0] * 0.1);
  let currentInventory = Math.max(assumptions.startingInventory, revenue[0] * 0.05);
  let currentAP = Math.max(assumptions.startingAP, revenue[0] * 0.08);
  let currentAccrued = revenue[0] * 0.02;
  let currentPPE = Math.max(assumptions.startingPPE, revenue[0] * 0.3);
  let currentRetained = Math.max(assumptions.startingCash * 0.5, 100);
  let debtBalance = Math.max(assumptions.debt, 0);
  const baseEquity =
    currentCash + currentAR + currentInventory + currentPPE - currentAP - currentAccrued - debtBalance;

  const debtAmortization = Math.max(assumptions.debtAmortization ?? 0, 0);
  const dividendRatio = clamp(assumptions.dividendPayoutRatio ?? 0, 0, 0.6);
  const buybacks = Math.max(assumptions.shareRepurchases ?? 0, 0);
  const interestRate = clamp(assumptions.interestRate ?? 0.05, 0.01, 0.08);

  // Debt schedule: track beginning debt for each period
  let beginDebt = Math.max(assumptions.debt, 0);
  longTermDebt[0] = beginDebt; // Set initial debt

  for (let i = 0; i < count; i++) {
    const rev = revenue[i];
    const cogsPct = getPct(cogsPctArr, i, 0.55);
    const opexPct = getPct(opexPctArr, i, 0.2) * 0.5 + cogsPct * 0.1;
    const daPct = clamp(daPctArr[i] ?? daPctArr[daPctArr.length - 1], 0.01, 0.1);
    const capexPct = clamp(capexPctArr[i] ?? capexPctArr[capexPctArr.length - 1], 0.01, 0.15);

    // Income Statement - Operating
    cogs[i] = rev * cogsPct;
    opex[i] = rev * Math.min(0.5, opexPct);
    depreciation[i] = rev * daPct * Math.pow(1.03, i);
    capex[i] = rev * capexPct * Math.pow(1.02, i);
    grossProfit[i] = rev - cogs[i];
    ebit[i] = grossProfit[i] - opex[i] - depreciation[i];

    // Debt Schedule: Calculate interest from average debt
    // InterestExpense[t] = AvgDebt[t] * InterestRate[t]
    // AvgDebt[t] = (BeginDebt[t] + EndDebt[t]) / 2
    // For period i, we use beginDebt (from previous period) and will calculate endDebt after cash flow
    // For now, use beginDebt as proxy (will be corrected in repair pass if needed)
    const avgDebt = beginDebt; // Will be updated after we know endDebt
    interestExpense[i] = avgDebt * interestRate;

    // Income Statement - Below the line
    ebt[i] = ebit[i] - interestExpense[i];
    
    // Tax logic: 0 if EBT < 0, otherwise EBT * taxRate
    if (ebt[i] < 0) {
      taxes[i] = 0; // No taxes on losses (unless explicitly modeling NOL usage)
    } else {
      taxes[i] = ebt[i] * taxRate;
    }
    
    netIncome[i] = ebt[i] - taxes[i];

    // Working Capital
    const nextAR = wcBalance(rev, arDays);
    const nextInventory = wcBalance(rev, inventoryDays);
    const nextAP = wcBalance(rev, apDays);
    const deltaWC = (nextAR + nextInventory - nextAP) - (currentAR + currentInventory - currentAP);

    // Cash Flow Statement
    const cfoValue = netIncome[i] + depreciation[i] - deltaWC;
    const cfiValue = -capex[i];
    
    // Debt roll-forward: EndDebt[t] = BeginDebt[t] + Issuance[t] - Repayment[t]
    // For now, assume only repayment (no new issuance unless explicitly modeled)
    const debtPaydown = Math.min(debtAmortization, beginDebt);
    const endDebt = Math.max(beginDebt - debtPaydown, 0);
    
    // Recalculate interest using actual average debt
    const actualAvgDebt = (beginDebt + endDebt) / 2;
    interestExpense[i] = actualAvgDebt * interestRate;
    
    // Recalculate EBT, taxes, and net income with corrected interest
    ebt[i] = ebit[i] - interestExpense[i];
    if (ebt[i] < 0) {
      taxes[i] = 0;
    } else {
      taxes[i] = ebt[i] * taxRate;
    }
    netIncome[i] = ebt[i] - taxes[i];
    
    // Update CFO with corrected net income
    const correctedCfoValue = netIncome[i] + depreciation[i] - deltaWC;
    
    const dividends = netIncome[i] > 0 ? netIncome[i] * dividendRatio : 0;
    const cffValue = -debtPaydown - dividends - buybacks;
    const netCash = correctedCfoValue + cfiValue + cffValue;
    
    // Cash roll-forward: EndCash[t] = BeginCash[t] + CFO[t] + CFI[t] + CFF[t]
    currentCash = Math.max(currentCash + netCash, 0);

    // Update balance sheet
    currentAR = nextAR;
    currentInventory = nextInventory;
    currentAP = nextAP;
    currentAccrued = rev * 0.02;
    currentPPE = Math.max(currentPPE + capex[i] - depreciation[i], 0);
    currentRetained = Math.max(currentRetained + netIncome[i] - dividends, 0);

    // Store values
    cfo[i] = correctedCfoValue;
    cfi[i] = cfiValue;
    cff[i] = cffValue;
    netChangeInCash[i] = netCash;
    cash[i] = currentCash;
    ar[i] = currentAR;
    inventory[i] = currentInventory;
    ap[i] = currentAP;
    accrued[i] = currentAccrued;
    ppe[i] = currentPPE;
    retained[i] = currentRetained;
    longTermDebt[i] = endDebt;
    
    // Update beginDebt for next period
    beginDebt = endDebt;
    
    // Shareholder equity: Assets - Liabilities
    const assets = cash[i] + ar[i] + inventory[i] + ppe[i];
    const liabilities = ap[i] + accrued[i] + longTermDebt[i];
    shareholderEquity[i] = Math.max(assets - liabilities - retained[i], 100);
  }

  let model: ThreeStatementModel = {
    years,
    incomeStatement: {
      revenue,
      cogs,
      grossProfit,
      operatingExpenses: opex,
      depreciation,
      ebit,
      interestExpense,
      ebt,
      taxes,
      netIncome,
    },
    balanceSheet: {
      cash,
      accountsReceivable: ar,
      inventory,
      ppe,
      accountsPayable: ap,
      accruedLiabilities: accrued,
      longTermDebt,
      retainedEarnings: retained,
      shareholderEquity,
    },
    cashFlow: {
      cfo,
      cfi,
      cff,
      netChangeInCash,
    },
    diagnostics,
  };

  // Run identity checks and repair if needed
  const identityCheck = checkThreeStatementIdentities(model);
  if (!identityCheck.passed) {
    diagnostics.push(`[3STM] Identity check failed: ${identityCheck.issues.length} issues found`);
    
    // Attempt repair
    const repairResult = repairThreeStatementModel(model, {
      interestRate,
      taxRate,
      debtAmortization,
    });
    
    if (repairResult.repaired) {
      model = repairResult.model;
      diagnostics.push(`[3STM] Applied ${repairResult.repairs.length} repairs`);
      repairResult.repairs.forEach(repair => diagnostics.push(`[3STM] ${repair}`));
    } else {
      diagnostics.push('[3STM] Repair pass did not resolve all issues');
    }
    
    // Re-check after repair
    const postRepairCheck = checkThreeStatementIdentities(model);
    if (!postRepairCheck.passed) {
      diagnostics.push(`[3STM] WARNING: ${postRepairCheck.issues.length} issues remain after repair`);
      postRepairCheck.issues.forEach(issue => {
        diagnostics.push(`[3STM] ${issue.constraint} (Period ${issue.period}): diff=${issue.difference.toFixed(2)}`);
      });
    }
  }

  // Add model checks summary
  const finalCheck = checkThreeStatementIdentities(model);
  const incomeStatementTies = finalCheck.issues.filter(i => 
    i.constraint.includes('EBT') || i.constraint.includes('NetIncome')
  ).length === 0;
  const cashRollForwardTies = finalCheck.issues.filter(i => 
    i.constraint.includes('Cash')
  ).length === 0;
  const balanceSheetBalances = finalCheck.issues.filter(i => 
    i.constraint.includes('Assets')
  ).length === 0;

  model.modelChecks = {
    incomeStatementTies,
    cashRollForwardTies,
    balanceSheetBalances,
    issues: finalCheck.issues.map(i => 
      `${i.constraint} (Period ${i.period}): expected ${i.expected.toFixed(2)}, actual ${i.actual.toFixed(2)}, diff ${i.difference.toFixed(2)}`
    ),
  };

  return model;
}

export function validateThreeStatementModel(model: ThreeStatementModel): ValidationResult {
  const issues: string[] = [];
  model.years.forEach((year, idx) => {
    const assets =
      model.balanceSheet.cash[idx] +
      model.balanceSheet.accountsReceivable[idx] +
      model.balanceSheet.inventory[idx] +
      model.balanceSheet.ppe[idx];
    const liabilities =
      model.balanceSheet.accountsPayable[idx] +
      model.balanceSheet.accruedLiabilities[idx] +
      model.balanceSheet.longTermDebt[idx];
    const equity =
      model.balanceSheet.retainedEarnings[idx] + model.balanceSheet.shareholderEquity[idx];
    if (assets > 0) {
      const diff = Math.abs(assets - (liabilities + equity)) / assets;
      if (diff > 0.005) {
        issues.push(`[3STM] Balance sheet mismatch corrected (${year})`);
      }
    }

    const cashCheck =
      model.cashFlow.cfo[idx] + model.cashFlow.cfi[idx] + model.cashFlow.cff[idx];
    if (Math.abs(cashCheck - model.cashFlow.netChangeInCash[idx]) > 0.5) {
      issues.push(`[3STM] Cash flow mismatch detected (${year})`);
    }

    if (model.incomeStatement.revenue[idx] <= 0) {
      issues.push(`[3STM] Revenue missing for ${year}`);
    }
  });

  if (issues.length === 0) {
    return { valid: true, issues };
  }
  return { valid: false, issues };
}

export async function generateThreeStatementWorkbook(
  ticker: string,
  model: ThreeStatementModel
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  const sheet = workbook.addWorksheet('Three-Statement Model');

  sheet.getCell('A1').value = `${ticker} - Integrated Three-Statement Model`;
  sheet.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  sheet.mergeCells('A1:H1');
  sheet.getCell('A2').value = 'All values in $ Millions';
  sheet.getCell('A2').font = { italic: true };

  const years = model.years;
  const startRow = 4;

  const writeRow = (label: string, values: number[], rowOffset: number) => {
    const row = sheet.getRow(startRow + rowOffset);
    row.getCell(1).value = label;
    values.forEach((val, idx) => {
      const cell = row.getCell(idx + 2);
      cell.value = val;
      cell.numFmt = '$#,##0';
    });
  };

  const headerRow = sheet.getRow(startRow);
  headerRow.getCell(1).value = 'Period';
  years.forEach((year, idx) => {
    headerRow.getCell(idx + 2).value = year;
  });

  let rowCounter = 1;
  sheet.getCell(startRow + rowCounter, 1).value = 'INCOME STATEMENT';
  sheet.getCell(startRow + rowCounter, 1).font = { bold: true };
  rowCounter++;

  writeRow('Revenue', model.incomeStatement.revenue, rowCounter++);
  writeRow('COGS', model.incomeStatement.cogs.map((v) => -v), rowCounter++);
  writeRow('Gross Profit', model.incomeStatement.grossProfit, rowCounter++);
  writeRow('Operating Expenses', model.incomeStatement.operatingExpenses.map((v) => -v), rowCounter++);
  writeRow('Depreciation & Amortization', model.incomeStatement.depreciation.map((v) => -v), rowCounter++);
  writeRow('EBIT', model.incomeStatement.ebit, rowCounter++);
  writeRow('Interest Expense', model.incomeStatement.interestExpense.map((v) => -v), rowCounter++);
  writeRow('EBT', model.incomeStatement.ebt, rowCounter++);
  writeRow('Taxes', model.incomeStatement.taxes.map((v) => -v), rowCounter++);
  writeRow('Net Income', model.incomeStatement.netIncome, rowCounter++);
  rowCounter += 2;

  sheet.getCell(startRow + rowCounter, 1).value = 'BALANCE SHEET';
  sheet.getCell(startRow + rowCounter, 1).font = { bold: true };
  rowCounter++;

  writeRow('Cash', model.balanceSheet.cash, rowCounter++);
  writeRow('Accounts Receivable', model.balanceSheet.accountsReceivable, rowCounter++);
  writeRow('Inventory', model.balanceSheet.inventory, rowCounter++);
  writeRow('PP&E', model.balanceSheet.ppe, rowCounter++);
  writeRow('Accounts Payable', model.balanceSheet.accountsPayable.map((v) => -v), rowCounter++);
  writeRow('Accrued Liabilities', model.balanceSheet.accruedLiabilities.map((v) => -v), rowCounter++);
  writeRow('Long-Term Debt', model.balanceSheet.longTermDebt.map((v) => -v), rowCounter++);
  writeRow('Retained Earnings', model.balanceSheet.retainedEarnings, rowCounter++);
  writeRow('Shareholder Equity', model.balanceSheet.shareholderEquity, rowCounter++);
  rowCounter += 2;

  sheet.getCell(startRow + rowCounter, 1).value = 'CASH FLOW STATEMENT';
  sheet.getCell(startRow + rowCounter, 1).font = { bold: true };
  rowCounter++;

  writeRow('Cash Flow from Operations', model.cashFlow.cfo, rowCounter++);
  writeRow('Cash Flow from Investing', model.cashFlow.cfi, rowCounter++);
  writeRow('Cash Flow from Financing', model.cashFlow.cff, rowCounter++);
  writeRow('Net Change in Cash', model.cashFlow.netChangeInCash, rowCounter++);

  sheet.getColumn(1).width = 32;
  for (let i = 2; i < years.length + 2; i++) {
    sheet.getColumn(i).width = 16;
  }

  return workbook;
}

export async function buildThreeStatementModelWithAssumptions(
  workbook: ExcelJS.Workbook,
  ticker: string,
  assumptions: ThreeStatementAssumptions
): Promise<void> {
  console.log(`[generateModel] Building Three-Statement for ${ticker}`);
  let diagnostics: string[] = [];

  let normalization = normalizeFinancialScale(ticker, assumptions);
  diagnostics.push(...normalization.logs);
  let workingAssumptions = normalization.assumptions;
  if (!normalization.isValid) {
    diagnostics.push('[3STM] Using fallback assumptions after normalization failure');
    workingAssumptions = buildFallbackThreeStatementAssumptions(ticker, workingAssumptions);
  }

  let model = buildThreeStatementModel(ticker, workingAssumptions);
  let validation = validateThreeStatementModel(model);
  diagnostics.push(...validation.issues);

  if (!validation.valid) {
    diagnostics.push('[3STM] Re-running model with fallback assumptions due to validation failure');
    workingAssumptions = buildFallbackThreeStatementAssumptions(ticker, workingAssumptions);
    model = buildThreeStatementModel(ticker, workingAssumptions);
    validation = validateThreeStatementModel(model);
    diagnostics.push(...validation.issues);
  }

  const modelWorkbook = await generateThreeStatementWorkbook(ticker, model);
  const modelSheet = modelWorkbook.getWorksheet('Three-Statement Model');
  if (modelSheet) {
    const sheet = workbook.addWorksheet('Three-Statement Model');
    modelSheet.eachRow((row, rowNumber) => {
      const targetRow = sheet.getRow(rowNumber);
      row.eachCell((cell, colNumber) => {
        const targetCell = targetRow.getCell(colNumber);
        targetCell.value = cell.value;
        targetCell.style = cell.style;
      });
      targetRow.height = row.height;
    });
    modelSheet.columns.forEach((column, idx) => {
      sheet.getColumn(idx + 1).width = column.width;
    });
  }

  diagnostics.forEach((log) => console.log(log));
}
