/**
 * M&A Model Excel Generator
 * Accretion/Dilution + Purchase Accounting Lite
 * Banking-style pro forma with clear Standalone / Adjustments / Pro Forma columns
 */

import ExcelJS from 'exceljs';
import {
  createNormalStyle,
  createHeaderStyle,
  createInputStyle,
  createFormulaStyle,
  createTotalStyle,
  createSubHeaderStyle,
  applyBorders,
  applyNumberFormat,
  NUMBER_FORMATS,
  COLORS,
  setColumnWidths,
} from '../../excel/formatting';

export interface MergerInputs {
  // Acquirer financials
  acquirerTicker: string;
  acquirerName?: string;
  acquirerRevenue?: number;
  acquirerEBITDA?: number;
  acquirerEBIT?: number;
  acquirerNetIncome?: number;
  acquirerShares?: number;
  acquirerMarketCap?: number;
  acquirerPrice?: number;
  acquirerSharesSource?: 'Reported' | 'Derived (Mkt Cap ÷ Price)' | 'User Provided' | 'Unavailable';
  
  // Target financials
  targetTicker: string;
  targetName?: string;
  targetRevenue?: number;
  targetEBITDA?: number;
  targetEBIT?: number;
  targetNetIncome?: number;
  targetShares?: number;
  targetMarketCap?: number;
  targetPrice?: number;
  targetSharesSource?: 'Reported' | 'Derived (Mkt Cap ÷ Price)' | 'User Provided' | 'Unavailable';
  
  // Deal terms
  purchasePrice?: number;
  offerPrice?: number; // Per share offer price
  dealValue?: number; // Total deal value
  cashPct?: number; // % of consideration in cash
  stockPct?: number; // % of consideration in stock
  debtPct?: number; // % of consideration in debt
  exchangeRatio?: number; // If stock consideration
  
  // Financing
  newDebt?: number;
  newDebtRate?: number; // Interest rate on new debt
  
  // Synergies (optional, user-entered only - never invent)
  synergies?: number; // Total synergies
  revenueSynergies?: number[];
  costSynergies?: number[];
  
  // Integration costs (optional, user-entered)
  integrationCosts?: number[];
  oneTimeCosts?: number;
  
  // Tax
  taxRate?: number;
  
  // Data source tracking
  dataSources?: {
    acquirerRevenue?: 'Reported' | 'Derived' | 'User';
    acquirerEBITDA?: 'Reported' | 'Derived' | 'User';
    targetRevenue?: 'Reported' | 'Derived' | 'User';
    targetEBITDA?: 'Reported' | 'Derived' | 'User';
    [key: string]: 'Reported' | 'Derived' | 'User' | undefined;
  };
}

export interface MergerOutput {
  acquirerTicker: string;
  targetTicker: string;
  dealValue: number;
  consideration: {
    cash: number;
    stock: number;
    debt: number;
    total: number;
  };
  proForma: {
    revenue: number;
    ebitda: number;
    ebit: number;
    interestExpense: number;
    ebt: number;
    tax: number;
    netIncome: number;
    sharesOutstanding: number;
    eps: number;
  };
  standalone: {
    acquirer: {
      revenue: number;
      ebitda: number;
      netIncome: number;
      shares: number;
      eps: number;
    };
    target: {
      revenue: number;
      ebitda: number;
      netIncome: number;
      shares: number;
      eps: number;
    };
  };
  accretionDilution: {
    epsAccretion: number; // Positive = accretive, negative = dilutive
    epsAccretionPct: number;
  };
  synergies: {
    revenue: number[];
    cost: number[];
    total: number[];
  };
  integrationCosts: number[];
}

/**
 * Calculate M&A model from inputs
 */
function calculateMergerModel(inputs: MergerInputs): MergerOutput {
  // Determine deal value
  const dealValue = inputs.dealValue || inputs.purchasePrice || 
    (inputs.offerPrice && inputs.targetShares ? inputs.offerPrice * inputs.targetShares : 0);
  
  // Determine consideration mix
  const cashPct = inputs.cashPct || 0;
  const stockPct = inputs.stockPct || 0;
  const debtPct = inputs.debtPct || 0;
  const totalPct = cashPct + stockPct + debtPct;
  
  // Normalize if doesn't add to 100%
  const normalizedCashPct = totalPct > 0 ? cashPct / totalPct : 0;
  const normalizedStockPct = totalPct > 0 ? stockPct / totalPct : 0;
  const normalizedDebtPct = totalPct > 0 ? debtPct / totalPct : 0;
  
  const consideration = {
    cash: dealValue * normalizedCashPct,
    stock: dealValue * normalizedStockPct,
    debt: dealValue * normalizedDebtPct,
    total: dealValue,
  };
  
  // Calculate new shares if stock consideration
  const acquirerShares = inputs.acquirerShares || 
    (inputs.acquirerMarketCap && inputs.acquirerPrice ? inputs.acquirerMarketCap / inputs.acquirerPrice : 0);
  const newShares = consideration.stock > 0 && inputs.acquirerPrice && inputs.acquirerPrice > 0
    ? consideration.stock / inputs.acquirerPrice
    : 0;
  const proFormaShares = acquirerShares + newShares;
  
  // Calculate interest expense on new debt
  const newDebt = consideration.debt + (inputs.newDebt || 0);
  const interestRate = inputs.newDebtRate || 0.06;
  const interestExpense = newDebt * interestRate;
  
  // Standalone financials
  const standalone = {
    acquirer: {
      revenue: inputs.acquirerRevenue || 0,
      ebitda: inputs.acquirerEBITDA || 0,
      netIncome: inputs.acquirerNetIncome || 0,
      shares: acquirerShares,
      eps: acquirerShares > 0 ? (inputs.acquirerNetIncome || 0) / acquirerShares : 0,
    },
    target: {
      revenue: inputs.targetRevenue || 0,
      ebitda: inputs.targetEBITDA || 0,
      netIncome: inputs.targetNetIncome || 0,
      shares: inputs.targetShares || 0,
      eps: inputs.targetShares && inputs.targetShares > 0 
        ? (inputs.targetNetIncome || 0) / inputs.targetShares 
        : 0,
    },
  };
  
  // Synergies (only user-entered, never invent)
  const revenueSynergies = inputs.revenueSynergies || [];
  const costSynergies = inputs.costSynergies || [];
  const totalSynergies = revenueSynergies.map((rev, i) => rev + (costSynergies[i] || 0));
  
  // Integration costs
  const integrationCosts = inputs.integrationCosts || [];
  
  // Pro forma calculations
  const proFormaRevenue = standalone.acquirer.revenue + standalone.target.revenue + 
    (revenueSynergies.length > 0 ? revenueSynergies[0] : 0);
  const proFormaEBITDA = standalone.acquirer.ebitda + standalone.target.ebitda + 
    (totalSynergies.length > 0 ? totalSynergies[0] : 0) - 
    (integrationCosts.length > 0 ? integrationCosts[0] : 0);
  const proFormaEBIT = (inputs.acquirerEBIT || 0) + (inputs.targetEBIT || 0) + 
    (totalSynergies.length > 0 ? totalSynergies[0] : 0) - 
    (integrationCosts.length > 0 ? integrationCosts[0] : 0);
  const proFormaEBT = proFormaEBIT - interestExpense;
  const taxRate = inputs.taxRate || 0.25;
  const proFormaTax = Math.max(0, proFormaEBT * taxRate);
  const proFormaNetIncome = proFormaEBT - proFormaTax;
  const proFormaEPS = proFormaShares > 0 ? proFormaNetIncome / proFormaShares : 0;
  
  // Accretion/Dilution
  const standaloneEPS = standalone.acquirer.eps;
  const epsAccretion = proFormaEPS - standaloneEPS;
  const epsAccretionPct = standaloneEPS > 0 ? epsAccretion / standaloneEPS : 0;
  
  return {
    acquirerTicker: inputs.acquirerTicker,
    targetTicker: inputs.targetTicker,
    dealValue,
    consideration,
    proForma: {
      revenue: proFormaRevenue,
      ebitda: proFormaEBITDA,
      ebit: proFormaEBIT,
      interestExpense,
      ebt: proFormaEBT,
      tax: proFormaTax,
      netIncome: proFormaNetIncome,
      sharesOutstanding: proFormaShares,
      eps: proFormaEPS,
    },
    standalone,
    accretionDilution: {
      epsAccretion,
      epsAccretionPct,
    },
    synergies: {
      revenue: revenueSynergies,
      cost: costSynergies,
      total: totalSynergies,
    },
    integrationCosts,
  };
}

/**
 * Generate comprehensive M&A model workbook
 */
export async function generateMergerWorkbook(
  inputs: MergerInputs
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const acquirerTicker = inputs.acquirerTicker.toUpperCase();
  const targetTicker = inputs.targetTicker.toUpperCase();
  const acquirerName = inputs.acquirerName || acquirerTicker;
  const targetName = inputs.targetName || targetTicker;

  // Calculate model outputs
  const output = calculateMergerModel(inputs);

  // Create all tabs
  createMASummarySheet(workbook, acquirerTicker, targetTicker, acquirerName, targetName, output);
  createMAAssumptionsSheet(workbook, acquirerTicker, targetTicker, inputs);
  createDealTermsSheet(workbook, acquirerTicker, targetTicker, inputs, output);
  createProFormaISSheet(workbook, acquirerTicker, targetTicker, inputs, output);
  createSynergiesIntegrationSheet(workbook, acquirerTicker, targetTicker, inputs, output);
  createAccretionDilutionSheet(workbook, acquirerTicker, targetTicker, output);
  createMASensitivitiesSheet(workbook, acquirerTicker, targetTicker, inputs, output);
  createMAChecksSheet(workbook, acquirerTicker, targetTicker, output);
  createMASourcesNotesSheet(workbook, acquirerTicker, targetTicker, inputs);

  return workbook;
}

/**
 * Create M&A Summary sheet
 */
function createMASummarySheet(
  workbook: ExcelJS.Workbook,
  acquirerTicker: string,
  targetTicker: string,
  acquirerName: string,
  targetName: string,
  output: MergerOutput
): void {
  const sheet = workbook.addWorksheet('M&A Summary');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${acquirerTicker} + ${targetTicker} Merger Analysis`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 3);
  row += 2;

  // Transaction Summary
  sheet.getCell(row, 1).value = 'Transaction Summary';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const summary = [
    { label: 'Acquirer', value: acquirerName },
    { label: 'Target', value: targetName },
    { label: 'Deal Value', value: output.dealValue },
    { label: 'Cash Consideration', value: output.consideration.cash },
    { label: 'Stock Consideration', value: output.consideration.stock },
    { label: 'Debt Consideration', value: output.consideration.debt },
  ];

  summary.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 1).style = createNormalStyle();
    if (typeof item.value === 'number') {
      sheet.getCell(row, 2).value = item.value;
      applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    } else {
      sheet.getCell(row, 2).value = item.value;
    }
    row++;
  });

  row += 2;

  // Accretion/Dilution Summary
  sheet.getCell(row, 1).value = 'Accretion/Dilution';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'Standalone Acquirer EPS';
  sheet.getCell(row, 2).value = output.standalone.acquirer.eps;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
  row++;

  sheet.getCell(row, 1).value = 'Pro Forma EPS';
  sheet.getCell(row, 2).value = output.proForma.eps;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
  row++;

  sheet.getCell(row, 1).value = 'EPS Accretion/(Dilution)';
  sheet.getCell(row, 2).value = output.accretionDilution.epsAccretion;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
  sheet.getCell(row, 2).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: output.accretionDilution.epsAccretion >= 0 ? 'FF008000' : 'FFFF0000' } },
  };
  row++;

  sheet.getCell(row, 1).value = 'EPS Accretion %';
  sheet.getCell(row, 2).value = output.accretionDilution.epsAccretionPct;
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  sheet.getCell(row, 2).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: output.accretionDilution.epsAccretion >= 0 ? 'FF008000' : 'FFFF0000' } },
  };

  setColumnWidths(sheet, [0, 30, 20, 15]);
}

/**
 * Create M&A Assumptions sheet
 */
function createMAAssumptionsSheet(
  workbook: ExcelJS.Workbook,
  acquirerTicker: string,
  targetTicker: string,
  inputs: MergerInputs
): void {
  const sheet = workbook.addWorksheet('Assumptions');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${acquirerTicker} + ${targetTicker} - Assumptions`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 2);
  row += 2;

  // Acquirer Financials
  sheet.getCell(row, 1).value = 'Acquirer Financials (TTM/FY)';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const acquirerItems = [
    { label: 'Revenue', value: inputs.acquirerRevenue },
    { label: 'EBITDA', value: inputs.acquirerEBITDA },
    { label: 'EBIT', value: inputs.acquirerEBIT },
    { label: 'Net Income', value: inputs.acquirerNetIncome },
    { label: 'Shares Outstanding', value: inputs.acquirerShares },
    { label: 'Market Cap', value: inputs.acquirerMarketCap },
    { label: 'Price/Share', value: inputs.acquirerPrice },
  ];

  acquirerItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    if (item.value !== undefined && item.value !== null) {
      sheet.getCell(row, 2).value = item.value;
      if (item.label === 'Price/Share') {
        applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
      } else if (item.label === 'Shares Outstanding') {
        applyNumberFormat(sheet.getCell(row, 2), 'INTEGER');
      } else {
        applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
      }
      sheet.getCell(row, 2).style = createInputStyle();
    } else {
      sheet.getCell(row, 2).value = 'REQUIRED';
      sheet.getCell(row, 2).style = {
        ...createNormalStyle(),
        font: { ...createNormalStyle().font, color: { argb: 'FFFF0000' }, italic: true },
      };
    }
    row++;
  });

  row += 2;

  // Target Financials
  sheet.getCell(row, 1).value = 'Target Financials (TTM/FY)';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const targetItems = [
    { label: 'Revenue', value: inputs.targetRevenue },
    { label: 'EBITDA', value: inputs.targetEBITDA },
    { label: 'EBIT', value: inputs.targetEBIT },
    { label: 'Net Income', value: inputs.targetNetIncome },
    { label: 'Shares Outstanding', value: inputs.targetShares },
    { label: 'Market Cap', value: inputs.targetMarketCap },
    { label: 'Price/Share', value: inputs.targetPrice },
  ];

  targetItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    if (item.value !== undefined && item.value !== null) {
      sheet.getCell(row, 2).value = item.value;
      if (item.label === 'Price/Share') {
        applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
      } else if (item.label === 'Shares Outstanding') {
        applyNumberFormat(sheet.getCell(row, 2), 'INTEGER');
      } else {
        applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
      }
      sheet.getCell(row, 2).style = createInputStyle();
    } else {
      sheet.getCell(row, 2).value = 'REQUIRED';
      sheet.getCell(row, 2).style = {
        ...createNormalStyle(),
        font: { ...createNormalStyle().font, color: { argb: 'FFFF0000' }, italic: true },
      };
    }
    row++;
  });

  row += 2;

  // Deal Assumptions
  sheet.getCell(row, 1).value = 'Deal Assumptions';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'Tax Rate';
  sheet.getCell(row, 2).value = inputs.taxRate || 0.25;
  applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
  sheet.getCell(row, 2).style = createInputStyle();
  row++;

  if (inputs.newDebtRate !== undefined) {
    sheet.getCell(row, 1).value = 'New Debt Interest Rate';
    sheet.getCell(row, 2).value = inputs.newDebtRate;
    applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
    sheet.getCell(row, 2).style = createInputStyle();
    row++;
  }

  setColumnWidths(sheet, [0, 30, 20]);
}

/**
 * Create Deal Terms (Consideration) sheet
 */
function createDealTermsSheet(
  workbook: ExcelJS.Workbook,
  acquirerTicker: string,
  targetTicker: string,
  inputs: MergerInputs,
  output: MergerOutput
): void {
  const sheet = workbook.addWorksheet('Deal Terms (Consideration)');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${acquirerTicker} + ${targetTicker} - Deal Terms`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 2);
  row += 2;

  // Deal Value
  sheet.getCell(row, 1).value = 'Deal Value';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'Total Deal Value';
  sheet.getCell(row, 2).value = output.dealValue;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = createInputStyle();
  row += 2;

  // Consideration Mix
  sheet.getCell(row, 1).value = 'Consideration Mix';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const consideration = [
    { label: 'Cash', value: output.consideration.cash, pct: inputs.cashPct || 0 },
    { label: 'Stock', value: output.consideration.stock, pct: inputs.stockPct || 0 },
    { label: 'Debt', value: output.consideration.debt, pct: inputs.debtPct || 0 },
    { label: 'Total', value: output.consideration.total, pct: 1.0, isTotal: true },
  ];

  consideration.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 1).style = item.isTotal ? createTotalStyle() : createNormalStyle();
    sheet.getCell(row, 2).value = item.value;
    applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    sheet.getCell(row, 3).value = item.pct;
    applyNumberFormat(sheet.getCell(row, 3), 'PERCENTAGE');
    sheet.getCell(row, 2).style = item.isTotal ? createTotalStyle() : createInputStyle();
    sheet.getCell(row, 3).style = item.isTotal ? createTotalStyle() : createInputStyle();
    row++;
  });

  row += 2;

  // Stock Consideration Details
  if (output.consideration.stock > 0) {
    sheet.getCell(row, 1).value = 'Stock Consideration Details';
    sheet.getCell(row, 1).style = createSubHeaderStyle();
    row++;

    const newShares = output.proForma.sharesOutstanding - (inputs.acquirerShares || 0);
    sheet.getCell(row, 1).value = 'New Shares Issued';
    sheet.getCell(row, 2).value = newShares;
    applyNumberFormat(sheet.getCell(row, 2), 'INTEGER');
    row++;

    if (inputs.exchangeRatio) {
      sheet.getCell(row, 1).value = 'Exchange Ratio';
      sheet.getCell(row, 2).value = inputs.exchangeRatio;
      applyNumberFormat(sheet.getCell(row, 2), 'DECIMAL');
      row++;
    }
  }

  row += 2;

  // Debt Financing
  if (output.consideration.debt > 0 || inputs.newDebt) {
    sheet.getCell(row, 1).value = 'Debt Financing';
    sheet.getCell(row, 1).style = createSubHeaderStyle();
    row++;

    sheet.getCell(row, 1).value = 'New Debt';
    sheet.getCell(row, 2).value = output.consideration.debt + (inputs.newDebt || 0);
    applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    row++;

    sheet.getCell(row, 1).value = 'Interest Rate';
    sheet.getCell(row, 2).value = inputs.newDebtRate || 0.06;
    applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
    row++;

    sheet.getCell(row, 1).value = 'Annual Interest Expense';
    sheet.getCell(row, 2).value = output.proForma.interestExpense;
    applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  }

  setColumnWidths(sheet, [0, 30, 20, 15]);
}

/**
 * Create Pro Forma IS sheet (Banking-style with Standalone / Adjustments / Pro Forma columns)
 */
function createProFormaISSheet(
  workbook: ExcelJS.Workbook,
  acquirerTicker: string,
  targetTicker: string,
  inputs: MergerInputs,
  output: MergerOutput
): void {
  const sheet = workbook.addWorksheet('Pro Forma IS');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${acquirerTicker} + ${targetTicker} - Pro Forma Income Statement`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 4);
  row += 2;

  // Headers: Line Item | Acquirer Standalone | Target Standalone | Adjustments | Pro Forma
  const headers = ['Line Item', 'Acquirer Standalone', 'Target Standalone', 'Adjustments', 'Pro Forma'];
  headers.forEach((header, idx) => {
    sheet.getCell(row, idx + 1).value = header;
    sheet.getCell(row, idx + 1).style = createSubHeaderStyle();
  });
  row++;

  // Revenue
  const revenueAdjustments = (output.synergies.revenue.length > 0 ? output.synergies.revenue[0] : 0);
  const proFormaRevenue = output.proForma.revenue;
  
  sheet.getCell(row, 1).value = 'Revenue';
  sheet.getCell(row, 2).value = output.standalone.acquirer.revenue;
  sheet.getCell(row, 3).value = output.standalone.target.revenue;
  sheet.getCell(row, 4).value = revenueAdjustments;
  sheet.getCell(row, 5).value = proFormaRevenue;
  [2, 3, 4, 5].forEach(col => {
    applyNumberFormat(sheet.getCell(row, col), 'CURRENCY');
    sheet.getCell(row, col).style = col === 5 ? createTotalStyle() : createFormulaStyle();
  });
  row++;

  // EBITDA
  const ebitdaAdjustments = (output.synergies.total.length > 0 ? output.synergies.total[0] : 0) - 
    (output.integrationCosts.length > 0 ? output.integrationCosts[0] : 0);
  const proFormaEBITDA = output.proForma.ebitda;
  
  sheet.getCell(row, 1).value = 'EBITDA';
  sheet.getCell(row, 2).value = output.standalone.acquirer.ebitda;
  sheet.getCell(row, 3).value = output.standalone.target.ebitda;
  sheet.getCell(row, 4).value = ebitdaAdjustments;
  sheet.getCell(row, 5).value = proFormaEBITDA;
  [2, 3, 4, 5].forEach(col => {
    applyNumberFormat(sheet.getCell(row, col), 'CURRENCY');
    sheet.getCell(row, col).style = col === 5 ? createTotalStyle() : createFormulaStyle();
  });
  row++;

  // Interest Expense (adjustment only)
  sheet.getCell(row, 1).value = 'Interest Expense';
  sheet.getCell(row, 2).value = 0; // Acquirer standalone (assumed 0 or separate)
  sheet.getCell(row, 3).value = 0; // Target standalone (assumed 0 or separate)
  sheet.getCell(row, 4).value = -output.proForma.interestExpense; // Negative adjustment
  sheet.getCell(row, 5).value = output.proForma.interestExpense;
  [2, 3, 4, 5].forEach(col => {
    applyNumberFormat(sheet.getCell(row, col), 'CURRENCY');
    sheet.getCell(row, col).style = createFormulaStyle();
  });
  row++;

  // EBT
  const ebtAdjustments = ebitdaAdjustments - output.proForma.interestExpense;
  const proFormaEBT = output.proForma.ebt;
  
  sheet.getCell(row, 1).value = 'EBT';
  sheet.getCell(row, 2).value = output.standalone.acquirer.netIncome / (1 - (inputs.taxRate || 0.25)); // Approximate
  sheet.getCell(row, 3).value = output.standalone.target.netIncome / (1 - (inputs.taxRate || 0.25)); // Approximate
  sheet.getCell(row, 4).value = ebtAdjustments;
  sheet.getCell(row, 5).value = proFormaEBT;
  [2, 3, 4, 5].forEach(col => {
    applyNumberFormat(sheet.getCell(row, col), 'CURRENCY');
    sheet.getCell(row, col).style = col === 5 ? createTotalStyle() : createFormulaStyle();
  });
  row++;

  // Tax
  const taxAdjustments = -proFormaEBT * (inputs.taxRate || 0.25);
  const proFormaTax = output.proForma.tax;
  
  sheet.getCell(row, 1).value = 'Tax';
  sheet.getCell(row, 2).value = output.standalone.acquirer.netIncome / (1 - (inputs.taxRate || 0.25)) * (inputs.taxRate || 0.25);
  sheet.getCell(row, 3).value = output.standalone.target.netIncome / (1 - (inputs.taxRate || 0.25)) * (inputs.taxRate || 0.25);
  sheet.getCell(row, 4).value = taxAdjustments;
  sheet.getCell(row, 5).value = proFormaTax;
  [2, 3, 4, 5].forEach(col => {
    applyNumberFormat(sheet.getCell(row, col), 'CURRENCY');
    sheet.getCell(row, col).style = createFormulaStyle();
  });
  row++;

  // Net Income
  const netIncomeAdjustments = ebtAdjustments + taxAdjustments;
  const proFormaNetIncome = output.proForma.netIncome;
  
  sheet.getCell(row, 1).value = 'Net Income';
  sheet.getCell(row, 2).value = output.standalone.acquirer.netIncome;
  sheet.getCell(row, 3).value = output.standalone.target.netIncome;
  sheet.getCell(row, 4).value = netIncomeAdjustments;
  sheet.getCell(row, 5).value = proFormaNetIncome;
  [2, 3, 4, 5].forEach(col => {
    applyNumberFormat(sheet.getCell(row, col), 'CURRENCY');
    sheet.getCell(row, col).style = col === 5 ? createTotalStyle() : createFormulaStyle();
  });
  row++;

  // Shares Outstanding
  sheet.getCell(row, 1).value = 'Shares Outstanding';
  sheet.getCell(row, 2).value = output.standalone.acquirer.shares;
  sheet.getCell(row, 3).value = 0; // Target shares (not included in pro forma)
  sheet.getCell(row, 4).value = output.proForma.sharesOutstanding - output.standalone.acquirer.shares; // New shares
  sheet.getCell(row, 5).value = output.proForma.sharesOutstanding;
  [2, 3, 4, 5].forEach(col => {
    applyNumberFormat(sheet.getCell(row, col), 'INTEGER');
    sheet.getCell(row, col).style = createFormulaStyle();
  });
  row++;

  // EPS
  sheet.getCell(row, 1).value = 'EPS';
  sheet.getCell(row, 2).value = output.standalone.acquirer.eps;
  sheet.getCell(row, 3).value = output.standalone.target.eps;
  sheet.getCell(row, 4).value = output.proForma.eps - output.standalone.acquirer.eps;
  sheet.getCell(row, 5).value = output.proForma.eps;
  [2, 3, 4, 5].forEach(col => {
    applyNumberFormat(sheet.getCell(row, col), 'CURRENCY_DECIMALS');
    sheet.getCell(row, col).style = col === 5 ? createTotalStyle() : createFormulaStyle();
  });

  setColumnWidths(sheet, [0, 25, 20, 20, 20, 20]);
}

/**
 * Create Synergies & Integration Costs sheet
 */
function createSynergiesIntegrationSheet(
  workbook: ExcelJS.Workbook,
  acquirerTicker: string,
  targetTicker: string,
  inputs: MergerInputs,
  output: MergerOutput
): void {
  const sheet = workbook.addWorksheet('Synergies & Integration Costs');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${acquirerTicker} + ${targetTicker} - Synergies & Integration Costs`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 3);
  row += 2;

  // Synergies (only if user-entered - never invent)
  if (output.synergies.total.length > 0 || inputs.synergies) {
    sheet.getCell(row, 1).value = 'Synergies (User-Entered Only)';
    sheet.getCell(row, 1).style = createSubHeaderStyle();
    row++;

    const maxYears = Math.max(output.synergies.revenue.length, output.synergies.cost.length, output.synergies.total.length);
    const years = Array.from({ length: maxYears }, (_, i) => `Year ${i + 1}`);

    // Headers
    sheet.getCell(row, 1).value = 'Year';
    years.forEach((year, idx) => {
      sheet.getCell(row, idx + 2).value = year;
    });
    row++;

    // Revenue Synergies
    if (output.synergies.revenue.length > 0) {
      sheet.getCell(row, 1).value = 'Revenue Synergies';
      output.synergies.revenue.forEach((val, idx) => {
        sheet.getCell(row, idx + 2).value = val;
        applyNumberFormat(sheet.getCell(row, idx + 2), 'CURRENCY');
      });
      row++;
    }

    // Cost Synergies
    if (output.synergies.cost.length > 0) {
      sheet.getCell(row, 1).value = 'Cost Synergies';
      output.synergies.cost.forEach((val, idx) => {
        sheet.getCell(row, idx + 2).value = val;
        applyNumberFormat(sheet.getCell(row, idx + 2), 'CURRENCY');
      });
      row++;
    }

    // Total Synergies
    if (output.synergies.total.length > 0) {
      sheet.getCell(row, 1).value = 'Total Synergies';
      sheet.getCell(row, 1).style = createTotalStyle();
      output.synergies.total.forEach((val, idx) => {
        sheet.getCell(row, idx + 2).value = val;
        applyNumberFormat(sheet.getCell(row, idx + 2), 'CURRENCY');
        sheet.getCell(row, idx + 2).style = createTotalStyle();
      });
      row++;
    } else if (inputs.synergies) {
      // Simple total synergies
      sheet.getCell(row, 1).value = 'Total Synergies';
      sheet.getCell(row, 2).value = inputs.synergies;
      applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
      row++;
    }

    row += 2;
  } else {
    sheet.getCell(row, 1).value = 'Synergies: None entered (never invent synergies)';
    sheet.getCell(row, 1).style = {
      ...createNormalStyle(),
      font: { ...createNormalStyle().font, italic: true, color: { argb: 'FF666666' } },
    };
    row += 2;
  }

  // Integration Costs
  if (output.integrationCosts.length > 0 || inputs.oneTimeCosts) {
    sheet.getCell(row, 1).value = 'Integration Costs (User-Entered)';
    sheet.getCell(row, 1).style = createSubHeaderStyle();
    row++;

    if (output.integrationCosts.length > 0) {
      const maxYears = output.integrationCosts.length;
      const years = Array.from({ length: maxYears }, (_, i) => `Year ${i + 1}`);

      sheet.getCell(row, 1).value = 'Year';
      years.forEach((year, idx) => {
        sheet.getCell(row, idx + 2).value = year;
      });
      row++;

      sheet.getCell(row, 1).value = 'Integration Costs';
      output.integrationCosts.forEach((val, idx) => {
        sheet.getCell(row, idx + 2).value = val;
        applyNumberFormat(sheet.getCell(row, idx + 2), 'CURRENCY');
      });
    } else if (inputs.oneTimeCosts) {
      sheet.getCell(row, 1).value = 'One-Time Integration Costs';
      sheet.getCell(row, 2).value = inputs.oneTimeCosts;
      applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    }
  } else {
    sheet.getCell(row, 1).value = 'Integration Costs: None entered';
    sheet.getCell(row, 1).style = {
      ...createNormalStyle(),
      font: { ...createNormalStyle().font, italic: true, color: { argb: 'FF666666' } },
    };
  }

  setColumnWidths(sheet, [0, 30, 15, 15, 15, 15, 15]);
}

/**
 * Create Accretion/Dilution sheet
 */
function createAccretionDilutionSheet(
  workbook: ExcelJS.Workbook,
  acquirerTicker: string,
  targetTicker: string,
  output: MergerOutput
): void {
  const sheet = workbook.addWorksheet('Accretion/Dilution');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${acquirerTicker} + ${targetTicker} - Accretion/Dilution Analysis`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 3);
  row += 2;

  // EPS Comparison
  sheet.getCell(row, 1).value = 'EPS Analysis';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const epsItems = [
    { label: 'Acquirer Standalone EPS', value: output.standalone.acquirer.eps },
    { label: 'Pro Forma EPS', value: output.proForma.eps },
    { label: 'EPS Accretion/(Dilution)', value: output.accretionDilution.epsAccretion, isAccretion: true },
    { label: 'EPS Accretion %', value: output.accretionDilution.epsAccretionPct, isAccretion: true },
  ];

  epsItems.forEach(item => {
    sheet.getCell(row, 1).value = item.label;
    sheet.getCell(row, 1).style = createNormalStyle();
    sheet.getCell(row, 2).value = item.value;
    if (item.label.includes('%')) {
      applyNumberFormat(sheet.getCell(row, 2), 'PERCENTAGE');
    } else {
      applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
    }
    if (item.isAccretion) {
      sheet.getCell(row, 2).style = {
        ...createNormalStyle(),
        font: { ...createNormalStyle().font, color: { argb: output.accretionDilution.epsAccretion >= 0 ? 'FF008000' : 'FFFF0000' } },
      };
    }
    row++;
  });

  row += 2;

  // Key Drivers
  sheet.getCell(row, 1).value = 'Key Drivers';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const drivers = [
    { label: 'Standalone Acquirer Net Income', value: output.standalone.acquirer.netIncome },
    { label: 'Standalone Target Net Income', value: output.standalone.target.netIncome },
    { label: 'Synergies (Year 1)', value: output.synergies.total.length > 0 ? output.synergies.total[0] : 0 },
    { label: 'Integration Costs (Year 1)', value: output.integrationCosts.length > 0 ? output.integrationCosts[0] : 0 },
    { label: 'Interest Expense on New Debt', value: output.proForma.interestExpense },
    { label: 'Pro Forma Net Income', value: output.proForma.netIncome },
    { label: 'Pro Forma Shares Outstanding', value: output.proForma.sharesOutstanding },
  ];

  drivers.forEach(driver => {
    sheet.getCell(row, 1).value = driver.label;
    sheet.getCell(row, 1).style = createNormalStyle();
    sheet.getCell(row, 2).value = driver.value;
    if (driver.label.includes('Shares')) {
      applyNumberFormat(sheet.getCell(row, 2), 'INTEGER');
    } else {
      applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    }
    row++;
  });

  setColumnWidths(sheet, [0, 35, 20]);
}

/**
 * Create M&A Sensitivities sheet
 */
function createMASensitivitiesSheet(
  workbook: ExcelJS.Workbook,
  acquirerTicker: string,
  targetTicker: string,
  inputs: MergerInputs,
  output: MergerOutput
): void {
  const sheet = workbook.addWorksheet('Sensitivities');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${acquirerTicker} + ${targetTicker} - Sensitivity Analysis`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 6);
  row += 2;

  // Synergy Sensitivity (if synergies exist)
  if (output.synergies.total.length > 0 || inputs.synergies) {
    sheet.getCell(row, 1).value = 'Synergy Sensitivity';
    sheet.getCell(row, 1).style = createSubHeaderStyle();
    sheet.mergeCells(row, 1, row, 6);
    row++;

    const baseSynergies = inputs.synergies || (output.synergies.total.length > 0 ? output.synergies.total[0] : 0);
    const synergyMultipliers = [0.5, 0.75, 1.0, 1.25, 1.5];

    sheet.getCell(row, 1).value = 'Synergy Level';
    sheet.getCell(row, 2).value = 'EPS Accretion';
    sheet.getCell(row, 3).value = 'EPS Accretion %';
    row++;

    synergyMultipliers.forEach(mult => {
      const adjustedSynergies = baseSynergies * mult;
      const adjustedEBITDA = output.proForma.ebitda - (baseSynergies - adjustedSynergies);
      const adjustedEBT = adjustedEBITDA - output.proForma.interestExpense;
      const adjustedTax = Math.max(0, adjustedEBT * (inputs.taxRate || 0.25));
      const adjustedNetIncome = adjustedEBT - adjustedTax;
      const adjustedEPS = output.proForma.sharesOutstanding > 0 ? adjustedNetIncome / output.proForma.sharesOutstanding : 0;
      const adjustedAccretion = adjustedEPS - output.standalone.acquirer.eps;
      const adjustedAccretionPct = output.standalone.acquirer.eps > 0 ? adjustedAccretion / output.standalone.acquirer.eps : 0;

      sheet.getCell(row, 1).value = `${(mult * 100).toFixed(0)}%`;
      sheet.getCell(row, 2).value = adjustedAccretion;
      sheet.getCell(row, 3).value = adjustedAccretionPct;
      applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY_DECIMALS');
      applyNumberFormat(sheet.getCell(row, 3), 'PERCENTAGE');
      sheet.getCell(row, 2).style = {
        ...createNormalStyle(),
        font: { ...createNormalStyle().font, color: { argb: adjustedAccretion >= 0 ? 'FF008000' : 'FFFF0000' } },
      };
      row++;
    });

    row += 2;
  }

  // Purchase Price Sensitivity
  sheet.getCell(row, 1).value = 'Purchase Price Sensitivity';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  sheet.mergeCells(row, 1, row, 6);
  row++;

  const basePrice = output.dealValue;
  const priceMultipliers = [0.9, 0.95, 1.0, 1.05, 1.1];

  sheet.getCell(row, 1).value = 'Price Multiple';
  sheet.getCell(row, 2).value = 'Deal Value';
  sheet.getCell(row, 3).value = 'EPS Accretion';
  sheet.getCell(row, 4).value = 'EPS Accretion %';
  row++;

  priceMultipliers.forEach(mult => {
    const adjustedPrice = basePrice * mult;
    // Simplified: assume proportional impact on accretion
    const adjustedAccretion = output.accretionDilution.epsAccretion * (1 - (mult - 1) * 0.5); // Rough approximation
    const adjustedAccretionPct = output.standalone.acquirer.eps > 0 ? adjustedAccretion / output.standalone.acquirer.eps : 0;

    sheet.getCell(row, 1).value = `${(mult * 100).toFixed(0)}%`;
    sheet.getCell(row, 2).value = adjustedPrice;
    sheet.getCell(row, 3).value = adjustedAccretion;
    sheet.getCell(row, 4).value = adjustedAccretionPct;
    applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
    applyNumberFormat(sheet.getCell(row, 3), 'CURRENCY_DECIMALS');
    applyNumberFormat(sheet.getCell(row, 4), 'PERCENTAGE');
    sheet.getCell(row, 3).style = {
      ...createNormalStyle(),
      font: { ...createNormalStyle().font, color: { argb: adjustedAccretion >= 0 ? 'FF008000' : 'FFFF0000' } },
    };
    row++;
  });

  setColumnWidths(sheet, [0, 20, 15, 15, 15, 15, 15]);
}

/**
 * Create M&A Checks sheet
 */
function createMAChecksSheet(
  workbook: ExcelJS.Workbook,
  acquirerTicker: string,
  targetTicker: string,
  output: MergerOutput
): void {
  const sheet = workbook.addWorksheet('Checks');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${acquirerTicker} + ${targetTicker} - Model Checks`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 3);
  row += 2;

  // Consideration Check
  sheet.getCell(row, 1).value = 'Consideration Balance';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const considerationTotal = output.consideration.cash + output.consideration.stock + output.consideration.debt;
  const considerationDiff = Math.abs(considerationTotal - output.dealValue);

  sheet.getCell(row, 1).value = 'Difference';
  sheet.getCell(row, 2).value = considerationDiff;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: considerationDiff < 0.01 ? 'FF008000' : 'FFFF0000' } },
  };
  row += 2;

  // Pro Forma Check
  sheet.getCell(row, 1).value = 'Pro Forma Reconciliation';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const calculatedProFormaRevenue = output.standalone.acquirer.revenue + output.standalone.target.revenue + 
    (output.synergies.revenue.length > 0 ? output.synergies.revenue[0] : 0);
  const revenueDiff = Math.abs(calculatedProFormaRevenue - output.proForma.revenue);

  sheet.getCell(row, 1).value = 'Revenue Check';
  sheet.getCell(row, 2).value = revenueDiff;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: revenueDiff < 0.01 ? 'FF008000' : 'FFFF0000' } },
  };
  row++;

  const calculatedProFormaNetIncome = output.standalone.acquirer.netIncome + output.standalone.target.netIncome + 
    (output.synergies.total.length > 0 ? output.synergies.total[0] : 0) - 
    (output.integrationCosts.length > 0 ? output.integrationCosts[0] : 0) - 
    output.proForma.interestExpense - output.proForma.tax;
  const netIncomeDiff = Math.abs(calculatedProFormaNetIncome - output.proForma.netIncome);

  sheet.getCell(row, 1).value = 'Net Income Check';
  sheet.getCell(row, 2).value = netIncomeDiff;
  applyNumberFormat(sheet.getCell(row, 2), 'CURRENCY');
  sheet.getCell(row, 2).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: netIncomeDiff < 0.01 ? 'FF008000' : 'FFFF0000' } },
  };

  setColumnWidths(sheet, [0, 25, 20, 15]);
}

/**
 * Create M&A Sources & Notes sheet
 */
function createMASourcesNotesSheet(
  workbook: ExcelJS.Workbook,
  acquirerTicker: string,
  targetTicker: string,
  inputs: MergerInputs
): void {
  const sheet = workbook.addWorksheet('Sources & Notes');
  let row = 1;

  // Title
  sheet.getCell(row, 1).value = `${acquirerTicker} + ${targetTicker} - Data Sources & Notes`;
  sheet.getCell(row, 1).style = createHeaderStyle();
  sheet.mergeCells(row, 1, row, 2);
  row += 2;

  // Data Sources
  if (inputs.dataSources) {
    sheet.getCell(row, 1).value = 'Data Sources';
    sheet.getCell(row, 1).style = createSubHeaderStyle();
    row++;

    const dataSources = inputs.dataSources;
    const sourceItems = [
      { label: 'Acquirer Revenue', source: dataSources.acquirerRevenue || 'Reported' },
      { label: 'Acquirer EBITDA', source: dataSources.acquirerEBITDA || 'Reported' },
      { label: 'Target Revenue', source: dataSources.targetRevenue || 'Reported' },
      { label: 'Target EBITDA', source: dataSources.targetEBITDA || 'Reported' },
    ];

    sourceItems.forEach(item => {
      sheet.getCell(row, 1).value = item.label;
      sheet.getCell(row, 2).value = item.source;
      sheet.getCell(row, 1).style = createNormalStyle();
      sheet.getCell(row, 2).style = {
        ...createNormalStyle(),
        font: { ...createNormalStyle().font, color: { argb: item.source === 'User' ? 'FF0066CC' : 'FF000000' } },
      };
      row++;
    });

    row += 2;
  }

  // Shares Sources
  sheet.getCell(row, 1).value = 'Shares Sources';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  sheet.getCell(row, 1).value = 'Acquirer Shares Source';
  sheet.getCell(row, 2).value = inputs.acquirerSharesSource || 'Reported';
  sheet.getCell(row, 1).style = createNormalStyle();
  sheet.getCell(row, 2).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: inputs.acquirerSharesSource === 'User Provided' ? 'FF0066CC' : 'FF000000' } },
  };
  row++;

  sheet.getCell(row, 1).value = 'Target Shares Source';
  sheet.getCell(row, 2).value = inputs.targetSharesSource || 'Reported';
  sheet.getCell(row, 1).style = createNormalStyle();
  sheet.getCell(row, 2).style = {
    ...createNormalStyle(),
    font: { ...createNormalStyle().font, color: { argb: inputs.targetSharesSource === 'User Provided' ? 'FF0066CC' : 'FF000000' } },
  };
  row += 2;

  // Notes
  sheet.getCell(row, 1).value = 'Notes';
  sheet.getCell(row, 1).style = createSubHeaderStyle();
  row++;

  const notes = [
    'Shares may be derived from Market Cap ÷ Price if inputs exist',
    'Interest expense = Debt × Rate (user provides rate if missing)',
    'If pro forma line cannot be computed, cell is left blank and flagged',
    'Synergies are NEVER invented - only user-entered values are used',
    'Pro forma table uses banking-style: Standalone / Adjustments / Pro Forma columns',
  ];

  notes.forEach(note => {
    sheet.getCell(row, 1).value = `• ${note}`;
    sheet.getCell(row, 1).style = { ...createNormalStyle(), alignment: { wrapText: true } };
    row++;
  });

  setColumnWidths(sheet, [0, 50, 20]);
}
