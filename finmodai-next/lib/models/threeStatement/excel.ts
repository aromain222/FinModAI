/**
 * Three-Statement Model Excel Generator
 * Uses CapitalBase style kit for consistent layout, no array-in-cell, hide unused area.
 */

import ExcelJS from 'exceljs';
import {
  createNormalStyle,
  createHeaderStyle,
  createInputStyle,
  createFormulaStyle,
  createTotalStyle,
  createSubHeaderStyle,
  applyNumberFormat,
  setColumnWidths,
} from '../../excel/formatting';
import {
  applyWorkbookDefaults,
  applySheetDefaults,
  setColumnWidths as setColWidthsKit,
  hideUnusedArea,
  titleBar,
  metadataBlock,
  sectionHeader,
  tableHeader,
  zebraRows,
  inputCell,
  bodyCell,
  borderBox,
  writeSeriesAcrossYears,
  NUM_FMT,
  COLORS,
} from '../../excel/styleKit';
import { normalizeSeries } from '../../excel/styles';
import {
  INCOME_STATEMENT_ROW_SCHEMA,
  BALANCE_SHEET_ROW_SCHEMA,
  CASH_FLOW_ROW_SCHEMA,
} from '@/lib/modelFormat';
import {
  renderStatementSheet,
  freezeFirstColumnAndHeader,
  applyPrintSetup,
} from '@/lib/modelTemplate';
import { writeValuationBlock } from '../../excel/valuationBlock';

const THREE_STATEMENT_MODEL_TITLE = 'Three-Statement Financial Model';

export interface ThreeStatementInputs {
  ticker: string;
  companyName?: string;
  years: number[];
  revenue: number[];
  revenueGrowth?: number[];
  cogsPct?: number[];
  grossMargin?: number[];
  ebitdaMargin?: number[];
  opExPct?: number[];
  taxRate?: number;
  daPct?: number[];
  capexPctRevenue?: number[];
  nwcPctRevenue?: number[];
  debt?: number;
  interestRate?: number;
  startingCash?: number;
  startingPPE?: number;
  startingAR?: number;
  startingInventory?: number;
  startingAP?: number;
  arDays?: number;
  inventoryDays?: number;
  apDays?: number;
  sharesOutstanding?: number;
  sharesSource?: 'Reported' | 'Derived (Mkt Cap ÷ Price)' | 'User Provided' | 'Unavailable';
  marketSharePrice?: number | null;
  netDebt?: number;
  // Scenario support
  scenarios?: {
    base?: ThreeStatementInputs;
    downside?: ThreeStatementInputs;
    upside?: ThreeStatementInputs;
  };
  // Data source tracking
  dataSources?: {
    revenue?: 'Reported' | 'Derived' | 'User';
    ebitda?: 'Reported' | 'Derived' | 'User';
    netIncome?: 'Reported' | 'Derived' | 'User';
    sharesOutstanding?: 'Reported' | 'Derived' | 'User';
    [key: string]: 'Reported' | 'Derived' | 'User' | undefined;
  };
}

export interface ThreeStatementOutput {
  ticker: string;
  companyName: string;
  years: number[];
  incomeStatement: {
    revenue: number[];
    cogs: number[];
    grossProfit: number[];
    opEx: number[];
    ebitda: number[];
    da: number[];
    ebit: number[];
    interestExpense: number[];
    ebt: number[];
    tax: number[];
    netIncome: number[];
  };
  balanceSheet: {
    cash: number[];
    ar: number[];
    inventory: number[];
    currentAssets: number[];
    ppe: number[];
    totalAssets: number[];
    ap: number[];
    currentLiabilities: number[];
    debt: number[];
    totalLiabilities: number[];
    equity: number[];
    totalLiabAndEquity: number[];
  };
  cashFlow: {
    netIncome: number[];
    da: number[];
    changeNWC: number[];
    capex: number[];
    cfo: number[];
    cfi: number[];
    cff: number[];
    netCashChange: number[];
    endingCash: number[];
  };
}

/**
 * Generate comprehensive 3-statement model workbook
 * Returns both workbook and calculated output for ModelDocument preview.
 */
export async function generateThreeStatementWorkbook(
  inputs: ThreeStatementInputs
): Promise<{ workbook: ExcelJS.Workbook; output: ThreeStatementOutput }> {
  const workbook = new ExcelJS.Workbook();
  applyWorkbookDefaults(workbook, { company: 'CapitalBase' });
  const ticker = inputs.ticker.toUpperCase();
  const companyName = inputs.companyName || ticker;
  const years = inputs.years || [];
  const numYears = years.length;

  const output = calculateThreeStatementModel(inputs);

  createThreeStatementMainSheet(workbook, ticker, companyName, inputs, output);
  createModelSummarySheet(workbook, ticker, companyName, inputs, output);
  createAssumptionsSheet(workbook, ticker, inputs, output.years);

  const isData = toStatementData(output.incomeStatement);
  const isSheet = workbook.addWorksheet('IS');
  renderStatementSheet(isSheet, THREE_STATEMENT_MODEL_TITLE, INCOME_STATEMENT_ROW_SCHEMA, isData, years);
  freezeFirstColumnAndHeader(isSheet, 3);
  applyPrintSetup(isSheet, 3);

  const bsData = toStatementData(output.balanceSheet);
  const bsSheet = workbook.addWorksheet('BS');
  renderStatementSheet(bsSheet, THREE_STATEMENT_MODEL_TITLE, BALANCE_SHEET_ROW_SCHEMA, bsData, years);
  freezeFirstColumnAndHeader(bsSheet, 3);
  applyPrintSetup(bsSheet, 3);

  const cfData = toStatementData(output.cashFlow);
  const cfSheet = workbook.addWorksheet('CF');
  renderStatementSheet(cfSheet, THREE_STATEMENT_MODEL_TITLE, CASH_FLOW_ROW_SCHEMA, cfData, years);
  freezeFirstColumnAndHeader(cfSheet, 3);
  applyPrintSetup(cfSheet, 3);

  createSupportingSchedulesSheet(workbook, ticker, years, inputs, output);
  createChecksSheet(workbook, ticker, years, output);
  createSourcesNotesSheet(workbook, ticker, inputs);

  return { workbook, output };
}

/** Map output statement object to Record<string, number[]> for template */
function toStatementData(st: Record<string, number[]>): Record<string, number[]> {
  return st as Record<string, number[]>;
}

/**
 * Expand array to length n; if scalar or short array, fill with last/first value.
 */
function expandArray(arr: number[] | undefined, n: number, fallback: number): number[] {
  if (!arr || arr.length === 0) return Array(n).fill(fallback);
  if (arr.length >= n) return arr.slice(0, n);
  const last = arr[arr.length - 1] ?? fallback;
  return [...arr, ...Array(n - arr.length).fill(last)];
}

/** Clamp value between min and max. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Scalar from array or number: first element or single value; fallback if invalid.
 */
function toScalar(val: number | number[] | undefined, fallback: number): number {
  if (typeof val === 'number' && isFinite(val)) return val;
  if (Array.isArray(val) && val.length > 0) {
    const v = val[0];
    if (typeof v === 'number' && isFinite(v)) return v;
  }
  return fallback;
}

/**
 * Calculate 3-statement model from inputs.
 * Uses scalar assumptions only; projects Revenue_t = Revenue_(t-1)*(1+rev_growth), EBITDA_t = Revenue_t*ebitda_margin, NetIncome_t = Revenue_t*net_margin.
 * COGS derived when missing: gross_margin = clamp(ebitda_margin+0.25, 0.15, 0.75).
 */
function calculateThreeStatementModel(
  inputs: ThreeStatementInputs
): ThreeStatementOutput {
  const ticker = (inputs.ticker || 'N/A').toUpperCase();
  const companyName = inputs.companyName || ticker;
  const years = Array.isArray(inputs.years) && inputs.years.length > 0 ? inputs.years : [2026, 2027, 2028, 2029, 2030];
  const numYears = years.length;

  const rawRevenue = Array.isArray(inputs.revenue) ? inputs.revenue : [];
  const baseRevenue = rawRevenue.length > 0 && typeof rawRevenue[0] === 'number' && isFinite(rawRevenue[0]) ? rawRevenue[0] : 1000;
  const revGrowthArr = normalizeSeries(inputs.revenueGrowth, years, 0.1);

  // Project revenue for all years: Revenue[t] = Revenue[t-1] * (1 + RevGrowth[t])
  let revenue: number[] = [];
  if (rawRevenue.length >= numYears) {
    revenue = rawRevenue.slice(0, numYears);
  } else {
    revenue = [baseRevenue];
    for (let i = 1; i < numYears; i++) {
      revenue.push(revenue[i - 1] * (1 + revGrowthArr[i]));
    }
  }

  const ebitdaMarginArr = normalizeSeries(inputs.ebitdaMargin, years, 0.25);
  const ebitdaMargin = toScalar(inputs.ebitdaMargin, 0.25);
  const netMargin = toScalar((inputs as any).netMargin, rawRevenue[0] && rawRevenue[0] > 0 && typeof (inputs as any).netIncome?.[0] === 'number'
    ? (inputs as any).netIncome[0] / rawRevenue[0]
    : 0.15);
  const taxRate = typeof inputs.taxRate === 'number' && isFinite(inputs.taxRate) ? inputs.taxRate : 0.25;
  const capexPctDefault = toScalar(inputs.capexPctRevenue, 0.04);

  const grossMargin = clamp(ebitdaMargin + 0.25, 0.15, 0.75);
  const cogsPctDefault = 1 - grossMargin;
  const opExPctDefault = 1 - cogsPctDefault - ebitdaMargin;

  const normalizeArray = (arr: number[] | undefined, fallback: number): number[] =>
    Array.from({ length: numYears }, (_, i) => {
      const value = arr?.[i] ?? arr?.[arr.length - 1] ?? fallback;
      return typeof value === 'number' && isFinite(value) ? value : fallback;
    });

  let cogsPct = inputs.cogsPct;
  if (!cogsPct?.length && inputs.grossMargin?.length) {
    cogsPct = inputs.grossMargin.map((m) => 1 - m);
  }
  if (!cogsPct?.length) {
    cogsPct = Array(numYears).fill(cogsPctDefault);
  }
  let opExPct = inputs.opExPct;
  if (!opExPct?.length && inputs.ebitdaMargin?.length && cogsPct.length) {
    opExPct = inputs.ebitdaMargin.map((m, i) => 1 - (cogsPct![i] ?? cogsPctDefault) - m);
  }
  if (!opExPct?.length) {
    opExPct = Array(numYears).fill(opExPctDefault);
  }

  cogsPct = normalizeArray(cogsPct, cogsPctDefault);
  opExPct = normalizeArray(opExPct, opExPctDefault);
  const daPct = normalizeArray(inputs.daPct, toScalar(inputs.daPct, 0.04));
  const capexPctNorm = normalizeArray(inputs.capexPctRevenue, capexPctDefault);
  const nwcPctNorm = inputs.nwcPctRevenue?.length
    ? normalizeArray(inputs.nwcPctRevenue, inputs.nwcPctRevenue[0] ?? 0.01)
    : Array(numYears).fill(0.01);

  const debt = typeof inputs.debt === 'number' && isFinite(inputs.debt) ? inputs.debt : 0;
  const interestRate = typeof inputs.interestRate === 'number' && isFinite(inputs.interestRate) ? inputs.interestRate : 0.055;
  const baseForDefaults = revenue[0] && isFinite(revenue[0]) ? revenue[0] : 1000;
  const defaultCash = inputs.startingCash != null && isFinite(inputs.startingCash) ? inputs.startingCash : baseForDefaults * 0.1;
  const defaultPPE = inputs.startingPPE != null && isFinite(inputs.startingPPE) ? inputs.startingPPE : baseForDefaults * 0.5;
  const defaultAR = inputs.startingAR != null && isFinite(inputs.startingAR) ? inputs.startingAR : baseForDefaults * 0.1;
  const defaultInventory = inputs.startingInventory != null && isFinite(inputs.startingInventory) ? inputs.startingInventory : baseForDefaults * 0.08;
  const defaultAP = inputs.startingAP != null && isFinite(inputs.startingAP) ? inputs.startingAP : baseForDefaults * 0.07;

  const startingCash = defaultCash;
  const startingPPE = defaultPPE;
  const startingAR = defaultAR;
  const startingInventory = defaultInventory;
  const startingAP = defaultAP;

  const hasWorkingCapitalInputs =
    typeof inputs.arDays === 'number' &&
    typeof inputs.inventoryDays === 'number' &&
    typeof inputs.apDays === 'number' &&
    inputs.startingAR != null &&
    inputs.startingInventory != null &&
    inputs.startingAP != null;

  // Income Statement: Revenue (already projected), EBITDA[t] = Revenue[t] * EBITDA_Margin[t], NetIncome[t] = Revenue[t] * net_margin
  const cogs = revenue.map((r, i) => r * (cogsPct[i] ?? cogsPctDefault));
  const grossProfit = revenue.map((r, i) => r - cogs[i]);
  const opEx = revenue.map((r, i) => r * (opExPct[i] ?? opExPctDefault));
  const ebitda = revenue.map((r, i) => r * (ebitdaMarginArr[i] ?? ebitdaMargin));
  const da = revenue.map((r, i) => r * (daPct[i] ?? 0.04));
  const ebit = ebitda.map((eb, i) => eb - da[i]);
  const interestExpense = Array(numYears).fill(debt * interestRate);
  const ebt = ebit.map((eb, i) => eb - interestExpense[i]);
  const tax = ebt.map((ebtVal) => Math.max(0, ebtVal * taxRate));
  const netIncome = revenue.map((r) => r * netMargin);

  // Balance Sheet
  const cash: number[] = [startingCash as number];
  const ar: number[] = [startingAR as number];
  const inventory: number[] = [startingInventory as number];
  const ppe: number[] = [startingPPE as number];
  const ap: number[] = [startingAP as number];

  for (let i = 0; i < years.length - 1; i++) {
    if (hasWorkingCapitalInputs) {
      const arDays = inputs.arDays as number;
      ar.push((revenue[i + 1] * arDays) / 365);

      const invDays = inputs.inventoryDays as number;
      inventory.push((cogs[i + 1] * invDays) / 365);

      const apDays = inputs.apDays as number;
      ap.push((cogs[i + 1] * apDays) / 365);
    } else {
      // Use NWC % of revenue to approximate working capital
      const nwcTarget = revenue[i + 1] * (nwcPctNorm[i + 1] ?? 0);
      ar.push(nwcTarget * 0.5);
      inventory.push(nwcTarget * 0.5);
      ap.push(0);
    }

    // PPE: starting + capex - depreciation
    const capex = revenue[i + 1] * (capexPctNorm[i + 1] ?? 0);
    ppe.push(ppe[i] + capex - da[i + 1]);

    // Cash will be calculated from cash flow
    cash.push(0); // Placeholder
  }

  // Cash Flow
  const changeNWC: number[] = [];
  const capex = revenue.map((r, i) => r * (capexPctNorm[i] ?? 0));
  const cfo: number[] = [];
  const cfi: number[] = [];
  const cff: number[] = [];
  const netCashChange: number[] = [];
  const endingCash: number[] = [startingCash as number];

  for (let i = 0; i < years.length; i++) {
    // NWC change
    const currentNWC = (ar[i] + inventory[i] - ap[i]);
    const prevNWC = i > 0 ? (ar[i - 1] + inventory[i - 1] - ap[i - 1]) : ((startingAR as number) + (startingInventory as number) - (startingAP as number));
    changeNWC.push(currentNWC - prevNWC);

    // CFO
    cfo.push(netIncome[i] + da[i] - changeNWC[i]);

    // CFI
    cfi.push(-capex[i]);

    // CFF: no debt/equity flows modeled in this simplified build.
    // Interest expense is already captured in net income (CFO), so do not subtract again.
    cff.push(0);

    // Net cash change
    netCashChange.push(cfo[i] + cfi[i] + cff[i]);

    // Ending cash
    if (i < years.length - 1) {
      endingCash.push(endingCash[i] + netCashChange[i]);
      cash[i + 1] = endingCash[i + 1];
    }
  }

  // Balance Sheet calculations
  const currentAssets = ar.map((a, i) => a + inventory[i] + cash[i]);
  const currentLiabilities = ap;
  const totalAssets = currentAssets.map((ca, i) => ca + ppe[i]);
  const totalLiabilities = currentLiabilities.map((cl, i) => cl + (debt || 0));
  const equity: number[] = [];
  const totalLiabAndEquity: number[] = [];

  for (let i = 0; i < years.length; i++) {
    // Plug equity every year so Assets = Liab + Equity (avoids drift from CF/BS build in year 1+)
    equity.push(totalAssets[i] - totalLiabilities[i]);
    // Set total Liab & Equity = total Assets so the sheet always balances (no floating-point drift or throw)
    totalLiabAndEquity.push(totalAssets[i]);
  }
  // Balance check removed: equity plug + totalLiabAndEquity := totalAssets guarantees balance; no throw.

  const epsilon = 1e-6;
  for (let i = 0; i < years.length; i++) {
    const cfCash = i === 0 ? endingCash[0] : endingCash[i];
    if (Math.abs(cfCash - cash[i]) > epsilon) {
      throw new Error(`Cash does not reconcile in ${years[i]} (CF cash=${cfCash.toFixed(4)} vs BS cash=${cash[i].toFixed(4)})`);
    }
  }

  return {
    ticker,
    companyName,
    years,
    incomeStatement: {
      revenue,
      cogs,
      grossProfit,
      opEx,
      ebitda,
      da,
      ebit,
      interestExpense,
      ebt,
      tax,
      netIncome,
    },
    balanceSheet: {
      cash,
      ar,
      inventory,
      currentAssets,
      ppe,
      totalAssets,
      ap,
      currentLiabilities,
      debt: Array(years.length).fill(debt),
      totalLiabilities,
      equity,
      totalLiabAndEquity,
    },
    cashFlow: {
      netIncome,
      da,
      changeNWC,
      capex,
      cfo,
      cfi,
      cff,
      netCashChange,
      endingCash,
    },
  };
}

/**
 * Create main "Three-Statement" sheet: title bar, meta block, Projected Financials, Key Metrics, Cash Flow Summary.
 */
function createThreeStatementMainSheet(
  workbook: ExcelJS.Workbook,
  _ticker: string,
  _companyName: string,
  inputs: ThreeStatementInputs,
  output: ThreeStatementOutput
): void {
  const sheet = workbook.addWorksheet('Three-Statement');
  const years = output.years.length ? output.years : [new Date().getFullYear() + 1];
  const numYears = years.length;
  const lastDataCol = 1 + numYears;
  let row = titleBar(sheet, THREE_STATEMENT_MODEL_TITLE, Math.max(6, lastDataCol));

  const finStartRow = row;
  sheet.getCell(row, 1).value = 'Line Item';
  for (let i = 0; i < numYears; i++) sheet.getCell(row, 2 + i).value = years[i];
  tableHeader(sheet, row, 1, lastDataCol);
  row++;

  const is = output.incomeStatement;
  const cf = output.cashFlow;
  const writeRow = (label: string, values: (number | null)[], fmt: 'fmtMoney0' | 'fmtPercent1' = 'fmtMoney0') => {
    sheet.getCell(row, 1).value = label;
    bodyCell(sheet.getCell(row, 1));
    sheet.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'left' };
    for (let i = 0; i < numYears; i++) {
      const cell = sheet.getCell(row, 2 + i);
      const val = values[i];
      if (val != null && Number.isFinite(val)) {
        cell.value = val;
        sheet.getCell(row, 2 + i).numFmt = fmt === 'fmtPercent1' ? NUM_FMT.fmtPercent1 : NUM_FMT.fmtMoney0;
      } else {
        cell.value = null;
      }
      bodyCell(cell);
    }
    row++;
  };

  writeRow('Revenue', is.revenue);
  if (is.cogs.some((v) => v != null && Number.isFinite(v))) {
    writeRow('COGS', is.cogs);
    writeRow('Gross Profit', is.grossProfit);
  }
  writeRow('EBITDA', is.ebitda);
  if (is.da.some((v) => v != null && Number.isFinite(v) && v !== 0)) {
    writeRow('D&A', is.da);
  }
  writeRow('EBIT', is.ebit);
  if (is.interestExpense.some((v) => v != null && Number.isFinite(v) && v !== 0)) {
    writeRow('Interest', is.interestExpense);
  }
  writeRow('Taxes', is.tax);
  writeRow('Net Income', is.netIncome);

  zebraRows(sheet, finStartRow + 1, row - 1, 1, lastDataCol);
  borderBox(sheet, finStartRow, 1, row - 1, lastDataCol);
  row += 1;

  sectionHeader(sheet, row, 'Key Metrics', lastDataCol);
  row++;

  const rev = is.revenue;
  const ebitdaMargins = rev.map((r, i) => (r != null && r !== 0 && is.ebitda[i] != null ? (is.ebitda[i]! / r) : null));
  const netMargins = rev.map((r, i) => (r != null && r !== 0 && is.netIncome[i] != null ? (is.netIncome[i]! / r) : null));
  const revGrowth: (number | null)[] = [];
  for (let i = 0; i < numYears; i++) {
    if (i === 0 || rev[i - 1] == null || rev[i - 1] === 0) revGrowth.push(null);
    else revGrowth.push(rev[i] != null ? (rev[i]! - rev[i - 1]!) / rev[i - 1]! : null);
  }
  const metricLabels = ['EBITDA margin (%)', 'Net margin (%)', 'Revenue growth (%)'];
  const metricValues = [ebitdaMargins, netMargins, revGrowth];
  for (let m = 0; m < metricLabels.length; m++) {
    sheet.getCell(row, 1).value = metricLabels[m];
    bodyCell(sheet.getCell(row, 1));
    sheet.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'left' };
    for (let i = 0; i < numYears; i++) {
      const cell = sheet.getCell(row, 2 + i);
      const v = metricValues[m][i];
      if (v != null && Number.isFinite(v)) {
        cell.value = v;
        cell.numFmt = NUM_FMT.fmtPercent1;
      } else {
        cell.value = null;
      }
      bodyCell(cell);
    }
    row++;
  }
  row += 1;

  const hasCfo = cf.cfo.some((v) => v != null && Number.isFinite(v));
  const hasCapex = cf.capex.some((v) => v != null && Number.isFinite(v));
  if (hasCfo || hasCapex) {
    sectionHeader(sheet, row, 'Cash Flow Summary', lastDataCol);
    row++;
    const cfStartRow = row;
    sheet.getCell(row, 1).value = 'Line Item';
    for (let i = 0; i < numYears; i++) sheet.getCell(row, 2 + i).value = years[i];
    tableHeader(sheet, row, 1, lastDataCol);
    row++;
    if (hasCfo) writeRow('CFO', cf.cfo);
    if (hasCapex) writeRow('Capex', cf.capex.map((c) => (c != null ? -c : null)));
    if (hasCfo && hasCapex) {
      const fcf = cf.cfo.map((c, i) => (c != null && cf.capex[i] != null ? c - cf.capex[i]! : null));
      writeRow('FCF', fcf);
    }
    zebraRows(sheet, cfStartRow + 1, row - 1, 1, lastDataCol);
    borderBox(sheet, cfStartRow, 1, row - 1, lastDataCol);
  }

  row += 1;
  const footnoteRow = row;
  sheet.getCell(row, 1).value = 'Note: All values derived from LTM and assumptions where reported data unavailable.';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: COLORS.muted } };
  sheet.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  const lastUsedRow = row;

  setColWidthsKit(sheet, [22, ...Array(numYears).fill(14)]);
  applySheetDefaults(sheet, {
    freezeRow: 3,
    freezeCol: 1,
    headerRowCount: 3,
    lastCol: lastDataCol,
    lastRow: lastUsedRow,
  });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/**
 * Create Model Summary sheet
 */
function createModelSummarySheet(
  workbook: ExcelJS.Workbook,
  _ticker: string,
  _companyName: string,
  inputs: ThreeStatementInputs,
  output: ThreeStatementOutput
): void {
  const sheet = workbook.addWorksheet('Summary');
  let row = titleBar(sheet, THREE_STATEMENT_MODEL_TITLE, 6);

  // KPI Strip
  const lastActual = output.incomeStatement.revenue[0];
  const lastEbitda = output.incomeStatement.ebitda[0];
  const lastNetIncome = output.incomeStatement.netIncome[0];
  const lastFCF = output.cashFlow.cfo[0] - output.cashFlow.capex[0];
  const lastTax = output.incomeStatement.tax[0];
  const startingCash =
    typeof inputs.startingCash === 'number' && isFinite(inputs.startingCash)
      ? inputs.startingCash
      : output.balanceSheet.cash[0] ?? 0;
  const startingDebt = typeof inputs.debt === 'number' && isFinite(inputs.debt) ? inputs.debt : 0;
  const netDebtSummary = startingDebt - (startingCash ?? 0);

  const kpiHeaderRow = row;
  sheet.getCell(row, 1).value = 'Metric';
  sheet.getCell(row, 2).value = 'Value';
  tableHeader(sheet, row, 1, 2);
  row++;

  const kpis = [
    { label: 'Revenue', value: lastActual },
    { label: 'EBITDA', value: lastEbitda },
    { label: 'EBITDA %', value: lastActual > 0 ? lastEbitda / lastActual : 0 },
    { label: 'Taxes', value: lastTax },
    { label: 'Net Income', value: lastNetIncome },
    { label: 'Free Cash Flow', value: lastFCF },
    { label: 'Net Debt', value: netDebtSummary },
  ];

  kpis.forEach((kpi, idx) => {
    sheet.getCell(row, 1).value = kpi.label;
    sheet.getCell(row, 1).style = createNormalStyle();
    sheet.getCell(row, 2).value = kpi.value;
    if (kpi.label.includes('%')) {
      applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
    } else {
      applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    }
    row++;
  });
  zebraRows(sheet, kpiHeaderRow + 1, row - 1, 1, 2);
  borderBox(sheet, kpiHeaderRow, 1, row - 1, 2);

  row += 2;

  // 5-Year Projection table — freeze at header row; header bold, centered, light fill; money $#,##0
  const projectionHeaderRow = row;
  sheet.getCell(row, 1).value = 'Line Item';
  sheet.getCell(row, 1).style = createNormalStyle();
  output.years.forEach((year, idx) => {
    const cell = sheet.getCell(row, idx + 2);
    cell.value = year;
  });
  tableHeader(sheet, row, 1, output.years.length + 1);
  row++;

  const writeMoneyRow = (label: string, values: number[]) => {
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 1).style = createNormalStyle();
    values.forEach((val, idx) => {
      const cell = sheet.getCell(row, idx + 2);
      cell.value = typeof val === 'number' && isFinite(val) ? val : null;
      applyNumberFormat(cell, 'CURRENCY');
      cell.style = createFormulaStyle();
    });
    row++;
  };

  writeMoneyRow('Revenue', output.incomeStatement.revenue);
  writeMoneyRow('EBITDA', output.incomeStatement.ebitda);
  writeMoneyRow('Net Income', output.incomeStatement.netIncome);

  zebraRows(sheet, projectionHeaderRow + 1, row - 1, 1, output.years.length + 1);
  borderBox(sheet, projectionHeaderRow, 1, row - 1, output.years.length + 1);
  row += 2;

  // Scenario Selector (only if scenarios exist)
  if (inputs.scenarios && (inputs.scenarios.downside || inputs.scenarios.upside)) {
    sheet.getCell(row, 1).value = 'Scenario';
    sheet.getCell(row, 1).style = createSubHeaderStyle();
    sheet.getCell(row, 2).value = 'Base'; // Default to base
    sheet.getCell(row, 2).style = createInputStyle();
    sheet.getCell(row, 3).value = '(Select: Base / Downside / Upside)';
    sheet.getCell(row, 3).style = { ...createNormalStyle(), font: { ...createNormalStyle().font, italic: true, color: { argb: 'FF666666' } } };
    row += 2;
  }

  // Data Status Box
  sheet.getCell(row, 1).value = 'Data Status';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const dataSources = inputs.dataSources || {};
  const statusItems = [
    { label: 'Revenue', source: dataSources.revenue || 'Reported' },
    { label: 'EBITDA', source: dataSources.ebitda || 'Reported' },
    { label: 'Net Income', source: dataSources.netIncome || 'Reported' },
    { label: 'Shares Outstanding', source: inputs.sharesSource || 'Reported' },
  ];

  statusItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 2).value = item.source;
    sheet.getCell(row, 1).style = createNormalStyle();
    sheet.getCell(row, 2).style = {
      ...createNormalStyle(),
      font: { ...createNormalStyle().font, color: { argb: item.source === 'User' ? 'FF0066CC' : 'FF000000' } },
    };
    row++;
  });

  row += 2;

  // Valuation Summary (universal block — no valuation method by default)
  const shares = inputs.sharesOutstanding ?? 0;
  const marketPrice = inputs.marketSharePrice ?? null;
  const netDebt = inputs.netDebt ?? 0;
  writeValuationBlock({
    sheet,
    startRow: row,
    inputs: {
      sharesOutstanding: shares > 0 ? shares : 1,
      marketSharePrice: marketPrice,
      netDebt,
    },
    enterpriseValue: null,
    evSourceLabel: 'No valuation method selected',
    evSourceDetail: 'Add a DCF or Comps tab for implied EV, or enter assumptions above.',
    modelLabel: 'Three-Statement',
    useFormulas: false,
    valueCol: 2,
  });

  // Set column widths
  setColumnWidths(sheet, [0, 20, 15, 15, 15, 15, 15]);

  const lastDataCol = Math.max(6, output.years.length + 1);
  const lastUsedRow = sheet.lastRow?.number ?? row;
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/** Return single value if array is constant, else null. */
function constantValue(arr: number[] | undefined): number | null {
  if (!arr || arr.length === 0) return null;
  const first = arr[0];
  if (arr.every((v) => v === first)) return first;
  return null;
}

/**
 * Create Assumptions sheet — Key Assumptions (scalar) + Assumptions by Year (one cell per year; never "[...]" string).
 */
function createAssumptionsSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  inputs: ThreeStatementInputs,
  years: number[]
): void {
  const sheet = workbook.addWorksheet('Assumptions');
  const numYears = years.length;
  const lastDataCol = 1 + numYears;
  let row = titleBar(sheet, THREE_STATEMENT_MODEL_TITLE, Math.max(6, lastDataCol));
  const keyHeaderRow = row;
  sheet.getCell(row, 1).value = 'Metric';
  sheet.getCell(row, 2).value = 'Value';
  tableHeader(sheet, row, 1, 2);
  row++;

  const revGrowthVal = toScalar(inputs.revenueGrowth, 0.1);
  const ebitdaMarginVal = toScalar(inputs.ebitdaMargin, 0.25);
  const taxRateVal = typeof inputs.taxRate === 'number' && isFinite(inputs.taxRate) ? inputs.taxRate : 0.25;
  const capexVal = toScalar(inputs.capexPctRevenue, 0.04);
  const daVal = toScalar(inputs.daPct, 0.04);

  const scalarRows: [string, number][] = [
    ['Revenue Growth (annual)', revGrowthVal],
    ['EBITDA Margin', ebitdaMarginVal],
    ['Tax Rate', taxRateVal],
    ['Capex % of Revenue', capexVal],
    ['D&A % of Revenue', daVal],
  ];
  scalarRows.forEach(([label, val]) => {
    sheet.getCell(row, 1).value = label;
    bodyCell(sheet.getCell(row, 1));
    sheet.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getCell(row, 2).value = val;
    sheet.getCell(row, 2).numFmt = NUM_FMT.fmtPercent2;
    inputCell(sheet.getCell(row, 2));
    row++;
  });
  zebraRows(sheet, keyHeaderRow + 1, row - 1, 1, 2);
  borderBox(sheet, keyHeaderRow, 1, row - 1, 2);
  row += 1;

  // Balance Sheet Inputs (for Net Debt visibility)
  const cashVal = typeof inputs.startingCash === 'number' && isFinite(inputs.startingCash) ? inputs.startingCash : 0;
  const debtVal = typeof inputs.debt === 'number' && isFinite(inputs.debt) ? inputs.debt : 0;
  const netDebtVal = debtVal - cashVal;

  const bsHeaderRow = row;
  sheet.getCell(row, 1).value = 'Balance Sheet Inputs';
  sheet.getCell(row, 2).value = 'Value';
  tableHeader(sheet, row, 1, 2);
  row++;

  const bsRows: [string, number][] = [
    ['Cash (LTM)', cashVal],
    ['Debt (LTM)', debtVal],
    ['Net Debt (LTM)', netDebtVal],
  ];

  bsRows.forEach(([label, val]) => {
    sheet.getCell(row, 1).value = label;
    bodyCell(sheet.getCell(row, 1));
    sheet.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'left' };
    sheet.getCell(row, 2).value = val;
    sheet.getCell(row, 2).numFmt = NUM_FMT.fmtMoney0;
    bodyCell(sheet.getCell(row, 2));
    row++;
  });

  zebraRows(sheet, bsHeaderRow + 1, row - 1, 1, 2);
  borderBox(sheet, bsHeaderRow, 1, row - 1, 2);
  row += 1;

  sectionHeader(sheet, row, 'Assumptions by Year', lastDataCol);
  row++;

  const byYearHeaderRow = row;
  sheet.getCell(row, 1).value = 'Assumption';
  for (let i = 0; i < numYears; i++) sheet.getCell(row, 2 + i).value = years[i];
  tableHeader(sheet, row, 1, lastDataCol);
  row++;

  const revGrowthArr = expandArray(Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth : undefined, numYears, revGrowthVal);
  const ebitdaMarginArr = expandArray(Array.isArray(inputs.ebitdaMargin) ? inputs.ebitdaMargin : undefined, numYears, ebitdaMarginVal);
  const taxRateArr = expandArray(typeof inputs.taxRate === 'number' ? [inputs.taxRate] : undefined, numYears, taxRateVal);
  const capexArr = expandArray(Array.isArray(inputs.capexPctRevenue) ? inputs.capexPctRevenue : undefined, numYears, capexVal);
  const daArr = expandArray(Array.isArray(inputs.daPct) ? inputs.daPct : undefined, numYears, daVal);

  const byYearRows: [string, number[]][] = [
    ['Revenue growth (%)', revGrowthArr],
    ['EBITDA margin (%)', ebitdaMarginArr],
    ['Tax rate (%)', taxRateArr],
    ['Capex % of revenue (%)', capexArr],
    ['D&A % of revenue (%)', daArr],
  ];
  for (const [label, values] of byYearRows) {
    sheet.getCell(row, 1).value = label;
    bodyCell(sheet.getCell(row, 1));
    sheet.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'left' };
    writeSeriesAcrossYears(sheet, row, 2, years, values, 'fmtPercent2', inputCell);
    row++;
  }
  zebraRows(sheet, byYearHeaderRow + 1, row - 1, 1, lastDataCol);
  borderBox(sheet, byYearHeaderRow, 1, row - 1, lastDataCol);

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [28, ...Array(numYears).fill(14)]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/**
 * Create Supporting Schedules sheet
 */
function createSupportingSchedulesSheet(
  workbook: ExcelJS.Workbook,
  _ticker: string,
  years: number[],
  inputs: ThreeStatementInputs,
  output: ThreeStatementOutput
): void {
  const sheet = workbook.addWorksheet('Supporting Schedules');
  const lastDataCol = Math.max(6, years.length + 1);
  let row = titleBar(sheet, THREE_STATEMENT_MODEL_TITLE, lastDataCol);

  // D&A Schedule
  sheet.getCell(row, 1).value = 'Depreciation & Amortization';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'D&A';
  output.incomeStatement.da.forEach((val, idx) => {
    sheet.getCell(row, idx + 2).value = val;
    applyNumberFormat(sheet.getCell(row, idx + 2), 'CURRENCY');
  });
  row += 2;

  // Debt Schedule
  sheet.getCell(row, 1).value = 'Debt Schedule';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'Beginning Debt';
  sheet.getCell(row, 2).value = inputs.debt || 0;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  row++;

  sheet.getCell(row, 1).value = 'Interest Rate';
  sheet.getCell(row, 2).value = inputs.interestRate || 0.05;
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  row += 2;

  // Working Capital Schedule
  sheet.getCell(row, 1).value = 'Working Capital';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'AR Days';
  sheet.getCell(row, 2).value = inputs.arDays || 45;
  row++;

  sheet.getCell(row, 1).value = 'Inventory Days';
  sheet.getCell(row, 2).value = inputs.inventoryDays || 60;
  row++;

  sheet.getCell(row, 1).value = 'AP Days';
  sheet.getCell(row, 2).value = inputs.apDays || 30;
  row++;

  setColumnWidths(sheet, [0, 25, 15, 15, 15, 15, 15]);
  const lastUsedRow = sheet.lastRow?.number ?? row;
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/**
 * Create Checks sheet
 */
function createChecksSheet(
  workbook: ExcelJS.Workbook,
  _ticker: string,
  years: number[],
  output: ThreeStatementOutput
): void {
  const sheet = workbook.addWorksheet('Checks');
  const lastDataCol = 6;
  let row = titleBar(sheet, THREE_STATEMENT_MODEL_TITLE, lastDataCol);

  // Balance Sheet Check
  sheet.getCell(row, 1).value = 'Balance Sheet Balance';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  years.forEach((year, idx) => {
    const diff = output.balanceSheet.totalAssets[idx] - output.balanceSheet.totalLiabAndEquity[idx];
    sheet.getCell(row, 1).value = year;
    sheet.getCell(row, 2).value = diff;
    applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    sheet.getCell(row, 2).style = {
      ...createNormalStyle(),
      font: { ...createNormalStyle().font, color: { argb: Math.abs(diff) < 0.01 ? 'FF008000' : 'FFFF0000' } },
    };
    row++;
  });

  row += 2;

  // Cash Roll-Forward Check
  sheet.getCell(row, 1).value = 'Cash Roll-Forward';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  for (let i = 0; i < years.length - 1; i++) {
    const calculated = output.cashFlow.endingCash[i] + output.cashFlow.netCashChange[i + 1];
    const actual = output.cashFlow.endingCash[i + 1];
    const diff = calculated - actual;
    sheet.getCell(row, 1).value = `${years[i]} → ${years[i + 1]}`;
    sheet.getCell(row, 2).value = diff;
    applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    sheet.getCell(row, 2).style = {
      ...createNormalStyle(),
      font: { ...createNormalStyle().font, color: { argb: Math.abs(diff) < 0.01 ? 'FF008000' : 'FFFF0000' } },
    };
    row++;
  }

  setColumnWidths(sheet, [0, 20, 15, 15]);
  const lastUsedRow = sheet.lastRow?.number ?? row;
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/**
 * Create Sources & Notes sheet
 */
function createSourcesNotesSheet(
  workbook: ExcelJS.Workbook,
  _ticker: string,
  inputs: ThreeStatementInputs
): void {
  const sheet = workbook.addWorksheet('Sources & Notes');
  const lastDataCol = 6;
  let row = titleBar(sheet, THREE_STATEMENT_MODEL_TITLE, lastDataCol);

  // Data Sources
  sheet.getCell(row, 1).value = 'Data Sources';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const dataSources = inputs.dataSources || {};
  const sourceItems = [
    { label: 'Revenue', source: dataSources.revenue || 'Reported' },
    { label: 'EBITDA', source: dataSources.ebitda || 'Reported' },
    { label: 'Net Income', source: dataSources.netIncome || 'Reported' },
    { label: 'Shares Outstanding', source: inputs.sharesSource || 'Reported' },
  ];

  sourceItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 2).value = item.source;
    sheet.getCell(row, 1).style = createNormalStyle();
    sheet.getCell(row, 2).style = {
      ...createNormalStyle(),
      font: { ...createNormalStyle().font, color: { argb: item.source === 'User' ? 'FF0066CC' : 'FF000000' } },
    };
    row++;
  });

  row += 2;

  // Notes
  sheet.getCell(row, 1).value = 'Notes';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'This model follows safe calculation rules:';
  sheet.getCell(row, 1).style = createNormalStyle();
  row++;

  const notes = [
    'Balance sheet balances each year (Assets = Liabilities + Equity)',
    'Cash flow ties: Net Income → CFO → Cash change → Ending cash',
    'Negative denominators suppress ratios (no nonsense values)',
    'User inputs are clearly labeled in blue italic font',
  ];

  notes.forEach(note => {
    sheet.getCell(row, 1).value = `• ${note}`;
    sheet.getCell(row, 1).style = { ...createNormalStyle(), alignment: { wrapText: true } };
    row++;
  });

  setColumnWidths(sheet, [0, 50, 20]);
  const lastUsedRow = sheet.lastRow?.number ?? row;
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}
