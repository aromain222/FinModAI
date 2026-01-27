/**
 * Banker-Grade Comparable Company Analysis (CCA) Generator
 * 
 * Generates investment banking-quality trading comps models with peer benchmarking,
 * valuation multiples, and implied valuations. Matches Macabacus/BIWS standards.
 */

import ExcelJS from 'exceljs';
import { APP_NAME } from '@/lib/branding';

type CompanyData = {
  name: string;
  ticker: string;
  marketCap: number; // $ millions
  enterpriseValue: number; // $ millions
  ltmRevenue: number; // $ millions
  ltmEBITDA: number; // $ millions
  ltmEBIT: number; // $ millions
  ltmNetIncome: number; // $ millions
};

type CompsInputs = {
  // Target company
  targetTicker: string;
  targetCompanyName?: string;
  
  // Target metrics
  targetMarketCap?: number;
  targetEnterpriseValue?: number;
  targetLTMRevenue?: number;
  targetLTMEBITDA?: number;
  targetLTMEBIT?: number;
  targetLTMNetIncome?: number;
  targetSharesOutstanding?: number;
  
  // Comparable companies (8-12 peers)
  comparables?: CompanyData[];
  
  // Optional: Auto-select peers based on sector/market cap
  autoSelectPeers?: boolean;
  sector?: string;
  marketCapRange?: [number, number]; // [min, max] in millions
};

// Color scheme matching IB standards
const COLORS = {
  HEADER: 'FF4F81BD', // Blue
  SUB_HEADER: 'FFD9D9D9', // Grey
  ASSUMPTION: 'FFFFEB9C', // Pale Yellow
  MEDIAN_ROW: 'FFD9D9D9', // Grey
  IMPLIED_VALUATION: 'FFFFEB9C', // Pale Yellow
  WHITE: 'FFFFFFFF',
  BORDER: 'FFD0D0D0'
};

// Font standards
const FONT_HEADER = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
const FONT_SUB_HEADER = { name: 'Calibri', size: 10, bold: true };
const FONT_NORMAL = { name: 'Calibri', size: 10 };
const FONT_BOLD = { name: 'Calibri', size: 10, bold: true };

export async function generateCompsModel(inputs: CompsInputs): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = APP_NAME;
  workbook.created = new Date();
  
  const sheet = workbook.addWorksheet('Comparable Company Analysis', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true },
    views: [{ state: 'frozen', xSplit: 0, ySplit: 3 }] // Freeze first 3 rows
  });
  
  // Set column widths
  sheet.getColumn(1).width = 25; // Name
  sheet.getColumn(2).width = 10; // Ticker
  sheet.getColumn(3).width = 16; // Market Cap
  sheet.getColumn(4).width = 16; // Enterprise Value
  sheet.getColumn(5).width = 14; // LTM Revenue
  sheet.getColumn(6).width = 14; // LTM EBITDA
  sheet.getColumn(7).width = 14; // LTM EBIT
  sheet.getColumn(8).width = 14; // LTM Net Income
  sheet.getColumn(9).width = 12; // TEV/Revenue
  sheet.getColumn(10).width = 12; // TEV/EBITDA
  sheet.getColumn(11).width = 12; // TEV/EBIT
  sheet.getColumn(12).width = 12; // P/E
  
  let currentRow = 1;
  
  // ========== SECTION A: HEADER ==========
  currentRow = buildHeader(sheet, currentRow);
  currentRow += 1;
  
  // ========== SECTION B: COMPANY TABLE ==========
  const tableStartRow = currentRow;
  currentRow = buildCompanyTable(sheet, currentRow, inputs);
  currentRow += 2;
  
  // ========== SECTION C: SUMMARY STATISTICS ==========
  const statsStartRow = currentRow;
  currentRow = buildSummaryStatistics(sheet, currentRow, inputs, tableStartRow);
  currentRow += 2;
  
  // ========== SECTION D: IMPLIED VALUATION ==========
  currentRow = buildImpliedValuation(sheet, currentRow, inputs, statsStartRow);
  
  return workbook;
}

function buildHeader(
  sheet: ExcelJS.Worksheet,
  startRow: number
): number {
  let row = startRow;
  
  // Main title
  const titleCell = sheet.getCell(row, 1);
  titleCell.value = 'Comparable Company Analysis (CCA)';
  titleCell.font = { ...FONT_HEADER, size: 14 };
  titleCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.HEADER }
  };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  sheet.mergeCells(row, 1, row, 12);
  row++;
  
  // Units
  const unitsCell = sheet.getCell(row, 1);
  unitsCell.value = '$ in millions';
  unitsCell.font = { name: 'Calibri', size: 9, italic: true };
  row++;
  
  // Present date
  const dateCell = sheet.getCell(row, 1);
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  dateCell.value = `Present Date: ${today}`;
  dateCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF0000FF' } };
  row++;
  
  return row;
}

function buildCompanyTable(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  inputs: CompsInputs
): number {
  let row = startRow;
  
  // Column headers
  const headerRow = sheet.getRow(row);
  const headers = [
    'Name',
    'Ticker',
    'Market Capitalization',
    'Enterprise Value (TEV)',
    'LTM Revenue',
    'LTM EBITDA',
    'LTM EBIT',
    'LTM Net Income',
    'TEV / Revenue',
    'TEV / EBITDA',
    'TEV / EBIT',
    'P/E'
  ];
  
  headers.forEach((header, idx) => {
    const cell = headerRow.getCell(idx + 1);
    cell.value = header;
    cell.font = FONT_SUB_HEADER;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.SUB_HEADER }
    };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.BORDER } },
      bottom: { style: 'thin', color: { argb: COLORS.BORDER } },
      left: { style: 'thin', color: { argb: COLORS.BORDER } },
      right: { style: 'thin', color: { argb: COLORS.BORDER } }
    };
  });
  
  headerRow.height = 30;
  row++;
  
  const dataStartRow = row;
  
  // Target company row (first row, highlighted)
  const targetRow = sheet.getRow(row);
  targetRow.getCell(1).value = inputs.targetCompanyName || inputs.targetTicker;
  targetRow.getCell(1).font = FONT_BOLD;
  targetRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.ASSUMPTION }
  };
  
  targetRow.getCell(2).value = inputs.targetTicker;
  targetRow.getCell(2).font = FONT_BOLD;
  targetRow.getCell(2).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.ASSUMPTION }
  };
  
  // Target metrics
  const targetMetrics = [
    inputs.targetMarketCap || 1000000,
    inputs.targetEnterpriseValue || 1050000,
    inputs.targetLTMRevenue || 400000,
    inputs.targetLTMEBITDA || 120000,
    inputs.targetLTMEBIT || 100000,
    inputs.targetLTMNetIncome || 75000
  ];
  
  targetMetrics.forEach((value, idx) => {
    const cell = targetRow.getCell(idx + 3);
    cell.value = value;
    cell.numFmt = '$#,##0';
    cell.font = FONT_BOLD;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.ASSUMPTION }
    };
    cell.alignment = { horizontal: 'right' };
  });
  
  // Target multiples (calculated)
  const targetMultiples = [
    inputs.targetEnterpriseValue && inputs.targetLTMRevenue ? inputs.targetEnterpriseValue / inputs.targetLTMRevenue : 0,
    inputs.targetEnterpriseValue && inputs.targetLTMEBITDA ? inputs.targetEnterpriseValue / inputs.targetLTMEBITDA : 0,
    inputs.targetEnterpriseValue && inputs.targetLTMEBIT ? inputs.targetEnterpriseValue / inputs.targetLTMEBIT : 0,
    inputs.targetMarketCap && inputs.targetLTMNetIncome ? inputs.targetMarketCap / inputs.targetLTMNetIncome : 0
  ];
  
  targetMultiples.forEach((value, idx) => {
    const cell = targetRow.getCell(idx + 9);
    cell.value = value;
    cell.numFmt = '0.0x';
    cell.font = FONT_BOLD;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.ASSUMPTION }
    };
    cell.alignment = { horizontal: 'center' };
  });
  
  row++;
  
  // Comparable companies
  const comparables = inputs.comparables || generateDefaultComparables(inputs.targetTicker);
  
  comparables.forEach((comp) => {
    const compRow = sheet.getRow(row);
    
    compRow.getCell(1).value = comp.name;
    compRow.getCell(1).font = FONT_NORMAL;
    
    compRow.getCell(2).value = comp.ticker;
    compRow.getCell(2).font = FONT_NORMAL;
    
    // Metrics
    const metrics = [
      comp.marketCap,
      comp.enterpriseValue,
      comp.ltmRevenue,
      comp.ltmEBITDA,
      comp.ltmEBIT,
      comp.ltmNetIncome
    ];
    
    metrics.forEach((value, idx) => {
      const cell = compRow.getCell(idx + 3);
      cell.value = value;
      cell.numFmt = '$#,##0';
      cell.font = FONT_NORMAL;
      cell.alignment = { horizontal: 'right' };
    });
    
    // Multiples (calculated)
    const multiples = [
      comp.enterpriseValue / comp.ltmRevenue,
      comp.enterpriseValue / comp.ltmEBITDA,
      comp.enterpriseValue / comp.ltmEBIT,
      comp.marketCap / comp.ltmNetIncome
    ];
    
    multiples.forEach((value, idx) => {
      const cell = compRow.getCell(idx + 9);
      cell.value = value;
      cell.numFmt = '0.0x';
      cell.font = FONT_NORMAL;
      cell.alignment = { horizontal: 'center' };
    });
    
    row++;
  });
  
  return row;
}

function buildSummaryStatistics(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  inputs: CompsInputs,
  tableStartRow: number
): number {
  let row = startRow;
  
  // Section header
  const headerCell = sheet.getCell(row, 1);
  headerCell.value = 'Summary Statistics';
  headerCell.font = FONT_SUB_HEADER;
  row++;
  
  // Calculate statistics for each multiple
  const comparables = inputs.comparables || generateDefaultComparables(inputs.targetTicker);
  
  // Extract multiples
  const tevRevenueMultiples = comparables.map(c => c.enterpriseValue / c.ltmRevenue);
  const tevEBITDAMultiples = comparables.map(c => c.enterpriseValue / c.ltmEBITDA);
  const tevEBITMultiples = comparables.map(c => c.enterpriseValue / c.ltmEBIT);
  const peMultiples = comparables.map(c => c.marketCap / c.ltmNetIncome);
  
  // Statistics rows
  const stats = [
    { label: 'Minimum', isMedian: false },
    { label: '25th Percentile', isMedian: false },
    { label: 'Median', isMedian: true },
    { label: 'Mean', isMedian: false },
    { label: '75th Percentile', isMedian: false },
    { label: 'Maximum', isMedian: false }
  ];
  
  // Column headers for statistics
  const statsHeaderRow = sheet.getRow(row);
  statsHeaderRow.getCell(1).value = 'Statistic';
  statsHeaderRow.getCell(1).font = FONT_SUB_HEADER;
  statsHeaderRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.SUB_HEADER }
  };
  
  const multipleHeaders = ['TEV / Revenue', 'TEV / EBITDA', 'TEV / EBIT', 'P/E'];
  multipleHeaders.forEach((header, idx) => {
    const cell = statsHeaderRow.getCell(idx + 2);
    cell.value = header;
    cell.font = FONT_SUB_HEADER;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.SUB_HEADER }
    };
    cell.alignment = { horizontal: 'center' };
  });
  row++;
  
  // Calculate and populate statistics
  stats.forEach((stat) => {
    const statRow = sheet.getRow(row);
    statRow.getCell(1).value = stat.label;
    statRow.getCell(1).font = stat.isMedian ? FONT_BOLD : FONT_NORMAL;
    
    if (stat.isMedian) {
      statRow.getCell(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: COLORS.MEDIAN_ROW }
      };
    }
    
    // Calculate statistic for each multiple
    const multipleArrays = [tevRevenueMultiples, tevEBITDAMultiples, tevEBITMultiples, peMultiples];
    
    multipleArrays.forEach((multiples, idx) => {
      const cell = statRow.getCell(idx + 2);
      const value = calculateStatistic(multiples, stat.label);
      cell.value = value;
      cell.numFmt = '0.0x';
      cell.font = stat.isMedian ? FONT_BOLD : FONT_NORMAL;
      cell.alignment = { horizontal: 'center' };
      
      if (stat.isMedian) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: COLORS.MEDIAN_ROW }
        };
      }
      
      cell.border = {
        top: { style: 'thin', color: { argb: COLORS.BORDER } },
        bottom: { style: 'thin', color: { argb: COLORS.BORDER } },
        left: { style: 'thin', color: { argb: COLORS.BORDER } },
        right: { style: 'thin', color: { argb: COLORS.BORDER } }
      };
    });
    
    row++;
  });
  
  return row;
}

function buildImpliedValuation(
  sheet: ExcelJS.Worksheet,
  startRow: number,
  inputs: CompsInputs,
  statsStartRow: number
): number {
  let row = startRow;
  
  // Section header
  const headerCell = sheet.getCell(row, 1);
  headerCell.value = 'Target Company — Implied Valuation';
  headerCell.font = { ...FONT_SUB_HEADER, size: 11 };
  headerCell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.IMPLIED_VALUATION }
  };
  sheet.mergeCells(row, 1, row, 5);
  row++;
  
  // Column headers
  const colHeaderRow = sheet.getRow(row);
  colHeaderRow.getCell(1).value = 'Method';
  colHeaderRow.getCell(1).font = FONT_SUB_HEADER;
  colHeaderRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.SUB_HEADER }
  };
  
  const multipleHeaders = ['TEV / Revenue', 'TEV / EBITDA', 'TEV / EBIT', 'P/E'];
  multipleHeaders.forEach((header, idx) => {
    const cell = colHeaderRow.getCell(idx + 2);
    cell.value = header;
    cell.font = FONT_SUB_HEADER;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.SUB_HEADER }
    };
    cell.alignment = { horizontal: 'center' };
  });
  row++;
  
  // Calculate implied valuations
  const comparables = inputs.comparables || generateDefaultComparables(inputs.targetTicker);
  
  const tevRevenueMultiples = comparables.map(c => c.enterpriseValue / c.ltmRevenue);
  const tevEBITDAMultiples = comparables.map(c => c.enterpriseValue / c.ltmEBITDA);
  const tevEBITMultiples = comparables.map(c => c.enterpriseValue / c.ltmEBIT);
  const peMultiples = comparables.map(c => c.marketCap / c.ltmNetIncome);
  
  const medianTEVRevenue = calculateStatistic(tevRevenueMultiples, 'Median');
  const medianTEVEBITDA = calculateStatistic(tevEBITDAMultiples, 'Median');
  const medianTEVEBIT = calculateStatistic(tevEBITMultiples, 'Median');
  const medianPE = calculateStatistic(peMultiples, 'Median');
  
  const meanTEVRevenue = calculateStatistic(tevRevenueMultiples, 'Mean');
  const meanTEVEBITDA = calculateStatistic(tevEBITDAMultiples, 'Mean');
  const meanTEVEBIT = calculateStatistic(tevEBITMultiples, 'Mean');
  const meanPE = calculateStatistic(peMultiples, 'Mean');
  
  // Target metrics
  const targetRevenue = inputs.targetLTMRevenue || 400000;
  const targetEBITDA = inputs.targetLTMEBITDA || 120000;
  const targetEBIT = inputs.targetLTMEBIT || 100000;
  const targetNetIncome = inputs.targetLTMNetIncome || 75000;
  
  // Median row
  const medianRow = sheet.getRow(row);
  medianRow.getCell(1).value = 'Median Implied Valuation';
  medianRow.getCell(1).font = FONT_BOLD;
  medianRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.IMPLIED_VALUATION }
  };
  
  const medianValues = [
    targetRevenue * medianTEVRevenue,
    targetEBITDA * medianTEVEBITDA,
    targetEBIT * medianTEVEBIT,
    targetNetIncome * medianPE
  ];
  
  medianValues.forEach((value, idx) => {
    const cell = medianRow.getCell(idx + 2);
    cell.value = value;
    cell.numFmt = '$#,##0';
    cell.font = FONT_BOLD;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.IMPLIED_VALUATION }
    };
    cell.alignment = { horizontal: 'right' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.BORDER } },
      bottom: { style: 'thin', color: { argb: COLORS.BORDER } },
      left: { style: 'thin', color: { argb: COLORS.BORDER } },
      right: { style: 'thin', color: { argb: COLORS.BORDER } }
    };
  });
  row++;
  
  // Mean row
  const meanRow = sheet.getRow(row);
  meanRow.getCell(1).value = 'Mean Implied Valuation';
  meanRow.getCell(1).font = FONT_BOLD;
  meanRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: COLORS.IMPLIED_VALUATION }
  };
  
  const meanValues = [
    targetRevenue * meanTEVRevenue,
    targetEBITDA * meanTEVEBITDA,
    targetEBIT * meanTEVEBIT,
    targetNetIncome * meanPE
  ];
  
  meanValues.forEach((value, idx) => {
    const cell = meanRow.getCell(idx + 2);
    cell.value = value;
    cell.numFmt = '$#,##0';
    cell.font = FONT_BOLD;
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: COLORS.IMPLIED_VALUATION }
    };
    cell.alignment = { horizontal: 'right' };
    cell.border = {
      top: { style: 'thin', color: { argb: COLORS.BORDER } },
      bottom: { style: 'thin', color: { argb: COLORS.BORDER } },
      left: { style: 'thin', color: { argb: COLORS.BORDER } },
      right: { style: 'thin', color: { argb: COLORS.BORDER } }
    };
  });
  row++;
  
  return row;
}

function calculateStatistic(values: number[], statistic: string): number {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  
  switch (statistic) {
    case 'Minimum':
      return sorted[0];
    case '25th Percentile':
      return sorted[Math.floor(n * 0.25)];
    case 'Median':
      return n % 2 === 0 ? (sorted[n / 2 - 1] + sorted[n / 2]) / 2 : sorted[Math.floor(n / 2)];
    case 'Mean':
      return values.reduce((sum, val) => sum + val, 0) / n;
    case '75th Percentile':
      return sorted[Math.floor(n * 0.75)];
    case 'Maximum':
      return sorted[n - 1];
    default:
      return 0;
  }
}

function generateDefaultComparables(targetTicker: string): CompanyData[] {
  // Default comparable companies (would be replaced with real data from API)
  return [
    {
      name: 'Peer Company 1',
      ticker: 'PEER1',
      marketCap: 950000,
      enterpriseValue: 1000000,
      ltmRevenue: 380000,
      ltmEBITDA: 110000,
      ltmEBIT: 95000,
      ltmNetIncome: 70000
    },
    {
      name: 'Peer Company 2',
      ticker: 'PEER2',
      marketCap: 1100000,
      enterpriseValue: 1150000,
      ltmRevenue: 420000,
      ltmEBITDA: 130000,
      ltmEBIT: 110000,
      ltmNetIncome: 80000
    },
    {
      name: 'Peer Company 3',
      ticker: 'PEER3',
      marketCap: 850000,
      enterpriseValue: 900000,
      ltmRevenue: 350000,
      ltmEBITDA: 100000,
      ltmEBIT: 85000,
      ltmNetIncome: 65000
    },
    {
      name: 'Peer Company 4',
      ticker: 'PEER4',
      marketCap: 1200000,
      enterpriseValue: 1250000,
      ltmRevenue: 450000,
      ltmEBITDA: 140000,
      ltmEBIT: 120000,
      ltmNetIncome: 90000
    },
    {
      name: 'Peer Company 5',
      ticker: 'PEER5',
      marketCap: 900000,
      enterpriseValue: 950000,
      ltmRevenue: 370000,
      ltmEBITDA: 105000,
      ltmEBIT: 90000,
      ltmNetIncome: 68000
    },
    {
      name: 'Peer Company 6',
      ticker: 'PEER6',
      marketCap: 1050000,
      enterpriseValue: 1100000,
      ltmRevenue: 410000,
      ltmEBITDA: 125000,
      ltmEBIT: 105000,
      ltmNetIncome: 78000
    },
    {
      name: 'Peer Company 7',
      ticker: 'PEER7',
      marketCap: 980000,
      enterpriseValue: 1030000,
      ltmRevenue: 390000,
      ltmEBITDA: 115000,
      ltmEBIT: 98000,
      ltmNetIncome: 72000
    },
    {
      name: 'Peer Company 8',
      ticker: 'PEER8',
      marketCap: 1150000,
      enterpriseValue: 1200000,
      ltmRevenue: 440000,
      ltmEBITDA: 135000,
      ltmEBIT: 115000,
      ltmNetIncome: 85000
    }
  ];
}
