/**
 * Banker-Grade DCF Generator - REFACTORED
 * 
 * Computes all DCF math in TypeScript first, then writes to Excel.
 * NO MORE BROKEN FORMULAS OR ZERO VALUES.
 * 
 * CRITICAL: All monetary values are in MILLIONS of currency units.
 */

import ExcelJS from 'exceljs';
import { APP_NAME } from '@/lib/branding';
import { ensureMillions, formatMillions, validateMillions, UNITS } from './unitConversion';
import { addNamedRangeSafe } from '@/lib/excel/namedRanges';
import { quoteSheetName } from '@/lib/excel/address';

/**
 * DCF Inputs - All dollar amounts in MILLIONS
 */
export interface DCFInputs {
  ticker: string;
  companyName?: string;
  
  // Fiscal years
  years: number[];                    // e.g. [2024, 2025, 2026, 2027, 2028, 2029]
  
  // Revenue forecast (in $ millions)
  revenueByYear: number[];            // Must match years.length
  
  // Operating assumptions (as decimals: 0.25 = 25%)
  ebitMargin: number;                 // EBIT / Revenue
  taxRate: number;                    // Cash tax rate
  daPercentOfRevenue: number;         // D&A / Revenue
  changeInWCPercentOfRevenue: number; // ΔWC / Revenue (positive = investment)
  capexPercentOfRevenue: number;      // Capex / Revenue
  
  // Valuation inputs (as decimals)
  wacc: number;                       // Weighted average cost of capital
  terminalGrowth: number;             // Perpetual growth rate
  
  // Balance sheet
  netDebtMillions: number;            // Total Debt - Cash (can be negative)
  sharesOutstandingMillions: number;  // Shares outstanding
  sharesSource?: 'capTable' | 'marketData' | 'assumption'; // Source of shares data
  
  // Optional: pre-computed EBIT by year (if not provided, uses revenue * margin)
  ebitByYear?: number[];
}

/**
 * DCF Computation Results
 */
export interface DCFResults {
  // Operating metrics
  ebitByYear: number[];
  taxesByYear: number[];
  nopatByYear: number[];
  daByYear: number[];
  deltaWCByYear: number[];
  capexByYear: number[];
  
  // Free cash flow
  ufcfByYear: number[];
  
  // Discounting
  discountFactors: number[];
  pvUfcfByYear: number[];
  
  // Terminal value
  terminalValue: number;
  pvTerminalValue: number;
  
  // Valuation
  pvExplicitFCF: number;
  enterpriseValue: number;
  equityValue: number;
  pricePerShare: number | null;
  isValid: boolean;
  invalidReason: string | null;
  notes?: string[];
}

const FULL_DOLLAR_THRESHOLD = 1_000_000_000;

function normalizeMonetarySeries(values: number[], label: string): number[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new Error(`${label} must be provided and contain at least one value`);
  }

  let sawFullDollar = false;
  let sawMillions = false;

  const normalized = values.map((rawValue, index) => {
    if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
      throw new Error(`${label}[${index}] must be a finite number (received ${rawValue})`);
    }

    if (rawValue !== 0) {
      if (Math.abs(rawValue) >= FULL_DOLLAR_THRESHOLD) {
        sawFullDollar = true;
      } else {
        sawMillions = true;
      }
    }

    return ensureMillions(rawValue, `${label}[${index}]`);
  });

  if (sawFullDollar && sawMillions) {
    throw new Error(
      `Mixed units detected for ${label}. All values must be expressed in ${UNITS}.`
    );
  }

  return normalized;
}

function normalizeMonetaryValue(value: number | undefined | null, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} is required and must be a finite number`);
  }
  return ensureMillions(value, label);
}

function ensureRate(
  value: number | undefined | null,
  label: string,
  min: number,
  max: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} is required and must be a finite number`);
  }

  const clamped = Math.max(min, Math.min(max, value));
  if (clamped !== value) {
    console.warn(
      `[normalizeDCFInputs] ${label} (${(value * 100).toFixed(1)}%) clamped to ${(clamped * 100).toFixed(1)}%`
    );
  }

  return clamped;
}

/**
 * Normalize and validate DCF inputs
 */
export function normalizeDCFInputs(raw: Partial<DCFInputs>): DCFInputs {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Missing DCF inputs');
  }

  if (!raw.ticker || typeof raw.ticker !== 'string' || raw.ticker.trim().length === 0) {
    throw new Error('Ticker is required');
  }

  if (!raw.years || !Array.isArray(raw.years) || raw.years.length === 0) {
    throw new Error('Projection years are required');
  }

  const years = raw.years;

  if (!raw.revenueByYear || !Array.isArray(raw.revenueByYear) || raw.revenueByYear.length !== years.length) {
    throw new Error('Revenue series must align with projection years');
  }

  const revenueByYear = normalizeMonetarySeries(raw.revenueByYear, 'revenueByYear');

  if (revenueByYear.some((rev) => rev <= 0)) {
    throw new Error('Revenue must contain positive values');
  }

  const ebitByYear = raw.ebitByYear
    ? normalizeMonetarySeries(raw.ebitByYear, 'ebitByYear')
    : undefined;

  if (ebitByYear && ebitByYear.length !== years.length) {
    throw new Error('EBIT series must match the forecast horizon');
  }

  const normalized: DCFInputs = {
    ticker: raw.ticker.trim().toUpperCase(),
    companyName: raw.companyName || raw.ticker || 'Unknown Company',
    years,
    revenueByYear,
    ebitMargin: ensureRate(raw.ebitMargin, 'EBIT margin', -0.2, 0.6),
    taxRate: ensureRate(raw.taxRate, 'Tax rate', 0, 0.5),
    daPercentOfRevenue: ensureRate(raw.daPercentOfRevenue, 'D&A % of revenue', 0, 0.2),
    changeInWCPercentOfRevenue: ensureRate(
      raw.changeInWCPercentOfRevenue,
      'ΔWC % of revenue',
      -0.2,
      0.2
    ),
    capexPercentOfRevenue: ensureRate(raw.capexPercentOfRevenue, 'Capex % of revenue', 0, 0.3),
    wacc: ensureRate(raw.wacc, 'WACC', 0.03, 0.25),
    terminalGrowth: ensureRate(raw.terminalGrowth, 'Terminal growth', 0, 0.05),
    netDebtMillions: normalizeMonetaryValue(raw.netDebtMillions, 'netDebt'),
    sharesOutstandingMillions: normalizeMonetaryValue(raw.sharesOutstandingMillions, 'sharesOutstanding'),
    ebitByYear,
  };

  // Shares outstanding is optional - only needed for per-share outputs
  const hasSharesOutstanding = normalized.sharesOutstandingMillions > 0;
  if (!hasSharesOutstanding) {
    console.warn('[dcfGenerator] Shares outstanding missing or invalid - per-share metrics will be unavailable');
  }

  try {
    validateMillions(revenueByYear[0], 'First year revenue', 1, 10_000_000);
    validateMillions(normalized.netDebtMillions, 'Net debt', -10_000_000, 10_000_000);
    validateMillions(normalized.sharesOutstandingMillions, 'Shares outstanding', 0.1, 100_000);
  } catch (err) {
    console.warn('[normalizeDCFInputs] Validation warning:', err);
  }

  console.log('[normalizeDCFInputs] Normalized:', {
    ticker: normalized.ticker,
    years: normalized.years,
    units: UNITS,
    revenue: normalized.revenueByYear.map((r) => formatMillions(r)),
    ebitMargin: `${(normalized.ebitMargin * 100).toFixed(1)}%`,
    taxRate: `${(normalized.taxRate * 100).toFixed(1)}%`,
    wacc: `${(normalized.wacc * 100).toFixed(1)}%`,
    netDebt: formatMillions(normalized.netDebtMillions),
    shares: `${normalized.sharesOutstandingMillions.toFixed(1)}M`,
  });

  return normalized;
}

/**
 * Compute DCF series - ALL MATH IN TYPESCRIPT
 */
export function computeDCFSeries(inputs: DCFInputs): DCFResults {
  console.log('[computeDCFSeries] Computing DCF for', inputs.ticker);
  
  const {
    years,
    revenueByYear,
    ebitMargin,
    taxRate,
    daPercentOfRevenue,
    changeInWCPercentOfRevenue,
    capexPercentOfRevenue,
    wacc,
    terminalGrowth,
    netDebtMillions,
    sharesOutstandingMillions,
    ebitByYear: providedEbitByYear,
  } = inputs;
  
  const n = years.length;
  
  const ebitByYear: number[] = [];
  const taxesByYear: number[] = [];
  const nopatByYear: number[] = [];
  const daByYear: number[] = [];
  const deltaWCByYear: number[] = [];
  const capexByYear: number[] = [];
  const ufcfByYear: number[] = [];
  const discountFactors: number[] = [];
  const pvUfcfByYear: number[] = [];
  
  for (let i = 0; i < n; i++) {
    const rev = revenueByYear[i];
    
    // EBIT: use provided or calculate from margin
    const ebit = providedEbitByYear ? providedEbitByYear[i] : rev * ebitMargin;
    
    // Taxes: negative cash outflow
    const taxes = -ebit * taxRate;
    
    // NOPAT: EBIT - Taxes (or EBIT + taxes since taxes is negative)
    const nopat = ebit + taxes;
    
    // D&A: positive non-cash add-back
    const dAndA = rev * daPercentOfRevenue;
    
    // ΔWC: negative if investment in working capital
    const deltaWC = -rev * changeInWCPercentOfRevenue;
    
    // Capex: negative cash outflow
    const capex = -rev * capexPercentOfRevenue;
    
    // UFCF = NOPAT + D&A + ΔWC + Capex
    const ufcf = nopat + dAndA + deltaWC + capex;
    
    // Discount factor: 1 / (1 + WACC)^t
    const t = i + 1;
    const df = 1 / Math.pow(1 + wacc, t);
    
    // PV of UFCF
    const pv = ufcf * df;
    
    ebitByYear.push(ebit);
    taxesByYear.push(taxes);
    nopatByYear.push(nopat);
    daByYear.push(dAndA);
    deltaWCByYear.push(deltaWC);
    capexByYear.push(capex);
    ufcfByYear.push(ufcf);
    discountFactors.push(df);
    pvUfcfByYear.push(pv);
  }
  
  // Terminal value calculation
  const lastUfcf = ufcfByYear[n - 1];
  const terminalValue = lastUfcf * (1 + terminalGrowth) / (wacc - terminalGrowth);
  const terminalDiscountFactor = 1 / Math.pow(1 + wacc, n);
  const pvTerminalValue = terminalValue * terminalDiscountFactor;
  
  // Valuation
  const pvExplicitFCF = pvUfcfByYear.reduce((sum, v) => sum + v, 0);
  const enterpriseValue = pvExplicitFCF + pvTerminalValue;
  const equityValue = enterpriseValue - netDebtMillions;
  
  // Per-share calculation: only compute if shares outstanding is available
  const pricePerShare = sharesOutstandingMillions > 0 
    ? equityValue / sharesOutstandingMillions 
    : null;
  
  const notes: string[] = [];
  if (equityValue <= 0) {
    notes.push('Equity value is negative due to net debt exceeding enterprise value.');
  }
  // Note: Removed warning for missing shares outstanding - UI should handle this gracefully without banner
  
  console.log('[computeDCFSeries] Results:', {
    ticker: inputs.ticker,
    pvExplicitFCF: formatMillions(pvExplicitFCF),
    pvTerminalValue: formatMillions(pvTerminalValue),
    enterpriseValue: formatMillions(enterpriseValue),
    netDebt: formatMillions(netDebtMillions),
    equityValue: formatMillions(equityValue),
    pricePerShare: pricePerShare !== null ? `$${pricePerShare.toFixed(2)}` : 'N/A',
    sharesOutstanding: `${sharesOutstandingMillions.toFixed(1)}M`,
    notes,
  });
  
  return {
    ebitByYear,
    taxesByYear,
    nopatByYear,
    daByYear,
    deltaWCByYear,
    capexByYear,
    ufcfByYear,
    discountFactors,
    pvUfcfByYear,
    terminalValue,
    pvTerminalValue,
    pvExplicitFCF,
    enterpriseValue,
    equityValue,
    pricePerShare,
    isValid: true,
    invalidReason: null,
    notes: notes.length > 0 ? notes : undefined,
  };
}

/**
 * Generate DCF Excel workbook
 */
export async function generateBankerDCF(
  inputs: DCFInputs,
  results: DCFResults
): Promise<ExcelJS.Workbook> {
  console.log('[generateBankerDCF] Building DCF workbook for', inputs.ticker);

  if (!results.isValid) {
    throw new Error('Refusing to generate Excel for invalid DCF');
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('DCF Model');
  const { sharesRow, evRow, netDebtRow, equityRow } = buildDCFSheet(sheet, inputs, results);

  // Add named ranges for all valuation outputs
  // This ensures deterministic access to values even if cell positions change
  const sheetName = sheet.name;
  
  // Units metadata (CB_META_UNITS = "mm" for millions)
  // Store in a dedicated metadata cell (use row 1, column 3 as metadata cell)
  const metaUnitsRow = 1;
  const metaUnitsCol = 'C';
  const metaUnitsCell = sheet.getCell(metaUnitsRow, 3);
  metaUnitsCell.value = 'mm'; // Always millions for DCF models
  metaUnitsCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF808080' } };
  const metaUnitsAddress = `${quoteSheetName(sheetName)}!$${metaUnitsCol}$${metaUnitsRow}`;
  addNamedRangeSafe(workbook, { 
    name: 'CB_META_UNITS', 
    ref: metaUnitsAddress,
    context: { modelType: 'dcf', sheet: sheetName }
  });

  console.log(`[generateBankerDCF] ✅ Named range CB_META_UNITS created: ${metaUnitsAddress} = "mm"`);
  
  // Enterprise Value
  const evCellAddress = `${quoteSheetName(sheetName)}!$B$${evRow}`;
  addNamedRangeSafe(workbook, { 
    name: 'CB_OUT_ENTERPRISE_VALUE', 
    ref: evCellAddress,
    context: { modelType: 'dcf', sheet: sheetName }
  });
  console.log(`[generateBankerDCF] ✅ Named range CB_OUT_ENTERPRISE_VALUE created: ${evCellAddress}`);
  
  // Net Debt
  const netDebtCellAddress = `${quoteSheetName(sheetName)}!$B$${netDebtRow}`;
  addNamedRangeSafe(workbook, { 
    name: 'CB_OUT_NET_DEBT', 
    ref: netDebtCellAddress,
    context: { modelType: 'dcf', sheet: sheetName }
  });
  console.log(`[generateBankerDCF] ✅ Named range CB_OUT_NET_DEBT created: ${netDebtCellAddress}`);
  
  // Equity Value
  const equityCellAddress = `${quoteSheetName(sheetName)}!$B$${equityRow}`;
  addNamedRangeSafe(workbook, { 
    name: 'CB_OUT_EQUITY_VALUE', 
    ref: equityCellAddress,
    context: { modelType: 'dcf', sheet: sheetName }
  });
  console.log(`[generateBankerDCF] ✅ Named range CB_OUT_EQUITY_VALUE created: ${equityCellAddress}`);
  
  // Shares Outstanding
  const sharesCellAddress = `${quoteSheetName(sheetName)}!$B$${sharesRow}`;
  addNamedRangeSafe(workbook, { 
    name: 'CB_OUT_SHARES_OUT', 
    ref: sharesCellAddress,
    context: { modelType: 'dcf', sheet: sheetName }
  });
  console.log(`[generateBankerDCF] ✅ Named range CB_OUT_SHARES_OUT created: ${sharesCellAddress}`);
  
  // Price Per Share (if available)
  if (results.pricePerShare !== null && Number.isFinite(results.pricePerShare)) {
    const priceRow = sharesRow + 1; // Price Per Share is right after Shares Outstanding
    const priceCellAddress = `${quoteSheetName(sheetName)}!$B$${priceRow}`;
    addNamedRangeSafe(workbook, { 
      name: 'CB_OUT_PRICE_PER_SHARE', 
      ref: priceCellAddress,
      context: { modelType: 'dcf', sheet: sheetName }
    });
    console.log(`[generateBankerDCF] ✅ Named range CB_OUT_PRICE_PER_SHARE created: ${priceCellAddress}`);
  }

  const debugSheet = workbook.addWorksheet('RAW_INPUTS');
  buildDebugSheet(debugSheet, inputs, results);

  console.log('[generateBankerDCF] ✅ DCF generation complete for', inputs.ticker);

  return workbook;
}

/**
 * Build the main DCF sheet
 */
function buildDCFSheet(
  sheet: ExcelJS.Worksheet,
  inputs: DCFInputs,
  results: DCFResults
): { sharesRow: number; evRow: number; netDebtRow: number; equityRow: number; priceRow: number | null } {
  if (!results.isValid) {
    throw new Error('Refusing to generate Excel for invalid DCF');
  }
  const COLORS = {
    HEADER: 'FF4472C4',
    SUB_HEADER: 'FFD9D9D9',
    ASSUMPTION: 'FFFFFF00',
    RESULT: 'FF00B050',
  };
  
  let row = 1;
  
  // Title
  sheet.getCell(row, 1).value = `${inputs.ticker} - Discounted Cash Flow Model`;
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  sheet.mergeCells(row, 1, row, 8);
  row++;
  
  const unitsLabel = UNITS.replace('_', ' ').replace('MILLIONS', 'Millions');
  // Subtitle
  sheet.getCell(row, 1).value = `Units: ${unitsLabel}`;
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 10, italic: true };
  row += 2;
  
  // Years header
  sheet.getCell(row, 1).value = 'Fiscal Year';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true };
  for (let i = 0; i < inputs.years.length; i++) {
    sheet.getCell(row, i + 2).value = inputs.years[i];
    sheet.getCell(row, i + 2).font = { name: 'Calibri', size: 10, bold: true };
    sheet.getCell(row, i + 2).alignment = { horizontal: 'center' };
  }
  row++;
  
  // Revenue
  sheet.getCell(row, 1).value = 'Revenue';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true };
  for (let i = 0; i < inputs.revenueByYear.length; i++) {
    sheet.getCell(row, i + 2).value = inputs.revenueByYear[i];
    sheet.getCell(row, i + 2).numFmt = '$#,##0';
  }
  const revenueRow = row;
  row++;
  
  // Revenue Growth
  sheet.getCell(row, 1).value = 'Revenue Growth';
  for (let i = 0; i < inputs.revenueByYear.length; i++) {
    if (i === 0) {
      sheet.getCell(row, i + 2).value = '-';
    } else {
      const growth = (inputs.revenueByYear[i] / inputs.revenueByYear[i - 1]) - 1;
      sheet.getCell(row, i + 2).value = growth;
      sheet.getCell(row, i + 2).numFmt = '0.0%';
    }
  }
  row += 2;
  
  // Operating Metrics Section
  sheet.getCell(row, 1).value = 'OPERATING METRICS';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  sheet.mergeCells(row, 1, row, 8);
  row++;
  
  // EBIT
  sheet.getCell(row, 1).value = 'EBIT';
  for (let i = 0; i < results.ebitByYear.length; i++) {
    sheet.getCell(row, i + 2).value = results.ebitByYear[i];
    sheet.getCell(row, i + 2).numFmt = '$#,##0';
  }
  row++;
  
  // EBIT Margin
  sheet.getCell(row, 1).value = 'EBIT Margin';
  sheet.getCell(row, 2).value = inputs.ebitMargin;
  sheet.getCell(row, 2).numFmt = '0.0%';
  sheet.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ASSUMPTION } };
  row++;
  
  // Tax Rate
  sheet.getCell(row, 1).value = 'Tax Rate';
  sheet.getCell(row, 2).value = inputs.taxRate;
  sheet.getCell(row, 2).numFmt = '0.0%';
  sheet.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ASSUMPTION } };
  row++;
  
  // Taxes
  sheet.getCell(row, 1).value = 'Taxes';
  for (let i = 0; i < results.taxesByYear.length; i++) {
    sheet.getCell(row, i + 2).value = results.taxesByYear[i];
    sheet.getCell(row, i + 2).numFmt = '($#,##0)';
  }
  row++;
  
  // NOPAT
  sheet.getCell(row, 1).value = 'NOPAT';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true };
  for (let i = 0; i < results.nopatByYear.length; i++) {
    sheet.getCell(row, i + 2).value = results.nopatByYear[i];
    sheet.getCell(row, i + 2).numFmt = '$#,##0';
    sheet.getCell(row, i + 2).font = { name: 'Calibri', size: 10, bold: true };
  }
  row += 2;
  
  // Free Cash Flow Section
  sheet.getCell(row, 1).value = 'FREE CASH FLOW';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  sheet.mergeCells(row, 1, row, 8);
  row++;
  
  // NOPAT (repeated)
  sheet.getCell(row, 1).value = 'NOPAT';
  for (let i = 0; i < results.nopatByYear.length; i++) {
    sheet.getCell(row, i + 2).value = results.nopatByYear[i];
    sheet.getCell(row, i + 2).numFmt = '$#,##0';
  }
  row++;
  
  // D&A
  sheet.getCell(row, 1).value = '+ D&A';
  for (let i = 0; i < results.daByYear.length; i++) {
    sheet.getCell(row, i + 2).value = results.daByYear[i];
    sheet.getCell(row, i + 2).numFmt = '$#,##0';
  }
  row++;
  
  // ΔWC
  sheet.getCell(row, 1).value = '- Δ Working Capital';
  for (let i = 0; i < results.deltaWCByYear.length; i++) {
    sheet.getCell(row, i + 2).value = results.deltaWCByYear[i];
    sheet.getCell(row, i + 2).numFmt = '($#,##0)';
  }
  row++;
  
  // Capex
  sheet.getCell(row, 1).value = '- Capex';
  for (let i = 0; i < results.capexByYear.length; i++) {
    sheet.getCell(row, i + 2).value = results.capexByYear[i];
    sheet.getCell(row, i + 2).numFmt = '($#,##0)';
  }
  row++;
  
  // UFCF
  sheet.getCell(row, 1).value = 'Unlevered Free Cash Flow';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true };
  for (let i = 0; i < results.ufcfByYear.length; i++) {
    sheet.getCell(row, i + 2).value = results.ufcfByYear[i];
    sheet.getCell(row, i + 2).numFmt = '$#,##0';
    sheet.getCell(row, i + 2).font = { name: 'Calibri', size: 10, bold: true };
  }
  row += 2;
  
  // Valuation Section
  sheet.getCell(row, 1).value = 'VALUATION';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getCell(row, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.HEADER } };
  sheet.mergeCells(row, 1, row, 8);
  row++;
  
  // Discount factors
  sheet.getCell(row, 1).value = 'Discount Factor';
  for (let i = 0; i < results.discountFactors.length; i++) {
    sheet.getCell(row, i + 2).value = results.discountFactors[i];
    sheet.getCell(row, i + 2).numFmt = '0.000';
  }
  row++;
  
  // PV of UFCF
  sheet.getCell(row, 1).value = 'PV of UFCF';
  for (let i = 0; i < results.pvUfcfByYear.length; i++) {
    sheet.getCell(row, i + 2).value = results.pvUfcfByYear[i];
    sheet.getCell(row, i + 2).numFmt = '$#,##0';
  }
  row += 2;
  
  // WACC
  sheet.getCell(row, 1).value = 'WACC';
  sheet.getCell(row, 2).value = inputs.wacc;
  sheet.getCell(row, 2).numFmt = '0.0%';
  sheet.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ASSUMPTION } };
  row++;
  
  // Terminal Growth
  sheet.getCell(row, 1).value = 'Terminal Growth Rate';
  sheet.getCell(row, 2).value = inputs.terminalGrowth;
  sheet.getCell(row, 2).numFmt = '0.0%';
  sheet.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.ASSUMPTION } };
  row += 2;
  
  // PV of Explicit FCF
  sheet.getCell(row, 1).value = 'PV of Explicit FCF';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true };
  sheet.getCell(row, 2).value = results.pvExplicitFCF;
  sheet.getCell(row, 2).numFmt = '$#,##0';
  sheet.getCell(row, 2).font = { name: 'Calibri', size: 10, bold: true };
  row++;
  
  // Terminal Value
  sheet.getCell(row, 1).value = 'Terminal Value';
  sheet.getCell(row, 2).value = results.terminalValue;
  sheet.getCell(row, 2).numFmt = '$#,##0';
  row++;
  
  // PV of Terminal Value
  sheet.getCell(row, 1).value = 'PV of Terminal Value';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 10, bold: true };
  sheet.getCell(row, 2).value = results.pvTerminalValue;
  sheet.getCell(row, 2).numFmt = '$#,##0';
  sheet.getCell(row, 2).font = { name: 'Calibri', size: 10, bold: true };
  row += 2;
  
  // Enterprise Value
  sheet.getCell(row, 1).value = 'Enterprise Value';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 11, bold: true };
  const evCell = sheet.getCell(row, 2);
  evCell.value = results.enterpriseValue;
  evCell.numFmt = '$#,##0';
  evCell.font = { name: 'Calibri', size: 11, bold: true };
  evCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RESULT } };
  const evRow = row;
  row++;
  
  // Net Debt
  sheet.getCell(row, 1).value = '- Net Debt';
  const netDebtCell = sheet.getCell(row, 2);
  netDebtCell.value = inputs.netDebtMillions;
  netDebtCell.numFmt = '$#,##0';
  const netDebtRow = row;
  row++;
  
  // Equity Value
  sheet.getCell(row, 1).value = 'Equity Value';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 11, bold: true };
  const equityCell = sheet.getCell(row, 2);
  equityCell.value = results.equityValue;
  equityCell.numFmt = '$#,##0';
  equityCell.font = { name: 'Calibri', size: 11, bold: true };
  equityCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RESULT } };
  const equityRow = row;
  row += 2;
  
  // Shares Outstanding - ALWAYS written for deterministic output
  const sharesLabel = inputs.sharesSource === 'capTable' 
    ? 'Shares Outstanding (mm) [Cap Table]'
    : inputs.sharesSource === 'marketData'
    ? 'Shares Outstanding (mm) [Market Data]'
    : 'Shares Outstanding (mm)';
  sheet.getCell(row, 1).value = sharesLabel;
  // Always write shares value (even if 0) - ensures named range exists
  const sharesValue = inputs.sharesOutstandingMillions ?? 0;
  const sharesCell = sheet.getCell(row, 2);
  sharesCell.value = sharesValue;
  sharesCell.numFmt = '#,##0.0';
  // Store row for named range creation
  const sharesRow = row;
  row++;
  
  // Price Per Share
  sheet.getCell(row, 1).value = 'Price Per Share';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 12, bold: true };
  if (typeof results.pricePerShare === 'number' && Number.isFinite(results.pricePerShare)) {
    sheet.getCell(row, 2).value = results.pricePerShare;
    sheet.getCell(row, 2).numFmt = '$#,##0.00';
  } else {
    sheet.getCell(row, 2).value = 'N/A';
  }
  sheet.getCell(row, 2).font = { name: 'Calibri', size: 12, bold: true };
  sheet.getCell(row, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.RESULT } };
  
  // Set column widths
  sheet.getColumn(1).width = 30;
  for (let i = 2; i <= 8; i++) {
    sheet.getColumn(i).width = 15;
  }
  
  // Return all valuation output rows for named range creation
  return { sharesRow, evRow, netDebtRow, equityRow };
}

/**
 * Build debug sheet with raw inputs and results
 */
function buildDebugSheet(
  sheet: ExcelJS.Worksheet,
  inputs: DCFInputs,
  results: DCFResults
): void {
  if (!results.isValid) {
    throw new Error('Refusing to generate Excel for invalid DCF');
  }
  let row = 1;
  
  sheet.getCell(row, 1).value = 'DCF DEBUG - RAW INPUTS AND RESULTS';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 12, bold: true };
  row += 2;
  
  // Inputs
  sheet.getCell(row, 1).value = 'INPUTS';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 11, bold: true };
  row++;
  
  const inputData = [
    ['Ticker', inputs.ticker],
    ['Company', inputs.companyName],
    ['Units', UNITS],
    ['Years', JSON.stringify(inputs.years)],
    ['Revenue (mm)', JSON.stringify(inputs.revenueByYear)],
    ['EBIT Margin', inputs.ebitMargin],
    ['Tax Rate', inputs.taxRate],
    ['D&A % Revenue', inputs.daPercentOfRevenue],
    ['ΔWC % Revenue', inputs.changeInWCPercentOfRevenue],
    ['Capex % Revenue', inputs.capexPercentOfRevenue],
    ['WACC', inputs.wacc],
    ['Terminal Growth', inputs.terminalGrowth],
    ['Net Debt (mm)', inputs.netDebtMillions],
    ['Shares (mm)', inputs.sharesOutstandingMillions],
  ];
  
  for (const [label, value] of inputData) {
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 2).value = value;
    row++;
  }
  
  row += 2;
  
  // Results
  sheet.getCell(row, 1).value = 'RESULTS';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 11, bold: true };
  row++;
  
  const resultData = [
    ['PV Explicit FCF (mm)', results.pvExplicitFCF],
    ['Terminal Value (mm)', results.terminalValue],
    ['PV Terminal Value (mm)', results.pvTerminalValue],
    ['Enterprise Value (mm)', results.enterpriseValue],
    ['Equity Value (mm)', results.equityValue],
    ['Price Per Share', results.pricePerShare],
  ];

  for (const [label, value] of resultData) {
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 2).value =
      typeof value === 'number' && Number.isFinite(value)
        ? value.toFixed(2)
        : value === null || value === undefined
        ? 'N/A'
        : value;
    row++;
  }

  row += 2;
  sheet.getCell(row, 1).value = 'VALIDATION';
  sheet.getCell(row, 1).font = { name: 'Calibri', size: 11, bold: true };
  row++;
  sheet.getCell(row, 1).value = 'Status';
  sheet.getCell(row, 2).value = results.isValid ? 'Valid' : 'Invalid';
  row++;
  sheet.getCell(row, 1).value = 'Invalid reason';
  sheet.getCell(row, 2).value = results.invalidReason ?? 'None';
  row++;
  if (results.notes && results.notes.length > 0) {
    sheet.getCell(row, 1).value = 'Notes';
    sheet.getCell(row, 2).value = results.notes.join(' | ');
    row++;
  }

  sheet.getColumn(1).width = 25;
  sheet.getColumn(2).width = 50;
}
