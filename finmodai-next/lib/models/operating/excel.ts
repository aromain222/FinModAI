/**
 * Operating Model Excel Generator
 * Institutional-grade monthly/quarterly operating plan with full projection detail.
 * Uses shared styleKit for consistent typography, freeze panes, and hidden unused area.
 */

import ExcelJS from 'exceljs';
import {
  createNormalStyle,
  createTotalStyle,
  applyNumberFormat,
  NUMBER_FORMATS,
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

const MONEY_FMT = '#,##0;(#,##0)';
const PERCENT_FMT = '0.0%';
const INT_FMT = '#,##0';
const UNITS_TITLE = 'All figures in USD thousands unless otherwise noted.';

function fmt(cell: ExcelJS.Cell, format: string): void {
  cell.numFmt = format;
}

function applyLabelStyle(cell: ExcelJS.Cell): void {
  cell.style = {
    ...createNormalStyle(),
    alignment: { vertical: 'middle', horizontal: 'left' },
  };
}

export async function generateOperatingWorkbook(data: Record<string, any>): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  applyWorkbookDefaults(workbook, { company: 'CapitalBase' });
  workbook.calcProperties.fullCalcOnLoad = true;

  const ticker = (data.ticker || 'COMPANY').toUpperCase();
  const companyName = data.companyName || ticker;
  const periodType: 'monthly' | 'quarterly' = data.periodType || 'quarterly';
  const numPeriods = data.numPeriods || data.months || (periodType === 'monthly' ? 12 : 4);
  const currentYear = new Date().getFullYear();
  const startMonth = data.startMonth || `${currentYear}-01`;

  const baseRevenue = data.baseRevenue ?? data.revenue ?? 1000;
  const growthRate = data.revenueGrowth ?? 0.05;
  const ebitdaMargin = data.ebitdaMargin ?? 0.20;
  const cogsPct = data.cogsPct ?? 0.60;
  const opexPct = data.opexPct ?? 0.20;
  const capexPct = data.capexPct ?? 0.04;
  const taxRate = data.taxRate ?? 0.25;
  const arDays = data.arDays ?? 45;
  const inventoryDays = data.inventoryDays ?? 60;
  const apDays = data.apDays ?? 30;

  const periodGrowth = periodType === 'monthly'
    ? Math.pow(1 + growthRate, 1 / 12) - 1
    : growthRate / 4;

  const periodLabels = periodType === 'monthly'
    ? Array.from({ length: numPeriods }, (_, i) => {
        const [y, m] = startMonth.split('-').map(Number);
        const date = new Date(y, (m || 1) - 1 + i, 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      })
    : Array.from({ length: numPeriods }, (_, i) => `Q${i + 1} ${currentYear}`);

  const revenueValues = Array.from({ length: numPeriods }, (_, i) =>
    baseRevenue * Math.pow(1 + periodGrowth, i + 1)
  );
  const cogsValues = revenueValues.map(r => r * cogsPct);
  const grossProfitValues = revenueValues.map((r, i) => r - cogsValues[i]);
  const opexValues = revenueValues.map(r => r * opexPct);
  const ebitdaValues = revenueValues.map(r => r * ebitdaMargin);
  const daValues = revenueValues.map(r => r * 0.04);
  const ebitValues = ebitdaValues.map((e, i) => e - daValues[i]);
  const taxValues = ebitValues.map(e => Math.max(0, e * taxRate));
  const netIncomeValues = ebitValues.map((e, i) => e - taxValues[i]);
  const capexValues = revenueValues.map(r => r * capexPct);
  const fcfValues = ebitdaValues.map((e, i) => e - capexValues[i]);

  const daysInPeriod = periodType === 'monthly' ? 30 : 90;
  const arValues = revenueValues.map(r => (r / daysInPeriod) * arDays);
  const invValues = cogsValues.map(c => (c / daysInPeriod) * inventoryDays);
  const apValuesArr = cogsValues.map(c => (c / daysInPeriod) * apDays);
  const nwcValues = arValues.map((ar, i) => ar + invValues[i] - apValuesArr[i]);
  const nwcChangeValues = nwcValues.map((nwc, i) => i === 0 ? nwc : nwc - nwcValues[i - 1]);

  createCoverSheet(workbook, ticker, companyName, periodType, numPeriods, revenueValues, ebitdaValues, fcfValues);
  createAssumptionsSheet(workbook, ticker, {
    baseRevenue, growthRate, ebitdaMargin, cogsPct, opexPct, capexPct,
    taxRate, arDays, inventoryDays, apDays, periodType, numPeriods,
  });
  createProjectionsSheet(workbook, ticker, periodType, periodLabels, {
    revenueValues, cogsValues, grossProfitValues, opexValues,
    ebitdaValues, daValues, ebitValues, taxValues, netIncomeValues,
    capexValues, fcfValues, nwcChangeValues,
  });
  createWorkingCapitalSheet(workbook, ticker, periodLabels, {
    arValues, invValues, apValues: apValuesArr, nwcValues, nwcChangeValues,
    revenueValues, cogsValues, arDays, inventoryDays, apDays,
  });
  createSummarySheet(workbook, ticker, numPeriods, ebitdaMargin, {
    revenueValues, ebitdaValues, netIncomeValues, fcfValues, capexValues,
  });
  createChecksSheet(workbook, ticker, {
    revenueValues, ebitdaValues, grossProfitValues, fcfValues,
    cogsValues, opexValues, ebitdaMargin, cogsPct, opexPct,
  });
  createSourcesNotesSheet(workbook, ticker, periodType);

  return workbook;
}

/* ─────────────── Cover ─────────────── */
function createCoverSheet(
  workbook: ExcelJS.Workbook, ticker: string, companyName: string,
  periodType: string, numPeriods: number,
  revenueValues: number[], ebitdaValues: number[], fcfValues: number[]
): void {
  const sheet = workbook.addWorksheet('Cover');
  const lastDataCol = 2;

  let row = titleBar(sheet, `${companyName} — Operating Model`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  sectionHeader(sheet, row, 'Model Information', lastDataCol);
  row++;
  const infoStartRow = row;

  const info: Array<{ label: string; value: string | number }> = [
    { label: 'Ticker', value: ticker },
    { label: 'Model Date', value: new Date().toLocaleDateString() },
    { label: 'Period Type', value: periodType === 'monthly' ? 'Monthly' : 'Quarterly' },
    { label: 'Forecast Periods', value: numPeriods },
  ];
  info.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    styleKitOutputCell(vc);
    row++;
  });
  zebraRows(sheet, infoStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, infoStartRow - 1, 1, row - 1, lastDataCol);

  row += 1;
  sectionHeader(sheet, row, 'Key Metrics (Total)', lastDataCol);
  row++;
  const metricsStartRow = row;

  const totalRevenue = revenueValues.reduce((s, v) => s + v, 0);
  const totalEBITDA = ebitdaValues.reduce((s, v) => s + v, 0);
  const totalFCF = fcfValues.reduce((s, v) => s + v, 0);

  const metrics: Array<{ label: string; value: number; format: string }> = [
    { label: 'Total Revenue', value: totalRevenue, format: MONEY_FMT },
    { label: 'Total EBITDA', value: totalEBITDA, format: MONEY_FMT },
    { label: 'Total Free Cash Flow', value: totalFCF, format: MONEY_FMT },
    { label: 'Avg EBITDA Margin', value: totalRevenue > 0 ? totalEBITDA / totalRevenue : 0, format: PERCENT_FMT },
    { label: 'FCF Conversion (FCF/EBITDA)', value: totalEBITDA > 0 ? totalFCF / totalEBITDA : 0, format: PERCENT_FMT },
  ];
  metrics.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    styleKitOutputCell(vc);
    row++;
  });
  zebraRows(sheet, metricsStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, metricsStartRow - 1, 1, row - 1, lastDataCol);

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [30, 22]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/* ─────────────── Assumptions ─────────────── */
function createAssumptionsSheet(
  workbook: ExcelJS.Workbook, ticker: string,
  a: {
    baseRevenue: number; growthRate: number; ebitdaMargin: number;
    cogsPct: number; opexPct: number; capexPct: number; taxRate: number;
    arDays: number; inventoryDays: number; apDays: number;
    periodType: string; numPeriods: number;
  }
): void {
  const sheet = workbook.addWorksheet('Assumptions');
  const lastDataCol = 2;

  let row = titleBar(sheet, `${ticker} — Operating Assumptions`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  sectionHeader(sheet, row, 'Revenue Assumptions', lastDataCol);
  row++;
  const revStartRow = row;

  const revItems: Array<{ label: string; value: number; format: string }> = [
    { label: 'Base Revenue', value: a.baseRevenue, format: MONEY_FMT },
    { label: 'Annual Revenue Growth', value: a.growthRate, format: PERCENT_FMT },
  ];
  revItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    styleKitInputCell(vc);
    row++;
  });
  zebraRows(sheet, revStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, revStartRow - 1, 1, row - 1, lastDataCol);

  row += 1;
  sectionHeader(sheet, row, 'Margin Assumptions', lastDataCol);
  row++;
  const marginStartRow = row;

  const marginItems: Array<{ label: string; value: number; format: string }> = [
    { label: 'COGS % of Revenue', value: a.cogsPct, format: PERCENT_FMT },
    { label: 'OpEx % of Revenue', value: a.opexPct, format: PERCENT_FMT },
    { label: 'EBITDA Margin', value: a.ebitdaMargin, format: PERCENT_FMT },
    { label: 'D&A % of Revenue', value: 0.04, format: PERCENT_FMT },
    { label: 'Tax Rate', value: a.taxRate, format: PERCENT_FMT },
  ];
  marginItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    styleKitInputCell(vc);
    row++;
  });
  zebraRows(sheet, marginStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, marginStartRow - 1, 1, row - 1, lastDataCol);

  row += 1;
  sectionHeader(sheet, row, 'Working Capital Assumptions', lastDataCol);
  row++;
  const wcStartRow = row;

  const wcItems: Array<{ label: string; value: number; format: string }> = [
    { label: 'Accounts Receivable Days', value: a.arDays, format: INT_FMT },
    { label: 'Inventory Days', value: a.inventoryDays, format: INT_FMT },
    { label: 'Accounts Payable Days', value: a.apDays, format: INT_FMT },
    { label: 'Cash Conversion Cycle', value: a.arDays + a.inventoryDays - a.apDays, format: INT_FMT },
  ];
  wcItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    styleKitInputCell(vc);
    row++;
  });
  zebraRows(sheet, wcStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, wcStartRow - 1, 1, row - 1, lastDataCol);

  row += 1;
  sectionHeader(sheet, row, 'Capital Expenditures', lastDataCol);
  row++;
  sheet.getCell(row, 1).value = 'Capex % of Revenue';
  applyLabelStyle(sheet.getCell(row, 1));
  const capexCell = sheet.getCell(row, 2);
  capexCell.value = a.capexPct;
  fmt(capexCell, PERCENT_FMT);
  styleKitInputCell(capexCell);

  const lastUsedRow = row;
  setColWidthsKit(sheet, [30, 20]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/* ─────────────── Projections ─────────────── */
function createProjectionsSheet(
  workbook: ExcelJS.Workbook, ticker: string, periodType: string,
  periodLabels: string[],
  p: {
    revenueValues: number[]; cogsValues: number[]; grossProfitValues: number[];
    opexValues: number[]; ebitdaValues: number[]; daValues: number[];
    ebitValues: number[]; taxValues: number[]; netIncomeValues: number[];
    capexValues: number[]; fcfValues: number[]; nwcChangeValues: number[];
  }
): void {
  const n = periodLabels.length;
  const sheet = workbook.addWorksheet(periodType === 'monthly' ? 'Monthly Projections' : 'Quarterly Projections');
  const lastDataCol = n + 1;

  let row = titleBar(sheet, `${ticker} — ${periodType === 'monthly' ? 'Monthly' : 'Quarterly'} Projections`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  const headerRow = row;
  sheet.getCell(row, 1).value = 'Line Item';
  periodLabels.forEach((label, idx) => {
    sheet.getCell(row, idx + 2).value = label;
  });
  tableHeader(sheet, row, 1, lastDataCol);
  row++;

  type LineItem = { label: string; values: number[]; format: string; isTotal?: boolean };

  const incomeBlock: LineItem[] = [
    { label: 'Revenue', values: p.revenueValues, format: MONEY_FMT },
    { label: 'COGS', values: p.cogsValues.map(v => -v), format: MONEY_FMT },
    { label: 'Gross Profit', values: p.grossProfitValues, format: MONEY_FMT, isTotal: true },
    { label: 'Gross Margin', values: p.revenueValues.map((r, i) => r > 0 ? p.grossProfitValues[i] / r : 0), format: PERCENT_FMT },
    { label: 'Operating Expenses', values: p.opexValues.map(v => -v), format: MONEY_FMT },
    { label: 'EBITDA', values: p.ebitdaValues, format: MONEY_FMT, isTotal: true },
    { label: 'EBITDA Margin', values: p.revenueValues.map((r, i) => r > 0 ? p.ebitdaValues[i] / r : 0), format: PERCENT_FMT },
    { label: 'Depreciation & Amortization', values: p.daValues.map(v => -v), format: MONEY_FMT },
    { label: 'EBIT', values: p.ebitValues, format: MONEY_FMT, isTotal: true },
    { label: 'Tax', values: p.taxValues.map(v => -v), format: MONEY_FMT },
    { label: 'Net Income', values: p.netIncomeValues, format: MONEY_FMT, isTotal: true },
  ];

  sectionHeader(sheet, row, 'Income Statement', lastDataCol);
  row++;
  const isStartRow = row;

  incomeBlock.forEach(item => {
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
  zebraRows(sheet, isStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, isStartRow - 1, 1, row - 1, lastDataCol);

  row += 1;
  sectionHeader(sheet, row, 'Free Cash Flow', lastDataCol);
  row++;
  const fcfStartRow = row;

  const fcfBlock: LineItem[] = [
    { label: 'EBITDA', values: p.ebitdaValues, format: MONEY_FMT },
    { label: 'Capex', values: p.capexValues.map(v => -v), format: MONEY_FMT },
    { label: 'Change in NWC', values: p.nwcChangeValues.map(v => -v), format: MONEY_FMT },
    { label: 'Free Cash Flow', values: p.fcfValues, format: MONEY_FMT, isTotal: true },
    { label: 'Cumulative FCF', values: p.fcfValues.reduce<number[]>((acc, v) => { acc.push((acc[acc.length - 1] ?? 0) + v); return acc; }, []), format: MONEY_FMT },
  ];

  fcfBlock.forEach(item => {
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
  zebraRows(sheet, fcfStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, fcfStartRow - 1, 1, row - 1, lastDataCol);

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [24, ...Array(n).fill(14)]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/* ─────────────── Working Capital ─────────────── */
function createWorkingCapitalSheet(
  workbook: ExcelJS.Workbook, ticker: string, periodLabels: string[],
  w: {
    arValues: number[]; invValues: number[]; apValues: number[];
    nwcValues: number[]; nwcChangeValues: number[];
    revenueValues: number[]; cogsValues: number[];
    arDays: number; inventoryDays: number; apDays: number;
  }
): void {
  const n = periodLabels.length;
  const sheet = workbook.addWorksheet('Working Capital');
  const lastDataCol = n + 1;

  let row = titleBar(sheet, `${ticker} — Working Capital Schedule`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  const headerRow = row;
  sheet.getCell(row, 1).value = 'Line Item';
  periodLabels.forEach((label, idx) => {
    sheet.getCell(row, idx + 2).value = label;
  });
  tableHeader(sheet, row, 1, lastDataCol);
  row++;

  type LineItem = { label: string; values: number[]; format: string; isTotal?: boolean };

  const items: LineItem[] = [
    { label: 'Accounts Receivable', values: w.arValues, format: MONEY_FMT },
    { label: 'Inventory', values: w.invValues, format: MONEY_FMT },
    { label: 'Accounts Payable', values: w.apValues.map(v => -v), format: MONEY_FMT },
    { label: 'Net Working Capital', values: w.nwcValues, format: MONEY_FMT, isTotal: true },
    { label: 'Change in NWC', values: w.nwcChangeValues, format: MONEY_FMT },
  ];

  const dataStartRow = row;
  items.forEach(item => {
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

  row += 1;
  sectionHeader(sheet, row, 'Days Outstanding', lastDataCol);
  row++;

  const daysItems: Array<{ label: string; value: number }> = [
    { label: 'AR Days', value: w.arDays },
    { label: 'Inventory Days', value: w.inventoryDays },
    { label: 'AP Days', value: w.apDays },
    { label: 'Cash Conversion Cycle', value: w.arDays + w.inventoryDays - w.apDays },
  ];
  daysItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, INT_FMT);
    styleKitOutputCell(vc);
    row++;
  });

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [24, ...Array(n).fill(14)]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/* ─────────────── Summary ─────────────── */
function createSummarySheet(
  workbook: ExcelJS.Workbook, ticker: string, numPeriods: number,
  ebitdaMargin: number,
  s: {
    revenueValues: number[]; ebitdaValues: number[];
    netIncomeValues: number[]; fcfValues: number[]; capexValues: number[];
  }
): void {
  const sheet = workbook.addWorksheet('Summary');
  const lastDataCol = 2;

  let row = titleBar(sheet, `${ticker} — Operating Model Summary`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  const totalRevenue = s.revenueValues.reduce((a, b) => a + b, 0);
  const totalEBITDA = s.ebitdaValues.reduce((a, b) => a + b, 0);
  const totalNetIncome = s.netIncomeValues.reduce((a, b) => a + b, 0);
  const totalFCF = s.fcfValues.reduce((a, b) => a + b, 0);
  const totalCapex = s.capexValues.reduce((a, b) => a + b, 0);

  sectionHeader(sheet, row, 'Totals', lastDataCol);
  row++;
  const totStartRow = row;

  const totals: Array<{ label: string; value: number; format: string }> = [
    { label: 'Total Revenue', value: totalRevenue, format: MONEY_FMT },
    { label: 'Total EBITDA', value: totalEBITDA, format: MONEY_FMT },
    { label: 'Total Net Income', value: totalNetIncome, format: MONEY_FMT },
    { label: 'Total Capex', value: totalCapex, format: MONEY_FMT },
    { label: 'Total Free Cash Flow', value: totalFCF, format: MONEY_FMT },
  ];
  totals.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    styleKitOutputCell(vc);
    row++;
  });
  zebraRows(sheet, totStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, totStartRow - 1, 1, row - 1, lastDataCol);

  row += 1;
  sectionHeader(sheet, row, 'Averages per Period', lastDataCol);
  row++;
  const avgStartRow = row;

  const averages: Array<{ label: string; value: number; format: string }> = [
    { label: 'Average Revenue', value: totalRevenue / numPeriods, format: MONEY_FMT },
    { label: 'Average EBITDA', value: totalEBITDA / numPeriods, format: MONEY_FMT },
    { label: 'Average Net Income', value: totalNetIncome / numPeriods, format: MONEY_FMT },
    { label: 'Average EBITDA Margin', value: totalRevenue > 0 ? totalEBITDA / totalRevenue : 0, format: PERCENT_FMT },
    { label: 'Net Margin', value: totalRevenue > 0 ? totalNetIncome / totalRevenue : 0, format: PERCENT_FMT },
    { label: 'FCF Yield (FCF / Revenue)', value: totalRevenue > 0 ? totalFCF / totalRevenue : 0, format: PERCENT_FMT },
  ];
  averages.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    applyLabelStyle(sheet.getCell(row, 1));
    const vc = sheet.getCell(row, 2);
    vc.value = item.value;
    fmt(vc, item.format);
    styleKitOutputCell(vc);
    row++;
  });
  zebraRows(sheet, avgStartRow, row - 1, 1, lastDataCol);
  borderBox(sheet, avgStartRow - 1, 1, row - 1, lastDataCol);

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [30, 22]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/* ─────────────── Checks ─────────────── */
function createChecksSheet(
  workbook: ExcelJS.Workbook, ticker: string,
  c: {
    revenueValues: number[]; ebitdaValues: number[];
    grossProfitValues: number[]; fcfValues: number[];
    cogsValues: number[]; opexValues: number[];
    ebitdaMargin: number; cogsPct: number; opexPct: number;
  }
): void {
  const sheet = workbook.addWorksheet('Checks');
  const lastDataCol = 3;

  let row = titleBar(sheet, `${ticker} — Operating Model Checks`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  sectionHeader(sheet, row, 'Model Guardrails', lastDataCol);
  row++;

  const totalRev = c.revenueValues.reduce((a, b) => a + b, 0);
  const totalCOGS = c.cogsValues.reduce((a, b) => a + b, 0);
  const totalEBITDA = c.ebitdaValues.reduce((a, b) => a + b, 0);
  const totalFCF = c.fcfValues.reduce((a, b) => a + b, 0);
  const impliedCOGSPct = totalRev > 0 ? totalCOGS / totalRev : 0;
  const impliedEBITDAMargin = totalRev > 0 ? totalEBITDA / totalRev : 0;
  const allRevPositive = c.revenueValues.every(r => r > 0);
  const negativeFCFPeriods = c.fcfValues.filter(v => v < 0).length;

  const checks: Array<{ label: string; result: string; ok: boolean; detail?: string }> = [
    {
      label: 'All revenue periods positive',
      result: allRevPositive ? 'OK' : 'WARN',
      ok: allRevPositive,
    },
    {
      label: 'COGS % reconciliation',
      result: Math.abs(impliedCOGSPct - c.cogsPct) < 0.01 ? 'OK' : 'WARN',
      ok: Math.abs(impliedCOGSPct - c.cogsPct) < 0.01,
      detail: `Implied ${(impliedCOGSPct * 100).toFixed(1)}% vs Input ${(c.cogsPct * 100).toFixed(1)}%`,
    },
    {
      label: 'EBITDA margin reconciliation',
      result: Math.abs(impliedEBITDAMargin - c.ebitdaMargin) < 0.01 ? 'OK' : 'WARN',
      ok: Math.abs(impliedEBITDAMargin - c.ebitdaMargin) < 0.01,
      detail: `Implied ${(impliedEBITDAMargin * 100).toFixed(1)}% vs Input ${(c.ebitdaMargin * 100).toFixed(1)}%`,
    },
    {
      label: 'FCF positive all periods',
      result: negativeFCFPeriods === 0 ? 'OK' : 'WARN',
      ok: negativeFCFPeriods === 0,
      detail: negativeFCFPeriods > 0 ? `${negativeFCFPeriods} period(s) negative` : undefined,
    },
    {
      label: 'Revenue growth monotonic',
      result: c.revenueValues.every((v, i) => i === 0 || v >= c.revenueValues[i - 1]) ? 'OK' : 'INFO',
      ok: c.revenueValues.every((v, i) => i === 0 || v >= c.revenueValues[i - 1]),
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

  const lastUsedRow = row - 1;
  setColWidthsKit(sheet, [30, 14, 34]);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 1, headerRowCount: 3, lastCol: lastDataCol, lastRow: lastUsedRow });
  hideUnusedArea(sheet, lastDataCol, lastUsedRow);
}

/* ─────────────── Sources & Notes ─────────────── */
function createSourcesNotesSheet(
  workbook: ExcelJS.Workbook, ticker: string, periodType: string
): void {
  const sheet = workbook.addWorksheet('Sources & Notes');
  const lastDataCol = 2;

  let row = titleBar(sheet, `${ticker} — Data Sources & Notes`, lastDataCol);
  sheet.getCell(2, 1).value = UNITS_TITLE;
  row += 1;

  sectionHeader(sheet, row, 'Input Classification', lastDataCol);
  row++;

  const classifications: Array<{ label: string; detail: string }> = [
    { label: 'User Input', detail: 'Base revenue, growth rate, all margin/expense percentages, working capital days' },
    { label: 'Calculated', detail: 'Revenue projections, COGS, OpEx, EBITDA, EBIT, tax, net income, FCF, NWC balances' },
    { label: 'Period Type', detail: periodType === 'monthly' ? 'Monthly granularity' : 'Quarterly granularity' },
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
    'Revenue is compounded each period using the annual growth rate converted to the period frequency.',
    'EBITDA is derived from Revenue × EBITDA Margin (user assumption).',
    'D&A is assumed at 4% of revenue unless otherwise specified.',
    'Working capital balances use days-outstanding method applied to revenue/COGS.',
    'FCF = EBITDA − Capex (simplified; excludes NWC changes from FCF bridge for clarity).',
    'All assumptions are user-entered; no values are fetched or invented.',
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
