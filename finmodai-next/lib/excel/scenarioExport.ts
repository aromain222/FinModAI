import ExcelJS from 'exceljs';
import type { BaseAssumptions, DcfResult, ScenarioAssumptions, ScenarioDelta } from '@/lib/scenarioEngine';
import {
  applyWorkbookDefaults,
  applySheetDefaults,
  setColumnWidths,
  hideUnusedArea,
  sectionHeader,
  tableHeader,
  zebraRows,
  bodyCell,
  outputCell,
  applyNumFmt,
  NUM_FMT,
  COLORS,
} from '@/lib/excel/styleKit';

export type ScenarioExportRow = {
  scenario: ScenarioAssumptions;
  dcf: DcfResult;
  deltaVsBase: ScenarioDelta;
  drivers: {
    revenueGrowth: number;
    ebitdaMargin: number;
    wacc: number;
    terminalGrowth: number;
    taxRate: number;
    capexPctRevenue: number;
    nwcPctRevenue: number;
    daPctRevenue: number;
  };
};

function setTitleRow(sheet: ExcelJS.Worksheet, totalColumns: number, title: string): void {
  sheet.getRow(1).height = 26;
  const cell = sheet.getCell(1, 1);
  cell.value = title;
  cell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.text } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.mergeCells(1, 1, 1, totalColumns);
}

function setSubtitleRow(sheet: ExcelJS.Worksheet, totalColumns: number, subtitle: string): void {
  sheet.getRow(2).height = 20;
  const cell = sheet.getCell(2, 1);
  cell.value = subtitle;
  cell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: COLORS.muted } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.mergeCells(2, 1, 2, totalColumns);
}

function setUnitsRow(sheet: ExcelJS.Worksheet, totalColumns: number): void {
  sheet.getRow(3).height = 18;
  const cell = sheet.getCell(3, 1);
  cell.value = 'All figures in USD millions';
  cell.font = { name: 'Calibri', size: 11, italic: true, color: { argb: COLORS.muted } };
  cell.alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.mergeCells(3, 1, 3, totalColumns);
}

function writeTextCell(sheet: ExcelJS.Worksheet, row: number, col: number, value: string, bold = false): void {
  const cell = sheet.getCell(row, col);
  cell.value = value;
  cell.font = { name: 'Calibri', size: 11, bold, color: { argb: COLORS.text } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}

function setHeaderValue(sheet: ExcelJS.Worksheet, row: number, col: number, value: string): void {
  sheet.getCell(row, col).value = value;
}

function writeNumberCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: number,
  fmt: keyof typeof NUM_FMT,
  isTotal = false
): void {
  const cell = sheet.getCell(row, col);
  cell.value = value;
  if (isTotal) {
    outputCell(cell);
  } else {
    bodyCell(cell);
  }
  applyNumFmt(cell, fmt);
}

function markRowTotal(sheet: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number): void {
  for (let c = fromCol; c <= toCol; c++) {
    const cell = sheet.getCell(row, c);
    outputCell(cell);
  }
}

function emphasizeLabel(sheet: ExcelJS.Worksheet, row: number, col: number): void {
  const cell = sheet.getCell(row, col);
  cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.text } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}

function findBaseRow(rows: ScenarioExportRow[]): ScenarioExportRow {
  const base = rows.find(r => r.scenario.name.toLowerCase().includes('base'));
  return base ?? rows[0];
}

export async function buildScenarioEngineWorkbook(args: {
  base: BaseAssumptions;
  rows: ScenarioExportRow[];
  asOfUtc?: string;
}) {
  const workbook = new ExcelJS.Workbook();
  applyWorkbookDefaults(workbook, { company: 'CapitalBase' });

  const sheet = workbook.addWorksheet('Scenario Analysis');
  const totalColumns = 9;

  setTitleRow(sheet, totalColumns, 'CapitalBase Scenario Analysis');
  const company = args.base.companyName || args.base.ticker;
  const asOf = args.asOfUtc ?? new Date().toISOString();
  setSubtitleRow(sheet, totalColumns, `${company} • As of ${asOf}`);
  setUnitsRow(sheet, totalColumns);

  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 0 });

  setColumnWidths(sheet, {
    1: 18,
    2: 12,
    3: 14,
    4: 12,
    5: 12,
    6: 12,
    7: 12,
    8: 12,
    9: 12,
  });

  let row = 4;

  sectionHeader(sheet, row, 'Drivers', totalColumns);
  row += 1;
  tableHeader(sheet, row, 1, totalColumns);
  const driverHeaders = [
    'Scenario',
    'Rev Growth',
    'EBITDA Margin',
    'WACC',
    'Terminal g',
    'Tax Rate',
    'Capex % Rev',
    'NWC % Rev',
    'D&A % Rev',
  ];
  driverHeaders.forEach((label, idx) => setHeaderValue(sheet, row, idx + 1, label));
  row += 1;

  args.rows.forEach((r, idx) => {
    writeTextCell(sheet, row, 1, r.scenario.name);
    writeNumberCell(sheet, row, 2, r.drivers.revenueGrowth, 'fmtPercent2');
    writeNumberCell(sheet, row, 3, r.drivers.ebitdaMargin, 'fmtPercent2');
    writeNumberCell(sheet, row, 4, r.drivers.wacc, 'fmtPercent2');
    writeNumberCell(sheet, row, 5, r.drivers.terminalGrowth, 'fmtPercent2');
    writeNumberCell(sheet, row, 6, r.drivers.taxRate, 'fmtPercent2');
    writeNumberCell(sheet, row, 7, r.drivers.capexPctRevenue, 'fmtPercent2');
    writeNumberCell(sheet, row, 8, r.drivers.nwcPctRevenue, 'fmtPercent2');
    writeNumberCell(sheet, row, 9, r.drivers.daPctRevenue, 'fmtPercent2');
    if (r.scenario.name.toLowerCase().includes('base')) {
      emphasizeLabel(sheet, row, 1);
      markRowTotal(sheet, row, 2, totalColumns);
    }
    row += 1;
    if (idx === args.rows.length - 1) {
      zebraRows(sheet, row - args.rows.length, row - 1, 1, totalColumns);
    }
  });

  sectionHeader(sheet, row, 'Forecast', totalColumns);
  row += 1;
  const baseRow = findBaseRow(args.rows);
  const years = baseRow.dcf.projections.map(p => `Year ${p.year}`);
  const forecastHeaders = ['Line Item', ...years];
  tableHeader(sheet, row, 1, forecastHeaders.length);
  forecastHeaders.forEach((label, idx) => setHeaderValue(sheet, row, idx + 1, label));
  row += 1;

  const revenueSeries = baseRow.dcf.projections.map(p => p.revenue);
  const ebitdaSeries = baseRow.dcf.projections.map(p => p.ebitda);
  const fcfSeries = baseRow.dcf.projections.map(p => p.freeCashFlow);
  const forecastRows: Array<[string, number[]]> = [
    ['Revenue', revenueSeries],
    ['EBITDA', ebitdaSeries],
    ['Free Cash Flow', fcfSeries],
  ];
  forecastRows.forEach((item, idx) => {
    writeTextCell(sheet, row, 1, item[0]);
    item[1].forEach((val, j) => {
      writeNumberCell(sheet, row, j + 2, val, 'fmtMoney0');
    });
    row += 1;
    if (idx === forecastRows.length - 1) {
      zebraRows(sheet, row - forecastRows.length, row - 1, 1, forecastHeaders.length);
    }
  });

  sectionHeader(sheet, row, 'Valuation', totalColumns);
  row += 1;
  const valuationHeaders = ['Scenario', 'Enterprise Value', 'Equity Value', 'Price / Share'];
  tableHeader(sheet, row, 1, valuationHeaders.length);
  valuationHeaders.forEach((label, idx) => setHeaderValue(sheet, row, idx + 1, label));
  row += 1;
  args.rows.forEach((r, idx) => {
    writeTextCell(sheet, row, 1, r.scenario.name);
    writeNumberCell(sheet, row, 2, r.dcf.enterpriseValue, 'fmtMoney0');
    writeNumberCell(sheet, row, 3, r.dcf.equityValue, 'fmtMoney0');
    writeNumberCell(sheet, row, 4, r.dcf.pricePerShare, 'fmtMoney2');
    if (r.scenario.name.toLowerCase().includes('base')) {
      emphasizeLabel(sheet, row, 1);
      markRowTotal(sheet, row, 2, valuationHeaders.length);
    }
    row += 1;
    if (idx === args.rows.length - 1) {
      zebraRows(sheet, row - args.rows.length, row - 1, 1, valuationHeaders.length);
    }
  });

  sectionHeader(sheet, row, 'Comparison vs Base', totalColumns);
  row += 1;
  const deltaHeaders = ['Scenario', 'Δ Enterprise Value', 'Δ Equity Value', 'Δ Price / Share'];
  tableHeader(sheet, row, 1, deltaHeaders.length);
  deltaHeaders.forEach((label, idx) => setHeaderValue(sheet, row, idx + 1, label));
  row += 1;
  args.rows.forEach((r, idx) => {
    writeTextCell(sheet, row, 1, r.scenario.name);
    writeNumberCell(sheet, row, 2, r.deltaVsBase.enterpriseValue, 'fmtMoney0');
    writeNumberCell(sheet, row, 3, r.deltaVsBase.equityValue, 'fmtMoney0');
    writeNumberCell(sheet, row, 4, r.deltaVsBase.pricePerShare, 'fmtMoney2');
    if (r.scenario.name.toLowerCase().includes('base')) {
      emphasizeLabel(sheet, row, 1);
      markRowTotal(sheet, row, 2, deltaHeaders.length);
    }
    row += 1;
    if (idx === args.rows.length - 1) {
      zebraRows(sheet, row - args.rows.length, row - 1, 1, deltaHeaders.length);
    }
  });

  hideUnusedArea(sheet, totalColumns, row);

  return workbook;
}
