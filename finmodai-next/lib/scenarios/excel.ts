import ExcelJS from 'exceljs';
import type { BaseAssumptions, DcfResult, ScenarioAssumptions, ScenarioDelta } from '@/lib/scenarioEngine';

const COLORS = {
  ink: 'FF111827',
  muted: 'FF4B5563',
  band: 'FF1F2937',
  headerFill: 'FF0B1220',
  inputFill: 'FFE0F2FE',
  grid: 'FF243042',
};

function setCell(
  sheet: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: ExcelJS.CellValue,
  style?: Partial<ExcelJS.Style>
) {
  const cell = sheet.getCell(row, col);
  cell.value = value;
  if (style) cell.style = { ...cell.style, ...style };
  return cell;
}

function addModelHeader(sheet: ExcelJS.Worksheet, title: string, totalColumns: number) {
  sheet.getRow(1).height = 26;
  sheet.mergeCells(1, 1, 1, totalColumns);
  setCell(sheet, 1, 1, title, {
    font: { name: 'Calibri', size: 16, bold: true, color: { argb: COLORS.ink } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });

  sheet.getRow(2).height = 18;
  sheet.mergeCells(2, 1, 2, totalColumns);
  setCell(sheet, 2, 1, 'All financial figures are in USD millions unless otherwise noted.', {
    font: { name: 'Calibri', size: 11, italic: true, color: { argb: COLORS.muted } },
    alignment: { horizontal: 'center', vertical: 'middle' },
  });
}

function styleTableHeader(sheet: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number) {
  sheet.getRow(row).height = 20;
  for (let c = fromCol; c <= toCol; c += 1) {
    const cell = sheet.getCell(row, c);
    cell.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerFill } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.grid } },
      left: { style: 'thin', color: { argb: COLORS.grid } },
      bottom: { style: 'thin', color: { argb: COLORS.grid } },
      right: { style: 'thin', color: { argb: COLORS.grid } },
    };
  }
}

function zebraRows(sheet: ExcelJS.Worksheet, startRow: number, endRow: number, fromCol: number, toCol: number) {
  for (let r = startRow; r <= endRow; r += 1) {
    const fill = r % 2 === 0 ? 'FF0F172A' : 'FF0B1220';
    for (let c = fromCol; c <= toCol; c += 1) {
      const cell = sheet.getCell(r, c);
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FFE5E7EB' } };
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.grid } },
        left: { style: 'thin', color: { argb: COLORS.grid } },
        bottom: { style: 'thin', color: { argb: COLORS.grid } },
        right: { style: 'thin', color: { argb: COLORS.grid } },
      };
      if (c > 1) cell.alignment = { horizontal: 'right', vertical: 'middle' };
    }
  }
}

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

export async function buildScenarioEngineWorkbook(args: {
  base: BaseAssumptions;
  rows: ScenarioExportRow[];
  asOfUtc?: string;
}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CapitalBase';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Scenario Summary', {
    properties: { defaultRowHeight: 16, showGridLines: false },
    views: [{ state: 'frozen', ySplit: 3, xSplit: 1 }],
  });

  const totalColumns = 12;
  addModelHeader(sheet, 'Scenario Engine — DCF Cases', totalColumns);

  setCell(sheet, 3, 1, `Ticker: ${args.base.ticker}`, {
    font: { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.muted } },
    alignment: { horizontal: 'left', vertical: 'middle' },
  });
  setCell(sheet, 3, 6, `As of (UTC): ${args.asOfUtc ?? new Date().toISOString()}`, {
    font: { name: 'Calibri', size: 11, italic: true, color: { argb: COLORS.muted } },
    alignment: { horizontal: 'right', vertical: 'middle' },
  });
  sheet.mergeCells(3, 6, 3, totalColumns);

  const headerRow = 4;
  const headers = [
    'Scenario',
    'Rev Growth',
    'EBITDA Margin',
    'WACC',
    'Terminal g',
    'EV ($M)',
    'Equity ($M)',
    'Price/Share',
    'Δ EV',
    'Δ Equity',
    'Δ Price',
    'Confidence',
  ];
  headers.forEach((h, idx) => setCell(sheet, headerRow, idx + 1, h));
  styleTableHeader(sheet, headerRow, 1, totalColumns);

  const startRow = headerRow + 1;
  const moneyFmt = '#,##0';
  const priceFmt = '$0.00';
  const pctFmt = '0.00%';

  args.rows.forEach((row, idx) => {
    const r = startRow + idx;
    setCell(sheet, r, 1, row.scenario.name);
    setCell(sheet, r, 2, row.drivers.revenueGrowth, { numFmt: pctFmt });
    setCell(sheet, r, 3, row.drivers.ebitdaMargin, { numFmt: pctFmt });
    setCell(sheet, r, 4, row.drivers.wacc, { numFmt: pctFmt });
    setCell(sheet, r, 5, row.drivers.terminalGrowth, { numFmt: pctFmt });
    setCell(sheet, r, 6, row.dcf.enterpriseValue, { numFmt: moneyFmt });
    setCell(sheet, r, 7, row.dcf.equityValue, { numFmt: moneyFmt });
    setCell(sheet, r, 8, row.dcf.pricePerShare, { numFmt: priceFmt });
    setCell(sheet, r, 9, row.deltaVsBase.enterpriseValue, { numFmt: moneyFmt });
    setCell(sheet, r, 10, row.deltaVsBase.equityValue, { numFmt: moneyFmt });
    setCell(sheet, r, 11, row.deltaVsBase.pricePerShare, { numFmt: priceFmt });
    setCell(sheet, r, 12, idx === 0 ? 'Base' : 'Scenario');
  });

  zebraRows(sheet, startRow, startRow + args.rows.length - 1, 1, totalColumns);

  sheet.getColumn(1).width = 18;
  for (let c = 2; c <= 5; c += 1) sheet.getColumn(c).width = 12;
  for (let c = 6; c <= 7; c += 1) sheet.getColumn(c).width = 14;
  sheet.getColumn(8).width = 12;
  for (let c = 9; c <= 11; c += 1) sheet.getColumn(c).width = 12;
  sheet.getColumn(12).width = 12;

  const notesRow = startRow + args.rows.length + 2;
  setCell(sheet, notesRow, 1, 'Notes:', {
    font: { name: 'Calibri', size: 11, bold: true, color: { argb: COLORS.muted } },
  });
  sheet.mergeCells(notesRow, 1, notesRow, totalColumns);
  setCell(
    sheet,
    notesRow + 1,
    1,
    'Base case financials (Revenue, EBITDA, Cash, Debt, Shares) are sourced from Supabase demo_company_snapshots. Driver deltas are deterministic assumptions applied on top of the Base case.',
    {
      font: { name: 'Calibri', size: 10, italic: true, color: { argb: COLORS.muted } },
      alignment: { horizontal: 'left', vertical: 'top', wrapText: true },
    }
  );
  sheet.mergeCells(notesRow + 1, 1, notesRow + 2, totalColumns);

  return workbook;
}

