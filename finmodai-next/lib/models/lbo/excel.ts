/**
 * LBO Model Excel Generator
 * Institutional-grade leveraged buyout model with all required tabs.
 * Uses shared styleKit for consistent typography, freeze panes, and hidden unused area.
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
import {
  applyWorkbookDefaults,
  applySheetDefaults,
  setColumnWidths as setColWidthsKit,
  hideUnusedArea,
  titleBar,
  sectionHeader,
  tableHeader,
  zebraRows,
  inputCell as styleKitInputCell,
  outputCell as styleKitOutputCell,
  bodyCell as styleKitBodyCell,
  borderBox,
} from '../../excel/styleKit';
import type { LboEngineOutput } from '../../lboEngine';
import { writeValuationBlock } from '../../excel/valuationBlock';

const MONEY_FMT = '$#,##0;($#,##0)';
const PERCENT_FMT = '0.0%';
const MULTIPLE_FMT = '0.0x';
const UNITS_TITLE = 'All figures in USD millions unless otherwise noted.';

export interface LBOExcelInputs {
  ticker: string;
  companyName?: string;
  entryEV?: number;
  entryEBITDA?: number;
  entryMultiple?: number;
  leverageMultiple?: number;
  totalDebt?: number;
  seniorDebt?: number;
  subordinatedDebt?: number;
  seniorRate?: number;
  subRate?: number;
  revenue: number;
  ebitda: number;
  revenueGrowth?: number[];
  ebitdaMargin?: number;
  ebitdaMarginExpansion?: number;
  capexPctRevenue?: number;
  daPctRevenue?: number;
  nwcPctRevenue?: number;
  taxRate?: number;
  exitMultiple?: number;
  exitEV?: number;
  holdPeriod?: number;
  transactionFees?: number;
  sharesOutstanding?: number;
  marketSharePrice?: number;
  dataSources?: {
    revenue?: 'Reported' | 'Derived' | 'User';
    ebitda?: 'Reported' | 'Derived' | 'User';
    [key: string]: 'Reported' | 'Derived' | 'User' | undefined;
  };
  notes?: string[];
}

function fmt(cell: ExcelJS.Cell, format: string): void {
  cell.numFmt = format;
}

function applyLabelStyle(cell: ExcelJS.Cell): void {
  cell.style = {
    ...createNormalStyle(),
    alignment: { vertical: 'middle', horizontal: 'left' },
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
  applyWorkbookDefaults(workbook, { company: 'CapitalBase' });
  workbook.calcProperties.fullCalcOnLoad = true;
  const ticker = output.ticker.toUpperCase();
  const companyName = output.companyName || ticker;

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

function createLBOSummarySheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  companyName: string,
  output: LboEngineOutput,
  inputs?: LBOExcelInputs
): void {
  const sheet = workbook.addWorksheet('LBO Summary');
  const lastDataCol = 3;

  let row = titleBar(sheet, `${ticker} — Leveraged Buyout Analysis`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  sectionHeader(sheet, row, 'Key Returns', lastDataCol);
  row++;
  const returnsStartRow = row;

  const returns: Array<{ label: string; value: number; format: string }> = [
    { label: 'Entry EV', value: output.returns.entryEV, format: MONEY_FMT },
    { label: 'Exit EV', value: output.returns.exitEV, format: MONEY_FMT },
    { label: 'Sponsor Equity', value: output.sourcesAndUses.sources.sponsorEquity, format: MONEY_FMT },
    { label: 'Exit Equity Value', value: output.returns.exitEquityValue, format: MONEY_FMT },
    { label: 'MOIC', value: output.returns.moic, format: '0.00x' },
    { label: 'IRR', value: output.returns.irr, format: PERCENT_FMT },
  ];

  returns.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    styleKitOutputCell(vc);
    row++;
  });
  zebraRows(sheet, returnsStartRow, row - 1, 1, 2);
  borderBox(sheet, returnsStartRow - 1, 1, row - 1, 2);

  row += 1;
  sectionHeader(sheet, row, 'Key Assumptions', lastDataCol);
  row++;
  const assumptionsStartRow = row;

  const entryMultiple = output.returns.entryEV / output.inputs.ebitda;
  const lastProj = output.projections[output.projections.length - 1];
  const exitMultiple = output.returns.exitEV / lastProj.ebitda;
  const totalDebt = output.sourcesAndUses.sources.seniorDebt + output.sourcesAndUses.sources.subordinatedDebt;
  const leverageMultiple = totalDebt / output.inputs.ebitda;

  const assumptions: Array<{ label: string; value: number; format: string }> = [
    { label: 'Entry Multiple (EV/EBITDA)', value: entryMultiple, format: MULTIPLE_FMT },
    { label: 'Exit Multiple (EV/EBITDA)', value: exitMultiple, format: MULTIPLE_FMT },
    { label: 'Leverage Multiple (Debt/EBITDA)', value: leverageMultiple, format: MULTIPLE_FMT },
    { label: 'Holding Period (years)', value: output.inputs.holdPeriod || 5, format: '#,##0' },
    { label: 'Senior Debt Rate', value: output.inputs.seniorRate || 0.06, format: PERCENT_FMT },
    { label: 'Sub Debt Rate', value: output.inputs.subRate || 0.10, format: PERCENT_FMT },
    { label: 'Tax Rate', value: output.inputs.taxRate || 0.25, format: PERCENT_FMT },
  ];

  assumptions.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    styleKitOutputCell(vc);
    row++;
  });
  zebraRows(sheet, assumptionsStartRow, row - 1, 1, 2);
  borderBox(sheet, assumptionsStartRow - 1, 1, row - 1, 2);

  row += 1;

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
    evSourceDetail: 'Entry EV = Entry Multiple × LTM EBITDA',
    modelLabel: 'LBO',
    useFormulas: false,
    valueCol: 2,
  });

  const exitDebt = output.debtSchedule[output.debtSchedule.length - 1]?.endingBalance ?? 0;
  const exitExcessCash = output.debtSchedule[output.debtSchedule.length - 1]?.excessCash ?? 0;
  const exitEbitda = output.projections[output.projections.length - 1]?.ebitda ?? output.inputs.ebitda;
  const sponsorEquity = output.sourcesAndUses.sources.sponsorEquity;
  const debtPaydown = totalDebt - exitDebt;
  const operatingValueAtEntryMultiple = exitEbitda * entryMultiple;
  const ebitdaGrowthEffect = operatingValueAtEntryMultiple - output.returns.entryEV;
  const multipleExpansionEffect = output.returns.exitEV - operatingValueAtEntryMultiple;

  row = (sheet.lastRow?.number ?? row) + 2;
  sectionHeader(sheet, row, 'Sponsor Case Overview', lastDataCol);
  row++;
  sheet.mergeCells(row, 1, row, lastDataCol);
  sheet.getCell(row, 1).value =
    'Start on this sheet to judge whether the entry price, leverage package, and exit underwriting support the target return. Then move into Sources & Uses, Debt Schedule, and Returns before changing the case.';
  sheet.getCell(row, 1).font = { name: 'Aptos', size: 10, color: { argb: 'FF475569' } };
  sheet.getCell(row, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' },
  };
  sheet.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
  row += 2;

  sectionHeader(sheet, row, 'Leverage & Exit Profile', lastDataCol);
  row++;
  const leverageStartRow = row;
  const leverageRows: Array<{ label: string; value: number; format: string }> = [
    { label: 'Entry Debt', value: totalDebt, format: MONEY_FMT },
    { label: 'Exit Debt', value: exitDebt, format: MONEY_FMT },
    { label: 'Debt Paydown', value: debtPaydown, format: MONEY_FMT },
    { label: 'Exit Excess Cash', value: exitExcessCash, format: MONEY_FMT },
    { label: 'Exit EBITDA', value: exitEbitda, format: MONEY_FMT },
    { label: 'Exit Debt / EBITDA', value: exitEbitda > 0 ? exitDebt / exitEbitda : 0, format: MULTIPLE_FMT },
  ];
  leverageRows.forEach((item) => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const valueCell = sheet.getCell(row, 2);
    valueCell.value = item.value;
    fmt(valueCell, item.format);
    styleKitOutputCell(valueCell);
    row++;
  });
  zebraRows(sheet, leverageStartRow, row - 1, 1, 2);
  borderBox(sheet, leverageStartRow - 1, 1, row - 1, 2);

  row += 1;
  sectionHeader(sheet, row, 'Value Driver View', lastDataCol);
  row++;
  const driverStartRow = row;
  const driverRows: Array<{ label: string; value: number; format: string }> = [
    { label: 'Entry Sponsor Equity', value: sponsorEquity, format: MONEY_FMT },
    { label: 'EBITDA Growth Effect', value: ebitdaGrowthEffect, format: MONEY_FMT },
    { label: 'Multiple Shift Effect', value: multipleExpansionEffect, format: MONEY_FMT },
    { label: 'Debt Paydown Effect', value: debtPaydown, format: MONEY_FMT },
    { label: 'Exit Equity Value', value: output.returns.exitEquityValue, format: MONEY_FMT },
  ];
  driverRows.forEach((item) => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const valueCell = sheet.getCell(row, 2);
    valueCell.value = item.value;
    fmt(valueCell, item.format);
    styleKitOutputCell(valueCell);
    row++;
  });
  zebraRows(sheet, driverStartRow, row - 1, 1, 2);
  borderBox(sheet, driverStartRow - 1, 1, row - 1, 2);

  row += 1;
  sheet.mergeCells(row, 1, row, lastDataCol);
  sheet.getCell(row, 1).value =
    'The value-driver view is directional. Use Returns and the Debt Schedule for the exact sponsor payoff mechanics, especially when fees or excess cash are material.';
  sheet.getCell(row, 1).font = { name: 'Aptos', size: 10, color: { argb: 'FF64748B' } };
  sheet.getCell(row, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' },
  };
  sheet.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

  const lastUsedRow = sheet.lastRow?.number ?? row;
  setColWidthsKit(sheet, [34, 22, 18]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

function createLBOAssumptionsSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput,
  inputs?: LBOExcelInputs
): void {
  const sheet = workbook.addWorksheet('Assumptions');
  const lastDataCol = 7;

  let row = titleBar(sheet, `${ticker} — LBO Assumptions`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  sectionHeader(sheet, row, 'Entry Assumptions', 2);
  row++;

  const entryEV = output.returns.entryEV;
  const entryEBITDA = output.inputs.ebitda;
  const entryMultiple = entryEV / entryEBITDA;

  const entryItems: Array<{ label: string; value: number; format: string; isInput: boolean }> = [
    { label: 'LTM Revenue', value: output.inputs.revenue, format: MONEY_FMT, isInput: false },
    { label: 'LTM EBITDA', value: entryEBITDA, format: MONEY_FMT, isInput: false },
    { label: 'Entry Multiple (EV/EBITDA)', value: entryMultiple, format: MULTIPLE_FMT, isInput: true },
    { label: 'Entry EV', value: entryEV, format: MONEY_FMT, isInput: false },
  ];

  entryItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    if (item.isInput) styleKitInputCell(vc); else styleKitOutputCell(vc);
    row++;
  });

  row += 1;
  sectionHeader(sheet, row, 'Debt Assumptions', 2);
  row++;

  const totalDebt = output.sourcesAndUses.sources.seniorDebt + output.sourcesAndUses.sources.subordinatedDebt;
  const leverageMultiple = totalDebt / entryEBITDA;

  const debtItems: Array<{ label: string; value: number; format: string; isInput: boolean }> = [
    { label: 'Leverage Multiple (Debt/EBITDA)', value: leverageMultiple, format: MULTIPLE_FMT, isInput: true },
    { label: 'Total Debt', value: totalDebt, format: MONEY_FMT, isInput: false },
    { label: 'Senior Debt', value: output.sourcesAndUses.sources.seniorDebt, format: MONEY_FMT, isInput: true },
    { label: 'Senior Rate (%)', value: output.inputs.seniorRate || 0.06, format: PERCENT_FMT, isInput: true },
    { label: 'Subordinated Debt', value: output.sourcesAndUses.sources.subordinatedDebt, format: MONEY_FMT, isInput: true },
    { label: 'Subordinated Rate (%)', value: output.inputs.subRate || 0.10, format: PERCENT_FMT, isInput: true },
  ];

  debtItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    if (item.isInput) styleKitInputCell(vc); else styleKitOutputCell(vc);
    row++;
  });

  row += 1;
  sectionHeader(sheet, row, 'Operating Assumptions', lastDataCol);
  row++;

  const holdPeriod = output.inputs.holdPeriod || 5;
  const revenueGrowth = Array.isArray(output.inputs.revenueGrowth)
    ? output.inputs.revenueGrowth
    : Array(holdPeriod).fill(typeof output.inputs.revenueGrowth === 'number' ? output.inputs.revenueGrowth : 0.05);

  const opHeader = row;
  sheet.getCell(row, 1).value = 'Assumption';
  for (let i = 0; i < holdPeriod; i++) {
    sheet.getCell(row, 2 + i).value = `Year ${i + 1}`;
  }
  tableHeader(sheet, row, 1, 1 + holdPeriod);
  row++;

  const opItems: Array<{ label: string; values: number[]; format: string }> = [
    { label: 'Revenue Growth (%)', values: revenueGrowth.slice(0, holdPeriod), format: PERCENT_FMT },
    { label: 'EBITDA Margin (%)', values: Array(holdPeriod).fill(output.inputs.ebitdaMargin || (output.inputs.ebitda / output.inputs.revenue)), format: PERCENT_FMT },
    { label: 'Capex % Revenue', values: Array(holdPeriod).fill(output.inputs.capexPctRevenue || 0.03), format: PERCENT_FMT },
    { label: 'D&A % Revenue', values: Array(holdPeriod).fill((output.inputs as any).daPctRevenue || 0.04), format: PERCENT_FMT },
    { label: 'NWC % Revenue', values: Array(holdPeriod).fill(output.inputs.nwcPctRevenue || 0.05), format: PERCENT_FMT },
    { label: 'Tax Rate (%)', values: Array(holdPeriod).fill(output.inputs.taxRate || 0.25), format: PERCENT_FMT },
  ];

  opItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    item.values.forEach((val, idx) => {
      const c = sheet.getCell(row, 2 + idx);
      c.value = val;
      fmt(c, item.format);
      styleKitInputCell(c);
    });
    row++;
  });
  zebraRows(sheet, opHeader + 1, row - 1, 1, 1 + holdPeriod);
  borderBox(sheet, opHeader, 1, row - 1, 1 + holdPeriod);

  row += 1;
  sectionHeader(sheet, row, 'Exit Assumptions', 2);
  row++;

  const exitMultiple =
    typeof (output.inputs as any).exitMultiple === 'number'
      ? (output.inputs as any).exitMultiple
      : output.returns.exitEV / output.projections[output.projections.length - 1].ebitda;

  const exitItems: Array<{ label: string; value: number; format: string }> = [
    { label: 'Exit Multiple (EV/EBITDA)', value: exitMultiple, format: MULTIPLE_FMT },
    { label: 'Holding Period (years)', value: holdPeriod, format: '#,##0' },
  ];

  exitItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    styleKitInputCell(vc);
    row++;
  });

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [30, 16, 14, 14, 14, 14, 14]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

function createSourcesUsesSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput
): void {
  const sheet = workbook.addWorksheet('Sources & Uses');
  const lastDataCol = 3;

  let row = titleBar(sheet, `${ticker} — Sources & Uses`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  sectionHeader(sheet, row, 'Sources', lastDataCol);
  row++;
  const sourcesStartRow = row;

  const sources: Array<{ label: string; value: number; isTotal?: boolean }> = [
    { label: 'Senior Debt', value: output.sourcesAndUses.sources.seniorDebt },
    { label: 'Subordinated Debt', value: output.sourcesAndUses.sources.subordinatedDebt },
    { label: 'Sponsor Equity', value: output.sourcesAndUses.sources.sponsorEquity },
    { label: 'Total Sources', value: output.sourcesAndUses.sources.total, isTotal: true },
  ];

  sources.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    if (item.isTotal) {
      sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { vertical: 'middle', horizontal: 'left' } };
    } else {
      applyLabelStyle(sheet.getCell(row, 1));
    }
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, MONEY_FMT);
    if (item.isTotal) {
      vc.style = createTotalStyle();
    } else {
      styleKitOutputCell(vc);
    }
    const pctCell = sheet.getCell(row, 3);
    pctCell.value = output.sourcesAndUses.sources.total > 0 ? item.value / output.sourcesAndUses.sources.total : 0;
    fmt(pctCell, PERCENT_FMT);
    styleKitBodyCell(pctCell);
    row++;
  });
  zebraRows(sheet, sourcesStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, sourcesStartRow - 1, 1, row - 1, lastDataCol);

  row += 1;
  sectionHeader(sheet, row, 'Uses', lastDataCol);
  row++;
  const usesStartRow = row;

  const uses: Array<{ label: string; value: number; isTotal?: boolean }> = [
    { label: 'Purchase Price (Entry EV)', value: output.sourcesAndUses.uses.purchasePrice },
    { label: 'Transaction Fees', value: output.sourcesAndUses.uses.transactionFees },
    { label: 'Total Uses', value: output.sourcesAndUses.uses.total, isTotal: true },
  ];

  uses.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    if (item.isTotal) {
      sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { vertical: 'middle', horizontal: 'left' } };
    } else {
      applyLabelStyle(sheet.getCell(row, 1));
    }
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, MONEY_FMT);
    if (item.isTotal) {
      vc.style = createTotalStyle();
    } else {
      styleKitOutputCell(vc);
    }
    const pctCell = sheet.getCell(row, 3);
    pctCell.value = output.sourcesAndUses.uses.total > 0 ? item.value / output.sourcesAndUses.uses.total : 0;
    fmt(pctCell, PERCENT_FMT);
    styleKitBodyCell(pctCell);
    row++;
  });
  zebraRows(sheet, usesStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, usesStartRow - 1, 1, row - 1, lastDataCol);

  row += 1;
  const balanceDiff = output.sourcesAndUses.sources.total - output.sourcesAndUses.uses.total;
  sheet.getCell(row, 1).value = 'Balance Check (Sources − Uses)';
  applyLabelStyle(sheet.getCell(row, 1));
  const balCell = sheet.getCell(row, 2);
  balCell.value = balanceDiff;
  fmt(balCell, MONEY_FMT);
  balCell.font = { ...createNormalStyle().font, color: { argb: Math.abs(balanceDiff) < 0.01 ? 'FF008000' : 'FFFF0000' } };

  const lastUsedRow = row;
  setColWidthsKit(sheet, [30, 22, 14]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

function createOperatingForecastSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput
): void {
  const sheet = workbook.addWorksheet('Operating Forecast');
  const projYears = output.projections.length;
  const lastDataCol = projYears + 1;

  let row = titleBar(sheet, `${ticker} — Operating Forecast`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  const headerRow = row;
  sheet.getCell(row, 1).value = 'Line Item';
  output.projections.forEach((proj, idx) => {
    sheet.getCell(row, idx + 2).value = proj.year;
  });
  tableHeader(sheet, row, 1, lastDataCol);
  row++;

  const lineItems: Array<{ label: string; values: number[]; format: string; isTotal?: boolean }> = [
    { label: 'Revenue', values: output.projections.map(p => p.revenue), format: MONEY_FMT },
    { label: 'Revenue Growth (%)', values: output.projections.map((p, i) => i === 0 ? 0 : (p.revenue - output.projections[i - 1].revenue) / output.projections[i - 1].revenue), format: PERCENT_FMT },
    { label: 'EBITDA', values: output.projections.map(p => p.ebitda), format: MONEY_FMT },
    { label: 'EBITDA Margin (%)', values: output.projections.map(p => p.ebitdaMargin), format: PERCENT_FMT },
    { label: 'Capex', values: output.projections.map(p => p.capex), format: MONEY_FMT },
    { label: 'Change in NWC', values: output.projections.map(p => p.nwcChange), format: MONEY_FMT },
    { label: 'Free Cash Flow', values: output.projections.map(p => p.freeCashFlow), format: MONEY_FMT, isTotal: true },
    { label: 'Cumulative FCF', values: output.projections.reduce((acc: number[], p) => { const prev = acc.length > 0 ? acc[acc.length - 1] : 0; acc.push(prev + p.freeCashFlow); return acc; }, []), format: MONEY_FMT },
  ];

  const dataStartRow = row;
  lineItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    if (item.isTotal) {
      sheet.getCell(row, 1).style = { ...createTotalStyle(), alignment: { vertical: 'middle', horizontal: 'left' } };
    } else {
      applyLabelStyle(sheet.getCell(row, 1));
    }
    item.values.forEach((val, idx) => {
      const c = sheet.getCell(row, idx + 2);
      c.value = val;
      fmt(c, item.format);
      if (item.isTotal) c.style = createTotalStyle();
      else styleKitBodyCell(c);
    });
    row++;
  });
  zebraRows(sheet, dataStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, headerRow, 1, row - 1, lastDataCol);

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [22, ...Array(projYears).fill(16)]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

function createDebtScheduleSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput
): void {
  const sheet = workbook.addWorksheet('Debt Schedule');
  const lastDataCol = 10;

  let row = titleBar(sheet, `${ticker} — Debt Schedule`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  const headerRow = row;
  const headers = [
    'Year', 'Beginning Debt', 'Interest Expense', 'Cash Available',
    'Mandatory Amort.', 'Actual Amort.', 'Cash Sweep',
    'Total Repayment', 'Ending Debt', 'Excess Cash',
  ];
  headers.forEach((h, idx) => {
    sheet.getCell(row, idx + 1).value = h;
  });
  tableHeader(sheet, row, 1, lastDataCol);
  row++;

  const dataStartRow = row;
  output.debtSchedule.forEach(debt => {
    sheet.getCell(row, 1).value = debt.year;
    styleKitBodyCell(sheet.getCell(row, 1));
    sheet.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'center' };

    const vals = [
      debt.beginningBalance, debt.interest, debt.cashAvailableForDebt,
      debt.mandatoryAmortizationRequired, debt.mandatoryAmortization,
      debt.cashSweep, debt.totalDebtRepayment, debt.endingBalance, debt.excessCash,
    ];
    vals.forEach((v, idx) => {
      const c = sheet.getCell(row, idx + 2);
      c.value = v;
      fmt(c, MONEY_FMT);
      styleKitBodyCell(c);
    });
    row++;
  });
  zebraRows(sheet, dataStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, headerRow, 1, row - 1, lastDataCol);

  row += 1;
  sheet.getCell(row, 1).value = 'Total Interest Paid';
  applyLabelStyle(sheet.getCell(row, 1));
  const totalInterest = output.debtSchedule.reduce((s, d) => s + d.interest, 0);
  const tic = sheet.getCell(row, 2);
  tic.value = totalInterest;
  fmt(tic, MONEY_FMT);
  styleKitOutputCell(tic);
  row++;

  sheet.getCell(row, 1).value = 'Total Debt Repaid';
  applyLabelStyle(sheet.getCell(row, 1));
  const totalRepaid = output.debtSchedule.reduce((s, d) => s + d.totalDebtRepayment, 0);
  const trc = sheet.getCell(row, 2);
  trc.value = totalRepaid;
  fmt(trc, MONEY_FMT);
  styleKitOutputCell(trc);

  const lastUsedRow = row;
  setColWidthsKit(sheet, [10, 18, 16, 16, 16, 16, 16, 16, 18, 16]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

function createReturnsSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput
): void {
  const sheet = workbook.addWorksheet('Returns Analysis');
  const lastDataCol = 3;

  let row = titleBar(sheet, `${ticker} — Returns Analysis`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  sectionHeader(sheet, row, 'Key Returns', lastDataCol);
  row++;
  const returnsStartRow = row;

  const returns: Array<{ label: string; value: number; format: string }> = [
    { label: 'Sponsor Equity Invested', value: output.sourcesAndUses.sources.sponsorEquity, format: MONEY_FMT },
    { label: 'Exit Equity Value', value: output.returns.exitEquityValue, format: MONEY_FMT },
    { label: 'Excess Cash at Exit', value: output.returns.exitExcessCash ?? 0, format: MONEY_FMT },
    { label: 'Total Value to Sponsor', value: output.returns.exitEquityValue + (output.returns.exitExcessCash ?? 0), format: MONEY_FMT },
    { label: 'MOIC', value: output.returns.moic, format: '0.00x' },
    { label: 'IRR', value: output.returns.irr, format: PERCENT_FMT },
  ];

  returns.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    styleKitOutputCell(vc);
    row++;
  });
  zebraRows(sheet, returnsStartRow, row - 1, 1, 2);
  borderBox(sheet, returnsStartRow - 1, 1, row - 1, 2);

  row += 1;
  sectionHeader(sheet, row, 'IRR Cash Flow Schedule', lastDataCol);
  row++;

  const cfHeader = row;
  sheet.getCell(row, 1).value = 'Year';
  sheet.getCell(row, 2).value = 'Cash Flow';
  sheet.getCell(row, 3).value = 'Description';
  tableHeader(sheet, row, 1, lastDataCol);
  row++;

  const holdPeriod = output.inputs.holdPeriod || 5;

  sheet.getCell(row, 1).value = 0;
  styleKitBodyCell(sheet.getCell(row, 1));
  const negEq = sheet.getCell(row, 2);
  negEq.value = -output.sourcesAndUses.sources.sponsorEquity;
  fmt(negEq, MONEY_FMT);
  styleKitBodyCell(negEq);
  sheet.getCell(row, 3).value = 'Initial equity investment';
  styleKitBodyCell(sheet.getCell(row, 3));
  row++;

  for (let year = 1; year < holdPeriod; year++) {
    sheet.getCell(row, 1).value = year;
    styleKitBodyCell(sheet.getCell(row, 1));
    const zc = sheet.getCell(row, 2);
    zc.value = 0;
    fmt(zc, MONEY_FMT);
    styleKitBodyCell(zc);
    sheet.getCell(row, 3).value = 'No interim distributions';
    styleKitBodyCell(sheet.getCell(row, 3));
    row++;
  }

  sheet.getCell(row, 1).value = holdPeriod;
  styleKitBodyCell(sheet.getCell(row, 1));
  const exitCf = sheet.getCell(row, 2);
  exitCf.value = output.returns.exitEquityValue + (output.returns.exitExcessCash ?? 0);
  fmt(exitCf, MONEY_FMT);
  exitCf.style = createTotalStyle();
  sheet.getCell(row, 3).value = 'Exit equity + excess cash';
  styleKitBodyCell(sheet.getCell(row, 3));
  row++;

  zebraRows(sheet, cfHeader + 1, row - 1, 1, lastDataCol);
  borderBox(sheet, cfHeader, 1, row - 1, lastDataCol);

  row += 2;
  sectionHeader(sheet, row, 'Sponsor Return Bridge', lastDataCol);
  row++;

  const entryMultiple = output.returns.entryEV / output.inputs.ebitda;
  const totalDebt = output.sourcesAndUses.sources.seniorDebt + output.sourcesAndUses.sources.subordinatedDebt;
  const exitDebt = output.debtSchedule[output.debtSchedule.length - 1]?.endingBalance ?? 0;
  const exitCash = output.returns.exitExcessCash ?? 0;
  const exitEbitda = output.projections[output.projections.length - 1]?.ebitda ?? output.inputs.ebitda;
  const exitValueAtEntryMultiple = exitEbitda * entryMultiple;
  const ebitdaGrowthEffect = exitValueAtEntryMultiple - output.returns.entryEV;
  const multipleShiftEffect = output.returns.exitEV - exitValueAtEntryMultiple;
  const deleveragingEffect = totalDebt - exitDebt;
  const bridgeStartRow = row;
  const bridgeRows: Array<{ label: string; value: number; format: string }> = [
    { label: 'Entry Sponsor Equity', value: output.sourcesAndUses.sources.sponsorEquity, format: MONEY_FMT },
    { label: 'EBITDA Growth Effect', value: ebitdaGrowthEffect, format: MONEY_FMT },
    { label: 'Multiple Shift Effect', value: multipleShiftEffect, format: MONEY_FMT },
    { label: 'Debt Paydown Effect', value: deleveragingEffect, format: MONEY_FMT },
    { label: 'Exit Excess Cash', value: exitCash, format: MONEY_FMT },
    { label: 'Exit Equity Value', value: output.returns.exitEquityValue, format: MONEY_FMT },
  ];
  bridgeRows.forEach((item, index) => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const valueCell = sheet.getCell(row, 2);
    valueCell.value = item.value;
    fmt(valueCell, item.format);
    if (index === bridgeRows.length - 1) {
      valueCell.style = createTotalStyle();
    } else {
      styleKitOutputCell(valueCell);
    }
    row++;
  });
  zebraRows(sheet, bridgeStartRow, row - 1, 1, 2);
  borderBox(sheet, bridgeStartRow - 1, 1, row - 1, 2);

  row += 1;
  sheet.mergeCells(row, 1, row, lastDataCol);
  sheet.getCell(row, 1).value =
    'Use the bridge to separate operating improvement from multiple movement and deleveraging. The sponsor payoff should not be treated as a single black-box IRR output.';
  sheet.getCell(row, 1).font = { name: 'Aptos', size: 10, color: { argb: 'FF64748B' } };
  sheet.getCell(row, 1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF8FAFC' },
  };
  sheet.getCell(row, 1).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [10, 22, 28]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

function createLBOSensitivitiesSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput,
  inputs?: LBOExcelInputs
): void {
  const sheet = workbook.addWorksheet('Sensitivities');
  const lastDataCol = 6;

  let row = titleBar(sheet, `${ticker} — Sensitivity Analysis`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  const baseEntryMultiple = output.returns.entryEV / output.inputs.ebitda;
  const baseExitMultiple = output.returns.exitEV / output.projections[output.projections.length - 1].ebitda;
  const baseTotalDebt = output.sourcesAndUses.sources.seniorDebt + output.sourcesAndUses.sources.subordinatedDebt;
  const holdPeriod = output.inputs.holdPeriod || 5;
  const sponsorEquity = output.sourcesAndUses.sources.sponsorEquity;
  const exitEBITDA = output.projections[output.projections.length - 1].ebitda;

  sectionHeader(sheet, row, 'MOIC: Entry Multiple × Exit Multiple', lastDataCol);
  row++;

  const entryMultiples = [
    baseEntryMultiple - 2, baseEntryMultiple - 1,
    baseEntryMultiple, baseEntryMultiple + 1, baseEntryMultiple + 2,
  ].map(v => Math.max(3, v));
  const exitMultiples = [
    baseExitMultiple - 2, baseExitMultiple - 1,
    baseExitMultiple, baseExitMultiple + 1, baseExitMultiple + 2,
  ].map(v => Math.max(3, v));

  const grid1Header = row;
  sheet.getCell(row, 1).value = 'Entry \\ Exit';
  exitMultiples.forEach((exit, idx) => {
    const c = sheet.getCell(row, idx + 2);
    c.value = `${exit.toFixed(1)}x`;
    c.alignment = { horizontal: 'center' };
  });
  tableHeader(sheet, row, 1, lastDataCol);
  row++;

  entryMultiples.forEach(entry => {
    sheet.getCell(row, 1).value = `${entry.toFixed(1)}x`;
    styleKitBodyCell(sheet.getCell(row, 1));
    exitMultiples.forEach((exit, idx) => {
      const entryEV = output.inputs.ebitda * entry;
      const equity = entryEV - baseTotalDebt;
      if (equity <= 0) {
        sheet.getCell(row, idx + 2).value = 'N/A';
        styleKitBodyCell(sheet.getCell(row, idx + 2));
        return;
      }
      const exitEV = exitEBITDA * exit;
      const lastDebt = output.debtSchedule.length > 0 ? output.debtSchedule[output.debtSchedule.length - 1].endingBalance : 0;
      const exitEquity = exitEV - lastDebt;
      const moic = exitEquity / equity;
      const c = sheet.getCell(row, idx + 2);
      c.value = moic;
      fmt(c, '0.00x');
      styleKitBodyCell(c);
      if (Math.abs(entry - baseEntryMultiple) < 0.01 && Math.abs(exit - baseExitMultiple) < 0.01) {
        c.font = { ...(c.font || {}), bold: true };
      }
    });
    row++;
  });
  zebraRows(sheet, grid1Header + 1, row - 1, 1, lastDataCol);
  borderBox(sheet, grid1Header, 1, row - 1, lastDataCol);

  row += 1;
  sectionHeader(sheet, row, 'IRR: Entry Multiple × Exit Multiple', lastDataCol);
  row++;

  const grid2Header = row;
  sheet.getCell(row, 1).value = 'Entry \\ Exit';
  exitMultiples.forEach((exit, idx) => {
    const c = sheet.getCell(row, idx + 2);
    c.value = `${exit.toFixed(1)}x`;
    c.alignment = { horizontal: 'center' };
  });
  tableHeader(sheet, row, 1, lastDataCol);
  row++;

  entryMultiples.forEach(entry => {
    sheet.getCell(row, 1).value = `${entry.toFixed(1)}x`;
    styleKitBodyCell(sheet.getCell(row, 1));
    exitMultiples.forEach((exit, idx) => {
      const entryEV = output.inputs.ebitda * entry;
      const equity = entryEV - baseTotalDebt;
      if (equity <= 0) {
        sheet.getCell(row, idx + 2).value = 'N/A';
        styleKitBodyCell(sheet.getCell(row, idx + 2));
        return;
      }
      const exitEV = exitEBITDA * exit;
      const lastDebt = output.debtSchedule.length > 0 ? output.debtSchedule[output.debtSchedule.length - 1].endingBalance : 0;
      const exitEquity = exitEV - lastDebt;
      const moic = exitEquity / equity;
      const irr = moic > 0 ? Math.pow(moic, 1 / holdPeriod) - 1 : -1;
      const c = sheet.getCell(row, idx + 2);
      c.value = irr;
      fmt(c, PERCENT_FMT);
      styleKitBodyCell(c);
      if (Math.abs(entry - baseEntryMultiple) < 0.01 && Math.abs(exit - baseExitMultiple) < 0.01) {
        c.font = { ...(c.font || {}), bold: true };
      }
    });
    row++;
  });
  zebraRows(sheet, grid2Header + 1, row - 1, 1, lastDataCol);
  borderBox(sheet, grid2Header, 1, row - 1, lastDataCol);

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [16, 14, 14, 14, 14, 14]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

function createLBOChecksSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  output: LboEngineOutput
): void {
  const sheet = workbook.addWorksheet('Checks');
  const lastDataCol = 3;

  let row = titleBar(sheet, `${ticker} — LBO Model Checks`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  sectionHeader(sheet, row, 'Guardrails', lastDataCol);
  row++;

  const sourcesUsesDiff = output.sourcesAndUses.sources.total - output.sourcesAndUses.uses.total;
  const finalDebt = output.debtSchedule.length > 0 ? output.debtSchedule[output.debtSchedule.length - 1].endingBalance : 0;
  const calculatedMOIC = output.sourcesAndUses.sources.sponsorEquity > 0
    ? output.returns.exitEquityValue / output.sourcesAndUses.sources.sponsorEquity
    : 0;
  const moicDiff = Math.abs(calculatedMOIC - output.returns.moic);
  const entryMultiple = output.returns.entryEV / output.inputs.ebitda;
  const lastProj = output.projections[output.projections.length - 1];

  const checks: Array<{ label: string; result: string; ok: boolean; detail?: string }> = [
    {
      label: 'Sources = Uses',
      result: Math.abs(sourcesUsesDiff) < 0.01 ? 'OK' : 'FAIL',
      ok: Math.abs(sourcesUsesDiff) < 0.01,
      detail: `Diff: ${sourcesUsesDiff.toFixed(2)}`,
    },
    {
      label: 'MOIC reconciliation',
      result: moicDiff < 0.01 ? 'OK' : 'WARN',
      ok: moicDiff < 0.01,
      detail: `Reported ${output.returns.moic.toFixed(2)}x vs Calc ${calculatedMOIC.toFixed(2)}x`,
    },
    {
      label: 'IRR is finite',
      result: Number.isFinite(output.returns.irr) ? 'OK' : 'FAIL',
      ok: Number.isFinite(output.returns.irr),
    },
    {
      label: 'Entry multiple > 0',
      result: entryMultiple > 0 ? 'OK' : 'FAIL',
      ok: entryMultiple > 0,
    },
    {
      label: 'Exit equity > 0',
      result: output.returns.exitEquityValue > 0 ? 'OK' : 'WARN',
      ok: output.returns.exitEquityValue > 0,
    },
    {
      label: 'Final year EBITDA > 0',
      result: lastProj.ebitda > 0 ? 'OK' : 'WARN',
      ok: lastProj.ebitda > 0,
    },
    {
      label: 'Ending debt >= 0',
      result: finalDebt >= -0.01 ? 'OK' : 'FAIL',
      ok: finalDebt >= -0.01,
      detail: `Ending balance: ${finalDebt.toFixed(2)}`,
    },
  ];

  checks.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const rc = sheet.getCell(row, 2);
    rc.value = item.result;
    rc.font = { ...createNormalStyle().font, color: { argb: item.ok ? 'FF008000' : 'FFFF0000' }, bold: true };
    rc.alignment = { horizontal: 'center' };
    if (item.detail) {
      sheet.getCell(row, 3).value = item.detail;
      sheet.getCell(row, 3).style = { ...createNormalStyle(), font: { ...createNormalStyle().font, size: 9, color: { argb: 'FF666666' } } };
    }
    row++;
  });

  row += 1;
  sectionHeader(sheet, row, 'Year-by-Year FCF Check', lastDataCol);
  row++;

  output.projections.forEach(proj => {
    sheet.getCell(row, 1).value = `Year ${proj.year}`;
    applyLabelStyle(sheet.getCell(row, 1));
    const fcfCell = sheet.getCell(row, 2);
    fcfCell.value = proj.freeCashFlow;
    fmt(fcfCell, MONEY_FMT);
    styleKitBodyCell(fcfCell);
    const okCell = sheet.getCell(row, 3);
    okCell.value = proj.freeCashFlow >= 0 ? 'Positive' : 'Negative';
    okCell.font = { ...createNormalStyle().font, color: { argb: proj.freeCashFlow >= 0 ? 'FF008000' : 'FFFF6600' } };
    row++;
  });

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [28, 16, 30]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

function createLBOSourcesNotesSheet(
  workbook: ExcelJS.Workbook,
  ticker: string,
  inputs?: LBOExcelInputs
): void {
  const sheet = workbook.addWorksheet('Sources & Notes');
  const lastDataCol = 2;

  let row = titleBar(sheet, `${ticker} — Data Sources & Notes`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  sectionHeader(sheet, row, 'Data Sources', lastDataCol);
  row++;

  const dataSources = inputs?.dataSources || {};
  const sourceItems = [
    { label: 'Revenue', source: dataSources.revenue || 'Reported' },
    { label: 'EBITDA', source: dataSources.ebitda || 'Reported' },
  ];

  sourceItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const sc = sheet.getCell(row, 2);
    sc.value = item.source;
    sc.font = { ...createNormalStyle().font, color: { argb: item.source === 'User' ? 'FF0066CC' : 'FF000000' } };
    row++;
  });

  row += 1;
  sectionHeader(sheet, row, 'Input Classification', lastDataCol);
  row++;

  const classifications = [
    { label: 'Fetched', detail: 'LTM Revenue, LTM EBITDA' },
    { label: 'Assumed', detail: 'Entry/Exit multiples, leverage, growth rates, margins' },
    { label: 'Calculated', detail: 'Sources & Uses, Debt Schedule, FCF, IRR/MOIC, Sensitivities' },
  ];
  classifications.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    sheet.getCell(row, 2).value = item.detail;
    sheet.getCell(row, 2).style = { ...createNormalStyle(), alignment: { wrapText: true } };
    row++;
  });

  row += 1;
  sectionHeader(sheet, row, 'Notes', lastDataCol);
  row++;

  const notes = [
    'Entry EV is derived from EBITDA × entry multiple.',
    'Debt schedule assumes mandatory amortization with excess cash sweep.',
    'IRR is computed from sponsor equity cash flow schedule (initial investment + exit proceeds).',
    'Sensitivities use the actual ending debt from the debt schedule, not simplistic paydown.',
    'No advanced features like revolver, PIK toggle, or management rollover.',
    ...(Array.isArray(inputs?.notes)
      ? inputs.notes.filter((note): note is string => typeof note === 'string' && note.trim().length > 0)
      : []),
  ];

  notes.forEach(note => {
    sheet.getCell(row, 1).value = `• ${note}`;
    sheet.getCell(row, 1).style = { ...createNormalStyle(), alignment: { wrapText: true } };
    row++;
  });

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [50, 20]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}
