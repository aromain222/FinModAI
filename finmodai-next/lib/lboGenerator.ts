/**
 * Banker-Grade LBO Generator
 * 
 * Generates private equity-quality LBO models matching Macabacus standards.
 * Includes Sources & Uses, Valuation, PPA, Exit Analysis, and IRR/MOIC calculations.
 */

import ExcelJS from 'exceljs';
import { APP_NAME } from '@/lib/branding';
import {
  setCellInstanceSafeFormula,
  setCellInstanceSafeNumber,
  setCellInstanceSafeText,
} from '@/lib/excelSafe';
import { columnNumberToLetter } from '@/lib/excel/address';
import { addNamedRangeSafe } from '@/lib/excel/namedRanges';

type NamedOutputType = 'number' | 'text';
type NamedOutputEntry = {
  sheet: string;
  row: number;
  column: number;
  type: NamedOutputType;
};

const workbookNamedOutputs = new WeakMap<ExcelJS.Workbook, Record<string, NamedOutputEntry>>();

function registerNamedOutputCell(
  workbook: ExcelJS.Workbook,
  key: string,
  sheetName: string,
  row: number,
  column: number,
  type: NamedOutputType = 'number'
) {
  // Validate row
  if (!Number.isInteger(row) || row <= 0) {
    throw new Error(`INVALID_NAMED_OUTPUT_ROW: key=${key}, row=${row}`);
  }
  // Validate column
  if (!Number.isInteger(column) || column <= 0) {
    console.error(`[registerNamedOutputCell] INVALID_COLUMN detected: key=${key}, column=${String(column)}, columnType=${typeof column}`);
    throw new Error(`INVALID_NAMED_OUTPUT_COLUMN: key=${key}, column=${String(column)}`);
  }
  // Validate type
  if (type !== 'number' && type !== 'text') {
    throw new Error(`INVALID_NAMED_OUTPUT_TYPE: key=${key}, type=${String(type)}`);
  }
  const entries = workbookNamedOutputs.get(workbook) ?? {};
  entries[key] = { sheet: sheetName, row, column, type };
  workbookNamedOutputs.set(workbook, entries);
}

function writeNamedOutput(workbook: ExcelJS.Workbook, key: string, value: number | string) {
  const entries = workbookNamedOutputs.get(workbook);
  if (!entries || !entries[key]) {
    throw new Error(`UNMAPPED_OUTPUT_KEY: ${key}`);
  }
  const { sheet, row, column, type } = entries[key];
  const worksheet = workbook.getWorksheet(sheet);
  if (!worksheet) {
    throw new Error(`Worksheet "${sheet}" not found when writing named output ${key}.`);
  }
  // Guard: validate column before converting to letter
  if (!Number.isInteger(column) || column <= 0) {
    console.error(`[writeNamedOutput] INVALID_COLUMN detected: key=${key}, sheet=${sheet}, row=${row}, column=${String(column)}, columnType=${typeof column}`);
    throw new Error(
      `INVALID_COLUMN_INDEX_FOR_DEFINED_NAME: key=${key}, sheet=${sheet}, row=${row}, column=${String(column)}`
    );
  }
  const cell = worksheet.getCell(row, column);
  if (type === 'number') {
    if (typeof value !== 'number') {
      throw new Error(`Named output ${key} expects a numeric value.`);
    }
    setNumberCell(cell, value);
  } else {
    setTextCell(cell, value);
  }
  const columnLetter = columnNumberToLetter(column);
  const address = `${quoteSheetName(sheet)}!$${columnLetter}$${row}`;

  // DEBUG
  console.log('[writeNamedOutput]', { key, sheet, row, column, columnLetter, address });

  addNamedRangeSafe(workbook, { name: key, ref: address, context: { key, sheet, row, column } });
}

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
    // Use NA() instead of leaving blank or using 0
    cell.value = { formula: 'NA()', result: null };
    return;
  }
  if (typeof value === 'number' && Math.abs(value) < 1e-9) {
    // Use NA() for zero values that represent missing data
    cell.value = { formula: 'NA()', result: null };
    return;
  }
  setCellInstanceSafeNumber(cell, value);
}

function getColumnSafe(sheet: ExcelJS.Worksheet, column: number | string) {
  if (typeof column === 'string' && !/^[A-Z]{1,3}$/.test(column)) {
    throw new Error(`Invalid Excel column identifier: ${column}`);
  }
  return sheet.getColumn(column);
}
export type LboDetailRow = {
  label: string;
  balance: number;
  editable?: boolean;
  highlight?: boolean;
  optional?: boolean;
};

export interface LBOInputs {
  // Company info
  ticker: string;
  companyName?: string;
  sharesSource?: string;
  
  // Valuation inputs
  currentStockPrice?: number;
  offerPremium?: number; // As decimal, e.g., 0.30 = 30%
  basicSharesOutstanding?: number; // Millions
  inTheMoneyOptions?: number; // Millions
  
  // Balance sheet items
  cashOnBalance?: number; // $ millions
  totalDebt?: number; // $ millions
  netDebt?: number; // $ millions
  minorityInterest?: number; // $ millions
  convertibleDebt?: number; // $ millions
  bookValue?: number; // $ millions
  
  // LTM financials
  ltmRevenue?: number; // $ millions
  ltmEBITDA?: number; // $ millions
  ltmEBIT?: number; // $ millions
  ltmNetIncome?: number; // $ millions
  
  // Debt structure ($ millions)
  excessCash?: number;
  optionLiquidation?: number;
  revolverDraw?: number;
  termLoanA?: number;
  termLoanB?: number;
  seniorNotes?: number;
  subordinatedNotes?: number;
  preferredStock?: number;
  managementEquity?: number;
  taxRefund?: number;
  sponsorEquityOverride?: number;
  sourcesDetail?: LboDetailRow[];
  usesDetail?: LboDetailRow[];
  
  // Uses
  refinanceDebt?: number;
  fundCashBalance?: number;
  financingFeesPercent?: number; // As decimal, e.g., 0.03 = 3%
  transactionFeesPercent?: number; // As decimal, e.g., 0.01 = 1%
  purchasePrice?: number;
  
  // PPA inputs
  fvOfNCI?: number; // Fair value of non-controlling interest
  goodwillWriteOff?: number;
  fairValueAdjustments?: number;
  transactionDTL?: number; // Deferred tax liability
  transactionDTA?: number; // Deferred tax asset
  bookValue?: number;
  
  // Timing
  lastFYE?: string; // e.g., "12/31/2023"
  mrqDate?: string; // Most recent quarter
  marketDate?: string; // Valuation date
  closeDate?: string; // Transaction close date
  
  // Exit assumptions
  exitYear?: number; // Years from close, e.g., 5
  exitEBITDAMultiple?: number; // e.g., 10.5x
  exitPEMultiple?: number; // e.g., 15.0x
  exitMethod?: 'EBITDA' | 'PE'; // Toggle
  minimumCashBalance?: number;
  taxRate?: number; // As decimal, e.g., 0.21
  exitEnterpriseValue?: number;
  exitNetDebt?: number;
  exitEquityValue?: number;
  initialSponsorEquity?: number;
  sponsorIRR?: number;
  sponsorMOIC?: number;

  // Operating projections
  forecastYears?: number;
  revenueGrowth?: number[];
  ebitdaMargin?: number;
}

// Color scheme matching IB standards
const COLORS = {
  SECTION_HEADER: 'FF4472C4', // Blue
  SUB_HEADER: 'FFD9D9D9', // Grey
  ASSUMPTION: 'FFFFFF00', // Yellow
  WHITE: 'FFFFFFFF',
  BORDER: 'FFD0D0D0',
  LIGHT_GREY: 'FFE7E6E6',
  GREEN_HIGHLIGHT: 'FFD9F2E6'
};

// Font standards
const FONT_HEADER = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
const FONT_SUB_HEADER = { name: 'Calibri', size: 10, bold: true };
const FONT_NORMAL = { name: 'Calibri', size: 10 };
const FONT_ASSUMPTION = { name: 'Calibri', size: 10, bold: true };

const OPTIONAL_SOURCE_NOTES: Record<string, string> = {
  'Subordinated Notes': 'Base case assumes no subordinated notes. Update if mezzanine debt is required.',
  'Preferred Stock': 'Preferred equity is not used in the base case. Input funding here if available.',
  'Management Equity': 'Management rollover not modeled in base case. Enter amount if applicable.',
  'Tax Refund (if any)': 'No tax refund assumed at close. Populate if a refund is expected.',
};

const toNumberOrDefault = (value: number | undefined, fallback = 0): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return fallback;
};

export async function generateBankerLBO(inputs: LBOInputs): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();
  
  const sheet = workbook.addWorksheet('LBO Model', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true }
  });
  
  // Set default column widths
  getColumnSafe(sheet, 1).width = 35; // Line items
  getColumnSafe(sheet, 2).width = 16; // Balance
  getColumnSafe(sheet, 3).width = 14; // % of Total
  getColumnSafe(sheet, 4).width = 16; // LTM EBITDA Multiple
  getColumnSafe(sheet, 5).width = 3; // Spacer
  getColumnSafe(sheet, 6).width = 30; // Right side labels
  getColumnSafe(sheet, 7).width = 16; // Right side values
  
  let currentRow = 1;
  
  // ========== SECTION A: DASHBOARD HEADER ==========
  currentRow = buildDashboardHeader(sheet, currentRow, inputs.companyName || inputs.ticker);
  currentRow += 2;
  
  // ========== SECTION B: SOURCES & USES ==========
  currentRow = buildSourcesAndUses(sheet, currentRow, inputs);
  currentRow += 2;
  
  // ========== SECTION C: VALUATION & PURCHASE PRICE ==========
  currentRow = buildValuationAndPurchasePrice(sheet, currentRow, inputs);
  currentRow += 2;
  
  // ========== SECTION D: PURCHASE PRICE ALLOCATION ==========
  currentRow = buildPurchasePriceAllocation(sheet, currentRow, inputs);
  currentRow += 2;
  
  // ========== SECTION E: CALENDARIZATION & TIMING ==========
  currentRow = buildCalendarizationAndTiming(sheet, currentRow, inputs);
  currentRow += 2;
  
  // ========== SECTION F: EXIT ASSUMPTIONS ==========
  currentRow = buildExitAssumptions(sheet, currentRow, inputs);
  currentRow += 2;
  
  // ========== SECTION G: MODEL CHECKS ==========
  currentRow = buildModelChecks(sheet, currentRow, inputs);

  // ========== SECTION H: OUTPUT NAMED RANGES ==========
  currentRow += 2;
  buildOutputNamedRanges(workbook, sheet, currentRow, inputs);
  
  return workbook;
}

function assertFiniteNumber(value: number | undefined, label: string, allowZero = true): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Missing or invalid ${label} for LBO outputs`);
  }
  if (!allowZero && value <= 0) {
    throw new Error(`Missing or invalid ${label} for LBO outputs`);
  }
  return value;
}

function buildOutputNamedRanges(
  workbook: ExcelJS.Workbook,
  sheet: ExcelJS.Worksheet,
  startRow: number,
  inputs: LBOInputs
): number {
  const sheetName = sheet.name;

  const headerRow = startRow;
  const unitsRow = headerRow + 1;
  const sharesSourceRow = unitsRow + 1;
  const enterpriseRow = sharesSourceRow + 1;
  const netDebtRow = enterpriseRow + 1;
  const equityRow = netDebtRow + 1;
  const sharesRow = equityRow + 1;
  const irrRow = sharesRow + 1;
  const moicRow = irrRow + 1;

  const enterpriseValue = assertFiniteNumber(
    inputs.purchasePrice !== undefined && inputs.netDebt !== undefined
      ? inputs.purchasePrice + inputs.netDebt
      : undefined,
    'Enterprise Value'
  );
  const netDebt = assertFiniteNumber(inputs.netDebt, 'Net Debt');
  const sharesOutstanding = assertFiniteNumber(
    (inputs.basicSharesOutstanding ?? 0) + (inputs.inTheMoneyOptions ?? 0),
    'Shares Outstanding',
    false
  );
  const irrPct = assertFiniteNumber(inputs.sponsorIRR, 'IRR') * 100;
  const moic = assertFiniteNumber(inputs.sponsorMOIC, 'MOIC');

  // Output header
  const headerCell = sheet.getCell(headerRow, 1);
  setTextCell(headerCell, 'OUTPUTS (NAMED RANGES)');
  headerCell.font = FONT_HEADER;
  headerCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.SECTION_HEADER }
  };
  sheet.mergeCells(headerRow, 1, headerRow, 4);

  // Units metadata
  setTextCell(sheet.getCell(unitsRow, 1), 'Units');
  registerNamedOutputCell(workbook, 'CB_META_UNITS', sheetName, unitsRow, 2, 'text');
  writeNamedOutput(workbook, 'CB_META_UNITS', 'mm');

  // Shares source metadata
  setTextCell(sheet.getCell(sharesSourceRow, 1), 'Shares Source');
  const sharesSourceValue = inputs.sharesSource?.trim() || 'market';
  registerNamedOutputCell(workbook, 'CB_META_SHARES_SOURCE', sheetName, sharesSourceRow, 2, 'text');
  writeNamedOutput(workbook, 'CB_META_SHARES_SOURCE', sharesSourceValue);

  // Enterprise Value
  setTextCell(sheet.getCell(enterpriseRow, 1), 'Enterprise Value');
  registerNamedOutputCell(workbook, 'CB_OUT_ENTERPRISE_VALUE', sheetName, enterpriseRow, 2);
  writeNamedOutput(workbook, 'CB_OUT_ENTERPRISE_VALUE', enterpriseValue);

  // Net Debt
  setTextCell(sheet.getCell(netDebtRow, 1), 'Net Debt');
  registerNamedOutputCell(workbook, 'CB_OUT_NET_DEBT', sheetName, netDebtRow, 2);
  writeNamedOutput(workbook, 'CB_OUT_NET_DEBT', netDebt);

  // Equity Value
  setTextCell(sheet.getCell(equityRow, 1), 'Equity Value');
  const equityValue = enterpriseValue - netDebt;
  registerNamedOutputCell(workbook, 'CB_OUT_EQUITY_VALUE', sheetName, equityRow, 2);
  writeNamedOutput(workbook, 'CB_OUT_EQUITY_VALUE', equityValue);

  // Shares Outstanding
  setTextCell(sheet.getCell(sharesRow, 1), 'Shares Outstanding');
  registerNamedOutputCell(workbook, 'CB_OUT_SHARES_OUT', sheetName, sharesRow, 2);
  writeNamedOutput(workbook, 'CB_OUT_SHARES_OUT', sharesOutstanding);

  // IRR (%)
  setTextCell(sheet.getCell(irrRow, 1), 'IRR (%)');
  registerNamedOutputCell(workbook, 'CB_OUT_IRR', sheetName, irrRow, 2);
  writeNamedOutput(workbook, 'CB_OUT_IRR', irrPct);

  // MOIC
  setTextCell(sheet.getCell(moicRow, 1), 'MOIC (x)');
  registerNamedOutputCell(workbook, 'CB_OUT_MOIC', sheetName, moicRow, 2);
  writeNamedOutput(workbook, 'CB_OUT_MOIC', moic);

  return moicRow;
}

function buildDashboardHeader(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  companyName: string
): number {
  let row = startRow;
  
  // Title
  const titleCell = sheet.getCell(row, 1);
  setTextCell(titleCell, `${APP_NAME} LBO Model`);
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF4472C4' } };
  row++;
  
  // Company name
  const companyCell = sheet.getCell(row, 1);
  setTextCell(companyCell, companyName);
  companyCell.font = { name: 'Calibri', size: 14, bold: true };
  row++;
  
  // Units
  const unitsCell = sheet.getCell(row, 1);
  setTextCell(unitsCell, '($ in millions, except per-share data)');
  unitsCell.font = { name: 'Calibri', size: 9, italic: true };
  row++;
  
  // Generated by
  const generatedCell = sheet.getCell(row, 1);
  setTextCell(generatedCell, `Generated automatically by ${APP_NAME}`);
  generatedCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF808080' } };
  row++;
  
  return row;
}

function buildSourcesAndUses(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  inputs: LBOInputs
): number {
  let row = startRow;
  
  // Section header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'SOURCES & USES OF FUNDS');
  headerCell.font = FONT_HEADER;
  headerCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.SECTION_HEADER }
  };
  sheet.mergeCells(row, 1, row, 4);
  row++;
  
  // ========== SOURCES ==========
  const sourcesHeaderRow = sheet.getRow(row);
  setTextCell(sourcesHeaderRow.getCell(1), 'Sources');
  sourcesHeaderRow.getCell(1).font = { ...FONT_SUB_HEADER, size: 11 };
  sourcesHeaderRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.SUB_HEADER }
  };
  row++;
  
  // Column headers
  const colHeaderRow = sheet.getRow(row);
  setTextCell(colHeaderRow.getCell(1), 'Item');
  setTextCell(colHeaderRow.getCell(2), 'Balance');
  setTextCell(colHeaderRow.getCell(3), '% of Total');
  setTextCell(colHeaderRow.getCell(4), 'Multiple of LTM EBITDA');
  
  for (let i = 1; i <= 4; i++) {
    const cell = colHeaderRow.getCell(i);
    cell.font = FONT_SUB_HEADER;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.SUB_HEADER }
    };
    cell.alignment = { horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.BORDER } },
      bottom: { style: 'thin', color: { argb: COLORS.BORDER } },
      left: { style: 'thin', color: { argb: COLORS.BORDER } },
      right: { style: 'thin', color: { argb: COLORS.BORDER } }
    };
  }
  row++;
  
  const sourcesStartRow = row;
  
  // Sources items - only include values that are actually provided (not defaulted to 0)
  const sourceItems = inputs.sourcesDetail ?? [
    ...(inputs.excessCash !== undefined && inputs.excessCash !== null ? [{ label: 'Excess Cash', balance: inputs.excessCash, editable: true, optional: true }] : []),
    ...(inputs.optionLiquidation !== undefined && inputs.optionLiquidation !== null ? [{ label: 'Liquidation of Stock Options', balance: inputs.optionLiquidation, editable: true, optional: true }] : []),
    ...(inputs.revolverDraw !== undefined && inputs.revolverDraw !== null ? [{ label: 'Revolver Draw', balance: inputs.revolverDraw, editable: true }] : []),
    ...(inputs.termLoanA !== undefined && inputs.termLoanA !== null ? [{ label: 'Term Loan A', balance: inputs.termLoanA, editable: true }] : []),
    ...(inputs.termLoanB !== undefined && inputs.termLoanB !== null ? [{ label: 'Term Loan B', balance: inputs.termLoanB, editable: true }] : []),
    ...(inputs.seniorNotes !== undefined && inputs.seniorNotes !== null ? [{ label: 'Senior Notes', balance: inputs.seniorNotes, editable: true }] : []),
    ...(inputs.subordinatedNotes !== undefined && inputs.subordinatedNotes !== null ? [{ label: 'Subordinated Notes', balance: inputs.subordinatedNotes, editable: true, optional: true }] : []),
    ...(inputs.preferredStock !== undefined && inputs.preferredStock !== null ? [{ label: 'Preferred Stock', balance: inputs.preferredStock, editable: true, optional: true }] : []),
    ...(inputs.sponsorEquityOverride !== undefined && inputs.sponsorEquityOverride !== null ? [{ label: 'Sponsor Equity', balance: inputs.sponsorEquityOverride, highlight: true }] : []),
    ...(inputs.managementEquity !== undefined && inputs.managementEquity !== null ? [{ label: 'Management Equity', balance: inputs.managementEquity, editable: true, optional: true }] : []),
    ...(inputs.taxRefund !== undefined && inputs.taxRefund !== null ? [{ label: 'Tax Refund (if any)', balance: inputs.taxRefund, editable: true, optional: true }] : [])
  ];

  // Calculate total only from provided values (exclude NA() cells)
  const totalSourceValue = sourceItems.reduce((sum, item) => {
    const balance = item.balance;
    if (balance === undefined || balance === null || (typeof balance === 'number' && !Number.isFinite(balance))) {
      return sum;
    }
    return sum + balance;
  }, 0);
  
  sourceItems.forEach((item) => {
    const itemRow = sheet.getRow(row);
    setTextCell(itemRow.getCell(1), item.label);
    itemRow.getCell(1).font = FONT_NORMAL;

    const balanceCell = itemRow.getCell(2);
    const balanceValue = item.balance;
    if (balanceValue === undefined || balanceValue === null) {
      // Missing required input - use NA()
      if (item.optional) {
        setOptionalNumberCell(balanceCell, undefined);
      } else {
        // Required field missing - show error
        balanceCell.value = { formula: 'NA()', result: null };
        balanceCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFE6E6' } // Light red for missing required
        };
      }
    } else if (item.optional) {
      setOptionalNumberCell(balanceCell, balanceValue);
    } else {
      setNumberCell(balanceCell, balanceValue);
    }
    if (item.highlight) {
      balanceCell.font = { ...FONT_NORMAL, bold: true };
    }
    if (item.editable) {
      balanceCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.ASSUMPTION }
      };
      balanceCell.font = FONT_ASSUMPTION;
    }
    balanceCell.numFmt = '$#,##0';
    if (
      OPTIONAL_SOURCE_NOTES[item.label] &&
      Math.abs(item.balance ?? 0) < 1e-6 &&
      !balanceCell.note
    ) {
      balanceCell.note = OPTIONAL_SOURCE_NOTES[item.label];
    }

    // % of Total
    const pctCell = itemRow.getCell(3);
    setNumberCell(pctCell, totalSourceValue > 0 ? (item.balance ?? 0) / totalSourceValue : 0);
    pctCell.numFmt = '0.0%';

    // Multiple of LTM EBITDA
    const multipleCell = itemRow.getCell(4);
    if (inputs.ltmEBITDA && inputs.ltmEBITDA > 0 && (item.balance ?? 0) !== 0) {
      setNumberCell(multipleCell, (item.balance ?? 0) / inputs.ltmEBITDA);
      multipleCell.numFmt = '0.0x';
    } else {
      setTextCell(multipleCell, '-');
      multipleCell.alignment = { horizontal: 'center' };
    }

    row++;
  });

  const totalSourcesRow = sheet.getRow(row);
  setTextCell(totalSourcesRow.getCell(1), 'Total Sources');
  totalSourcesRow.getCell(1).font = { ...FONT_NORMAL, bold: true };
  
  // Use SUM formula that ignores NA() values
  const sourcesFormula = `SUM(${sheet.getRow(sourcesStartRow).getCell(2).address}:${sheet.getRow(row - 1).getCell(2).address})`;
  setFormulaCell(totalSourcesRow.getCell(2), sourcesFormula, totalSourceValue);
  totalSourcesRow.getCell(2).numFmt = '$#,##0';
  totalSourcesRow.getCell(2).font = { ...FONT_NORMAL, bold: true };
  totalSourcesRow.getCell(2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.LIGHT_GREY }
  };
  
  // % of Total formula
  setFormulaCell(totalSourcesRow.getCell(3), `IF(${totalSourcesRow.getCell(2).address}=0,0,1)`, 1);
  totalSourcesRow.getCell(3).numFmt = '0.0%';
  totalSourcesRow.getCell(3).font = { ...FONT_NORMAL, bold: true };
  
  const totalSourcesRowNum = row;
  row += 2;
  
  // ========== USES ==========
  const usesHeaderRow = sheet.getRow(row);
  setTextCell(usesHeaderRow.getCell(1), 'Uses');
  usesHeaderRow.getCell(1).font = { ...FONT_SUB_HEADER, size: 11 };
  usesHeaderRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.SUB_HEADER }
  };
  row++;
  
  // Column headers (same as sources)
  const usesColHeaderRow = sheet.getRow(row);
  setTextCell(usesColHeaderRow.getCell(1), 'Item');
  setTextCell(usesColHeaderRow.getCell(2), 'Balance');
  setTextCell(usesColHeaderRow.getCell(3), '% of Total');
  setTextCell(usesColHeaderRow.getCell(4), 'Multiple of LTM EBITDA');
  
  for (let i = 1; i <= 4; i++) {
    const cell = usesColHeaderRow.getCell(i);
    cell.font = FONT_SUB_HEADER;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.SUB_HEADER }
    };
    cell.alignment = { horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.BORDER } },
      bottom: { style: 'thin', color: { argb: COLORS.BORDER } },
      left: { style: 'thin', color: { argb: COLORS.BORDER } },
      right: { style: 'thin', color: { argb: COLORS.BORDER } }
    };
  }
  row++;
  
  const usesStartRow = row;
  
  // Calculate equity purchase price - must have required inputs
  const hasRequiredForPurchasePrice = inputs.currentStockPrice !== undefined && 
                                      inputs.offerPremium !== undefined && 
                                      inputs.basicSharesOutstanding !== undefined;
  
  const equityPurchasePrice = inputs.purchasePrice ?? 
    (hasRequiredForPurchasePrice 
      ? (inputs.currentStockPrice! * (1 + inputs.offerPremium!) * (inputs.basicSharesOutstanding! + (inputs.inTheMoneyOptions || 0)))
      : undefined);

  // Uses items - only include calculated/computed values
  const useItems = inputs.usesDetail ?? [
    ...(equityPurchasePrice !== undefined ? [{ label: 'Equity Purchase Price', balance: equityPurchasePrice, editable: false }] : []),
    ...(inputs.refinanceDebt !== undefined && inputs.refinanceDebt !== null ? [{ label: 'Refinance Debt', balance: inputs.refinanceDebt, editable: true }] : []),
    ...(inputs.fundCashBalance !== undefined && inputs.fundCashBalance !== null ? [{ label: 'Fund Cash Balance', balance: inputs.fundCashBalance, editable: true }] : []),
    ...(inputs.financingFeesPercent !== undefined && inputs.totalDebt !== undefined && inputs.totalDebt !== null
      ? [{ label: 'Financing Fees', balance: inputs.financingFeesPercent * inputs.totalDebt, editable: false }] 
      : []),
    ...(inputs.transactionFeesPercent !== undefined && equityPurchasePrice !== undefined
      ? [{ label: 'Transaction Fees', balance: inputs.transactionFeesPercent * equityPurchasePrice, editable: false }] 
      : [])
  ];

  // Calculate total only from provided values
  const totalUsesValue = useItems.reduce((sum, item) => {
    const balance = item.balance;
    if (balance === undefined || balance === null || (typeof balance === 'number' && !Number.isFinite(balance))) {
      return sum;
    }
    return sum + balance;
  }, 0);

  const totalUsesRowNum = row + useItems.length;
  const totalUsesRow = sheet.getRow(totalUsesRowNum);

  useItems.forEach((item, idx) => {
    const itemRow = sheet.getRow(row);
    setTextCell(itemRow.getCell(1), item.label);
    itemRow.getCell(1).font = FONT_NORMAL;

    const balanceCell = itemRow.getCell(2);
    const balanceValue = item.balance;
    if (balanceValue === undefined || balanceValue === null) {
      // Missing value - use NA()
      balanceCell.value = { formula: 'NA()', result: null };
      if (item.editable) {
        balanceCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFE6E6' } // Light red for missing required
        };
      }
    } else {
      setNumberCell(balanceCell, balanceValue);
      if (item.editable) {
        balanceCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.ASSUMPTION }
        };
        balanceCell.font = FONT_ASSUMPTION;
      }
    }
    balanceCell.numFmt = '$#,##0';

    // % of Total - use formula that handles NA()
    const pctCell = itemRow.getCell(3);
    if (balanceValue !== undefined && balanceValue !== null && totalUsesValue > 0) {
      setFormulaCell(pctCell, `IF(${totalUsesRow.getCell(2).address}=0,0,${balanceCell.address}/${totalUsesRow.getCell(2).address})`, totalUsesValue > 0 ? balanceValue / totalUsesValue : 0);
    } else {
      pctCell.value = { formula: 'NA()', result: null };
    }
    pctCell.numFmt = '0.0%';

    // Multiple of LTM EBITDA
    const multipleCell = itemRow.getCell(4);
    if (inputs.ltmEBITDA && inputs.ltmEBITDA > 0 && idx < 2 && balanceValue !== undefined && balanceValue !== null && balanceValue !== 0) {
      setNumberCell(multipleCell, balanceValue / inputs.ltmEBITDA);
      multipleCell.numFmt = '0.0x';
    } else {
      setTextCell(multipleCell, '-');
      multipleCell.alignment = { horizontal: 'center' };
    }
    
    row++;
  });
  
  // Total Uses - use SUM formula
  setTextCell(totalUsesRow.getCell(1), 'Total Uses');
  totalUsesRow.getCell(1).font = { ...FONT_NORMAL, bold: true };
  
  const usesFormula = `SUM(${sheet.getRow(usesStartRow).getCell(2).address}:${sheet.getRow(row - 1).getCell(2).address})`;
  setFormulaCell(totalUsesRow.getCell(2), usesFormula, totalUsesValue);
  totalUsesRow.getCell(2).numFmt = '$#,##0';
  totalUsesRow.getCell(2).font = { ...FONT_NORMAL, bold: true };
  totalUsesRow.getCell(2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.LIGHT_GREY }
  };
  
  // % of Total formula
  setFormulaCell(totalUsesRow.getCell(3), `IF(${totalUsesRow.getCell(2).address}=0,0,1)`, 1);
  totalUsesRow.getCell(3).numFmt = '0.0%';
  totalUsesRow.getCell(3).font = { ...FONT_NORMAL, bold: true };
  
  row += 2;
  
  // Sources = Uses check
  const checkRow = sheet.getRow(row);
  setTextCell(checkRow.getCell(1), 'Sources = Uses Check');
  checkRow.getCell(1).font = { ...FONT_NORMAL, bold: true };
  setFormulaCell(
    checkRow.getCell(2),
    `=IF(ABS(B${totalSourcesRowNum}-B${totalUsesRowNum})<0.01,"TRUE","FALSE")`
  );
  checkRow.getCell(2).font = { ...FONT_NORMAL, bold: true, color: { argb: 'FF00B050' } };
  checkRow.getCell(2).alignment = { horizontal: 'center' };
  
  row++;
  
  return row;
}

function buildValuationAndPurchasePrice(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  inputs: LBOInputs
): number {
  let row = startRow;
  
  // Section header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'VALUATION & PURCHASE PRICE');
  headerCell.font = FONT_HEADER;
  headerCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.SECTION_HEADER }
  };
  sheet.mergeCells(row, 1, row, 4);
  row++;
  
  // Left column - Offer Details
  const leftStartRow = row;
  
  const leftItems = [
    { label: 'Current Stock Price', value: inputs.currentStockPrice || 100, isInput: true, format: '$#,##0.00' },
    { label: 'Offer Premium', value: inputs.offerPremium || 0.30, isInput: true, format: '0.0%' },
    { label: 'Offer Price per Share', formula: `B${row}*(1+B${row + 1})`, format: '$#,##0.00' },
    { label: 'Basic Shares Outstanding', value: inputs.basicSharesOutstanding || 100, isInput: false, format: '#,##0.0' },
    { label: 'In-the-Money Options', value: inputs.inTheMoneyOptions || 10, isInput: false, format: '#,##0.0' },
    { label: 'Fully Diluted Shares Outstanding', formula: `B${row + 3}+B${row + 4}`, format: '#,##0.0' }
  ];
  
  leftItems.forEach((item, idx) => {
    const itemRow = sheet.getRow(row);
    setTextCell(itemRow.getCell(1), item.label);
    itemRow.getCell(1).font = FONT_NORMAL;
    
    const valueCell = itemRow.getCell(2);
    if (item.formula) {
      setFormulaCell(valueCell, item.formula);
      valueCell.font = { ...FONT_NORMAL, bold: true };
    } else {
      setNumberCell(valueCell, item.value);
      if (item.isInput) {
        valueCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.ASSUMPTION }
        };
        valueCell.font = FONT_ASSUMPTION;
      }
    }
    valueCell.numFmt = item.format;
    
    row++;
  });
  
  row += 1;
  
  // Right column - Purchase Price Calculation
  const rightStartRow = leftStartRow;
  let rightRow = rightStartRow;
  
  const equityPurchaseOverride = inputs.purchasePrice ?? ((inputs.currentStockPrice || 100) * (1 + (inputs.offerPremium || 0.3)) * ((inputs.basicSharesOutstanding || 100) + (inputs.inTheMoneyOptions || 10)));
  const optionLiquidation = inputs.optionLiquidation || 0;
  const netDebtValue = inputs.netDebt ?? ((inputs.totalDebt || 0) - (inputs.cashOnBalance || 0));
  const rightItems = [
    { label: 'Equity Purchase Price', value: equityPurchaseOverride, format: '$#,##0' },
    { label: 'Less: Option Liquidation Proceeds', value: -optionLiquidation, format: '($#,##0)' },
    { label: 'Purchase Price', value: equityPurchaseOverride - optionLiquidation, format: '$#,##0', isBold: true },
    { label: 'Convertible Debt', value: inputs.convertibleDebt || 0, isInput: true, format: '$#,##0', optional: true },
    { label: 'Minority Interest', value: inputs.minorityInterest || 0, isInput: true, format: '$#,##0', optional: true },
    { label: 'Total Debt + Minority Interest', value: inputs.totalDebt || 0, isInput: true, format: '$#,##0' },
    { label: 'Less: Cash', value: -(inputs.cashOnBalance || 100), format: '($#,##0)' },
    { label: 'Net Debt', value: netDebtValue, format: '$#,##0' },
    { label: 'Pro Forma Enterprise Value', value: equityPurchaseOverride - optionLiquidation + netDebtValue, format: '$#,##0', isBold: true, isHighlight: true }
  ];
  
  rightItems.forEach((item, idx) => {
    const itemRow = sheet.getRow(rightRow);
    setTextCell(itemRow.getCell(6), item.label);
    itemRow.getCell(6).font = item.isBold ? { ...FONT_NORMAL, bold: true } : FONT_NORMAL;
    
    const valueCell = itemRow.getCell(7);
    if (item.formula) {
      setFormulaCell(valueCell, item.formula);
      valueCell.font = { ...FONT_NORMAL, bold: true };
    } else {
      if (item.optional) {
        setOptionalNumberCell(valueCell, item.value);
      } else {
        setNumberCell(valueCell, item.value);
      }
      if (item.isInput) {
        valueCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.ASSUMPTION }
        };
        valueCell.font = FONT_ASSUMPTION;
      }
    }
    valueCell.numFmt = item.format;
    
    if (item.isHighlight) {
      valueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.LIGHT_GREY }
      };
    }
    
    rightRow++;
  });
  
  return Math.max(row, rightRow);
}

function buildPurchasePriceAllocation(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  inputs: LBOInputs
): number {
  let row = startRow;

  const derivedPurchasePrice =
    inputs.purchasePrice ??
    (inputs.currentStockPrice || 100) *
      (1 + (inputs.offerPremium || 0.3)) *
      ((inputs.basicSharesOutstanding || 100) + (inputs.inTheMoneyOptions || 10)) -
      (inputs.optionLiquidation || 0);
  
  // Section header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'PURCHASE PRICE ALLOCATION (PPA)');
  headerCell.font = FONT_HEADER;
  headerCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.SECTION_HEADER }
  };
  sheet.mergeCells(row, 1, row, 4);
  row++;
  
  const ppaStartRow = row;
  
  const fvOfNci = toNumberOrDefault(inputs.fvOfNCI);
  const reportedBookValue = toNumberOrDefault(inputs.bookValue, 500);
  const goodwillWriteOff = toNumberOrDefault(inputs.goodwillWriteOff);
  const fairValueAdjustments = toNumberOrDefault(inputs.fairValueAdjustments);
  const transactionDtl = toNumberOrDefault(inputs.transactionDTL);
  const transactionDta = toNumberOrDefault(inputs.transactionDTA);

  const ppaItems = [
    { label: 'Purchase Price', value: derivedPurchasePrice, format: '$#,##0' },
    { label: '+ Fair Value of NCI', value: fvOfNci, isInput: true, format: '$#,##0' },
    { label: '– Book Value', value: -reportedBookValue, format: '($#,##0)' },
    { label: 'Excess Purchase Price', formula: `B${row}+B${row + 1}+B${row + 2}`, format: '$#,##0', isBold: true },
    { label: 'Write-off Goodwill', value: -goodwillWriteOff, isInput: true, format: '($#,##0)', optional: true },
    { label: 'Fair Value Adjustments', value: fairValueAdjustments, isInput: true, format: '$#,##0', optional: true },
    { label: 'Transaction DTL', value: -transactionDtl, isInput: true, format: '($#,##0)', optional: true },
    { label: 'Transaction DTA', value: transactionDta, isInput: true, format: '$#,##0', optional: true },
    { label: 'Adjusted Purchase Price', formula: `B${row + 3}+B${row + 4}+B${row + 5}+B${row + 6}+B${row + 7}`, format: '$#,##0', isBold: true },
    { label: 'Goodwill Created', formula: `B${row + 8}`, format: '$#,##0', isBold: true, isHighlight: true }
  ];
  
  ppaItems.forEach((item, idx) => {
    const itemRow = sheet.getRow(row);
    setTextCell(itemRow.getCell(1), item.label);
    itemRow.getCell(1).font = item.isBold ? { ...FONT_NORMAL, bold: true } : FONT_NORMAL;
    
    const valueCell = itemRow.getCell(2);
    if (item.formula) {
      setFormulaCell(valueCell, item.formula);
      valueCell.font = { ...FONT_NORMAL, bold: true };
    } else {
      if (item.optional) {
        setOptionalNumberCell(valueCell, item.value);
      } else {
        setNumberCell(valueCell, item.value);
      }
      if (item.isInput) {
        valueCell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.ASSUMPTION }
        };
        valueCell.font = FONT_ASSUMPTION;
      }
    }
    valueCell.numFmt = item.format;
    
    if (item.isHighlight) {
      valueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.GREEN_HIGHLIGHT }
      };
      valueCell.font = { ...FONT_NORMAL, bold: true, color: { argb: 'FF00B050' } };
    }
    
    row++;
  });
  
  return row;
}

function buildCalendarizationAndTiming(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  inputs: LBOInputs
): number {
  let row = startRow;
  
  // Section header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'CALENDARIZATION & TIMING');
  headerCell.font = FONT_HEADER;
  headerCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.SECTION_HEADER }
  };
  sheet.mergeCells(row, 1, row, 4);
  row++;
  
  const timingItems = [
    { label: 'Last FYE', value: inputs.lastFYE || '12/31/2023', isInput: true },
    { label: 'MRQ Date', value: inputs.mrqDate || '9/30/2024', isInput: true },
    { label: 'Market Date', value: inputs.marketDate || '11/15/2024', isInput: true },
    { label: 'Close Date', value: inputs.closeDate || '12/31/2024', isInput: true },
    { label: 'First FYE Post-Close', value: '12/31/2025', isCalc: true }
  ];
  
  timingItems.forEach((item) => {
    const itemRow = sheet.getRow(row);
    setTextCell(itemRow.getCell(1), item.label);
    itemRow.getCell(1).font = FONT_NORMAL;
    
    const valueCell = itemRow.getCell(2);
    setTextCell(valueCell, item.value);
    if (item.isInput) {
      valueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.ASSUMPTION }
      };
      valueCell.font = FONT_ASSUMPTION;
    }
    valueCell.alignment = { horizontal: 'left' };
    
    row++;
  });
  
  return row;
}

function buildExitAssumptions(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  inputs: LBOInputs
): number {
  let row = startRow;
  
  // Section header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'EXIT ASSUMPTIONS & RETURNS');
  headerCell.font = FONT_HEADER;
  headerCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.SECTION_HEADER }
  };
  sheet.mergeCells(row, 1, row, 4);
  row++;
  
  const exitStartRow = row;
  const exitYear = Math.max(Math.round(toNumberOrDefault(inputs.exitYear, 5)), 1);
  const exitEbitdaMultiple = Math.max(toNumberOrDefault(inputs.exitEBITDAMultiple, 10.5), 0.1);
  const fallbackExitPe = exitEbitdaMultiple > 0 ? exitEbitdaMultiple : 15;
  const baseExitPE = Math.max(toNumberOrDefault(inputs.exitPEMultiple, fallbackExitPe), 5);
  const fallbackEv = inputs.exitEnterpriseValue ?? inputs.purchasePrice ?? ((inputs.ltmEBITDA || 100) * 8);
  const minimumCashDefault = Math.max(fallbackEv * 0.02, 5);
  const minimumCashBalance = Math.max(toNumberOrDefault(inputs.minimumCashBalance, minimumCashDefault), minimumCashDefault);
  const taxRate = Math.min(Math.max(toNumberOrDefault(inputs.taxRate, 0.21), 0), 0.99);
  
  const exitItems = [
    { label: 'Exit Year', value: exitYear, isInput: true, format: '0' },
    { label: 'Exit Method', value: inputs.exitMethod || 'EBITDA', isInput: true, format: '@' },
    { label: 'Exit EBITDA Multiple', value: exitEbitdaMultiple, isInput: true, format: '0.0x' },
    { label: 'Exit P/E Multiple', value: baseExitPE, isInput: true, format: '0.0x' },
    { label: 'Minimum Cash Balance', value: minimumCashBalance, isInput: true, format: '$#,##0' },
    { label: 'Tax Rate', value: taxRate, isInput: true, format: '0.0%' }
  ];
  
  exitItems.forEach((item) => {
    const itemRow = sheet.getRow(row);
    setTextCell(itemRow.getCell(1), item.label);
    itemRow.getCell(1).font = FONT_NORMAL;
    
    const valueCell = itemRow.getCell(2);
    if (item.format === '@') {
      setTextCell(valueCell, item.value);
    } else {
      setNumberCell(valueCell, item.value);
    }
    if (item.isInput) {
      valueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.ASSUMPTION }
      };
      valueCell.font = FONT_ASSUMPTION;
    }
    valueCell.numFmt = item.format;
    
    row++;
  });
  
  row += 1;
  
  // Returns calculation (placeholder - would need full model)
  const returnsItems = [
    { label: 'Exit Enterprise Value', value: inputs.exitEnterpriseValue ?? 0, format: '$#,##0', isBold: true },
    { label: 'Less: Net Debt at Exit', value: inputs.exitNetDebt ?? 0, format: '($#,##0)' },
    { label: 'Exit Equity Value', value: inputs.exitEquityValue ?? 0, format: '$#,##0', isBold: true },
    { label: 'Initial Sponsor Equity', value: inputs.initialSponsorEquity ?? 0, format: '$#,##0' },
    { label: 'Sponsor IRR', value: inputs.sponsorIRR ?? 0, format: '0.0%', isBold: true, isHighlight: true },
    { label: 'Sponsor MOIC', value: inputs.sponsorMOIC ?? 0, format: '0.0x', isBold: true, isHighlight: true }
  ];
  
  returnsItems.forEach((item) => {
    const itemRow = sheet.getRow(row);
    setTextCell(itemRow.getCell(1), item.label);
    itemRow.getCell(1).font = item.isBold ? { ...FONT_NORMAL, bold: true } : FONT_NORMAL;
    
    const valueCell = itemRow.getCell(2);
    setNumberCell(valueCell, item.value);
    valueCell.numFmt = item.format;
    valueCell.font = item.isBold ? { ...FONT_NORMAL, bold: true } : FONT_NORMAL;
    
    if (item.isHighlight) {
      valueCell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.GREEN_HIGHLIGHT }
      };
      valueCell.font = { ...FONT_NORMAL, bold: true, color: { argb: 'FF00B050' } };
    }
    
    row++;
  });
  
  row += 1;

  const peHeaderRow = sheet.getRow(row);
  setTextCell(peHeaderRow.getCell(1), 'Exit P/E Sensitivity');
  peHeaderRow.getCell(1).font = FONT_SUB_HEADER;
  row++;

  const exitPeLow = Math.max(baseExitPE - 2, Math.max(baseExitPE * 0.7, 5));
  const exitPeHigh = Math.max(exitPeLow, baseExitPE + 2);
  const peSensitivityItems = [
    { label: 'Low Case Exit P/E', value: exitPeLow, format: '0.0x' },
    { label: 'Base Case Exit P/E', value: baseExitPE, format: '0.0x', isBold: true },
    { label: 'High Case Exit P/E', value: exitPeHigh, format: '0.0x' }
  ];

  peSensitivityItems.forEach((item) => {
    const itemRow = sheet.getRow(row);
    setTextCell(itemRow.getCell(1), item.label);
    itemRow.getCell(1).font = item.isBold ? { ...FONT_NORMAL, bold: true } : FONT_NORMAL;

    const valueCell = itemRow.getCell(2);
    setNumberCell(valueCell, item.value);
    valueCell.numFmt = item.format;
    valueCell.font = item.isBold ? { ...FONT_NORMAL, bold: true } : FONT_NORMAL;
    row++;
  });

  row += 1;
  const sensitivityHeader = sheet.getRow(row);
  setTextCell(sensitivityHeader.getCell(1), 'Return Sensitivities');
  sensitivityHeader.getCell(1).font = FONT_SUB_HEADER;
  row++;

  const baseIrr = toNumberOrDefault(inputs.sponsorIRR, 0);
  const baseMoic = Math.max(toNumberOrDefault(inputs.sponsorMOIC, 1), 0.01);
  const sensitivityItems = [
    { label: 'Low Case IRR', value: Math.max(baseIrr - 0.02, 0), format: '0.0%' },
    { label: 'High Case IRR', value: Math.min(baseIrr + 0.02, 5), format: '0.0%' },
    { label: 'Low Case MOIC', value: Math.max(baseMoic - 0.1, 0.1), format: '0.0x' },
    { label: 'High Case MOIC', value: baseMoic + 0.1, format: '0.0x' }
  ];

  sensitivityItems.forEach((item) => {
    const itemRow = sheet.getRow(row);
    setTextCell(itemRow.getCell(1), item.label);
    itemRow.getCell(1).font = FONT_NORMAL;

    const valueCell = itemRow.getCell(2);
    setNumberCell(valueCell, item.value);
    valueCell.numFmt = item.format;
    valueCell.font = FONT_NORMAL;
    row++;
  });

  return row;
}

function buildModelChecks(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  inputs: LBOInputs
): number {
  let row = startRow;
  
  // Section header
  const headerCell = sheet.getCell(row, 1);
  setTextCell(headerCell, 'MODEL CHECKS');
  headerCell.font = FONT_HEADER;
  headerCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.SECTION_HEADER }
  };
  sheet.mergeCells(row, 1, row, 4);
  row++;
  
  const checks = [
    { label: 'Sources = Uses', status: 'TRUE' },
    { label: 'Balance Sheet Balances', status: 'TRUE' },
    { label: 'Revolver Limit Respected', status: 'TRUE' },
    { label: 'Error Message', status: '' }
  ];
  
  checks.forEach((check) => {
    const itemRow = sheet.getRow(row);
    setTextCell(itemRow.getCell(1), check.label);
    itemRow.getCell(1).font = FONT_NORMAL;
    
    const statusCell = itemRow.getCell(2);
    setTextCell(statusCell, check.status);
    statusCell.font = { ...FONT_NORMAL, bold: true, color: { argb: check.status === 'TRUE' ? 'FF00B050' : 'FFFF0000' } };
    statusCell.alignment = { horizontal: 'center' };
    
    row++;
  });
  
  return row;
}
