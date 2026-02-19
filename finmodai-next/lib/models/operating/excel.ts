import ExcelJS from 'exceljs';

export async function generateOperatingWorkbook(data: Record<string, any>): Promise<ExcelJS.Workbook> {
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
  
  const ticker = data.ticker || 'COMPANY';
  const companyName = data.companyName || ticker;
  const periodType = data.periodType || 'quarterly'; // 'monthly' or 'quarterly'
  const numPeriods = data.numPeriods || (periodType === 'monthly' ? 12 : 4);
  const currentYear = new Date().getFullYear();
  
  // ============================================
  // SHEET 1: COVER
  // ============================================
  const coverSheet = createSheetWithStructure(workbook, 'Cover', 0);
  setColumnWidths(coverSheet, [35, 25]);
  
  let row = 1;
  const titleCell = coverSheet.getCell(row, 1);
  titleCell.value = `${companyName} Operating Model`;
  titleCell.font = { name: 'Calibri', size: 16, bold: true };
  row += 2;
  
  addLabelValueRow(coverSheet, row, 'Ticker', ticker);
  row++;
  addLabelValueRow(coverSheet, row, 'Model Date', new Date().toLocaleDateString());
  row++;
  addLabelValueRow(coverSheet, row, 'Period Type', periodType === 'monthly' ? 'Monthly' : 'Quarterly');
  row++;
  addLabelValueRow(coverSheet, row, 'Forecast Periods', numPeriods);
  row += 2;
  
  addSectionHeader(coverSheet, row, 'Key Metrics', 1, 2);
  row++;
  addLabelValueRow(coverSheet, row, 'Total Revenue', data.totalRevenue || 0, false, false, 'CURRENCY');
  row++;
  addLabelValueRow(coverSheet, row, 'Total EBITDA', data.totalEBITDA || 0, false, false, 'CURRENCY');
  row++;
  addLabelValueRow(coverSheet, row, 'Total FCF', data.totalFCF || 0, false, false, 'CURRENCY');
  
  // ============================================
  // SHEET 2: ASSUMPTIONS
  // ============================================
  const assumptionsSheet = createSheetWithStructure(workbook, 'Assumptions', 1);
  setColumnWidths(assumptionsSheet, [30, 20]);
  
  row = 1;
  addSectionHeader(assumptionsSheet, row, 'Revenue Assumptions', 1, 2);
  row++;
  addLabelValueRow(assumptionsSheet, row, 'Base Revenue', data.baseRevenue || 1000, true, false, 'CURRENCY');
  row++;
  addLabelValueRow(assumptionsSheet, row, 'Revenue Growth Rate', data.revenueGrowth || 0.05, true, false, 'PERCENTAGE');
  row += 2;
  
  addSectionHeader(assumptionsSheet, row, 'Margin Assumptions', 1, 2);
  row++;
  addLabelValueRow(assumptionsSheet, row, 'COGS % of Revenue', data.cogsPct || 0.60, true, false, 'PERCENTAGE');
  row++;
  addLabelValueRow(assumptionsSheet, row, 'Operating Expenses % of Revenue', data.opexPct || 0.20, true, false, 'PERCENTAGE');
  row++;
  addLabelValueRow(assumptionsSheet, row, 'EBITDA Margin', data.ebitdaMargin || 0.20, true, false, 'PERCENTAGE');
  row += 2;
  
  addSectionHeader(assumptionsSheet, row, 'Working Capital Assumptions', 1, 2);
  row++;
  addLabelValueRow(assumptionsSheet, row, 'AR Days', data.arDays || 45, true, false, 'INTEGER');
  row++;
  addLabelValueRow(assumptionsSheet, row, 'Inventory Days', data.inventoryDays || 60, true, false, 'INTEGER');
  row++;
  addLabelValueRow(assumptionsSheet, row, 'AP Days', data.apDays || 30, true, false, 'INTEGER');
  row += 2;
  
  addSectionHeader(assumptionsSheet, row, 'Capital Expenditures', 1, 2);
  row++;
  addLabelValueRow(assumptionsSheet, row, 'Capex % of Revenue', data.capexPct || 0.04, true, false, 'PERCENTAGE');
  
  // ============================================
  // SHEET 3: PROJECTIONS
  // ============================================
  const projectionsSheet = createSheetWithStructure(workbook, periodType === 'monthly' ? 'Monthly Projections' : 'Quarterly Projections', 1);
  setTimeBasedColumnWidths(projectionsSheet, numPeriods, false);
  
  row = 1;
  const periodLabels = periodType === 'monthly' 
    ? Array.from({ length: numPeriods }, (_, i) => {
        const date = new Date(currentYear, i, 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      })
    : Array.from({ length: numPeriods }, (_, i) => `Q${i + 1} ${currentYear}`);
  
  // Header row
  const headerRow = projectionsSheet.getRow(row);
  headerRow.getCell(2).value = 'Period';
  Object.assign(headerRow.getCell(2), createSubHeaderStyle());
  periodLabels.forEach((label, idx) => {
    const cell = headerRow.getCell(3 + idx);
    cell.value = label;
    Object.assign(cell, createSubHeaderStyle());
  });
  row++;
  
  addSectionHeader(projectionsSheet, row, 'REVENUE', 2, 2 + numPeriods);
  row++;
  
  // Generate projection data
  const baseRevenue = data.baseRevenue || 1000;
  const growthRate = data.revenueGrowth || 0.05;
  const monthlyGrowth = periodType === 'monthly' ? Math.pow(1 + growthRate, 1/12) - 1 : growthRate / 4;
  
  const revenueValues = Array.from({ length: numPeriods }, (_, i) => {
    if (periodType === 'monthly') {
      return baseRevenue * Math.pow(1 + monthlyGrowth, i + 1);
    } else {
      return baseRevenue * Math.pow(1 + growthRate, (i + 1) / 4);
    }
  });
  
  addMetricRow(projectionsSheet, row, 'Revenue', revenueValues, false, true, 'CURRENCY');
  row++;
  
  row = addEmptyRow(projectionsSheet, row);
  addSectionHeader(projectionsSheet, row, 'OPERATING INCOME', 2, 2 + numPeriods);
  row++;
  
  const ebitdaMargin = data.ebitdaMargin || 0.20;
  const ebitdaValues = revenueValues.map(rev => rev * ebitdaMargin);
  addMetricRow(projectionsSheet, row, 'EBITDA', ebitdaValues, false, true, 'CURRENCY');
  row++;
  
  const ebitdaMarginValues = revenueValues.map(rev => rev > 0 ? ebitdaMargin : 0);
  addMetricRow(projectionsSheet, row, 'EBITDA Margin', ebitdaMarginValues, false, false, 'PERCENTAGE');
  row++;
  
  row = addEmptyRow(projectionsSheet, row);
  addSectionHeader(projectionsSheet, row, 'FREE CASH FLOW', 2, 2 + numPeriods);
  row++;
  
  const capexPct = data.capexPct || 0.04;
  const capexValues = revenueValues.map(rev => -rev * capexPct);
  addMetricRow(projectionsSheet, row, 'Capex', capexValues, false, false, 'CURRENCY');
  row++;
  
  const fcfValues = ebitdaValues.map((ebitda, i) => ebitda + capexValues[i]);
  addMetricRow(projectionsSheet, row, 'Free Cash Flow', fcfValues, false, true, 'CURRENCY');
  
  // ============================================
  // SHEET 4: SUMMARY
  // ============================================
  const summarySheet = createSheetWithStructure(workbook, 'Summary', 0);
  setColumnWidths(summarySheet, [30, 25]);
  
  row = 1;
  addSectionHeader(summarySheet, row, 'OPERATING MODEL SUMMARY', 1, 2);
  row++;
  
  const totalRevenue = revenueValues.reduce((sum, val) => sum + val, 0);
  const totalEBITDA = ebitdaValues.reduce((sum, val) => sum + val, 0);
  const totalFCF = fcfValues.reduce((sum, val) => sum + val, 0);
  
  addLabelValueRow(summarySheet, row, 'Total Revenue', totalRevenue, false, false, 'CURRENCY');
  row++;
  addLabelValueRow(summarySheet, row, 'Total EBITDA', totalEBITDA, false, false, 'CURRENCY');
  row++;
  addLabelValueRow(summarySheet, row, 'Total Free Cash Flow', totalFCF, false, true, 'CURRENCY');
  row++;
  
  row = addEmptyRow(summarySheet, row);
  addSectionHeader(summarySheet, row, 'AVERAGE METRICS', 1, 2);
  row++;
  addLabelValueRow(summarySheet, row, 'Average Revenue', totalRevenue / numPeriods, false, false, 'CURRENCY');
  row++;
  addLabelValueRow(summarySheet, row, 'Average EBITDA', totalEBITDA / numPeriods, false, false, 'CURRENCY');
  row++;
  addLabelValueRow(summarySheet, row, 'Average EBITDA Margin', ebitdaMargin, false, true, 'PERCENTAGE');
  
  return workbook;
}
