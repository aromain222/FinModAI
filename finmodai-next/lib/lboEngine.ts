/**
 * LBO Engine
 * Generates Leveraged Buyout models with debt schedules and returns calculations
 */

import ExcelJS from 'exceljs';

export interface LboInputs {
  ticker: string;
  companyName?: string;
  enterpriseValue: number; // Purchase price
  revenue: number; // LTM revenue
  ebitda: number; // LTM EBITDA
  ebitdaMargin?: number;
  revenueGrowth?: number[];
  ebitdaMarginExpansion?: number;
  capexPctRevenue?: number;
  nwcPctRevenue?: number;
  taxRate?: number;
  exitMultiple?: number;
  holdPeriod?: number; // years
  
  // Debt structure
  debtToEquity?: number;
  seniorDebtPct?: number;
  subordinatedDebtPct?: number;
  seniorRate?: number;
  subRate?: number;
  
  // Other
  transactionFees?: number;
  currency?: string;
}

export interface LboEngineOutput {
  ticker: string;
  companyName: string;
  inputs: LboInputs;
  sourcesAndUses: {
    sources: {
      seniorDebt: number;
      subordinatedDebt: number;
      sponsorEquity: number;
      total: number;
    };
    uses: {
      purchasePrice: number;
      transactionFees: number;
      total: number;
    };
  };
  returns: {
    entryEV: number;
    exitEV: number;
    exitEquityValue: number;
    moic: number; // Multiple of Invested Capital
    irr: number; // Internal Rate of Return
  };
  debtSchedule: Array<{
    year: number;
    beginningBalance: number;
    interest: number;
    principalPayment: number;
    endingBalance: number;
  }>;
  projections: Array<{
    year: number;
    revenue: number;
    ebitda: number;
    ebitdaMargin: number;
    capex: number;
    nwcChange: number;
    freeCashFlow: number;
  }>;
}

/**
 * Calculate IRR using Newton-Raphson method
 */
function calculateIRR(cashFlows: number[], guess: number = 0.1): number {
  const maxIterations = 100;
  const tolerance = 0.0001;
  let rate = guess;
  
  for (let i = 0; i < maxIterations; i++) {
    let npv = 0;
    let dnpv = 0;
    
    for (let t = 0; t < cashFlows.length; t++) {
      npv += cashFlows[t] / Math.pow(1 + rate, t);
      dnpv -= t * cashFlows[t] / Math.pow(1 + rate, t + 1);
    }
    
    const newRate = rate - npv / dnpv;
    
    if (Math.abs(newRate - rate) < tolerance) {
      return newRate;
    }
    
    rate = newRate;
  }
  
  return rate;
}

/**
 * Run LBO model calculations
 */
export function runLboModel(inputs: LboInputs): LboEngineOutput {
  // Default assumptions
  const holdPeriod = inputs.holdPeriod || 5;
  const revenueGrowth = inputs.revenueGrowth || [0.08, 0.07, 0.06, 0.05, 0.05];
  const ebitdaMargin = inputs.ebitdaMargin || (inputs.ebitda / inputs.revenue);
  const ebitdaMarginExpansion = inputs.ebitdaMarginExpansion || 0.01;
  const capexPctRevenue = inputs.capexPctRevenue || 0.03;
  const nwcPctRevenue = inputs.nwcPctRevenue || 0.05;
  const taxRate = inputs.taxRate || 0.25;
  const exitMultiple = inputs.exitMultiple || (inputs.enterpriseValue / inputs.ebitda);
  
  // Debt structure
  const debtToEquity = inputs.debtToEquity || 0.6; // 60% debt
  const seniorDebtPct = inputs.seniorDebtPct || 0.7; // 70% of debt is senior
  const subordinatedDebtPct = inputs.subordinatedDebtPct || 0.3;
  const seniorRate = inputs.seniorRate || 0.06;
  const subRate = inputs.subRate || 0.10;
  
  const transactionFees = inputs.transactionFees || inputs.enterpriseValue * 0.02;
  
  // Sources & Uses
  const totalUses = inputs.enterpriseValue + transactionFees;
  const totalDebt = totalUses * debtToEquity;
  const seniorDebt = totalDebt * seniorDebtPct;
  const subordinatedDebt = totalDebt * subordinatedDebtPct;
  const sponsorEquity = totalUses - totalDebt;
  
  const sourcesAndUses = {
    sources: {
      seniorDebt,
      subordinatedDebt,
      sponsorEquity,
      total: seniorDebt + subordinatedDebt + sponsorEquity
    },
    uses: {
      purchasePrice: inputs.enterpriseValue,
      transactionFees,
      total: totalUses
    }
  };
  
  // Projections
  const projections: LboEngineOutput['projections'] = [];
  let currentRevenue = inputs.revenue;
  let currentEbitdaMargin = ebitdaMargin;
  
  for (let year = 1; year <= holdPeriod; year++) {
    const growth = revenueGrowth[year - 1] || revenueGrowth[revenueGrowth.length - 1];
    currentRevenue = currentRevenue * (1 + growth);
    currentEbitdaMargin = Math.min(currentEbitdaMargin + ebitdaMarginExpansion, 0.50);
    
    const ebitda = currentRevenue * currentEbitdaMargin;
    const capex = currentRevenue * capexPctRevenue;
    const nwcChange = currentRevenue * nwcPctRevenue * growth;
    const taxes = ebitda * taxRate;
    const freeCashFlow = ebitda - taxes - capex - nwcChange;
    
    projections.push({
      year,
      revenue: currentRevenue,
      ebitda,
      ebitdaMargin: currentEbitdaMargin,
      capex,
      nwcChange,
      freeCashFlow
    });
  }
  
  // Debt schedule (simplified - assumes level amortization)
  const debtSchedule: LboEngineOutput['debtSchedule'] = [];
  let remainingDebt = totalDebt;
  const annualPrincipal = totalDebt / holdPeriod;
  
  for (let year = 1; year <= holdPeriod; year++) {
    const beginningBalance = remainingDebt;
    const interest = remainingDebt * ((seniorDebt / totalDebt) * seniorRate + (subordinatedDebt / totalDebt) * subRate);
    const principalPayment = Math.min(annualPrincipal, remainingDebt);
    remainingDebt -= principalPayment;
    
    debtSchedule.push({
      year,
      beginningBalance,
      interest,
      principalPayment,
      endingBalance: remainingDebt
    });
  }
  
  // Exit calculations
  const exitEbitda = projections[projections.length - 1].ebitda;
  const exitEV = exitEbitda * exitMultiple;
  const exitDebt = debtSchedule[debtSchedule.length - 1].endingBalance;
  const exitEquityValue = exitEV - exitDebt;
  
  // Returns
  const moic = exitEquityValue / sponsorEquity;
  
  // IRR calculation
  const cashFlows = [-sponsorEquity];
  for (let i = 1; i < holdPeriod; i++) {
    cashFlows.push(0); // No interim distributions
  }
  cashFlows.push(exitEquityValue);
  const irr = calculateIRR(cashFlows);
  
  return {
    ticker: inputs.ticker,
    companyName: inputs.companyName || inputs.ticker,
    inputs,
    sourcesAndUses,
    returns: {
      entryEV: inputs.enterpriseValue,
      exitEV,
      exitEquityValue,
      moic,
      irr
    },
    debtSchedule,
    projections
  };
}

/**
 * Build LBO workbook using ExcelJS
 */
export async function buildLboWorkbook(output: LboEngineOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  
  // Dashboard sheet
  const dashboard = workbook.addWorksheet('Dashboard');
  dashboard.columns = [
    { key: 'label', width: 30 },
    { key: 'value', width: 20 }
  ];
  
  // Header
  dashboard.getCell('A1').value = `${output.companyName} LBO Model`;
  dashboard.getCell('A1').font = { bold: true, size: 16 };
  
  // Key metrics
  dashboard.getCell('A3').value = 'Key Returns';
  dashboard.getCell('A3').font = { bold: true };
  dashboard.addRow({ label: 'Entry EV', value: output.returns.entryEV });
  dashboard.addRow({ label: 'Exit EV', value: output.returns.exitEV });
  dashboard.addRow({ label: 'Sponsor Equity', value: output.sourcesAndUses.sources.sponsorEquity });
  dashboard.addRow({ label: 'Exit Equity Value', value: output.returns.exitEquityValue });
  dashboard.addRow({ label: 'MOIC', value: output.returns.moic });
  dashboard.addRow({ label: 'IRR', value: output.returns.irr });
  
  // Sources & Uses sheet
  const sourcesUses = workbook.addWorksheet('Sources & Uses');
  sourcesUses.columns = [
    { key: 'item', width: 30 },
    { key: 'amount', width: 20 }
  ];
  
  sourcesUses.getCell('A1').value = 'Sources & Uses';
  sourcesUses.getCell('A1').font = { bold: true, size: 14 };
  
  sourcesUses.getCell('A3').value = 'Sources';
  sourcesUses.getCell('A3').font = { bold: true };
  sourcesUses.addRow({ item: 'Senior Debt', amount: output.sourcesAndUses.sources.seniorDebt });
  sourcesUses.addRow({ item: 'Subordinated Debt', amount: output.sourcesAndUses.sources.subordinatedDebt });
  sourcesUses.addRow({ item: 'Sponsor Equity', amount: output.sourcesAndUses.sources.sponsorEquity });
  sourcesUses.addRow({ item: 'Total Sources', amount: output.sourcesAndUses.sources.total });
  
  sourcesUses.addRow({});
  sourcesUses.getCell('A9').value = 'Uses';
  sourcesUses.getCell('A9').font = { bold: true };
  sourcesUses.addRow({ item: 'Purchase Price', amount: output.sourcesAndUses.uses.purchasePrice });
  sourcesUses.addRow({ item: 'Transaction Fees', amount: output.sourcesAndUses.uses.transactionFees });
  sourcesUses.addRow({ item: 'Total Uses', amount: output.sourcesAndUses.uses.total });
  
  // Projections sheet
  const projections = workbook.addWorksheet('Projections');
  projections.columns = [
    { key: 'year', width: 10 },
    { key: 'revenue', width: 15 },
    { key: 'ebitda', width: 15 },
    { key: 'margin', width: 15 },
    { key: 'fcf', width: 15 }
  ];
  
  projections.getCell('A1').value = 'Financial Projections';
  projections.getCell('A1').font = { bold: true, size: 14 };
  
  projections.addRow({ year: 'Year', revenue: 'Revenue', ebitda: 'EBITDA', margin: 'Margin %', fcf: 'FCF' });
  projections.getRow(3).font = { bold: true };
  
  output.projections.forEach(proj => {
    projections.addRow({
      year: proj.year,
      revenue: proj.revenue,
      ebitda: proj.ebitda,
      margin: proj.ebitdaMargin,
      fcf: proj.freeCashFlow
    });
  });
  
  // Debt Schedule sheet
  const debtSched = workbook.addWorksheet('Debt Schedule');
  debtSched.columns = [
    { key: 'year', width: 10 },
    { key: 'beginning', width: 18 },
    { key: 'interest', width: 15 },
    { key: 'principal', width: 15 },
    { key: 'ending', width: 18 }
  ];
  
  debtSched.getCell('A1').value = 'Debt Schedule';
  debtSched.getCell('A1').font = { bold: true, size: 14 };
  
  debtSched.addRow({ year: 'Year', beginning: 'Beginning Balance', interest: 'Interest', principal: 'Principal', ending: 'Ending Balance' });
  debtSched.getRow(3).font = { bold: true };
  
  output.debtSchedule.forEach(debt => {
    debtSched.addRow({
      year: debt.year,
      beginning: debt.beginningBalance,
      interest: debt.interest,
      principal: debt.principalPayment,
      ending: debt.endingBalance
    });
  });
  
  return workbook;
}
