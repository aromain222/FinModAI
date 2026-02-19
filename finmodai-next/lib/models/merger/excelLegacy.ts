import ExcelJS from 'exceljs';

/**
 * Legacy merger workbook generator
 * @deprecated Use generateMergerWorkbook from lib/models/merger/excelNew.ts instead
 */
export async function generateMergerWorkbook(data: Record<string, any>): Promise<ExcelJS.Workbook> {
  // Use the new comprehensive M&A Excel generator
  const { generateMergerWorkbook: generateNew } = await import('./excelNew');
  
  // Convert legacy data format to new format
  const inputs = {
    acquirerTicker: data.acquirerTicker || data.acquirer?.ticker || 'ACQUIRER',
    acquirerName: data.acquirer?.name || data.acquirerTicker,
    acquirerRevenue: data.acquirer?.revenue,
    acquirerEBITDA: data.acquirer?.ebitda,
    acquirerEBIT: data.acquirer?.ebit,
    acquirerNetIncome: data.acquirer?.netIncome,
    acquirerShares: data.acquirer?.shares,
    acquirerMarketCap: data.acquirer?.marketCap,
    acquirerPrice: data.acquirer?.price,
    targetTicker: data.targetTicker || data.target?.ticker || 'TARGET',
    targetName: data.target?.name || data.targetTicker,
    targetRevenue: data.target?.revenue,
    targetEBITDA: data.target?.ebitda,
    targetEBIT: data.target?.ebit,
    targetNetIncome: data.target?.netIncome,
    targetShares: data.target?.shares,
    targetMarketCap: data.target?.marketCap,
    targetPrice: data.target?.price,
    purchasePrice: data.purchasePrice,
    dealValue: data.dealValue || data.purchasePrice,
    cashPct: data.cashPct,
    stockPct: data.stockPct,
    debtPct: data.debtPct,
    exchangeRatio: data.exchangeRatio,
    newDebt: data.newDebt,
    newDebtRate: data.newDebtRate,
    synergies: data.synergies,
    revenueSynergies: data.revenueSynergies,
    costSynergies: data.costSynergies,
    integrationCosts: data.integrationCosts,
    oneTimeCosts: data.oneTimeCosts,
    taxRate: data.taxRate,
  };
  
  return generateNew(inputs);
}

/**
 * Legacy merger workbook generator implementation (kept for reference)
 * @deprecated Use generateMergerWorkbook from lib/models/merger/excelNew.ts instead
 */
async function generateMergerWorkbookLegacy(data: Record<string, any>): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  
  // Import formatting utilities
  const {
    createSheetWithStructure,
    addSectionHeader,
    addLabelValueRow,
    addMetricRow,
    addTimeColumns,
    setTimeBasedColumnWidths,
    addEmptyRow,
  } = await import('../../excel/sheetBuilder');
  
  const {
    createHeaderStyle,
    createInputStyle,
    createFormulaStyle,
    createTotalStyle,
    createSubHeaderStyle,
    applyBorders,
    applyNumberFormat,
    setColumnWidths,
    NUMBER_FORMATS,
  } = await import('../../excel/formatting');
  
  const acquirerTicker = data.acquirerTicker || data.acquirer?.ticker || 'ACQUIRER';
  const targetTicker = data.targetTicker || data.target?.ticker || 'TARGET';
  const purchasePrice = data.purchasePrice || 0;
  const synergies = data.synergies || 0;
  const currentYear = new Date().getFullYear();
  const projectionYears = 5;
  
  // ============================================
  // SHEET 1: COVER
  // ============================================
  const coverSheet = createSheetWithStructure(workbook, 'Cover', 0);
  setColumnWidths(coverSheet, [35, 25]);
  
  let row = 1;
  const titleCell = coverSheet.getCell(row, 1);
  titleCell.value = `Merger Analysis: ${acquirerTicker} + ${targetTicker}`;
  titleCell.font = { name: 'Calibri', size: 16, bold: true };
  row += 2;
  
  addLabelValueRow(coverSheet, row, 'Acquirer', acquirerTicker);
  row++;
  addLabelValueRow(coverSheet, row, 'Target', targetTicker);
  row++;
  addLabelValueRow(coverSheet, row, 'Purchase Price', purchasePrice, false, false, 'CURRENCY');
  row++;
  addLabelValueRow(coverSheet, row, 'Synergies', synergies, false, false, 'CURRENCY');
  row += 2;
  
  addSectionHeader(coverSheet, row, 'Transaction Summary', 1, 2);
  row++;
  const combinedEV = (data.acquirer?.enterpriseValue || 0) + (data.target?.enterpriseValue || 0) + synergies;
  addLabelValueRow(coverSheet, row, 'Combined Enterprise Value', combinedEV, false, false, 'CURRENCY');
  
  // ============================================
  // SHEET 2: ASSUMPTIONS
  // ============================================
  const assumptionsSheet = createSheetWithStructure(workbook, 'Assumptions', 1);
  setColumnWidths(assumptionsSheet, [30, 20]);
  
  row = 1;
  addSectionHeader(assumptionsSheet, row, 'Transaction Assumptions', 1, 2);
  row++;
  addLabelValueRow(assumptionsSheet, row, 'Purchase Price', purchasePrice, true, false, 'CURRENCY');
  row++;
  addLabelValueRow(assumptionsSheet, row, 'Synergies', synergies, true, false, 'CURRENCY');
  row++;
  addLabelValueRow(assumptionsSheet, row, 'Synergy Realization Period', '3 years');
  row += 2;
  
  addSectionHeader(assumptionsSheet, row, 'Acquirer Assumptions', 1, 2);
  row++;
  addLabelValueRow(assumptionsSheet, row, 'Revenue Growth', data.acquirer?.revenueGrowth || 0.05, true, false, 'PERCENTAGE');
  row++;
  addLabelValueRow(assumptionsSheet, row, 'EBITDA Margin', data.acquirer?.ebitdaMargin || 0.20, true, false, 'PERCENTAGE');
  row += 2;
  
  addSectionHeader(assumptionsSheet, row, 'Target Assumptions', 1, 2);
  row++;
  addLabelValueRow(assumptionsSheet, row, 'Revenue Growth', data.target?.revenueGrowth || 0.05, true, false, 'PERCENTAGE');
  row++;
  addLabelValueRow(assumptionsSheet, row, 'EBITDA Margin', data.target?.ebitdaMargin || 0.20, true, false, 'PERCENTAGE');
  
  // ============================================
  // SHEET 3: SYNERGIES
  // ============================================
  const synergiesSheet = createSheetWithStructure(workbook, 'Synergies', 1);
  setTimeBasedColumnWidths(synergiesSheet, projectionYears, false);
  
  row = 1;
  addTimeColumns(synergiesSheet, row, {
    baseYearLabel: 'Base',
    forecastYears: projectionYears,
    startYear: currentYear,
    includeTerminal: false,
  });
  row++;
  
  addSectionHeader(synergiesSheet, row, 'SYNERGY ANALYSIS', 2, 2 + projectionYears);
  row++;
  
  // Cost synergies
  const costSynergies = Array(projectionYears).fill(synergies * 0.6 / projectionYears);
  addMetricRow(synergiesSheet, row, 'Cost Synergies', costSynergies, false, false, 'CURRENCY');
  row++;
  
  // Revenue synergies
  const revenueSynergies = Array(projectionYears).fill(synergies * 0.4 / projectionYears);
  addMetricRow(synergiesSheet, row, 'Revenue Synergies', revenueSynergies, false, false, 'CURRENCY');
  row++;
  
  // Total synergies
  const totalSynergies = costSynergies.map((cost, i) => cost + revenueSynergies[i]);
  addMetricRow(synergiesSheet, row, 'Total Synergies', totalSynergies, false, true, 'CURRENCY');
  
  // ============================================
  // SHEET 4: COMBINED FINANCIALS
  // ============================================
  const combinedSheet = createSheetWithStructure(workbook, 'Combined Financials', 1);
  setTimeBasedColumnWidths(combinedSheet, projectionYears, false);
  
  row = 1;
  addTimeColumns(combinedSheet, row, {
    baseYearLabel: 'LTM',
    forecastYears: projectionYears,
    startYear: currentYear,
    includeTerminal: false,
  });
  row++;
  
  addSectionHeader(combinedSheet, row, 'COMBINED FINANCIAL PROJECTIONS', 2, 2 + projectionYears);
  row++;
  
  // Revenue
  const acquirerRevenue = data.acquirer?.revenue || Array(projectionYears).fill(1000);
  const targetRevenue = data.target?.revenue || Array(projectionYears).fill(500);
  const combinedRevenue = acquirerRevenue.map((a: number, i: number) => 
    a + (Array.isArray(targetRevenue) ? targetRevenue[i] : targetRevenue) + (revenueSynergies[i] || 0)
  );
  addMetricRow(combinedSheet, row, 'Combined Revenue', combinedRevenue, false, true, 'CURRENCY');
  row++;
  
  row = addEmptyRow(combinedSheet, row);
  
  // EBITDA
  const acquirerEBITDA = data.acquirer?.ebitda || Array(projectionYears).fill(200);
  const targetEBITDA = data.target?.ebitda || Array(projectionYears).fill(100);
  const combinedEBITDA = acquirerEBITDA.map((a: number, i: number) => 
    a + (Array.isArray(targetEBITDA) ? targetEBITDA[i] : targetEBITDA) + (totalSynergies[i] || 0)
  );
  addMetricRow(combinedSheet, row, 'Combined EBITDA', combinedEBITDA, false, true, 'CURRENCY');
  row++;
  
  // EBITDA Margin
  const combinedMargin = combinedEBITDA.map((ebitda: number, i: number) => 
    combinedRevenue[i] > 0 ? ebitda / combinedRevenue[i] : 0
  );
  addMetricRow(combinedSheet, row, 'Combined EBITDA Margin', combinedMargin, false, false, 'PERCENTAGE');
  
  // ============================================
  // SHEET 5: VALUATION
  // ============================================
  const valuationSheet = createSheetWithStructure(workbook, 'Valuation', 0);
  setColumnWidths(valuationSheet, [30, 25]);
  
  row = 1;
  addSectionHeader(valuationSheet, row, 'VALUATION SUMMARY', 1, 2);
  row++;
  
  addLabelValueRow(valuationSheet, row, 'Acquirer Enterprise Value', data.acquirer?.enterpriseValue || 0, false, false, 'CURRENCY');
  row++;
  addLabelValueRow(valuationSheet, row, 'Target Enterprise Value', data.target?.enterpriseValue || 0, false, false, 'CURRENCY');
  row++;
  addLabelValueRow(valuationSheet, row, 'Synergies Value', synergies, false, false, 'CURRENCY');
  row++;
  addLabelValueRow(valuationSheet, row, 'Combined Enterprise Value', combinedEV, false, true, 'CURRENCY');
  row++;
  
  row = addEmptyRow(valuationSheet, row);
  addSectionHeader(valuationSheet, row, 'PURCHASE PRICE ANALYSIS', 1, 2);
  row++;
  addLabelValueRow(valuationSheet, row, 'Purchase Price', purchasePrice, false, false, 'CURRENCY');
  row++;
  addLabelValueRow(valuationSheet, row, 'Target Standalone Value', data.target?.enterpriseValue || 0, false, false, 'CURRENCY');
  row++;
  const premium = purchasePrice > 0 && data.target?.enterpriseValue ? 
    (purchasePrice - data.target.enterpriseValue) / data.target.enterpriseValue : 0;
  addLabelValueRow(valuationSheet, row, 'Premium', premium, false, true, 'PERCENTAGE');
  
  return workbook;
}
