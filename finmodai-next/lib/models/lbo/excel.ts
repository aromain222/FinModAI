/**
 * LBO Model Excel Generator
 * Pre-seed capable, not overbuilt - clean and defensible
 */

import ExcelJS from 'exceljs';
import {
  createNormalStyle,
  createHeaderStyle,
  createInputStyle,
  createFormulaStyle,
  createTotalStyle,
  createSubHeaderStyle,
  applyBorders,
  applyNumberFormat,
  NUMBER_FORMATS,
  COLORS,
  setColumnWidths,
} from '../../excel/formatting';
import type { LboEngineOutput } from '../../lboEngine';
import { writeValuationBlock } from '../../excel/valuationBlock';

export interface LBOExcelInputs {
  ticker: string;
  companyName?: string;
  // Entry assumptions
  entryEV?: number;
  entryEBITDA?: number;
  entryMultiple?: number; // EV/EBITDA
  // Debt assumptions
  leverageMultiple?: number; // Debt/EBITDA
  totalDebt?: number;
  seniorDebt?: number;
  subordinatedDebt?: number;
  seniorRate?: number;
  subRate?: number;
  // Operating assumptions
  revenue: number;
  ebitda: number;
  revenueGrowth?: number[];
  ebitdaMargin?: number;
  ebitdaMarginExpansion?: number;
  capexPctRevenue?: number;
  daPctRevenue?: number;
  nwcPctRevenue?: number;
  taxRate?: number;
  // Exit assumptions
  exitMultiple?: number;
  exitEV?: number;
  holdPeriod?: number;
  // Transaction
  transactionFees?: number;
  // Valuation block (universal)
  sharesOutstanding?: number;
  marketSharePrice?: number;
  // Data source tracking
  dataSources?: {
    revenue?: 'Reported' | 'Derived' | 'User';
    ebitda?: 'Reported' | 'Derived' | 'User';
    [key: string]: 'Reported' | 'Derived' | 'User' | undefined;
  };
}

/**
 * Generate comprehensive LBO model workbook
 */
export async function generateLBOWorkbook(
  output: LboEngineOutput,
  inputs?: LBOExcelInputs
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const ticker = output.ticker.toUpperCase();
  const companyName = output.companyName || ticker;

  // Create all tabs
  createLBOSummarySheet(workbook, ticker, companyName, output, inputs);
  createLBOAssumptionsSheet(workbook, ticker, output, inputs);
  createSourcesUsesSheet(workbook, ticker, output);
  createOperatingForecastSheet(workbook, ticker, output);
  createDebtScheduleSheet(workbook, ticker, output);
  createReturnsSheet(workbook, ticker, output);
  createLBOSensitivitiesSheet(workbook, ticker, output, inputs);
  createLBOChecksSheet(workbook, ticker, output);
  createLBOSourcesNotesSheet(workbook, ticker, inputs);

  return workbook;
}

/**
 * Create LBO Summary sheet (one-page clean) with universal Valuation & Share Price block
 */
function createLBOSummarySheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  companyName: string,
  output: LboEngineOutput,
  inputs?: LBOExcelInputs
): void {
  const sheet = workbook.addWorksheet('LBO Summary');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${ticker} - LBO Model Summary`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 3);
  row += 2;

  sheet.getCell(row, 1).value = 'Simplified LBO — Free-API Compatible. Financing assumptions are simplified.';
  sheet.getCell(row, 1).style = createNormalStyle();
  sheet.mergeCells(row, 1, row, 3);
  row += 2;

  // Key Returns (clear blocks)
  sheet.getCell(row, 1).value = 'Key Returns';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const returns = [
    { label: 'Entry EV', value: output.returns.entryEV },
    { label: 'Exit EV', value: output.returns.exitEV },
    { label: 'Sponsor Equity', value: output.sourcesAndUses.sources.sponsorEquity },
    { label: 'Exit Equity Value', value: output.returns.exitEquityValue },
    { label: 'MOIC', value: output.returns.moic },
    { label: 'IRR', value: output.returns.irr },
  ];

  returns.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 1).style = createNormalStyle();
    sheet.getCell(row, 2).value = item.value;
    if (item.label === 'MOIC') {
      applyNumberFormat(sheet.getCell(row, 2), 'DECIMAL');
    } else if (item.label === 'IRR') {
      applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
    } else {
      applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    }
    row++;
  });

  row += 2;

  // Key Assumptions Summary
  sheet.getCell(row, 1).value = 'Key Assumptions';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const entryMultiple = output.returns.entryEV / output.inputs.ebitda;
  const exitMultiple = output.returns.exitEV / (output.projections[output.projections.length - 1].ebitda);
  const leverage = output.sourcesAndUses.sources.seniorDebt + output.sourcesAndUses.sources.subordinatedDebt;
  const leverageMultiple = leverage / output.inputs.ebitda;

  const assumptions = [
    { label: 'Entry Multiple (EV/EBITDA)', value: entryMultiple },
    { label: 'Exit Multiple (EV/EBITDA)', value: exitMultiple },
    { label: 'Leverage Multiple (Debt/EBITDA)', value: leverageMultiple },
    { label: 'Holding Period', value: output.inputs.holdPeriod || 5 },
  ];

  assumptions.forEach(assumption => {
    sheet.getCell(row, 1).value = assumption.label;
    sheet.getCell(row, 1).style = createNormalStyle();
    sheet.getCell(row, 2).value = assumption.value;
    if (assumption.label.includes('Multiple')) {
      applyNumberFormat(sheet.getCell(row, 2), 'DECIMAL');
    } else {
      applyNumberFormat(sheet.getCell(row, 2), 'INTEGER');
    }
    row++;
  });

  row += 2;

  // Universal Valuation & Share Price block (Entry EV → Equity → Implied Price → Market comparison)
  const netDebt = output.inputs.netDebt ?? 0;
  const shares = inputs?.sharesOutstanding ?? 0;
  const marketPrice = inputs?.marketSharePrice ?? null;
  writeValuationBlock({
    sheet,
    startRow: row,
    inputs: {
      sharesOutstanding: shares > 0 ? shares : 1,
      marketSharePrice: marketPrice,
      netDebt,
    },
    enterpriseValue: output.returns.entryEV,
    evSourceLabel: 'LBO Entry',
    evSourceDetail: 'Entry EV (from entry multiple × EBITDA)',
    modelLabel: 'LBO',
    useFormulas: false,
    valueCol: 2,
  });

  setColumnWidths(sheet, [0, 30, 20, 15]);
}

/**
 * Create LBO Assumptions sheet
 */
function createLBOAssumptionsSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput,
  inputs?: LBOExcelInputs
): void {
  const sheet = workbook.addWorksheet('Assumptions');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${ticker} - LBO Assumptions`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 3);
  row += 2;

  // Entry Assumptions
  sheet.getCell(row, 1).value = 'Entry Assumptions';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const entryEV = output.returns.entryEV;
  const entryEBITDA = output.inputs.ebitda;
  const entryMultiple = entryEV / entryEBITDA;

  sheet.getCell(row, 1).value = 'Entry EV';
  sheet.getCell(row, 2).value = entryEV;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  sheet.getCell(row, 1).value = 'Entry EBITDA';
  sheet.getCell(row, 2).value = entryEBITDA;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  sheet.getCell(row, 1).value = 'Entry Multiple (EV/EBITDA)';
  sheet.getCell(row, 2).value = entryMultiple;
  applyNumberFormat(sheet.getCell(row, 2), 'DECIMAL');
  sheet.getCell(row, 2).style = createFormulaStyle();
  row += 2;

  // Debt Assumptions
  sheet.getCell(row, 1).value = 'Debt Assumptions';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const totalDebt = output.sourcesAndUses.sources.seniorDebt + output.sourcesAndUses.sources.subordinatedDebt;
  const leverageMultiple = totalDebt / entryEBITDA;

  sheet.getCell(row, 1).value = 'Leverage Multiple (Debt/EBITDA)';
  sheet.getCell(row, 2).value = leverageMultiple;
  applyNumberFormat(sheet.getCell(row, 2), 'DECIMAL');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  sheet.getCell(row, 1).value = 'Total Debt';
  sheet.getCell(row, 2).value = totalDebt;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = createFormulaStyle();
  row++;

  sheet.getCell(row, 1).value = 'Senior Debt';
  sheet.getCell(row, 2).value = output.sourcesAndUses.sources.seniorDebt;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  sheet.getCell(row, 1).value = 'Senior Rate';
  sheet.getCell(row, 2).value = output.inputs.seniorRate || 0.06;
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  sheet.getCell(row, 1).value = 'Subordinated Debt';
  sheet.getCell(row, 2).value = output.sourcesAndUses.sources.subordinatedDebt;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  sheet.getCell(row, 1).value = 'Subordinated Rate';
  sheet.getCell(row, 2).value = output.inputs.subRate || 0.10;
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  sheet.getCell(row, 2).style = createInputStyle();
  row += 2;

  // Operating Assumptions
  sheet.getCell(row, 1).value = 'Operating Assumptions';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const holdPeriod = output.inputs.holdPeriod || 5;
  const exitMultiple =
    typeof (output.inputs as any).exitMultiple === 'number'
      ? (output.inputs as any).exitMultiple
      : typeof output.returns?.exitEV === 'number' && output.projections.length > 0
          ? output.returns.exitEV / output.projections[output.projections.length - 1].ebitda
          : null;
  const revenueGrowth = Array.isArray(output.inputs.revenueGrowth)
    ? output.inputs.revenueGrowth
    : Array(holdPeriod).fill(
        typeof output.inputs.revenueGrowth === 'number' ? output.inputs.revenueGrowth : 0.05
      );

  sheet.getCell(row, 1).value = 'Revenue Growth';
  revenueGrowth.forEach((val, idx) => {
    sheet.getCell(row, idx + 2).value = val;
    applyNumberFormat(sheet.getCell(row, idx + 2), 'PERCENTAGE');
    sheet.getCell(row, idx + 2).style = createInputStyle();
  });
  row++;

  sheet.getCell(row, 1).value = 'EBITDA Margin';
  sheet.getCell(row, 2).value = output.inputs.ebitdaMargin || (output.inputs.ebitda / output.inputs.revenue);
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  sheet.getCell(row, 1).value = 'Capex % of Revenue';
  sheet.getCell(row, 2).value = output.inputs.capexPctRevenue || 0.03;
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  sheet.getCell(row, 1).value = 'D&A % of Revenue';
  // D&A may not be directly in LboInputs, use a reasonable default
  const daPct = (output.inputs as any).daPctRevenue || 0.04;
  sheet.getCell(row, 2).value = daPct;
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  sheet.getCell(row, 1).value = 'NWC % of Revenue';
  sheet.getCell(row, 2).value = output.inputs.nwcPctRevenue || 0.05;
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  sheet.getCell(row, 1).value = 'Tax Rate';
  sheet.getCell(row, 2).value = output.inputs.taxRate || 0.25;
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  sheet.getCell(row, 2).style = createInputStyle();
  row += 2;

  // Exit Assumptions
  sheet.getCell(row, 1).value = 'Exit Assumptions';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'Exit Multiple (EV/EBITDA)';
  sheet.getCell(row, 2).value = exitMultiple;
  applyNumberFormat(sheet.getCell(row, 2), 'DECIMAL');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  sheet.getCell(row, 1).value = 'Holding Period (years)';
  sheet.getCell(row, 2).value = holdPeriod;
  applyNumberFormat(sheet.getCell(row, 2), 'INTEGER');
  sheet.getCell(row, 2).style = createInputStyle();

  setColumnWidths(sheet, [0, 30, 15, 12, 12, 12, 12, 12]);
}

/**
 * Create Sources & Uses sheet
 */
function createSourcesUsesSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput
): void {
  const sheet = workbook.addWorksheet('Sources & Uses');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${ticker} - Sources & Uses`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 2);
  row += 2;

  // Sources
  sheet.getCell(row, 1).value = 'SOURCES';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const sources = [
    { label: 'Senior Debt', value: output.sourcesAndUses.sources.seniorDebt },
    { label: 'Subordinated Debt', value: output.sourcesAndUses.sources.subordinatedDebt },
    { label: 'Sponsor Equity', value: output.sourcesAndUses.sources.sponsorEquity },
    { label: 'Total Sources', value: output.sourcesAndUses.sources.total, isTotal: true },
  ];

  sources.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 1).style = item.isTotal ? createTotalStyle() : createNormalStyle();
    sheet.getCell(row, 2).value = item.value;
    applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    sheet.getCell(row, 2).style = item.isTotal ? createTotalStyle() : createFormulaStyle();
    row++;
  });

  row += 2;

  // Uses
  sheet.getCell(row, 1).value = 'USES';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const uses = [
    { label: 'Purchase Price', value: output.sourcesAndUses.uses.purchasePrice },
    { label: 'Transaction Fees', value: output.sourcesAndUses.uses.transactionFees },
    { label: 'Total Uses', value: output.sourcesAndUses.uses.total, isTotal: true },
  ];

  uses.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 1).style = item.isTotal ? createTotalStyle() : createNormalStyle();
    sheet.getCell(row, 2).value = item.value;
    applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    sheet.getCell(row, 2).style = item.isTotal ? createTotalStyle() : createFormulaStyle();
    row++;
  });

  setColumnWidths(sheet, [0, 25, 20]);
}

/**
 * Create Operating Forecast sheet
 */
function createOperatingForecastSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput
): void {
  const sheet = workbook.addWorksheet('Operating Forecast');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${ticker} - Operating Forecast`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, output.projections.length + 1);
  row += 2;

  // Headers
  sheet.getCell(row, 1).value = 'Year';
  output.projections.forEach((proj, idx) => {
    sheet.getCell(row, idx + 2).value = proj.year;
  });
  row++;

  // Forecast items
  const items = [
    { label: 'Revenue', values: output.projections.map(p => p.revenue) },
    { label: 'EBITDA', values: output.projections.map(p => p.ebitda) },
    { label: 'EBITDA Margin', values: output.projections.map(p => p.ebitdaMargin) },
    { label: 'Capex', values: output.projections.map(p => p.capex) },
    { label: 'Change in NWC', values: output.projections.map(p => p.nwcChange) },
    { label: 'Free Cash Flow', values: output.projections.map(p => p.freeCashFlow), isTotal: true },
  ];

  items.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 1).style = item.isTotal ? createTotalStyle() : createNormalStyle();
    item.values.forEach((val, idx) => {
      sheet.getCell(row, idx + 2).value = val;
      if (item.label.includes('Margin')) {
        applyNumberFormat(sheet.getCell(row, idx + 2), 'PERCENTAGE');
      } else {
        applyNumberFormat(sheet.getCell(row, idx + 2), 'CURRENCY');
      }
      sheet.getCell(row, idx + 2).style = item.isTotal ? createTotalStyle() : createFormulaStyle();
    });
    row++;
  });

  setColumnWidths(sheet, [0, 20, 15, 15, 15, 15, 15]);
}

/**
 * Create Debt Schedule sheet (readable)
 */
function createDebtScheduleSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput
): void {
  const sheet = workbook.addWorksheet('Debt Schedule');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${ticker} - Debt Schedule`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 10);
  row += 2;

  // Headers
  const headers = [
    'Year',
    'Beginning Debt',
    'Interest Expense',
    'Cash Available',
    'Mandatory Amort. (Req)',
    'Mandatory Amort. (Actual)',
    'Cash Sweep',
    'Total Debt Repayment',
    'Ending Debt',
    'Excess Cash',
  ];
  headers.forEach((header, idx) => {
    sheet.getCell(row, idx + 1).value = header;
    sheet.getCell(row, idx + 1).style = createSubHeaderStyle();
  });
  row++;

  // Debt schedule rows
  output.debtSchedule.forEach(debt => {
    sheet.getCell(row, 1).value = debt.year;
    sheet.getCell(row, 2).value = debt.beginningBalance;
    sheet.getCell(row, 3).value = debt.interest;
    sheet.getCell(row, 4).value = debt.cashAvailableForDebt;
    sheet.getCell(row, 5).value = debt.mandatoryAmortizationRequired;
    sheet.getCell(row, 6).value = debt.mandatoryAmortization;
    sheet.getCell(row, 7).value = debt.cashSweep;
    sheet.getCell(row, 8).value = debt.totalDebtRepayment;
    sheet.getCell(row, 9).value = debt.endingBalance;
    sheet.getCell(row, 10).value = debt.excessCash;

    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].forEach(col => {
      sheet.getCell(row, col).style = createFormulaStyle();
      if (col === 1) {
        applyNumberFormat(sheet.getCell(row, col), 'INTEGER');
      } else {
        applyNumberFormat(sheet.getCell(row, col), 'CURRENCY');
      }
    });
    row++;
  });

  setColumnWidths(sheet, [0, 10, 18, 16, 16, 18, 18, 16, 18, 18, 16]);
}

/**
 * Create Returns (IRR / MoM) sheet
 */
function createReturnsSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput
): void {
  const sheet = workbook.addWorksheet('Returns (IRR / MoM)');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${ticker} - Returns Analysis`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 3);
  row += 2;

  // Key Returns
  sheet.getCell(row, 1).value = 'Key Returns';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const returns = [
    { label: 'Sponsor Equity Invested', value: output.sourcesAndUses.sources.sponsorEquity },
    { label: 'Exit Equity Value', value: output.returns.exitEquityValue },
    { label: 'Excess Cash at Exit', value: output.returns.exitExcessCash ?? 0 },
    { label: 'MOIC', value: output.returns.moic },
    { label: 'IRR', value: output.returns.irr },
  ];

  returns.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 1).style = createNormalStyle();
    sheet.getCell(row, 2).value = item.value;
    if (item.label === 'MOIC') {
      applyNumberFormat(sheet.getCell(row, 2), 'DECIMAL');
    } else if (item.label === 'IRR') {
      applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
    } else {
      applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    }
    row++;
  });

  row += 2;

  // Cash Flow Summary
  sheet.getCell(row, 1).value = 'Cash Flow Summary';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'Year';
  sheet.getCell(row, 2).value = 'Cash Flow';
  row++;

  // Initial investment (negative)
  sheet.getCell(row, 1).value = 0;
  sheet.getCell(row, 2).value = -output.sourcesAndUses.sources.sponsorEquity;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  row++;

  // Interim years (assume no distributions)
  const holdPeriod = output.inputs.holdPeriod || 5;
  for (let year = 1; year < holdPeriod; year++) {
    sheet.getCell(row, 1).value = year;
    sheet.getCell(row, 2).value = 0;
    applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    row++;
  }

  // Exit
  sheet.getCell(row, 1).value = holdPeriod;
  sheet.getCell(row, 2).value = output.returns.exitEquityValue;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');

  setColumnWidths(sheet, [0, 25, 20]);
}

/**
 * Create LBO Sensitivities sheet (simple and real)
 */
function createLBOSensitivitiesSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput,
  inputs?: LBOExcelInputs
): void {
  const sheet = workbook.addWorksheet('Sensitivities');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${ticker} - Sensitivity Analysis`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 6);
  row += 2;

  // Entry Multiple × Exit Multiple Grid
  sheet.getCell(row, 1).value = 'Entry Multiple × Exit Multiple Sensitivity';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  sheet.mergeCells(row, 1, row, 6);
  row++;

  const baseEntryMultiple = output.returns.entryEV / output.inputs.ebitda;
  const baseExitMultiple = output.returns.exitEV / (output.projections[output.projections.length - 1].ebitda);
  const entryMultiples = [baseEntryMultiple * 0.9, baseEntryMultiple * 0.95, baseEntryMultiple, baseEntryMultiple * 1.05, baseEntryMultiple * 1.1];
  const exitMultiples = [baseExitMultiple * 0.9, baseExitMultiple * 0.95, baseExitMultiple, baseExitMultiple * 1.05, baseExitMultiple * 1.1];

  // Headers
  sheet.getCell(row, 1).value = 'Entry \\ Exit';
  exitMultiples.forEach((exit, idx) => {
    sheet.getCell(row, idx + 2).value = exit.toFixed(1) + 'x';
  });
  row++;

  // Grid values
  entryMultiples.forEach(entry => {
    sheet.getCell(row, 1).value = entry.toFixed(1) + 'x';
    exitMultiples.forEach((exit, idx) => {
      // Calculate MOIC for this combination
      const entryEV = output.inputs.ebitda * entry;
      const exitEBITDA = output.projections[output.projections.length - 1].ebitda;
      const exitEV = exitEBITDA * exit;
      const totalDebt = output.sourcesAndUses.sources.seniorDebt + output.sourcesAndUses.sources.subordinatedDebt;
      const exitDebt = Math.max(0, totalDebt - (totalDebt / (output.inputs.holdPeriod || 5)) * (output.inputs.holdPeriod || 5));
      const exitEquity = exitEV - exitDebt;
      const sponsorEquity = entryEV - totalDebt;
      const moic = sponsorEquity > 0 ? exitEquity / sponsorEquity : 0;

      sheet.getCell(row, idx + 2).value = moic;
      applyNumberFormat(sheet.getCell(row, idx + 2), 'DECIMAL');
    });
    row++;
  });

  row += 2;

  // Leverage × Exit Multiple Grid
  sheet.getCell(row, 1).value = 'Leverage × Exit Multiple Sensitivity';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  sheet.mergeCells(row, 1, row, 6);
  row++;

  const baseLeverage = (output.sourcesAndUses.sources.seniorDebt + output.sourcesAndUses.sources.subordinatedDebt) / output.inputs.ebitda;
  const leverageMultiples = [baseLeverage * 0.8, baseLeverage * 0.9, baseLeverage, baseLeverage * 1.1, baseLeverage * 1.2];

  // Headers
  sheet.getCell(row, 1).value = 'Leverage \\ Exit';
  exitMultiples.forEach((exit, idx) => {
    sheet.getCell(row, idx + 2).value = exit.toFixed(1) + 'x';
  });
  row++;

  // Grid values
  leverageMultiples.forEach(leverage => {
    sheet.getCell(row, 1).value = leverage.toFixed(1) + 'x';
    exitMultiples.forEach((exit, idx) => {
      // Calculate MOIC for this combination
      const entryEV = output.returns.entryEV;
      const totalDebt = output.inputs.ebitda * leverage;
      const sponsorEquity = entryEV - totalDebt;
      const exitEBITDA = output.projections[output.projections.length - 1].ebitda;
      const exitEV = exitEBITDA * exit;
      const exitDebt = Math.max(0, totalDebt - (totalDebt / (output.inputs.holdPeriod || 5)) * (output.inputs.holdPeriod || 5));
      const exitEquity = exitEV - exitDebt;
      const moic = sponsorEquity > 0 ? exitEquity / sponsorEquity : 0;

      sheet.getCell(row, idx + 2).value = moic;
      applyNumberFormat(sheet.getCell(row, idx + 2), 'DECIMAL');
    });
    row++;
  });

  setColumnWidths(sheet, [0, 20, 12, 12, 12, 12, 12]);
}

/**
 * Create LBO Checks sheet
 */
function createLBOChecksSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput
): void {
  const sheet = workbook.addWorksheet('Checks');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${ticker} - LBO Model Checks`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 3);
  row += 2;

  // Sources & Uses Check
  sheet.getCell(row, 1).value = 'Sources & Uses Balance';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const sourcesUsesDiff = output.sourcesAndUses.sources.total - output.sourcesAndUses.uses.total;
  sheet.getCell(row, 1).value = 'Difference';
  sheet.getCell(row, 2).value = sourcesUsesDiff;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: Math.abs(sourcesUsesDiff) < 0.01 ? 'FF008000' : 'FFFF0000' } },
  };
  row += 2;

  // Debt Schedule Check
  sheet.getCell(row, 1).value = 'Debt Schedule Check';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const finalDebt = output.debtSchedule[output.debtSchedule.length - 1].endingBalance;
  const expectedFinalDebt = 0; // Should be fully paid off
  const debtDiff = Math.abs(finalDebt - expectedFinalDebt);

  sheet.getCell(row, 1).value = 'Final Debt Balance';
  sheet.getCell(row, 2).value = finalDebt;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: debtDiff < 0.01 ? 'FF008000' : 'FFFF6600' } },
  };
  row += 2;

  // Returns Check
  sheet.getCell(row, 1).value = 'Returns Check';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const calculatedMOIC = output.returns.exitEquityValue / output.sourcesAndUses.sources.sponsorEquity;
  const moicDiff = Math.abs(calculatedMOIC - output.returns.moic);

  sheet.getCell(row, 1).value = 'MOIC Check';
  sheet.getCell(row, 2).value = moicDiff;
  applyNumberFormat(sheet.getCell(row, 2), 'DECIMAL');
  sheet.getCell(row, 2).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: moicDiff < 0.01 ? 'FF008000' : 'FFFF0000' } },
  };

  setColumnWidths(sheet, [0, 25, 20, 15]);
}

/**
 * Create LBO Sources & Notes sheet
 */
function createLBOSourcesNotesSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  inputs?: LBOExcelInputs
): void {
  const sheet = workbook.addWorksheet('Sources & Notes');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${ticker} - Data Sources & Notes`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 2);
  row += 2;

  // Data Sources
  if (inputs?.dataSources) {
    sheet.getCell(row, 1).value = 'Data Sources';
    sheet.getCell(row, 1).style = createSubHeaderStyle();
    row++;

    const dataSources = inputs.dataSources;
    const sourceItems = [
      { label: 'Revenue', source: dataSources.revenue || 'Reported' },
      { label: 'EBITDA', source: dataSources.ebitda || 'Reported' },
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
  }

  // Notes
  sheet.getCell(row, 1).value = 'Notes';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const notes = [
    'Entry EV may be derived from EBITDA × entry multiple if both exist',
    'Equity value = EV − net debt (if net debt exists)',
    'Shares are NOT required for LBO unless showing price/share outputs',
    'Debt schedule assumes level amortization over holding period',
    'No advanced features like revolver sweeps (not supported)',
    'Sensitivities show Entry Multiple × Exit Multiple and Leverage × Exit Multiple',
  ];

  notes.forEach(note => {
    sheet.getCell(row, 1).value = `• ${note}`;
    sheet.getCell(row, 1).style = { ...createNormalStyle(), alignment: { wrapText: true } };
    row++;
  });

  setColumnWidths(sheet, [0, 50, 20]);
}
