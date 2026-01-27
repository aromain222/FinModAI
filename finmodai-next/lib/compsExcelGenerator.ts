/**
 * Trading Comps Excel Generator
 * 
 * Generates banker-grade comparable company analysis Excel workbook.
 */

import ExcelJS from 'exceljs';
import { APP_NAME } from '@/lib/branding';
import type { CompsModel } from '@/types/compsModel';

const BLUE_HEADER = 'FF4472C4';
const GREY_SUBHEADER = 'FFD9D9D9';
const YELLOW_INPUT = 'FFFFFF00';
const GREEN_OUTPUT = 'FF00B050';
const LIGHT_GREY = 'FFF2F2F2';

/**
 * Generate banker-grade comps Excel workbook
 */
export async function generateCompsExcel(
  ticker: string,
  model: CompsModel
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.calcProperties.fullCalcOnLoad = true;

  const sheet = workbook.addWorksheet('Comps Analysis');

  let row = 1;

  // Header
  sheet.getCell(row, 1).value = `${ticker} — Trading Comparable Company Analysis`;
  sheet.getCell(row, 1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_HEADER } };
  sheet.getCell(row, 1).alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.mergeCells(row, 1, row, 12);
  sheet.getRow(row).height = 25;
  row += 2;

  // Metadata
  sheet.getCell(row, 1).value = 'Analysis Date:';
  sheet.getCell(row, 2).value = new Date().toLocaleDateString();
  row++;
  sheet.getCell(row, 1).value = 'Peer Count:';
  sheet.getCell(row, 2).value = model.comps.length;
  row++;
  sheet.getCell(row, 1).value = 'Custom Peers:';
  sheet.getCell(row, 2).value = model.metadata.customProvided;
  row += 2;

  // Comparable Companies Table
  sheet.getCell(row, 1).value = 'COMPARABLE COMPANIES';
  sheet.getCell(row, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_HEADER } };
  sheet.mergeCells(row, 1, row, 12);
  row++;

  // Column headers
  const headers = [
    'Company',
    'Ticker',
    'Market Cap',
    'EV',
    'Revenue',
    'EBITDA',
    'EBIT',
    'Net Income',
    'EV/Revenue',
    'EV/EBITDA',
    'EV/EBIT',
    'P/E',
  ];

  headers.forEach((header, idx) => {
    const cell = sheet.getCell(row, idx + 1);
    cell.value = header;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_SUBHEADER } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' },
      bottom: { style: 'thin' },
      left: { style: 'thin' },
      right: { style: 'thin' },
    };
  });
  row++;

  // Comp rows
  model.comps.forEach((comp) => {
    const sourceTag = comp.source === 'custom' ? ' (CUSTOM)' : '';
    const aiTag = comp.aiEstimated && comp.aiEstimated.length > 0 ? ' *' : '';

    sheet.getCell(row, 1).value = comp.name + sourceTag + aiTag;
    sheet.getCell(row, 2).value = comp.ticker;
    sheet.getCell(row, 3).value = comp.marketCap;
    sheet.getCell(row, 3).numFmt = '$#,##0';
    sheet.getCell(row, 4).value = comp.enterpriseValue;
    sheet.getCell(row, 4).numFmt = '$#,##0';
    sheet.getCell(row, 5).value = comp.revenue;
    sheet.getCell(row, 5).numFmt = '$#,##0';
    sheet.getCell(row, 6).value = comp.ebitda;
    sheet.getCell(row, 6).numFmt = '$#,##0';
    sheet.getCell(row, 7).value = comp.ebit;
    sheet.getCell(row, 7).numFmt = '$#,##0';
    sheet.getCell(row, 8).value = comp.netIncome;
    sheet.getCell(row, 8).numFmt = '$#,##0';
    sheet.getCell(row, 9).value = comp.evToRevenue;
    sheet.getCell(row, 9).numFmt = '0.0x';
    sheet.getCell(row, 10).value = comp.evToEbitda;
    sheet.getCell(row, 10).numFmt = '0.0x';
    sheet.getCell(row, 11).value = comp.evToEbit;
    sheet.getCell(row, 11).numFmt = '0.0x';
    sheet.getCell(row, 12).value = comp.pe;
    sheet.getCell(row, 12).numFmt = '0.0x';

    // Highlight custom comps
    if (comp.source === 'custom') {
      for (let col = 1; col <= 12; col++) {
        sheet.getCell(row, col).fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEAA7' }, // Light orange
        };
      }
    }

    row++;
  });

  row++;

  // Summary Statistics
  sheet.getCell(row, 1).value = 'SUMMARY STATISTICS';
  sheet.getCell(row, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_HEADER } };
  sheet.mergeCells(row, 1, row, 5);
  row++;

  // Stats headers
  const statsHeaders = ['Statistic', 'EV/Revenue', 'EV/EBITDA', 'EV/EBIT', 'P/E'];
  statsHeaders.forEach((header, idx) => {
    const cell = sheet.getCell(row, idx + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_SUBHEADER } };
    cell.alignment = { horizontal: 'center' };
  });
  row++;

  // Stats rows
  const statsRows = [
    ['Min', model.stats.evRevenue.min, model.stats.evEbitda.min, model.stats.evEbit.min, model.stats.pe.min],
    ['25th %ile', model.stats.evRevenue.p25, model.stats.evEbitda.p25, model.stats.evEbit.p25, model.stats.pe.p25],
    ['Median', model.stats.evRevenue.median, model.stats.evEbitda.median, model.stats.evEbit.median, model.stats.pe.median],
    ['Mean', model.stats.evRevenue.mean, model.stats.evEbitda.mean, model.stats.evEbit.mean, model.stats.pe.mean],
    ['75th %ile', model.stats.evRevenue.p75, model.stats.evEbitda.p75, model.stats.evEbit.p75, model.stats.pe.p75],
    ['Max', model.stats.evRevenue.max, model.stats.evEbitda.max, model.stats.evEbit.max, model.stats.pe.max],
  ];

  statsRows.forEach(([label, ...values]) => {
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 1).font = { bold: label === 'Median' || label === 'Mean' };
    sheet.getCell(row, 1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: LIGHT_GREY },
    };

    values.forEach((val, idx) => {
      const cell = sheet.getCell(row, idx + 2);
      cell.value = val as number;
      cell.numFmt = '0.0x';
      cell.alignment = { horizontal: 'center' };
      if (label === 'Median' || label === 'Mean') {
        cell.font = { bold: true };
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFEB9C' }, // Light yellow
        };
      }
    });

    row++;
  });

  row += 2;

  // Target Company Implied Valuation
  sheet.getCell(row, 1).value = `${ticker} IMPLIED VALUATION`;
  sheet.getCell(row, 1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE_HEADER } };
  sheet.mergeCells(row, 1, row, 5);
  row++;

  // Target financials
  sheet.getCell(row, 1).value = 'LTM Revenue:';
  sheet.getCell(row, 2).value = model.target.revenue;
  sheet.getCell(row, 2).numFmt = '$#,##0';
  row++;

  sheet.getCell(row, 1).value = 'LTM EBITDA:';
  sheet.getCell(row, 2).value = model.target.ebitda;
  sheet.getCell(row, 2).numFmt = '$#,##0';
  row++;

  sheet.getCell(row, 1).value = 'LTM EBIT:';
  sheet.getCell(row, 2).value = model.target.ebit;
  sheet.getCell(row, 2).numFmt = '$#,##0';
  row++;

  sheet.getCell(row, 1).value = 'LTM Net Income:';
  sheet.getCell(row, 2).value = model.target.netIncome;
  sheet.getCell(row, 2).numFmt = '$#,##0';
  row++;

  sheet.getCell(row, 1).value = 'Net Debt:';
  sheet.getCell(row, 2).value = model.target.netDebt;
  sheet.getCell(row, 2).numFmt = '$#,##0';
  row++;

  sheet.getCell(row, 1).value = 'Shares Outstanding:';
  sheet.getCell(row, 2).value = model.target.shares;
  sheet.getCell(row, 2).numFmt = '#,##0';
  row += 2;

  // Implied valuation table
  const valuationHeaders = ['Method', 'Multiple', 'Enterprise Value', 'Equity Value', 'Price/Share'];
  valuationHeaders.forEach((header, idx) => {
    const cell = sheet.getCell(row, idx + 1);
    cell.value = header;
    cell.font = { bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREY_SUBHEADER } };
    cell.alignment = { horizontal: 'center' };
  });
  row++;

  // Valuation rows
  const valuationRows = [
    [
      'EV/Revenue (Median)',
      model.stats.evRevenue.median,
      model.impliedValuation.evRevenueMedian,
      model.impliedValuation.evRevenueMedian - model.target.netDebt,
      (model.impliedValuation.evRevenueMedian - model.target.netDebt) / model.target.shares,
    ],
    [
      'EV/EBITDA (Median)',
      model.stats.evEbitda.median,
      model.impliedValuation.evEbitdaMedian,
      model.impliedValuation.evEbitdaMedian - model.target.netDebt,
      (model.impliedValuation.evEbitdaMedian - model.target.netDebt) / model.target.shares,
    ],
    [
      'EV/EBIT (Median)',
      model.stats.evEbit.median,
      model.impliedValuation.evEbitMedian,
      model.impliedValuation.evEbitMedian - model.target.netDebt,
      (model.impliedValuation.evEbitMedian - model.target.netDebt) / model.target.shares,
    ],
    [
      'P/E (Median)',
      model.stats.pe.median,
      model.impliedValuation.peMedian + model.target.netDebt,
      model.impliedValuation.peMedian,
      model.impliedValuation.peMedian / model.target.shares,
    ],
  ];

  valuationRows.forEach(([method, multiple, ev, equity, price]) => {
    sheet.getCell(row, 1).value = method;
    sheet.getCell(row, 2).value = multiple as number;
    sheet.getCell(row, 2).numFmt = '0.0x';
    sheet.getCell(row, 3).value = ev as number;
    sheet.getCell(row, 3).numFmt = '$#,##0';
    sheet.getCell(row, 4).value = equity as number;
    sheet.getCell(row, 4).numFmt = '$#,##0';
    sheet.getCell(row, 5).value = price as number;
    sheet.getCell(row, 5).numFmt = '$0.00';
    row++;
  });

  row++;

  // Blended valuation
  sheet.getCell(row, 1).value = 'BLENDED VALUE PER SHARE';
  sheet.getCell(row, 1).font = { bold: true, size: 12 };
  sheet.getCell(row, 2).value = model.impliedValuation.blendedValuePerShare;
  sheet.getCell(row, 2).numFmt = '$0.00';
  sheet.getCell(row, 2).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN_OUTPUT } };
  row++;

  if (model.impliedValuation.upsideDownside) {
    sheet.getCell(row, 1).value = 'Upside/(Downside) vs Current:';
    sheet.getCell(row, 2).value = model.impliedValuation.upsideDownside;
    sheet.getCell(row, 2).font = { bold: true };
    row++;
  }

  row += 2;

  // Commentary
  sheet.getCell(row, 1).value = 'COMMENTARY';
  sheet.getCell(row, 1).font = { bold: true };
  row++;
  sheet.getCell(row, 1).value = model.commentary;
  sheet.getCell(row, 1).alignment = { wrapText: true, vertical: 'top' };
  sheet.mergeCells(row, 1, row + 2, 12);
  row += 3;

  // Footer note
  if (model.metadata.aiEstimatedCount > 0) {
    sheet.getCell(row, 1).value = '* Companies marked with asterisk had missing data estimated by AI';
    sheet.getCell(row, 1).font = { italic: true, size: 9 };
    sheet.mergeCells(row, 1, row, 12);
  }

  // Set column widths
  sheet.getColumn(1).width = 30;
  sheet.getColumn(2).width = 12;
  for (let i = 3; i <= 12; i++) {
    sheet.getColumn(i).width = 14;
  }

  // Freeze panes
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 8 }];

  return workbook;
}
