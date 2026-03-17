/**
 * Trading Comps Excel Generator
 * Clean, simple comps analysis using only available data.
 * Uses shared styles for print/freeze; adds Peer Data sheet with full peer list.
 */

import ExcelJS from 'exceljs';
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
} from './excel/styleKit';

interface CompData {
  ticker?: string | any;
  name?: string | any;
  companyName?: string | any;
  sector?: string | null;
  price?: number | null;
  shares?: number | null;
  sharesOutstanding?: number | null;
  sharesSource?: 'Reported' | 'Derived (Mkt Cap ÷ Price)' | 'User Provided' | 'Unavailable';
  marketCap?: number | null;
  cash?: number | null;
  debt?: number | null;
  netDebt?: number | null;
  ev?: number | null;
  enterpriseValue?: number | null;
  revenue?: number | null;
  ebitda?: number | null;
  netIncome?: number | null;
  evToRevenue?: number | null;
  evToEbitda?: number | null;
  peRatio?: number | null;
  // User input tracking
  userInputs?: {
    revenue?: boolean;
    ebitda?: boolean;
    ebit?: boolean;
    netIncome?: boolean;
    sharesOutstanding?: boolean;
    netDebt?: boolean;
    marketCap?: boolean;
    price?: boolean;
    cash?: boolean;
    debt?: boolean;
  };
}

interface CompsData {
  subject?: CompData;
  peers?: CompData[];
  peerMetadata?: Record<string, {
    ticker: string;
    inclusionReason: string;
    sizeMultiple?: string;
    industryMatch?: string;
    profitabilityContext?: string;
  }>;
}

const MONEY_NUM_FMT = '#,##0;(#,##0)';
const PERCENT_NUM_FMT = '0.0%';
const SHARES_NUM_FMT = '#,##0.0';
const MULTIPLE_NUM_FMT = '0.0x';
const EDITABLE_INPUT_NOTE = 'Blue/filled cells are editable inputs. Other cells are formula-driven.';
const STYLE_KIT_INPUT_FILL = 'FFE8F4FC';

// Safe string extraction
function safeString(value: any): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'object') {
    if (value.name) return safeString(value.name);
    if (value.ticker) return safeString(value.ticker);
    if (value.companyName) return safeString(value.companyName);
    return '';
  }
  return String(value);
}

function safeNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeUsdMillions(value: number | null | undefined): number | null {
  const num = safeNumber(value);
  if (num === null) return null;
  // The comps path can receive either raw USD or already-normalized USD mm values.
  // Treat clearly large raw values as dollars; otherwise preserve the mm input.
  return Math.abs(num) >= 10_000_000 ? num / 1_000_000 : num;
}

function normalizeSharesMillions(value: number | null | undefined): number | null {
  const num = safeNumber(value);
  if (num === null) return null;
  // Shares may arrive as raw shares or already-normalized mm shares.
  return Math.abs(num) >= 1_000_000 ? num / 1_000_000 : num;
}

function colToLetter(col: number): string {
  let letter = '';
  let temp = col;
  while (temp > 0) {
    const mod = (temp - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    temp = Math.floor((temp - 1) / 26);
  }
  return letter;
}

// Calculate statistics
function calculateStats(values: number[]): {
  count: number;
  median: number | null;
  mean: number | null;
  p25: number | null;
  p75: number | null;
  min: number | null;
  max: number | null;
} {
  const valid = values.filter(v => v !== null && v !== undefined && isFinite(v) && v > 0);
  
  if (valid.length < 3) {
    return { count: valid.length, median: null, mean: null, p25: null, p75: null, min: null, max: null };
  }
  
  const sorted = [...valid].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  const median = sorted.length % 2 === 0
    ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2
    : sorted[Math.floor(n / 2)];
  const percentile = (p: number) => {
    if (sorted.length === 0) return null;
    const idx = (sorted.length - 1) * p;
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    if (lower === upper) return sorted[lower];
    const weight = idx - lower;
    return sorted[lower] * (1 - weight) + sorted[upper] * weight;
  };
  const p25 = percentile(0.25);
  const p75 = percentile(0.75);
  const min = sorted[0];
  const max = sorted[n - 1];
  
  return { count: n, median, mean, p25, p75, min, max };
}

function setFormulaCell(cell: ExcelJS.Cell, formula: string, result: number | string | null): void {
  cell.value = { formula, result: result ?? undefined };
}

function isFormulaCell(cell: ExcelJS.Cell): boolean {
  const value = cell.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  if (!('formula' in value)) return false;
  const formulaValue = (value as { formula?: unknown }).formula;
  return typeof formulaValue === 'string' && formulaValue.trim().length > 0;
}

function isInputCell(cell: ExcelJS.Cell): boolean {
  const fill = cell.fill;
  if (!fill || fill.type !== 'pattern') return false;
  const patternFill = fill as ExcelJS.FillPattern;
  return patternFill.fgColor?.argb?.toUpperCase() === STYLE_KIT_INPUT_FILL;
}

async function applyFormulaModelProtection(
  workbook: ExcelJS.Workbook,
  modelType: 'dcf' | 'comps'
): Promise<void> {
  const keyFormulaAddresses: string[] = [];
  let countInputsUnlocked = 0;
  let countFormulaCells = 0;

  for (const sheet of workbook.worksheets) {
    sheet.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const inputCell = isInputCell(cell);
        const formulaCell = isFormulaCell(cell);
        if (!inputCell && !formulaCell) return;

        if (inputCell) {
          cell.protection = { ...(cell.protection ?? {}), locked: false };
          countInputsUnlocked += 1;
        } else {
          cell.protection = { ...(cell.protection ?? {}), locked: true };
        }

        if (formulaCell) {
          countFormulaCells += 1;
          if (keyFormulaAddresses.length < 12) {
            keyFormulaAddresses.push(`${sheet.name}!${cell.address}`);
          }
        }
      });
    });

    await sheet.protect('', {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatCells: false,
      formatColumns: false,
      formatRows: false,
      insertRows: false,
      insertColumns: false,
      deleteRows: false,
      deleteColumns: false,
      sort: false,
      autoFilter: true,
      pivotTables: false,
    });
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug({
      modelType,
      countInputsUnlocked,
      countFormulaCells,
      keyFormulaAddresses,
    });
  }
}

export async function generateCompsWorkbook(data: CompsData | Record<string, any>): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  applyWorkbookDefaults(workbook, { company: 'CapitalBase' });
  workbook.calcProperties.fullCalcOnLoad = true;
  const sheet = workbook.addWorksheet('Comps');
  
  // Import formatting utilities
  const {
    createSubHeaderStyle,
    createNormalStyle,
    createFormulaStyle,
    applyNumberFormat,
  } = await import('./excel/formatting');
  
  // Extract comps data
  const compsData = (data as CompsData);
  let allComps: CompData[] = [];
  
  if (compsData.subject) {
    allComps.push(compsData.subject);
  }
  
  if (compsData.peers && Array.isArray(compsData.peers)) {
    allComps.push(...compsData.peers);
  }
  
  // Fallback
  if (allComps.length === 0 && (data as any).peers) {
    const peers = (data as any).peers;
    if (Array.isArray(peers)) {
      allComps = peers;
    }
  }
  
  // Sort by market cap (descending)
  allComps = allComps.sort((a, b) => {
    const aCap = normalizeUsdMillions(a.marketCap) || 0;
    const bCap = normalizeUsdMillions(b.marketCap) || 0;
    return bCap - aCap;
  });
  
  // Column definitions (Company, Ticker, Sector, then market/financials)
  const COLUMNS = {
    COMPANY: 1,
    TICKER: 2,
    SECTOR: 3,
    PRICE: 4,
    SHARES: 5,
    SHARES_SOURCE: 6,
    MARKET_CAP: 7,
    CASH: 8,
    DEBT: 9,
    NET_DEBT: 10,
    ENTERPRISE_VALUE: 11,
    REVENUE: 12,
    EBITDA: 13,
    NET_INCOME: 14,
    EV_REVENUE: 15,
    EV_EBITDA: 16,
    PE_RATIO: 17,
    NOTES: 18,
  };

  const COMPANY_MARKET_COLS = [COLUMNS.COMPANY, COLUMNS.TICKER, COLUMNS.SECTOR, COLUMNS.PRICE, COLUMNS.SHARES, COLUMNS.SHARES_SOURCE, COLUMNS.MARKET_CAP, COLUMNS.CASH, COLUMNS.DEBT, COLUMNS.NET_DEBT, COLUMNS.ENTERPRISE_VALUE];
  const FINANCIALS_COLS = [COLUMNS.REVENUE, COLUMNS.EBITDA, COLUMNS.NET_INCOME];
  const MULTIPLES_COLS = [COLUMNS.EV_REVENUE, COLUMNS.EV_EBITDA, COLUMNS.PE_RATIO];
  const NOTES_COL = COLUMNS.NOTES;
  const lastDataCol = COLUMNS.NOTES;

  setColWidthsKit(sheet, [28, 8, 14, 10, 14, 20, 14, 13, 13, 13, 14, 13, 13, 13, 11, 11, 10, 22]);

  const asOfDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  let row = titleBar(sheet, 'Comparable Company Analysis', lastDataCol);

  // ===== COLUMN HEADERS =====
  const compsTableHeaderRow = row;

  const headerRow = sheet.getRow(row);
  const headers = [
    'Company',
    'Ticker',
    'Sector',
    'Price / Share', // F6: Clear label
    'Shares Outstanding (mm)', // F6: Clarify units
    'Shares Source', // Shares resolution: source column
    'Market Cap (USD mm)', // F6: Add units
    'Cash (USD mm)', // F6: Add units
    'Total Debt (USD mm)', // F6: Add units
    'Net Debt (USD mm)', // F6: Add units
    'Enterprise Value (USD mm)', // F6: Add units
    'Revenue (USD mm)', // F6: Add units
    'EBITDA (USD mm)', // F6: Add units
    'Net Income (USD mm)', // F6: Add units
    'EV / Revenue',
    'EV / EBITDA',
    'P / E',
    'Notes',
  ];
  
  headers.forEach((header, idx) => {
    const col = idx + COLUMNS.COMPANY;
    headerRow.getCell(col).value = header;
  });
  tableHeader(sheet, compsTableHeaderRow, COLUMNS.COMPANY, COLUMNS.NOTES);
  // Left-align first 3 columns, center col 4, right-align rest
  headerRow.getCell(COLUMNS.COMPANY).alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.getCell(COLUMNS.TICKER).alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.getCell(COLUMNS.SECTOR).alignment = { vertical: 'middle', horizontal: 'left' };
  headerRow.getCell(COLUMNS.PRICE).alignment = { vertical: 'middle', horizontal: 'center' };
  row++;

  // ===== MAIN TABLE =====
  
  const dataStartRow = row;
  
  // Column groups already defined above (reuse them)
  
  // Helper function to get row shading based on column group
  const getRowShading = (col: number, isEven: boolean): string | undefined => {
    if (COMPANY_MARKET_COLS.includes(col)) {
      return isEven ? undefined : 'FFF9F9F9'; // Very light grey for Company & Market (reduced visual noise)
    } else if (MULTIPLES_COLS.includes(col)) {
      return isEven ? 'FFF0F0F0' : 'FFE8E8E8'; // Slightly darker for Multiples (stand out)
    } else {
      return isEven ? undefined : 'FFF5F5F5'; // Standard alternating for Financials
    }
  };
  
  // Helper function to get fill color (target row gets highlight, others use normal shading)
  const getCellFill = (col: number, isEven: boolean, isTarget: boolean): any => {
    if (isTarget) {
      return { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0F8' } }; // Subtle blue-grey highlight
    }
    const shading = getRowShading(col, isEven);
    return shading ? { type: 'pattern', pattern: 'solid', fgColor: { argb: shading } } : undefined;
  };
  
  // Identify target company (first row if subject exists)
  const isTargetRow = (idx: number): boolean => {
    return idx === 0 && compsData.subject !== undefined;
  };
  
  allComps.forEach((comp, idx) => {
    const dataRow = sheet.getRow(row);
    const isEven = idx % 2 === 0;
    const isTarget = isTargetRow(idx);
    
    // Company
    const companyName = safeString(comp.name || comp.companyName || comp.ticker || '');
    dataRow.getCell(COLUMNS.COMPANY).value = companyName;
    dataRow.getCell(COLUMNS.COMPANY).style = {
      ...createNormalStyle(),
      fill: getCellFill(COLUMNS.COMPANY, isEven, isTarget),
      alignment: { vertical: 'middle', horizontal: 'left' },
      font: {
        ...createNormalStyle().font,
        bold: isTarget ? true : undefined, // Bold Company for target (F3)
      },
    };
    
    // Ticker
    const tickerVal = safeString(comp.ticker || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    dataRow.getCell(COLUMNS.TICKER).value = tickerVal;
    dataRow.getCell(COLUMNS.TICKER).style = {
      ...createNormalStyle(),
      fill: getCellFill(COLUMNS.TICKER, isEven, isTarget),
      alignment: { vertical: 'middle', horizontal: 'center' },
      font: {
        ...createNormalStyle().font,
        bold: isTarget ? true : undefined,
      },
    };

    // Sector
    const sectorVal = safeString(comp.sector ?? '');
    dataRow.getCell(COLUMNS.SECTOR).value = sectorVal || '—';
    dataRow.getCell(COLUMNS.SECTOR).style = {
      ...createNormalStyle(),
      fill: getCellFill(COLUMNS.SECTOR, isEven, isTarget),
      alignment: { vertical: 'middle', horizontal: 'left' },
    };

    // Price
    const price = safeNumber(comp.price);
    if (price !== null && price > 0) {
      dataRow.getCell(COLUMNS.PRICE).value = price;
      dataRow.getCell(COLUMNS.PRICE).numFmt = '$0.00';
    }
    dataRow.getCell(COLUMNS.PRICE).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.PRICE, isEven, isTarget),
    };
    
    // Shares Outstanding (in millions) - professional formatting
    const shares = safeNumber(comp.shares || comp.sharesOutstanding);
    const sharesMM = shares ? normalizeSharesMillions(shares) : null;
    if (sharesMM !== null && sharesMM > 0) {
      dataRow.getCell(COLUMNS.SHARES).value = sharesMM;
      // Use whole numbers for shares (no unnecessary decimals)
      dataRow.getCell(COLUMNS.SHARES).numFmt = sharesMM % 1 === 0 ? '#,##0' : '#,##0.0';
    }
    dataRow.getCell(COLUMNS.SHARES).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.SHARES, isEven, isTarget),
    };
    
    // Shares Source column (Shares Resolution)
    const sharesSource = comp.sharesSource || 'Unavailable';
    dataRow.getCell(COLUMNS.SHARES_SOURCE).value = sharesSource;
    dataRow.getCell(COLUMNS.SHARES_SOURCE).style = {
      ...createNormalStyle(),
      fill: getCellFill(COLUMNS.SHARES_SOURCE, isEven, isTarget),
      alignment: { vertical: 'middle', horizontal: 'left' },
      font: { 
        name: 'Calibri', 
        size: 9, 
        color: sharesSource === 'Reported' ? { argb: 'FF000000' } : 
               sharesSource === 'Derived (Mkt Cap ÷ Price)' ? { argb: 'FF666666' } :
               sharesSource === 'User Provided' ? { argb: 'FF0066CC' } :
               { argb: 'FF999999' } // Unavailable
      },
    };
    
    // Market Cap (calculate if missing: Price × Shares)
    let marketCapMM = normalizeUsdMillions(comp.marketCap);
    if (marketCapMM === null && price !== null && sharesMM !== null && price > 0 && sharesMM > 0) {
      marketCapMM = price * sharesMM;
    }
    if (marketCapMM !== null && marketCapMM > 0) {
      dataRow.getCell(COLUMNS.MARKET_CAP).value = marketCapMM;
      applyNumberFormat(dataRow.getCell(COLUMNS.MARKET_CAP), 'CURRENCY');
    }
    dataRow.getCell(COLUMNS.MARKET_CAP).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.MARKET_CAP, isEven, isTarget),
    };
    
    // Cash (in millions)
    const cashMM = normalizeUsdMillions(comp.cash);
    if (cashMM !== null) {
      dataRow.getCell(COLUMNS.CASH).value = cashMM;
      applyNumberFormat(dataRow.getCell(COLUMNS.CASH), 'CURRENCY');
    }
    dataRow.getCell(COLUMNS.CASH).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.CASH, isEven, isTarget),
    };
    
    // Total Debt (in millions)
    const debtMM = normalizeUsdMillions(comp.debt);
    if (debtMM !== null) {
      dataRow.getCell(COLUMNS.DEBT).value = debtMM;
      applyNumberFormat(dataRow.getCell(COLUMNS.DEBT), 'CURRENCY');
    }
    dataRow.getCell(COLUMNS.DEBT).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.DEBT, isEven, isTarget),
    };
    
    // Net Debt (calculate if missing: Debt - Cash)
    let netDebtMM = normalizeUsdMillions(comp.netDebt);
    if (netDebtMM === null && debtMM !== null && cashMM !== null) {
      netDebtMM = debtMM - cashMM;
    }
    if (netDebtMM !== null) {
      dataRow.getCell(COLUMNS.NET_DEBT).value = netDebtMM;
      applyNumberFormat(dataRow.getCell(COLUMNS.NET_DEBT), 'CURRENCY');
    }
    dataRow.getCell(COLUMNS.NET_DEBT).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.NET_DEBT, isEven, isTarget),
    };
    
    // Enterprise Value (calculate if missing: Market Cap + Net Debt)
    let evMM = normalizeUsdMillions(comp.ev || comp.enterpriseValue);
    if (evMM === null && marketCapMM !== null && netDebtMM !== null) {
      evMM = marketCapMM + netDebtMM;
    }
    if (evMM !== null && evMM > 0) {
      dataRow.getCell(COLUMNS.ENTERPRISE_VALUE).value = evMM;
      applyNumberFormat(dataRow.getCell(COLUMNS.ENTERPRISE_VALUE), 'CURRENCY');
    }
    dataRow.getCell(COLUMNS.ENTERPRISE_VALUE).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.ENTERPRISE_VALUE, isEven, isTarget),
    };
    
    // Revenue (in millions)
    const revenueMM = normalizeUsdMillions(comp.revenue);
    if (revenueMM !== null && revenueMM > 0) {
      dataRow.getCell(COLUMNS.REVENUE).value = revenueMM;
      applyNumberFormat(dataRow.getCell(COLUMNS.REVENUE), 'CURRENCY');
    }
    dataRow.getCell(COLUMNS.REVENUE).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.REVENUE, isEven, isTarget),
    };
    
    // EBITDA (in millions) - label if user input
    const ebitdaMM = normalizeUsdMillions(comp.ebitda);
    const isEbitdaUserInput = comp.userInputs?.ebitda;
    if (ebitdaMM !== null && ebitdaMM > 0) {
      dataRow.getCell(COLUMNS.EBITDA).value = ebitdaMM;
      applyNumberFormat(dataRow.getCell(COLUMNS.EBITDA), 'CURRENCY');
    }
    dataRow.getCell(COLUMNS.EBITDA).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.EBITDA, isEven, isTarget),
      font: isEbitdaUserInput ? {
        ...createFormulaStyle().font,
        italic: true,
        color: { argb: 'FF0066CC' }, // Blue for user inputs
      } : createFormulaStyle().font,
    };
    
    // Net Income (in millions) - label if user input
    const netIncomeMM = normalizeUsdMillions(comp.netIncome);
    const isNetIncomeUserInput = comp.userInputs?.netIncome;
    if (netIncomeMM !== null) {
      dataRow.getCell(COLUMNS.NET_INCOME).value = netIncomeMM;
      applyNumberFormat(dataRow.getCell(COLUMNS.NET_INCOME), 'CURRENCY');
    }
    dataRow.getCell(COLUMNS.NET_INCOME).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.NET_INCOME, isEven, isTarget),
      font: isNetIncomeUserInput ? {
        ...createFormulaStyle().font,
        italic: true,
        color: { argb: 'FF0066CC' }, // Blue for user inputs
      } : createFormulaStyle().font,
    };
    
    // EV/Revenue (calculate if missing: EV / Revenue) - professional formatting
    let evRevenue = safeNumber(comp.evToRevenue);
    if (evRevenue === null && evMM !== null && revenueMM !== null && revenueMM > 0) {
      evRevenue = evMM / revenueMM;
    }
    if (evRevenue !== null && evRevenue > 0) {
      dataRow.getCell(COLUMNS.EV_REVENUE).value = evRevenue;
      // Consistent decimal places for multiples (1 decimal)
      dataRow.getCell(COLUMNS.EV_REVENUE).numFmt = '#,##0.0"x"';
    }
    dataRow.getCell(COLUMNS.EV_REVENUE).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.EV_REVENUE, isEven, isTarget),
    };
    
    // EV/EBITDA (calculate if missing: EV / EBITDA) - professional formatting
    let evEbitda = safeNumber(comp.evToEbitda);
    if (evEbitda === null && evMM !== null && ebitdaMM !== null && ebitdaMM > 0) {
      evEbitda = evMM / ebitdaMM;
    }
    if (evEbitda !== null && evEbitda > 0) {
      dataRow.getCell(COLUMNS.EV_EBITDA).value = evEbitda;
      // Consistent decimal places for multiples (1 decimal)
      dataRow.getCell(COLUMNS.EV_EBITDA).numFmt = '#,##0.0"x"';
    }
    dataRow.getCell(COLUMNS.EV_EBITDA).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.EV_EBITDA, isEven, isTarget),
    };
    
    // P/E (calculate if missing: Market Cap / Net Income) - professional formatting
    let peRatio = safeNumber(comp.peRatio);
    if (peRatio === null && marketCapMM !== null && netIncomeMM !== null && netIncomeMM > 0) {
      peRatio = marketCapMM / netIncomeMM;
    }
    if (peRatio !== null && peRatio > 0) {
      dataRow.getCell(COLUMNS.PE_RATIO).value = peRatio;
      // Consistent decimal places for multiples (1 decimal)
      dataRow.getCell(COLUMNS.PE_RATIO).numFmt = '#,##0.0"x"';
    }
    const peBorder: any = { all: { style: 'thin' } };
    // Add right border after Multiples section
    peBorder.right = { style: 'medium', color: { argb: 'FF808080' } };
    dataRow.getCell(COLUMNS.PE_RATIO).style = {
      ...createFormulaStyle(),
      fill: getCellFill(COLUMNS.PE_RATIO, isEven, isTarget),
      border: peBorder,
    };
    
    // Notes - include peer metadata if available
    const notes: string[] = [];
    const metadata = compsData.peerMetadata?.[tickerVal];
    if (metadata) {
      notes.push(metadata.inclusionReason);
      if (metadata.sizeMultiple) {
        notes.push(metadata.sizeMultiple);
      }
      if (metadata.industryMatch) {
        notes.push(metadata.industryMatch);
      }
    }
    
    // Shares source notes (Shares Resolution)
    if (sharesSource === 'Derived (Mkt Cap ÷ Price)') {
      notes.push('Shares derived from market cap and price.');
    } else if (sharesSource === 'User Provided') {
      notes.push('Shares provided by user.');
    } else if (sharesSource === 'Unavailable') {
      notes.push('Shares outstanding unavailable.');
    }
    
    // User input labels (Label user inputs)
    const userInputFields: string[] = [];
    if (comp.userInputs?.revenue) userInputFields.push('Revenue');
    if (comp.userInputs?.ebitda) userInputFields.push('EBITDA');
    if (comp.userInputs?.netIncome) userInputFields.push('Net Income');
    if (comp.userInputs?.sharesOutstanding) userInputFields.push('Shares');
    if (comp.userInputs?.netDebt) userInputFields.push('Net Debt');
    if (comp.userInputs?.marketCap) userInputFields.push('Market Cap');
    if (userInputFields.length > 0) {
      notes.push(`User input: ${userInputFields.join(', ')}`);
    }
    
    // Add concise notes for missing multiples only (F4)
    // Only note missing data that prevents multiple calculation
    if (evRevenue === null || evRevenue <= 0) {
      if (evMM === null || evMM <= 0) {
        notes.push('Missing EV');
      } else if (!revenueMM || revenueMM <= 0) {
        notes.push('Missing Revenue');
      }
    }
    if (evEbitda === null || evEbitda <= 0) {
      if (evMM === null || evMM <= 0) {
        notes.push('Missing EV');
      } else if (!ebitdaMM || ebitdaMM <= 0) {
        notes.push('Missing EBITDA');
      }
    }
    if (peRatio === null || peRatio <= 0) {
      if (marketCapMM === null || marketCapMM <= 0) {
        notes.push('Missing Market Cap');
      } else if (!netIncomeMM || netIncomeMM <= 0) {
        notes.push('Missing Net Income');
      }
    }
    dataRow.getCell(COLUMNS.NOTES).value = notes.join('; ') || '';
    // Notes column: enable text wrapping and auto-height (F2)
    dataRow.getCell(COLUMNS.NOTES).style = {
      ...createNormalStyle(),
      fill: getCellFill(COLUMNS.NOTES, isEven, isTarget),
      alignment: { 
        vertical: 'top', 
        horizontal: 'left',
        wrapText: true, // Enable text wrapping (F2)
      },
      font: { name: 'Calibri', size: 9, color: { argb: 'FF666666' } },
    };
    
    // Apply borders (with special handling for target row - F3)
    for (let col = COLUMNS.COMPANY; col <= COLUMNS.NOTES; col++) {
      // Skip P/E as it already has border set above
      if (col === COLUMNS.PE_RATIO) continue;
      
      const cell = dataRow.getCell(col);
      const borderStyle: any = {
        top: { style: isTarget ? 'medium' : 'thin' }, // Thicker top border for target (F3)
        bottom: { style: isTarget ? 'medium' : 'thin' }, // Thicker bottom border for target (F3)
        left: { style: 'thin' },
        right: { style: 'thin' },
      };
      cell.border = borderStyle;
    }
    
    // Auto-adjust row height for Notes column wrapping (F2)
    if (notes.length > 0) {
      // ExcelJS does not reliably support "auto" row height. Leave unset.
    }
    
    row++;
  });
  
  // ===== SUMMARY STATISTICS =====
  
  const lastDataRow = row - 1;
  row += 1;
  
  // Collect multiples for stats
  const evRevenueValues = allComps
    .map(c => {
      const ev = normalizeUsdMillions(c.ev || c.enterpriseValue || (c.marketCap && c.netDebt != null ? c.marketCap + c.netDebt : null));
      const rev = normalizeUsdMillions(c.revenue);
      if (ev !== null && rev !== null && rev > 0) return ev / rev;
      return safeNumber(c.evToRevenue);
    })
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v) && v > 0);
  
  const evEbitdaValues = allComps
    .map(c => {
      const ev = normalizeUsdMillions(c.ev || c.enterpriseValue || (c.marketCap && c.netDebt != null ? c.marketCap + c.netDebt : null));
      const ebitda = normalizeUsdMillions(c.ebitda);
      if (ev !== null && ebitda !== null && ebitda > 0) return ev / ebitda;
      return safeNumber(c.evToEbitda);
    })
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v) && v > 0);
  
  const peValues = allComps
    .map(c => {
      const mcap = normalizeUsdMillions(c.marketCap);
      const ni = normalizeUsdMillions(c.netIncome);
      if (mcap !== null && ni !== null && ni > 0) return mcap / ni;
      return safeNumber(c.peRatio);
    })
    .filter((v): v is number => v !== null && v !== undefined && !isNaN(v) && v > 0);
  
  const evRevenueStats = calculateStats(evRevenueValues);
  const evEbitdaStats = calculateStats(evEbitdaValues);
  const peStats = calculateStats(peValues);
  
  // Summary Statistics
  row += 1;
  sectionHeader(sheet, row, 'Summary Statistics', 4);
  row++;
  
  const statsSubHeaderRow = row;
  sheet.getCell(row, COLUMNS.COMPANY).value = '';
  sheet.getCell(row, COLUMNS.COMPANY + 1).value = 'EV / Revenue';
  sheet.getCell(row, COLUMNS.COMPANY + 2).value = 'EV / EBITDA';
  sheet.getCell(row, COLUMNS.COMPANY + 3).value = 'P / E';
  tableHeader(sheet, row, COLUMNS.COMPANY, COLUMNS.COMPANY + 3);
  sheet.getCell(row, COLUMNS.COMPANY + 1).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getCell(row, COLUMNS.COMPANY + 2).alignment = { vertical: 'middle', horizontal: 'center' };
  sheet.getCell(row, COLUMNS.COMPANY + 3).alignment = { vertical: 'middle', horizontal: 'center' };
  row++;
  
  const statRows = [
    { label: 'Count', evRev: evRevenueStats.count, evEbitda: evEbitdaStats.count, pe: peStats.count },
    { label: '25th Percentile', evRev: evRevenueStats.p25, evEbitda: evEbitdaStats.p25, pe: peStats.p25 },
    { label: 'Median', evRev: evRevenueStats.median, evEbitda: evEbitdaStats.median, pe: peStats.median },
    { label: 'Mean', evRev: evRevenueStats.mean, evEbitda: evEbitdaStats.mean, pe: peStats.mean },
    { label: '75th Percentile', evRev: evRevenueStats.p75, evEbitda: evEbitdaStats.p75, pe: peStats.p75 },
    { label: 'Min', evRev: evRevenueStats.min, evEbitda: evEbitdaStats.min, pe: peStats.min },
    { label: 'Max', evRev: evRevenueStats.max, evEbitda: evEbitdaStats.max, pe: peStats.max },
  ];
  
  statRows.forEach((stat) => {
    const isMedian = stat.label === 'Median';
    const isOutput = stat.label === 'Median' || stat.label === 'Mean';
    sheet.getCell(row, COLUMNS.COMPANY).value = stat.label;
    styleKitBodyCell(sheet.getCell(row, COLUMNS.COMPANY));
    sheet.getCell(row, COLUMNS.COMPANY).alignment = { vertical: 'middle', horizontal: 'left' };
    [stat.evRev, stat.evEbitda, stat.pe].forEach((val, colIdx) => {
      const cell = sheet.getCell(row, COLUMNS.COMPANY + 1 + colIdx);
      if (val !== null && val !== undefined) {
        if (stat.label === 'Count') {
          cell.value = val;
          cell.numFmt = '0';
        } else {
          cell.value = val;
          cell.numFmt = '#,##0.0"x"';
        }
      } else {
        cell.value = null;
      }
      if (isOutput) styleKitOutputCell(cell);
      else styleKitBodyCell(cell);
      if (isMedian) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.font = { ...cell.font, bold: true };
      }
    });
    if (isMedian) {
      const labelCell = sheet.getCell(row, COLUMNS.COMPANY);
      labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      labelCell.font = { ...labelCell.font, bold: true };
    }
    row++;
  });
  
  // ===== VALUATION & SHARE PRICE (universal block) =====
  row += 1;
  const subject = compsData.subject ?? allComps[0];
  const subjectEbitdaMM = normalizeUsdMillions(subject?.ebitda);
  const subjectRevenueMM = normalizeUsdMillions(subject?.revenue);
  const subjectNetIncomeMM = normalizeUsdMillions(subject?.netIncome);
  const subjectSharesMM = normalizeSharesMillions(subject?.shares ?? subject?.sharesOutstanding) ?? 0;
  let subjectNetDebtMM = normalizeUsdMillions(subject?.netDebt);
  if (subjectNetDebtMM === null && subject) {
    const d = normalizeUsdMillions(subject.debt);
    const c = normalizeUsdMillions(subject.cash);
    if (d !== null && c !== null) subjectNetDebtMM = d - c;
  }
  const subjectMarketPrice = subject ? safeNumber(subject.price) : null;

  const subjectRowRef = dataStartRow;
  const subjectRevenueCell = `${colToLetter(COLUMNS.REVENUE)}${subjectRowRef}`;
  const subjectEbitdaCell = `${colToLetter(COLUMNS.EBITDA)}${subjectRowRef}`;
  const subjectNetIncomeCell = `${colToLetter(COLUMNS.NET_INCOME)}${subjectRowRef}`;

  // ===== EDITABLE MODEL INPUTS =====
  sectionHeader(sheet, row, 'Model Inputs (Editable Drivers)', 6);
  row++;
  const inputRows = {
    evRevenue: row,
    evEbitda: row + 1,
    pe: row + 2,
    weightEvRevenue: row + 3,
    weightEvEbitda: row + 4,
    weightPe: row + 5,
    netDebt: row + 6,
    shares: row + 7,
    marketPrice: row + 8,
  };

  const editableDrivers: Array<{ label: string; value: number | null; format: string }> = [
    { label: 'Median EV / Revenue', value: evRevenueStats.median, format: MULTIPLE_NUM_FMT },
    { label: 'Median EV / EBITDA', value: evEbitdaStats.median, format: MULTIPLE_NUM_FMT },
    { label: 'Median P / E', value: peStats.median, format: MULTIPLE_NUM_FMT },
    { label: 'Weight: EV / Revenue', value: 0.4, format: PERCENT_NUM_FMT },
    { label: 'Weight: EV / EBITDA', value: 0.4, format: PERCENT_NUM_FMT },
    { label: 'Weight: P / E', value: 0.2, format: PERCENT_NUM_FMT },
    { label: 'Net Debt (USD mm)', value: subjectNetDebtMM, format: MONEY_NUM_FMT },
    { label: 'Shares Outstanding (mm)', value: subjectSharesMM > 0 ? subjectSharesMM : null, format: SHARES_NUM_FMT },
    { label: 'Market Price (USD)', value: subjectMarketPrice, format: '#,##0.00' },
  ];

  editableDrivers.forEach((driver, idx) => {
    const driverRow = row + idx;
    const labelCell = sheet.getCell(driverRow, COLUMNS.COMPANY);
    labelCell.value = driver.label;
    styleKitBodyCell(labelCell);
    labelCell.alignment = { vertical: 'middle', horizontal: 'left' };

    const valueCell = sheet.getCell(driverRow, COLUMNS.COMPANY + 1);
    valueCell.value = driver.value;
    valueCell.numFmt = driver.format;
    styleKitInputCell(valueCell);
  });
  row += editableDrivers.length;

  sheet.getCell(row, COLUMNS.COMPANY).value = EDITABLE_INPUT_NOTE;
  sheet.getCell(row, COLUMNS.COMPANY).font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF6B7280' } };
  sheet.getCell(row, COLUMNS.COMPANY).alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.mergeCells(row, COLUMNS.COMPANY, row, COLUMNS.COMPANY + 5);
  row += 2;

  // ===== FORMULA OUTPUTS =====
  sectionHeader(sheet, row, 'Formula Valuation Outputs', 8);
  row++;
  const formulaHeaderRow = row;
  const formulaHeaders = [
    'Method',
    'Selected Multiple',
    'Target Metric',
    'Implied Enterprise Value',
    'Net Debt',
    'Implied Equity Value',
    'Shares Outstanding',
    'Implied Price / Share',
  ];
  formulaHeaders.forEach((header, idx) => {
    sheet.getCell(formulaHeaderRow, COLUMNS.COMPANY + idx).value = header;
  });
  tableHeader(sheet, formulaHeaderRow, COLUMNS.COMPANY, COLUMNS.COMPANY + 7);
  row++;

  const evRevenueMethodRow = row;
  const evEbitdaMethodRow = row + 1;
  const peMethodRow = row + 2;
  const blendedMethodRow = row + 3;

  const setMethodLabel = (targetRow: number, method: string) => {
    sheet.getCell(targetRow, COLUMNS.COMPANY).value = method;
    styleKitBodyCell(sheet.getCell(targetRow, COLUMNS.COMPANY));
    sheet.getCell(targetRow, COLUMNS.COMPANY).alignment = { vertical: 'middle', horizontal: 'left' };
  };

  setMethodLabel(evRevenueMethodRow, 'EV / Revenue');
  setMethodLabel(evEbitdaMethodRow, 'EV / EBITDA');
  setMethodLabel(peMethodRow, 'P / E');
  setMethodLabel(blendedMethodRow, 'Blended');

  // EV / Revenue
  setFormulaCell(
    sheet.getCell(evRevenueMethodRow, COLUMNS.COMPANY + 1),
    `=$B$${inputRows.evRevenue}`,
    evRevenueStats.median
  );
  sheet.getCell(evRevenueMethodRow, COLUMNS.COMPANY + 1).numFmt = MULTIPLE_NUM_FMT;
  setFormulaCell(
    sheet.getCell(evRevenueMethodRow, COLUMNS.COMPANY + 2),
    `=${subjectRevenueCell}`,
    subjectRevenueMM
  );
  sheet.getCell(evRevenueMethodRow, COLUMNS.COMPANY + 2).numFmt = MONEY_NUM_FMT;
  setFormulaCell(
    sheet.getCell(evRevenueMethodRow, COLUMNS.COMPANY + 3),
    `=IF(OR(B${evRevenueMethodRow}<=0,C${evRevenueMethodRow}<=0),"",B${evRevenueMethodRow}*C${evRevenueMethodRow})`,
    null
  );
  sheet.getCell(evRevenueMethodRow, COLUMNS.COMPANY + 3).numFmt = MONEY_NUM_FMT;

  // EV / EBITDA
  setFormulaCell(
    sheet.getCell(evEbitdaMethodRow, COLUMNS.COMPANY + 1),
    `=$B$${inputRows.evEbitda}`,
    evEbitdaStats.median
  );
  sheet.getCell(evEbitdaMethodRow, COLUMNS.COMPANY + 1).numFmt = MULTIPLE_NUM_FMT;
  setFormulaCell(
    sheet.getCell(evEbitdaMethodRow, COLUMNS.COMPANY + 2),
    `=${subjectEbitdaCell}`,
    subjectEbitdaMM
  );
  sheet.getCell(evEbitdaMethodRow, COLUMNS.COMPANY + 2).numFmt = MONEY_NUM_FMT;
  setFormulaCell(
    sheet.getCell(evEbitdaMethodRow, COLUMNS.COMPANY + 3),
    `=IF(OR(B${evEbitdaMethodRow}<=0,C${evEbitdaMethodRow}<=0),"",B${evEbitdaMethodRow}*C${evEbitdaMethodRow})`,
    null
  );
  sheet.getCell(evEbitdaMethodRow, COLUMNS.COMPANY + 3).numFmt = MONEY_NUM_FMT;

  // P / E
  setFormulaCell(
    sheet.getCell(peMethodRow, COLUMNS.COMPANY + 1),
    `=$B$${inputRows.pe}`,
    peStats.median
  );
  sheet.getCell(peMethodRow, COLUMNS.COMPANY + 1).numFmt = MULTIPLE_NUM_FMT;
  setFormulaCell(
    sheet.getCell(peMethodRow, COLUMNS.COMPANY + 2),
    `=${subjectNetIncomeCell}`,
    subjectNetIncomeMM
  );
  sheet.getCell(peMethodRow, COLUMNS.COMPANY + 2).numFmt = MONEY_NUM_FMT;
  setFormulaCell(
    sheet.getCell(peMethodRow, COLUMNS.COMPANY + 5),
    `=IF(OR(B${peMethodRow}<=0,C${peMethodRow}<=0),"",B${peMethodRow}*C${peMethodRow})`,
    null
  );
  sheet.getCell(peMethodRow, COLUMNS.COMPANY + 5).numFmt = MONEY_NUM_FMT;
  setFormulaCell(
    sheet.getCell(peMethodRow, COLUMNS.COMPANY + 3),
    `=IF(F${peMethodRow}="","",F${peMethodRow}+$B$${inputRows.netDebt})`,
    null
  );
  sheet.getCell(peMethodRow, COLUMNS.COMPANY + 3).numFmt = MONEY_NUM_FMT;

  // Shared columns for all methods
  [evRevenueMethodRow, evEbitdaMethodRow, peMethodRow].forEach((methodRow) => {
    setFormulaCell(
      sheet.getCell(methodRow, COLUMNS.COMPANY + 4),
      `=$B$${inputRows.netDebt}`,
      subjectNetDebtMM
    );
    sheet.getCell(methodRow, COLUMNS.COMPANY + 4).numFmt = MONEY_NUM_FMT;

    if (methodRow !== peMethodRow) {
      setFormulaCell(
        sheet.getCell(methodRow, COLUMNS.COMPANY + 5),
        `=IF(D${methodRow}="","",D${methodRow}-E${methodRow})`,
        null
      );
      sheet.getCell(methodRow, COLUMNS.COMPANY + 5).numFmt = MONEY_NUM_FMT;
    }

    setFormulaCell(
      sheet.getCell(methodRow, COLUMNS.COMPANY + 6),
      `=$B$${inputRows.shares}`,
      subjectSharesMM
    );
    sheet.getCell(methodRow, COLUMNS.COMPANY + 6).numFmt = SHARES_NUM_FMT;
    setFormulaCell(
      sheet.getCell(methodRow, COLUMNS.COMPANY + 7),
      `=IF(OR(F${methodRow}="",G${methodRow}<=0),"",F${methodRow}/G${methodRow})`,
      null
    );
    sheet.getCell(methodRow, COLUMNS.COMPANY + 7).numFmt = '#,##0.00';
  });

  const blendedPriceFormula = `=IFERROR((IF(H${evRevenueMethodRow}="",0,H${evRevenueMethodRow}*$B$${inputRows.weightEvRevenue})+IF(H${evEbitdaMethodRow}="",0,H${evEbitdaMethodRow}*$B$${inputRows.weightEvEbitda})+IF(H${peMethodRow}="",0,H${peMethodRow}*$B$${inputRows.weightPe}))/(IF(H${evRevenueMethodRow}="",0,$B$${inputRows.weightEvRevenue})+IF(H${evEbitdaMethodRow}="",0,$B$${inputRows.weightEvEbitda})+IF(H${peMethodRow}="",0,$B$${inputRows.weightPe})),"")`;

  setFormulaCell(sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 3), `=IF(H${blendedMethodRow}="","",F${blendedMethodRow}+$B$${inputRows.netDebt})`, null);
  sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 3).numFmt = MONEY_NUM_FMT;
  setFormulaCell(sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 4), `=$B$${inputRows.netDebt}`, subjectNetDebtMM);
  sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 4).numFmt = MONEY_NUM_FMT;
  setFormulaCell(sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 5), `=IF(H${blendedMethodRow}="","",H${blendedMethodRow}*$B$${inputRows.shares})`, null);
  sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 5).numFmt = MONEY_NUM_FMT;
  setFormulaCell(sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 6), `=$B$${inputRows.shares}`, subjectSharesMM);
  sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 6).numFmt = SHARES_NUM_FMT;
  setFormulaCell(sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 7), blendedPriceFormula, null);
  sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 7).numFmt = '#,##0.00';
  sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 1).value = 'Weighted';
  sheet.getCell(blendedMethodRow, COLUMNS.COMPANY + 2).value = '—';

  for (let r = evRevenueMethodRow; r <= blendedMethodRow; r++) {
    for (let c = COLUMNS.COMPANY + 1; c <= COLUMNS.COMPANY + 7; c++) {
      styleKitOutputCell(sheet.getCell(r, c));
    }
  }
  for (let c = COLUMNS.COMPANY; c <= COLUMNS.COMPANY + 7; c++) {
    const cell = sheet.getCell(blendedMethodRow, c);
    cell.font = { ...cell.font, bold: true };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
  }
  row = blendedMethodRow + 1;

  // ===== VALUATION RANGE TABLE =====
  row += 1;
  sectionHeader(sheet, row, 'Valuation Range (Trading Comps)', 6);
  row++;
  const rangeHeaderRow = row;
  sheet.getCell(row, COLUMNS.COMPANY).value = 'Percentile';
  sheet.getCell(row, COLUMNS.COMPANY + 1).value = 'Multiple';
  sheet.getCell(row, COLUMNS.COMPANY + 2).value = 'Implied EV';
  sheet.getCell(row, COLUMNS.COMPANY + 3).value = 'Implied Equity';
  sheet.getCell(row, COLUMNS.COMPANY + 4).value = 'Implied Price';
  sheet.getCell(row, COLUMNS.COMPANY + 5).value = 'Premium / (Discount)';
  tableHeader(sheet, row, COLUMNS.COMPANY, COLUMNS.COMPANY + 5);
  row++;

  const multipleStats =
    evEbitdaStats.median != null && subjectEbitdaMM != null && subjectEbitdaMM > 0
      ? { label: 'EV / EBITDA', stats: evEbitdaStats, metric: subjectEbitdaMM }
      : evRevenueStats.median != null && subjectRevenueMM != null && subjectRevenueMM > 0
      ? { label: 'EV / Revenue', stats: evRevenueStats, metric: subjectRevenueMM }
      : null;

  const currentPrice = subjectMarketPrice;
  const subjectNetDebtSafe = subjectNetDebtMM ?? 0;
  const subjectSharesSafe = subjectSharesMM > 0 ? subjectSharesMM : 1;
  const rangeRows = multipleStats
    ? [
        { label: '25th Percentile', multiple: multipleStats.stats.p25 },
        { label: 'Median', multiple: multipleStats.stats.median },
        { label: '75th Percentile', multiple: multipleStats.stats.p75 },
        { label: 'Mean', multiple: multipleStats.stats.mean },
      ]
    : [];

  rangeRows.forEach((rstat) => {
    const isMedian = rstat.label === 'Median';
    sheet.getCell(row, COLUMNS.COMPANY).value = rstat.label;
    styleKitBodyCell(sheet.getCell(row, COLUMNS.COMPANY));
    sheet.getCell(row, COLUMNS.COMPANY).alignment = { vertical: 'middle', horizontal: 'left' };

    const multCell = sheet.getCell(row, COLUMNS.COMPANY + 1);
    if (rstat.multiple != null) {
      multCell.value = rstat.multiple;
      multCell.numFmt = '#,##0.0"x"';
    }
    styleKitBodyCell(multCell);

    const impliedEv = rstat.multiple != null ? rstat.multiple * (multipleStats?.metric ?? 0) : null;
    const impliedEquity = impliedEv != null ? impliedEv - subjectNetDebtSafe : null;
    const impliedPrice = impliedEquity != null ? impliedEquity / subjectSharesSafe : null;
    const premium = currentPrice != null && impliedPrice != null ? impliedPrice / currentPrice - 1 : null;

    const evCell = sheet.getCell(row, COLUMNS.COMPANY + 2);
    if (impliedEv != null) {
      evCell.value = impliedEv;
      evCell.numFmt = '"$"#,##0_;("$"#,##0)';
    }
    styleKitBodyCell(evCell);

    const eqCell = sheet.getCell(row, COLUMNS.COMPANY + 3);
    if (impliedEquity != null) {
      eqCell.value = impliedEquity;
      eqCell.numFmt = '"$"#,##0_;("$"#,##0)';
    }
    styleKitBodyCell(eqCell);

    const priceCell = sheet.getCell(row, COLUMNS.COMPANY + 4);
    if (impliedPrice != null) {
      priceCell.value = impliedPrice;
      priceCell.numFmt = '"$"#,##0.00';
    }
    styleKitBodyCell(priceCell);

    const premCell = sheet.getCell(row, COLUMNS.COMPANY + 5);
    if (premium != null) {
      premCell.value = premium;
      premCell.numFmt = '0.0%';
    }
    styleKitBodyCell(premCell);

    if (isMedian) {
      for (let c = COLUMNS.COMPANY; c <= COLUMNS.COMPANY + 5; c++) {
        const cell = sheet.getCell(row, c);
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
        cell.font = { ...cell.font, bold: true };
      }
    }
    row++;
  });

  // ===== VALUATION CONCLUSION =====
  row += 1;
  sectionHeader(sheet, row, 'Valuation Conclusion', 6);
  row++;
  const p25Equity = rangeRows[0]?.multiple != null && multipleStats ? rangeRows[0].multiple * multipleStats.metric - subjectNetDebtSafe : null;
  const p75Equity = rangeRows[2]?.multiple != null && multipleStats ? rangeRows[2].multiple * multipleStats.metric - subjectNetDebtSafe : null;
  const medianPrice = rangeRows[1]?.multiple != null && multipleStats ? (rangeRows[1].multiple * multipleStats.metric - subjectNetDebtSafe) / subjectSharesSafe : null;
  const medianPremium = currentPrice != null && medianPrice != null ? medianPrice / currentPrice - 1 : null;

  sheet.getCell(row, COLUMNS.COMPANY).value = 'Implied Equity Value Range';
  styleKitBodyCell(sheet.getCell(row, COLUMNS.COMPANY));
  sheet.getCell(row, COLUMNS.COMPANY + 1).value = p25Equity != null && p75Equity != null ? `${p25Equity.toFixed(0)} – ${p75Equity.toFixed(0)}` : 'N/A';
  styleKitBodyCell(sheet.getCell(row, COLUMNS.COMPANY + 1));
  row++;

  sheet.getCell(row, COLUMNS.COMPANY).value = 'Blended Implied Price';
  styleKitBodyCell(sheet.getCell(row, COLUMNS.COMPANY));
  setFormulaCell(
    sheet.getCell(row, COLUMNS.COMPANY + 1),
    `=H${blendedMethodRow}`,
    medianPrice
  );
  sheet.getCell(row, COLUMNS.COMPANY + 1).numFmt = '#,##0.00';
  styleKitBodyCell(sheet.getCell(row, COLUMNS.COMPANY + 1));
  row++;

  sheet.getCell(row, COLUMNS.COMPANY).value = 'Premium / (Discount) to Current';
  styleKitBodyCell(sheet.getCell(row, COLUMNS.COMPANY));
  setFormulaCell(
    sheet.getCell(row, COLUMNS.COMPANY + 1),
    `=IF(OR($B$${inputRows.marketPrice}<=0,H${blendedMethodRow}=""),"",H${blendedMethodRow}/$B$${inputRows.marketPrice}-1)`,
    medianPremium
  );
  sheet.getCell(row, COLUMNS.COMPANY + 1).numFmt = PERCENT_NUM_FMT;
  styleKitBodyCell(sheet.getCell(row, COLUMNS.COMPANY + 1));
  row++;

  const takeawayParts: string[] = [];
  if (medianPremium != null) {
    takeawayParts.push(`Median implied price is ${medianPremium >= 0 ? 'above' : 'below'} the current price.`);
  }
  if (p25Equity != null && p75Equity != null) {
    takeawayParts.push('Implied equity value range reflects 25th–75th percentile trading comps.');
  }
  const takeaway = takeawayParts.length > 0
    ? `${takeawayParts.join(' ')} Multiples-based valuation should be interpreted alongside business quality and growth visibility.`
    : 'Implied valuation reflects available comps and should be interpreted alongside business quality and growth visibility.';
  sheet.getCell(row, COLUMNS.COMPANY).value = takeaway;
  sheet.getCell(row, COLUMNS.COMPANY).font = { name: 'Calibri', size: 9, color: { argb: 'FF666666' } };
  sheet.getCell(row, COLUMNS.COMPANY).alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
  sheet.mergeCells(row, COLUMNS.COMPANY, row + 1, COLUMNS.COMPANY + 5);
  row += 2;

  // ===== FOOTNOTES =====
  row += 1;
  
  const footnoteRow = sheet.getRow(row);
  footnoteRow.getCell(COLUMNS.COMPANY).value = 'Note: Multiples shown only where sufficient public data is available.';
  footnoteRow.getCell(COLUMNS.COMPANY).style = {
    font: { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF999999' } },
    alignment: { vertical: 'middle', horizontal: 'left' },
  };
  sheet.mergeCells(row, COLUMNS.COMPANY, row, COLUMNS.NOTES);
  
  sheet.pageSetup = {
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    orientation: 'portrait',
    margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  };

  const compsLastRow = row;
  zebraRows(sheet, dataStartRow, lastDataRow, COLUMNS.COMPANY, COLUMNS.NOTES);
  borderBox(sheet, compsTableHeaderRow, COLUMNS.COMPANY, lastDataRow, COLUMNS.NOTES);
  applySheetDefaults(sheet, { freezeRow: 3, freezeCol: 0, headerRowCount: 3, lastCol: lastDataCol, lastRow: compsLastRow });
  hideUnusedArea(sheet, lastDataCol, compsLastRow);

  // Peer Data sheet: full peer list with zebra striping
  const peerSheet = workbook.addWorksheet('Peer Data');
  const peerLastCol = 11;
  let pr = titleBar(peerSheet, 'Comparable Company Analysis', peerLastCol);
  const peerHeaders = [
    'Company Name',
    'Ticker',
    'Sector',
    'Revenue LTM',
    'EBITDA LTM',
    'Net Income LTM',
    'Cash',
    'Total Debt',
    'Market Cap',
    'Enterprise Value',
    'As-of',
  ];
  const peerHeaderRow = pr;
  peerHeaders.forEach((h, idx) => {
    peerSheet.getCell(pr, idx + 1).value = h;
  });
  tableHeader(peerSheet, pr, 1, peerLastCol);
  peerSheet.getCell(pr, 1).alignment = { vertical: 'middle', horizontal: 'left' };
  peerSheet.getCell(pr, 2).alignment = { vertical: 'middle', horizontal: 'left' };
  peerSheet.getCell(pr, 3).alignment = { vertical: 'middle', horizontal: 'left' };
  pr++;
  const peerDataStartRow = pr;
  allComps.forEach((comp, idx) => {
    peerSheet.getCell(pr, 1).value = safeString(comp.companyName ?? comp.name ?? comp.ticker ?? '');
    peerSheet.getCell(pr, 2).value = safeString(comp.ticker ?? '').toUpperCase();
    peerSheet.getCell(pr, 3).value = safeString(comp.sector ?? '') || 'N/A';
    const revMM = normalizeUsdMillions(comp.revenue);
    const ebitdaMM = normalizeUsdMillions(comp.ebitda);
    const niMM = normalizeUsdMillions(comp.netIncome);
    const cashMM = normalizeUsdMillions(comp.cash);
    const debtMM = normalizeUsdMillions(comp.debt);
    const mcapMM = normalizeUsdMillions(comp.marketCap);
    let evMM = normalizeUsdMillions(comp.ev ?? comp.enterpriseValue);
    if (evMM === null && mcapMM !== null) {
      const netDebtVal = comp.netDebt != null ? normalizeUsdMillions(comp.netDebt) : (debtMM ?? 0) - (cashMM ?? 0);
      evMM = mcapMM + (netDebtVal ?? (debtMM ?? 0) - (cashMM ?? 0));
    }
    peerSheet.getCell(pr, 4).value = revMM != null ? revMM : null;
    peerSheet.getCell(pr, 5).value = ebitdaMM != null ? ebitdaMM : null;
    peerSheet.getCell(pr, 6).value = niMM != null ? niMM : null;
    peerSheet.getCell(pr, 7).value = cashMM != null ? cashMM : null;
    peerSheet.getCell(pr, 8).value = debtMM != null ? debtMM : null;
    peerSheet.getCell(pr, 9).value = mcapMM != null ? mcapMM : null;
    peerSheet.getCell(pr, 10).value = evMM != null ? evMM : null;
    peerSheet.getCell(pr, 11).value = asOfDate;
    for (let c = 1; c <= peerLastCol; c++) {
      const cell = peerSheet.getCell(pr, c);
      styleKitBodyCell(cell);
      cell.alignment = { vertical: 'middle', horizontal: c <= 3 ? 'left' : 'right' };
      if (c >= 4 && c <= 10 && cell.value != null && typeof cell.value === 'number') {
        cell.numFmt = '"$"#,##0_;("$"#,##0)';
      }
    }
    pr++;
  });
  const peerLastRow = pr - 1;
  if (peerLastRow >= peerDataStartRow) {
    zebraRows(peerSheet, peerDataStartRow, peerLastRow, 1, peerLastCol);
    borderBox(peerSheet, peerHeaderRow, 1, peerLastRow, peerLastCol);
  }
  setColWidthsKit(peerSheet, [28, 10, 18, 14, 14, 14, 14, 14, 14, 14, 12]);
  applySheetDefaults(peerSheet, { freezeRow: 3, freezeCol: 0, headerRowCount: 3, lastCol: peerLastCol, lastRow: peerLastRow });
  hideUnusedArea(peerSheet, peerLastCol, peerLastRow);

  await applyFormulaModelProtection(workbook, 'comps');
  return workbook;
}
