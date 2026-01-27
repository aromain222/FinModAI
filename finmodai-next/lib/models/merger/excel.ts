/**
 * Merger Model Excel Generator
 * 
 * Generates banker-grade Excel workbook with multiple tabs.
 */

import ExcelJS from 'exceljs';
import { APP_NAME } from '@/lib/branding';
import {
  setCellInstanceSafeFormula,
  setCellInstanceSafeNumber,
  setCellInstanceSafeText,
} from '@/lib/excelSafe';
import type { MergerModelInput } from './schema';
import type { MergerModelOutput } from './compute';

function setTextCell(cell: ExcelJS.Cell, value: any) {
  setCellInstanceSafeText(cell, value);
}

function setNumberCell(cell: ExcelJS.Cell, value: any) {
  setCellInstanceSafeNumber(cell, value);
}

function setFormulaCell(cell: ExcelJS.Cell, formula: string | null | undefined, fallback?: any) {
  setCellInstanceSafeFormula(cell, formula, fallback);
}

function setOptionalNumberCell(cell: ExcelJS.Cell, value: number | null | undefined) {
  if (value === null || value === undefined) {
    cell.value = { formula: 'NA()', result: null };
    return;
  }
  setCellInstanceSafeNumber(cell, value);
}

// Color scheme
const COLORS = {
  HEADER: 'FF2C3E50', // Dark blue-gray
  SUB_HEADER: 'FF34495E', // Medium gray
  BORDER: 'FFBDC3C7',
  LIGHT_GREY: 'FFECF0F1',
  GREEN: 'FF00E387',
  RED: 'FFE74C3C',
  WHITE: 'FFFFFFFF',
};

const FONT_HEADER = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
const FONT_SUB_HEADER = { name: 'Calibri', size: 10, bold: true };
const FONT_NORMAL = { name: 'Calibri', size: 10 };

/**
 * Main Excel Generator
 */
export async function generateMergerWorkbook(
  input: MergerModelInput,
  output: MergerModelOutput,
  buyerFinancials: any,
  targetFinancials: any
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();
  
  // Tab 1: Inputs
  const inputsSheet = workbook.addWorksheet('Inputs');
  buildInputsSheet(inputsSheet, input, buyerFinancials, targetFinancials);
  
  // Tab 2: Combined Income Statement
  const combinedISSheet = workbook.addWorksheet('Combined IS');
  buildCombinedISSheet(combinedISSheet, output, input.forecastYears);
  
  // Tab 3: Accretion/Dilution
  const accDilSheet = workbook.addWorksheet('Accretion Dilution');
  buildAccretionDilutionSheet(accDilSheet, output, input.forecastYears);
  
  // Tab 4: Sources & Uses
  const sourcesUsesSheet = workbook.addWorksheet('Sources & Uses');
  buildSourcesUsesSheet(sourcesUsesSheet, output);
  
  return workbook;
}

/**
 * Build Inputs Sheet
 */
function buildInputsSheet(
  sheet: ExcelJS.Worksheet,
  input: MergerModelInput,
  buyerFinancials: any,
  targetFinancials: any
) {
  sheet.getColumn(1).width = 35;
  sheet.getColumn(2).width = 20;
  sheet.getColumn(3).width = 20;
  
  let row = 1;
  
  // Header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, `${APP_NAME} Merger Model - Inputs`);
  headerCell.font = { name: 'Calibri', size: 14, bold: true };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  row += 2;
  
  // Deal Structure
  setTextCell(sheet.getCell(row, 1), 'Deal Structure');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  setTextCell(sheet.getCell(row, 2), input.dealStructure);
  row++;
  
  // Offer Price
  if (input.offerPrice) {
    setTextCell(sheet.getCell(row, 1), 'Offer Price ($)');
    setNumberCell(sheet.getCell(row, 2), input.offerPrice);
    row++;
  }
  
  if (input.premiumPct) {
    setTextCell(sheet.getCell(row, 1), 'Premium (%)');
    setNumberCell(sheet.getCell(row, 2), input.premiumPct * 100);
    row++;
  }
  
  // Stock Mechanics
  if (input.stockPct !== undefined) {
    setTextCell(sheet.getCell(row, 1), 'Stock %');
    setNumberCell(sheet.getCell(row, 2), input.stockPct * 100);
    row++;
  }
  
  if (input.exchangeRatio !== undefined) {
    setTextCell(sheet.getCell(row, 1), 'Exchange Ratio');
    setNumberCell(sheet.getCell(row, 2), input.exchangeRatio);
    row++;
  }
  
  // Financing
  if (input.buyerCashUsed !== undefined) {
    setTextCell(sheet.getCell(row, 1), 'Buyer Cash Used ($M)');
    setNumberCell(sheet.getCell(row, 2), input.buyerCashUsed);
    row++;
  }
  
  if (input.newDebt !== undefined) {
    setTextCell(sheet.getCell(row, 1), 'New Debt ($M)');
    setNumberCell(sheet.getCell(row, 2), input.newDebt);
    row++;
  }
  
  if (input.newDebtRate !== undefined) {
    setTextCell(sheet.getCell(row, 1), 'New Debt Rate (%)');
    setNumberCell(sheet.getCell(row, 2), input.newDebtRate * 100);
    row++;
  }
  
  row += 2;
  
  // Synergies
  setTextCell(sheet.getCell(row, 1), 'Revenue Synergies');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  row++;
  
  if (input.revenueSynergies?.runRate !== undefined) {
    setTextCell(sheet.getCell(row, 1), 'Run Rate ($M)');
    setNumberCell(sheet.getCell(row, 2), input.revenueSynergies.runRate);
    row++;
    setTextCell(sheet.getCell(row, 1), 'Ramp Years');
    setNumberCell(sheet.getCell(row, 2), input.revenueSynergies.rampYears);
    row++;
  }
  
  if (input.synergyCOGSPct !== undefined) {
    setTextCell(sheet.getCell(row, 1), 'Synergy COGS %');
    setNumberCell(sheet.getCell(row, 2), input.synergyCOGSPct * 100);
    row++;
  }
  
  if (input.synergyGrossMarginPct !== undefined) {
    setTextCell(sheet.getCell(row, 1), 'Synergy Gross Margin %');
    setNumberCell(sheet.getCell(row, 2), input.synergyGrossMarginPct * 100);
    row++;
  }
  
  row += 2;
  
  // Purchase Accounting
  if (input.purchaseAccountingEnabled) {
    setTextCell(sheet.getCell(row, 1), 'Purchase Accounting');
    sheet.getCell(row, 1).font = FONT_SUB_HEADER;
    row++;
    
    if (input.intangiblesPct !== undefined) {
      setTextCell(sheet.getCell(row, 1), 'Intangibles %');
      setNumberCell(sheet.getCell(row, 2), input.intangiblesPct * 100);
      row++;
    }
    
    if (input.intangiblesLifeYears !== undefined) {
      setTextCell(sheet.getCell(row, 1), 'Intangibles Life (years)');
      setNumberCell(sheet.getCell(row, 2), input.intangiblesLifeYears);
      row++;
    }
  }
}

/**
 * Build Combined Income Statement Sheet
 */
function buildCombinedISSheet(
  sheet: ExcelJS.Worksheet,
  output: MergerModelOutput,
  forecastYears: number
) {
  // Set column widths
  sheet.getColumn(1).width = 35;
  for (let col = 2; col <= forecastYears + 1; col++) {
    sheet.getColumn(col).width = 16;
  }
  
  let row = 1;
  
  // Header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'Combined Income Statement');
  headerCell.font = { name: 'Calibri', size: 14, bold: true };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  row += 2;
  
  // Year headers
  setTextCell(sheet.getCell(row, 1), '($ in millions)');
  for (let year = 1; year <= forecastYears; year++) {
    setTextCell(sheet.getCell(row, year + 1), `Year ${year}`);
    sheet.getCell(row, year + 1).font = FONT_SUB_HEADER;
  }
  row++;
  
  // Revenue
  setTextCell(sheet.getCell(row, 1), 'Revenue');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].revenue.total);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  Buyer');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].revenue.buyer);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  Target');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].revenue.target);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  Revenue Synergy');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].revenue.revenueSynergy);
  }
  row++;
  
  // COGS
  setTextCell(sheet.getCell(row, 1), 'COGS');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].cogs.total);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  Synergy COGS');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].cogs.synergyCOGS);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  COGS Savings');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), -output.combinedIS[year - 1].cogs.cogsSavings);
  }
  row++;
  
  // Gross Profit
  setTextCell(sheet.getCell(row, 1), 'Gross Profit');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].grossProfit);
  }
  row++;
  
  // OpEx
  setTextCell(sheet.getCell(row, 1), 'Operating Expenses');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].opex.total);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  OpEx Savings');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), -output.combinedIS[year - 1].opex.opexSavings);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  Integration Costs');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].opex.integrationCosts);
  }
  row++;
  
  // EBITDA
  setTextCell(sheet.getCell(row, 1), 'EBITDA');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].ebitda);
  }
  row++;
  
  // D&A
  setTextCell(sheet.getCell(row, 1), 'Depreciation & Amortization');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].da);
  }
  row++;
  
  // Purchase Accounting Amortization
  if (output.purchaseAccounting) {
    setTextCell(sheet.getCell(row, 1), 'Purchase Accounting Amortization');
    for (let year = 1; year <= forecastYears; year++) {
      setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].amortization);
    }
    row++;
  }
  
  // EBIT
  setTextCell(sheet.getCell(row, 1), 'EBIT');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].ebit);
  }
  row++;
  
  // Interest
  setTextCell(sheet.getCell(row, 1), 'Interest Expense');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].interest.total);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), '  Incremental Interest');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].interest.incremental);
  }
  row++;
  
  // EBT
  setTextCell(sheet.getCell(row, 1), 'EBT');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].ebt);
  }
  row++;
  
  // Taxes
  setTextCell(sheet.getCell(row, 1), 'Taxes');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].taxes);
  }
  row++;
  
  // Net Income
  setTextCell(sheet.getCell(row, 1), 'Net Income');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.combinedIS[year - 1].netIncome);
  }
}

/**
 * Build Accretion/Dilution Sheet
 */
function buildAccretionDilutionSheet(
  sheet: ExcelJS.Worksheet,
  output: MergerModelOutput,
  forecastYears: number
) {
  sheet.getColumn(1).width = 35;
  for (let col = 2; col <= forecastYears + 1; col++) {
    sheet.getColumn(col).width = 16;
  }
  
  let row = 1;
  
  // Header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'Accretion / Dilution Analysis');
  headerCell.font = { name: 'Calibri', size: 14, bold: true };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  row += 2;
  
  // Year headers
  setTextCell(sheet.getCell(row, 1), '');
  for (let year = 1; year <= forecastYears; year++) {
    setTextCell(sheet.getCell(row, year + 1), `Year ${year}`);
    sheet.getCell(row, year + 1).font = FONT_SUB_HEADER;
  }
  row++;
  
  // Shares
  setTextCell(sheet.getCell(row, 1), 'Buyer Shares (M)');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].shares.buyer);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'New Shares (M)');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].shares.newShares);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Pro Forma Shares (M)');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].shares.proForma);
  }
  row++;
  row++;
  
  // EPS
  setTextCell(sheet.getCell(row, 1), 'Buyer Standalone EPS ($)');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].buyerEPS);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Pro Forma EPS ($)');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].proFormaEPS);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Accretion / (Dilution) (%)');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let year = 1; year <= forecastYears; year++) {
    const accDil = output.epsAnalysis[year - 1].accretionDilutionPct * 100;
    setNumberCell(sheet.getCell(row, year + 1), accDil);
    // Color code: green if accretive, red if dilutive
    if (accDil > 0) {
      sheet.getCell(row, year + 1).font = { ...FONT_NORMAL, color: { argb: COLORS.GREEN } };
    } else if (accDil < 0) {
      sheet.getCell(row, year + 1).font = { ...FONT_NORMAL, color: { argb: COLORS.RED } };
    }
  }
  row += 2;
  
  // EPS Bridge
  setTextCell(sheet.getCell(row, 1), 'EPS Bridge ($M after-tax)');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Buyer Net Income');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].bridge.buyerNI);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Target Net Income');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].bridge.targetNI);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Revenue Synergy (after-tax)');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].bridge.revenueSynergyAfterTax);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Cost Synergy (after-tax)');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].bridge.costSynergyAfterTax);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Integration Costs (after-tax)');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].bridge.integrationAfterTax);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Amortization (after-tax)');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].bridge.amortizationAfterTax);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Incremental Interest (after-tax)');
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].bridge.interestAfterTax);
  }
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Total Pro Forma Net Income');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  for (let year = 1; year <= forecastYears; year++) {
    setNumberCell(sheet.getCell(row, year + 1), output.epsAnalysis[year - 1].bridge.total);
  }
}

/**
 * Build Sources & Uses Sheet
 */
function buildSourcesUsesSheet(
  sheet: ExcelJS.Worksheet,
  output: MergerModelOutput
) {
  sheet.getColumn(1).width = 35;
  sheet.getColumn(2).width = 20;
  sheet.getColumn(3).width = 3;
  sheet.getColumn(4).width = 35;
  sheet.getColumn(5).width = 20;
  
  let row = 1;
  
  // Header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'Sources & Uses');
  headerCell.font = { name: 'Calibri', size: 14, bold: true };
  headerCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  row += 2;
  
  // Uses
  setTextCell(sheet.getCell(row, 1), 'Uses');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Equity Value');
  setNumberCell(sheet.getCell(row, 2), output.sourcesUses.uses.equityValue);
  row++;
  
  setTextCell(sheet.getCell(row, 1), 'Transaction & Financing Fees');
  setNumberCell(sheet.getCell(row, 2), output.sourcesUses.uses.feesCash);
  row++;
  
  if (output.sourcesUses.uses.debtRefi > 0) {
    setTextCell(sheet.getCell(row, 1), 'Debt Refinancing');
    setNumberCell(sheet.getCell(row, 2), output.sourcesUses.uses.debtRefi);
    row++;
  }
  
  setTextCell(sheet.getCell(row, 1), 'Total Uses');
  sheet.getCell(row, 1).font = { ...FONT_SUB_HEADER, bold: true };
  setNumberCell(sheet.getCell(row, 2), output.sourcesUses.uses.total);
  row += 2;
  
  // Sources
  setTextCell(sheet.getCell(row, 4), 'Sources');
  sheet.getCell(row, 4).font = FONT_SUB_HEADER;
  row++;
  
  setTextCell(sheet.getCell(row, 4), 'Buyer Cash Used');
  setNumberCell(sheet.getCell(row, 5), output.sourcesUses.sources.buyerCashUsed);
  row++;
  
  setTextCell(sheet.getCell(row, 4), 'New Debt');
  setNumberCell(sheet.getCell(row, 5), output.sourcesUses.sources.newDebt);
  row++;
  
  setTextCell(sheet.getCell(row, 4), 'Stock Consideration');
  setNumberCell(sheet.getCell(row, 5), output.sourcesUses.sources.stockConsideration);
  row++;
  
  setTextCell(sheet.getCell(row, 4), 'Total Sources');
  sheet.getCell(row, 4).font = { ...FONT_SUB_HEADER, bold: true };
  setNumberCell(sheet.getCell(row, 5), output.sourcesUses.sources.total);
  row += 2;
  
  // Reconciliation
  setTextCell(sheet.getCell(row, 1), 'Reconciliation');
  sheet.getCell(row, 1).font = FONT_SUB_HEADER;
  const reconValue = output.sourcesUses.reconciliation;
  setNumberCell(sheet.getCell(row, 2), reconValue);
  
  // Conditional formatting: red if out of balance
  if (Math.abs(reconValue) > 1) {
    sheet.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RED } };
    sheet.getCell(row, 2).font = { ...FONT_NORMAL, color: { argb: 'FFFFFFFF' }, bold: true };
    setTextCell(sheet.getCell(row, 3), '⚠️ OUT OF BALANCE');
    sheet.getCell(row, 3).font = { ...FONT_NORMAL, color: { argb: COLORS.RED }, bold: true };
  } else {
    setTextCell(sheet.getCell(row, 3), '✓ Balanced');
    sheet.getCell(row, 3).font = { ...FONT_NORMAL, color: { argb: COLORS.GREEN } };
  }
}
