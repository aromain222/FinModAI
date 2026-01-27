/**
 * Operating Model Excel Generator
 * 
 * Generates FP&A-grade Excel workbook with multiple tabs.
 */

import ExcelJS from 'exceljs';
import { APP_NAME } from '@/lib/branding';
import {
  setCellInstanceSafeFormula,
  setCellInstanceSafeNumber,
  setCellInstanceSafeText,
} from '@/lib/excelSafe';
import type { OperatingModelInput } from './schema';
import type { OperatingOutput } from './compute';
import type { VarianceOutput } from './variance';

function setTextCell(cell: ExcelJS.Cell, value: any) {
  setCellInstanceSafeText(cell, value);
}

function setNumberCell(cell: ExcelJS.Cell, value: any) {
  setCellInstanceSafeNumber(cell, value);
}

function setFormulaCell(cell: ExcelJS.Cell, formula: string | null | undefined, fallback?: any) {
  setCellInstanceSafeFormula(cell, formula, fallback);
}

// Color scheme
const COLORS = {
  HEADER: 'FF2C3E50',
  SUB_HEADER: 'FF34495E',
  BORDER: 'FFBDC3C7',
  LIGHT_GREY: 'FFECF0F1',
  GREEN: 'FF00E387',
  RED: 'FFE74C3C',
  YELLOW: 'FFFFC107',
  WHITE: 'FFFFFFFF',
};

const FONT_HEADER = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
const FONT_SUB_HEADER = { name: 'Calibri', size: 10, bold: true };
const FONT_NORMAL = { name: 'Calibri', size: 10 };

/**
 * Main Excel Generator
 */
export async function generateOperatingWorkbook(
  input: OperatingModelInput,
  output: OperatingOutput,
  variance?: VarianceOutput | null
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();
  
  // Tab 1: Inputs
  const inputsSheet = workbook.addWorksheet('Inputs');
  buildInputsSheet(inputsSheet, input);
  
  // Tab 2: Monthly P&L
  const pnlSheet = workbook.addWorksheet('Monthly P&L');
  buildMonthlyPLSheet(pnlSheet, output, input.months);
  
  // Tab 3: Cash Flow & Runway
  const cashFlowSheet = workbook.addWorksheet('Cash Flow & Runway');
  buildCashFlowSheet(cashFlowSheet, output, input.months);
  
  // Tab 4: Budget vs Actual (if actuals exist)
  if (variance) {
    const budgetActualSheet = workbook.addWorksheet('Budget vs Actual');
    buildBudgetActualSheet(budgetActualSheet, output, variance, input.months);
    
    // Tab 5: Variance Bridges
    const varianceSheet = workbook.addWorksheet('Variance Bridges');
    buildVarianceBridgesSheet(varianceSheet, variance, input.months);
  }
  
  return workbook;
}

/**
 * Build Inputs Sheet
 */
function buildInputsSheet(sheet: ExcelJS.Worksheet, input: OperatingModelInput) {
  sheet.getColumn(1).width = 35;
  sheet.getColumn(2).width = 20;
  
  let row = 1;
  
  // Header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, `${APP_NAME} Operating Model - Inputs`);
  headerCell.font = { name: 'Calibri', size: 14, bold: true };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  row += 2;
  
  // Global Settings
  setTextCell(sheet.getCell(row, 1), 'Global Settings');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Start Month');
  setTextCell(sheet.getCell(row, 2), input.startMonth);
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Months');
  setNumberCell(sheet.getCell(row, 2), input.months);
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Currency');
  setTextCell(sheet.getCell(row, 2), input.currency);
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Tax Rate (%)');
  setNumberCell(sheet.getCell(row, 2), input.taxRate * 100);
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Starting Cash');
  setNumberCell(sheet.getCell(row, 2), input.startingCash);
  row += 2;
  
  // Revenue Model
  setTextCell(sheet.getCell(row, 1), 'Revenue Model');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Type');
  setTextCell(sheet.getCell(row, 2), input.revenueModel.type);
  row++;
  
  if (input.revenueModel.type === 'saas') {
    setTextCell(sheet.getCell(row, 1), 'Starting Customers');
    setNumberCell(sheet.getCell(row, 2), input.revenueModel.startingCustomers);
    row++;
    setTextCell(sheet.getCell(row, 1), 'Starting ARPU');
    setNumberCell(sheet.getCell(row, 2), input.revenueModel.startingARPU);
    row++;
    setTextCell(sheet.getCell(row, 1), 'Churn %');
    setNumberCell(sheet.getCell(row, 2), typeof input.revenueModel.churnPct === 'number' ? input.revenueModel.churnPct * 100 : 'Schedule');
    row++;
    setTextCell(sheet.getCell(row, 1), 'Expansion %');
    setNumberCell(sheet.getCell(row, 2), typeof input.revenueModel.expansionPct === 'number' ? input.revenueModel.expansionPct * 100 : 'Schedule');
    row++;
  } else if (input.revenueModel.type === 'priceVolume') {
    setTextCell(sheet.getCell(row, 1), 'Starting Units');
    setNumberCell(sheet.getCell(row, 2), input.revenueModel.startingUnits);
    row++;
    setTextCell(sheet.getCell(row, 1), 'Starting Price');
    setNumberCell(sheet.getCell(row, 2), input.revenueModel.startingPrice);
    row++;
  }
  
  row += 2;
  
  // COGS Model
  setTextCell(sheet.getCell(row, 1), 'COGS Model');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Type');
  setTextCell(sheet.getCell(row, 2), input.cogsModel.type);
  row++;
  
  if (input.cogsModel.type === 'pctRevenue') {
    setTextCell(sheet.getCell(row, 1), 'COGS %');
    setNumberCell(sheet.getCell(row, 2), input.cogsModel.cogsPct! * 100);
    row++;
  } else if (input.cogsModel.type === 'unitCost') {
    setTextCell(sheet.getCell(row, 1), 'Unit Cost');
    setNumberCell(sheet.getCell(row, 2), input.cogsModel.unitCost);
    row++;
  }
  
  row += 2;
  
  // Opex Model
  setTextCell(sheet.getCell(row, 1), 'Opex Model');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Starting Headcount');
  setNumberCell(sheet.getCell(row, 2), input.opexModel.startingHeadcount);
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Fully Loaded Cost Per Head');
  setNumberCell(sheet.getCell(row, 2), input.opexModel.fullyLoadedCostPerHead);
  row++;
}

/**
 * Build Monthly P&L Sheet
 */
function buildMonthlyPLSheet(
  sheet: ExcelJS.Worksheet,
  output: OperatingOutput,
  months: number
) {
  sheet.getColumn(1).width = 30;
  for (let col = 2; col <= months + 1; col++) {
    sheet.getColumn(col).width = 14;
  }
  sheet.getColumn(months + 2).width = 16; // Total column
  
  let row = 1;
  
  // Header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'Monthly P&L');
  headerCell.font = { name: 'Calibri', size: 14, bold: true };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  row += 2;
  
  // Month headers
  setTextCell(sheet.getCell(row, 1), '($ in thousands)');
  for (let month = 0; month < months; month++) {
    setTextCell(sheet.getCell(row, month + 2), output.monthly[month].monthLabel);
    sheet.getCell(row, month + 2).font = FONT_SUB_HEADER;
  }
  setTextCell(sheet.getCell(row, months + 2), 'Total');
  sheet.getCell(row, months + 2).font = FONT_SUB_HEADER;
  row++;
  
  // Revenue
  setTextCell(sheet.getCell(row, 1), 'Revenue');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].revenue.total);
  }
  setFormulaCell(sheet.getCell(row, months + 2), `SUM(B${row}:${String.fromCharCode(65 + months)}${row})`);
  row++;
  
  // COGS
  setTextCell(sheet.getCell(row, 1), 'COGS');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].cogs);
  }
  setFormulaCell(sheet.getCell(row, months + 2), `SUM(B${row}:${String.fromCharCode(65 + months)}${row})`);
  row++;
  
  // Gross Profit
  setTextCell(sheet.getCell(row, 1), 'Gross Profit');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].grossProfit);
  }
  setFormulaCell(sheet.getCell(row, months + 2), `SUM(B${row}:${String.fromCharCode(65 + months)}${row})`);
  row++;
  
  // Gross Margin %
  setTextCell(sheet.getCell(row, 1), 'Gross Margin %');
  for (let month = 0; month < months; month++) {
    if (output.monthly[month].grossMargin !== null) {
      setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].grossMargin! * 100);
      // Conditional formatting: red if margin drops
      if (month > 0 && output.monthly[month].grossMargin! < output.monthly[month - 1].grossMargin!) {
        sheet.getCell(row, month + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.YELLOW } };
      }
    }
  }
  row++;
  row++;
  
  // Opex
  setTextCell(sheet.getCell(row, 1), 'Operating Expenses');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  Headcount Cost');
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].headcountCost);
  }
  setFormulaCell(sheet.getCell(row, months + 2), `SUM(B${row}:${String.fromCharCode(65 + months)}${row})`);
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  Sales & Marketing');
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].salesMarketing);
  }
  setFormulaCell(sheet.getCell(row, months + 2), `SUM(B${row}:${String.fromCharCode(65 + months)}${row})`);
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  General & Admin');
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].generalAdmin);
  }
  setFormulaCell(sheet.getCell(row, months + 2), `SUM(B${row}:${String.fromCharCode(65 + months)}${row})`);
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  R&D');
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].rnd);
  }
  setFormulaCell(sheet.getCell(row, months + 2), `SUM(B${row}:${String.fromCharCode(65 + months)}${row})`);
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Total Opex');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].totalOpex);
  }
  setFormulaCell(sheet.getCell(row, months + 2), `SUM(B${row}:${String.fromCharCode(65 + months)}${row})`);
  row++;
  row++;
  
  // EBITDA
  setTextCell(sheet.getCell(row, 1), 'EBITDA');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].ebitda);
  }
  setFormulaCell(sheet.getCell(row, months + 2), `SUM(B${row}:${String.fromCharCode(65 + months)}${row})`);
  row++;
  
  // Taxes
  setTextCell(sheet.getCell(row, 1), 'Taxes');
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].taxes);
  }
  setFormulaCell(sheet.getCell(row, months + 2), `SUM(B${row}:${String.fromCharCode(65 + months)}${row})`);
  row++;
  
  // Net Income
  setTextCell(sheet.getCell(row, 1), 'Net Income');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].netIncome);
  }
  setFormulaCell(sheet.getCell(row, months + 2), `SUM(B${row}:${String.fromCharCode(65 + months)}${row})`);
}

/**
 * Build Cash Flow & Runway Sheet
 */
function buildCashFlowSheet(
  sheet: ExcelJS.Worksheet,
  output: OperatingOutput,
  months: number
) {
  sheet.getColumn(1).width = 30;
  for (let col = 2; col <= months + 1; col++) {
    sheet.getColumn(col).width = 14;
  }
  
  let row = 1;
  
  // Header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'Cash Flow & Runway');
  headerCell.font = { name: 'Calibri', size: 14, bold: true };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  row += 2;
  
  // Month headers
  setTextCell(sheet.getCell(row, 1), '($ in thousands)');
  for (let month = 0; month < months; month++) {
    setTextCell(sheet.getCell(row, month + 2), output.monthly[month].monthLabel);
    sheet.getCell(row, month + 2).font = FONT_SUB_HEADER;
  }
  row++;
  
  // Starting Cash
  setTextCell(sheet.getCell(row, 1), 'Starting Cash');
  setNumberCell(sheet.getCell(row, 2), output.monthly[0].cash - output.monthly[0].operatingCashFlow);
  row++;
  
  // EBITDA
  setTextCell(sheet.getCell(row, 1), 'EBITDA');
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), output.monthly[month].ebitda);
  }
  row++;
  
  // Taxes
  setTextCell(sheet.getCell(row, 1), 'Less: Taxes');
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), -output.monthly[month].taxes);
  }
  row++;
  
  // Capex
  setTextCell(sheet.getCell(row, 1), 'Less: Capex');
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), -output.monthly[month].capex);
  }
  row++;
  
  // Interest
  setTextCell(sheet.getCell(row, 1), 'Less: Interest');
  for (let month = 0; month < months; month++) {
    setNumberCell(sheet.getCell(row, month + 2), -output.monthly[month].interest);
  }
  row++;
  
  // Operating Cash Flow
  setTextCell(sheet.getCell(row, 1), 'Operating Cash Flow');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let month = 0; month < months; month++) {
    const ocf = output.monthly[month].operatingCashFlow;
    setNumberCell(sheet.getCell(row, month + 2), ocf);
    // Conditional formatting: red if negative
    if (ocf < 0) {
      sheet.getCell(row, month + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RED } };
      sheet.getCell(row, month + 2).font = { ...FONT_NORMAL, color: { argb: 'FFFFFFFF' } };
    }
  }
  row++;
  row++;
  
  // Cash Balance
  setTextCell(sheet.getCell(row, 1), 'Ending Cash');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let month = 0; month < months; month++) {
    const cash = output.monthly[month].cash;
    setNumberCell(sheet.getCell(row, month + 2), cash);
    // Conditional formatting: red if negative
    if (cash < 0) {
      sheet.getCell(row, month + 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RED } };
      sheet.getCell(row, month + 2).font = { ...FONT_NORMAL, color: { argb: 'FFFFFFFF' }, bold: true };
    }
  }
  row += 2;
  
  // Runway Summary
  if (output.summary.runwayMonthIndex !== null) {
    setTextCell(sheet.getCell(row, 1), 'Runway Summary');
    sheet.getCell(row, 1).font = FONT_SUB_HEADER;
    row++;
    
    setTextCell(sheet.getCell(row, 1), 'First Negative Cash Month');
    setTextCell(sheet.getCell(row, 2), output.monthly[output.summary.runwayMonthIndex].monthLabel);
    sheet.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RED } };
    sheet.getCell(row, 2).font = { ...FONT_NORMAL, color: { argb: 'FFFFFFFF' }, bold: true };
    row++;
    
    setTextCell(sheet.getCell(row, 1), 'Runway Months Remaining');
    setNumberCell(sheet.getCell(row, 2), output.summary.runwayMonthsRemaining || 0);
    row++;
    
    setTextCell(sheet.getCell(row, 1), 'Avg Burn (Last 3 Months)');
    setNumberCell(sheet.getCell(row, 2), output.summary.avgBurnLast3Months);
    sheet.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.YELLOW } };
    row++;
  } else {
    setTextCell(sheet.getCell(row, 1), 'Runway Summary');
    sheet.getCell(row, 1).font = FONT_SUB_HEADER;
    row++;
    setTextCell(sheet.getCell(row, 1), 'No runway risk - cash remains positive');
    sheet.getCell(row, 1).font = { ...FONT_NORMAL, color: { argb: COLORS.GREEN } };
  }
}

/**
 * Build Budget vs Actual Sheet
 */
function buildBudgetActualSheet(
  sheet: ExcelJS.Worksheet,
  output: OperatingOutput,
  variance: VarianceOutput,
  months: number
) {
  sheet.getColumn(1).width = 30;
  for (let col = 2; col <= months + 1; col++) {
    sheet.getColumn(col).width = 14;
  }
  
  let row = 1;
  
  // Header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'Budget vs Actual');
  headerCell.font = { name: 'Calibri', size: 14, bold: true };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  row += 2;
  
  // Revenue
  if (variance.revenue.length > 0) {
    setTextCell(sheet.getCell(row, 1), 'Revenue');
    sheet.getCell(row, 1).font = FONT_SUB_HEADER;
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Plan');
    for (const v of variance.revenue) {
      const col = v.month;
      setNumberCell(sheet.getCell(row, col + 1), v.plan);
    }
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Actual');
    for (const v of variance.revenue) {
      setNumberCell(sheet.getCell(row, v.month + 1), v.actual);
    }
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Variance');
    for (const v of variance.revenue) {
      const cell = sheet.getCell(row, v.month + 1);
      setNumberCell(cell, v.variance);
      if (v.variance < 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RED } };
        cell.font = { ...FONT_NORMAL, color: { argb: 'FFFFFFFF' } };
      }
    }
    row += 2;
  }
  
  // COGS
  if (variance.cogs.length > 0) {
    setTextCell(sheet.getCell(row, 1), 'COGS');
    sheet.getCell(row, 1).font = FONT_SUB_HEADER;
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Plan');
    for (const v of variance.cogs) {
      setNumberCell(sheet.getCell(row, v.month + 1), v.plan);
    }
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Actual');
    for (const v of variance.cogs) {
      setNumberCell(sheet.getCell(row, v.month + 1), v.actual);
    }
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Variance');
    for (const v of variance.cogs) {
      const cell = sheet.getCell(row, v.month + 1);
      setNumberCell(cell, v.variance);
      if (v.variance > 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RED } };
        cell.font = { ...FONT_NORMAL, color: { argb: 'FFFFFFFF' } };
      }
    }
    row += 2;
  }
  
  // Opex
  if (variance.opex.length > 0) {
    setTextCell(sheet.getCell(row, 1), 'Opex');
    sheet.getCell(row, 1).font = FONT_SUB_HEADER;
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Plan');
    for (const v of variance.opex) {
      setNumberCell(sheet.getCell(row, v.month + 1), v.plan);
    }
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Actual');
    for (const v of variance.opex) {
      setNumberCell(sheet.getCell(row, v.month + 1), v.actual);
    }
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Variance');
    for (const v of variance.opex) {
      const cell = sheet.getCell(row, v.month + 1);
      setNumberCell(cell, v.variance);
      if (v.variance > 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RED } };
        cell.font = { ...FONT_NORMAL, color: { argb: 'FFFFFFFF' } };
      }
    }
    row += 2;
  }
  
  // Headcount
  if (variance.headcount.length > 0) {
    setTextCell(sheet.getCell(row, 1), 'Headcount Cost');
    sheet.getCell(row, 1).font = FONT_SUB_HEADER;
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Plan');
    for (const v of variance.headcount) {
      setNumberCell(sheet.getCell(row, v.month + 1), v.plan);
    }
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Actual');
    for (const v of variance.headcount) {
      setNumberCell(sheet.getCell(row, v.month + 1), v.actual);
    }
    row++;
    
    setTextCell(sheet.getCell(row, 1), '  Variance');
    for (const v of variance.headcount) {
      const cell = sheet.getCell(row, v.month + 1);
      setNumberCell(cell, v.variance);
      if (v.variance > 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RED } };
        cell.font = { ...FONT_NORMAL, color: { argb: 'FFFFFFFF' } };
      }
    }
  }
}

/**
 * Build Variance Bridges Sheet
 */
function buildVarianceBridgesSheet(
  sheet: ExcelJS.Worksheet,
  variance: VarianceOutput,
  months: number
) {
  sheet.getColumn(1).width = 30;
  for (let col = 2; col <= months + 1; col++) {
    sheet.getColumn(col).width = 14;
  }
  
  let row = 1;
  
  // Header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'Variance Bridges');
  headerCell.font = { name: 'Calibri', size: 14, bold: true };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  row += 2;
  
  // Revenue variance bridge
  if (variance.revenue.length > 0) {
    setTextCell(sheet.getCell(row, 1), 'Revenue Variance Bridge');
    sheet.getCell(row, 1).font = FONT_SUB_HEADER;
    row++;
    
    for (const v of variance.revenue) {
      if (v.bridge.volumeVariance !== undefined) {
        setTextCell(sheet.getCell(row, 1), `  Month ${v.month} - Volume Variance`);
        setNumberCell(sheet.getCell(row, v.month + 1), v.bridge.volumeVariance);
        row++;
        
        setTextCell(sheet.getCell(row, 1), `  Month ${v.month} - Price Variance`);
        setNumberCell(sheet.getCell(row, v.month + 1), v.bridge.priceVariance);
        row++;
      }
    }
    row += 2;
  }
  
  // Headcount variance bridge
  if (variance.headcount.length > 0) {
    setTextCell(sheet.getCell(row, 1), 'Headcount Variance Bridge');
    sheet.getCell(row, 1).font = FONT_SUB_HEADER;
    row++;
    
    for (const v of variance.headcount) {
      setTextCell(sheet.getCell(row, 1), `  Month ${v.month} - Headcount Variance`);
      setNumberCell(sheet.getCell(row, v.month + 1), v.bridge.headcountVariance);
      row++;
      
      if (v.bridge.rateVariance !== undefined) {
        setTextCell(sheet.getCell(row, 1), `  Month ${v.month} - Rate Variance`);
        setNumberCell(sheet.getCell(row, v.month + 1), v.bridge.rateVariance);
        row++;
      }
    }
  }
}
