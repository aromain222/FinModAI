/**
 * DCF Generator
 * Generates Discounted Cash Flow valuation models
 */

import ExcelJS from 'exceljs';

export interface DCFInputs {
  ticker: string;
  companyName?: string;
  revenue: number | number[];
  revenueGrowth?: number | number[];
  ebitdaMargin?: number | number[];
  ebitMargin?: number | number[];
  taxRate?: number;
  depreciationPctRevenue?: number;
  capexPctRevenue?: number;
  nwcPctRevenue?: number;
  wacc?: number;
  terminalGrowth?: number;
  projectionYears?: number;
  netDebt?: number;
  sharesOutstanding?: number;
  currency?: string;
}

export interface DCFOutput {
  ticker: string;
  companyName: string;
  inputs: DCFInputs;
  projections: Array<{
    year: number;
    revenue: number;
    ebitda: number;
    ebit: number;
    nopat: number;
    depreciation: number;
    capex: number;
    nwcChange: number;
    freeCashFlow: number;
  }>;
  valuation: {
    pvOfProjectedFCF: number;
    terminalValue: number;
    pvOfTerminalValue: number;
    enterpriseValue: number;
    netDebt: number;
    equityValue: number;
    sharesOutstanding: number;
    pricePerShare: number;
  };
}

export async function generateBankerDCF(inputs: DCFInputs): Promise<DCFOutput> {
  const projectionYears = inputs.projectionYears || 5;
  const taxRate = inputs.taxRate || 0.25;
  const wacc = inputs.wacc || 0.10;
  const terminalGrowth = inputs.terminalGrowth || 0.025;
  const depreciationPct = inputs.depreciationPctRevenue || 0.05;
  const capexPct = inputs.capexPctRevenue || 0.04;
  const nwcPct = inputs.nwcPctRevenue || 0.10;
  
  const baseRevenue = Array.isArray(inputs.revenue) ? inputs.revenue[0] : inputs.revenue;
  
  let growthRates: number[];
  if (Array.isArray(inputs.revenueGrowth)) {
    growthRates = inputs.revenueGrowth;
  } else if (typeof inputs.revenueGrowth === 'number') {
    growthRates = Array(projectionYears).fill(inputs.revenueGrowth);
  } else {
    growthRates = [0.10, 0.08, 0.07, 0.06, 0.05];
  }
  
  let ebitdaMargins: number[];
  if (Array.isArray(inputs.ebitdaMargin)) {
    ebitdaMargins = inputs.ebitdaMargin;
  } else if (typeof inputs.ebitdaMargin === 'number') {
    ebitdaMargins = Array(projectionYears).fill(inputs.ebitdaMargin);
  } else {
    ebitdaMargins = Array(projectionYears).fill(0.25);
  }
  
  const projections: DCFOutput['projections'] = [];
  let currentRevenue = baseRevenue;
  let previousNWC = currentRevenue * nwcPct;
  
  for (let year = 1; year <= projectionYears; year++) {
    const growth = growthRates[year - 1] || growthRates[growthRates.length - 1];
    currentRevenue = currentRevenue * (1 + growth);
    
    const ebitdaMargin = ebitdaMargins[year - 1] || ebitdaMargins[ebitdaMargins.length - 1];
    const ebitda = currentRevenue * ebitdaMargin;
    const depreciation = currentRevenue * depreciationPct;
    const ebit = ebitda - depreciation;
    const nopat = ebit * (1 - taxRate);
    
    const capex = currentRevenue * capexPct;
    const currentNWC = currentRevenue * nwcPct;
    const nwcChange = currentNWC - previousNWC;
    previousNWC = currentNWC;
    
    const freeCashFlow = nopat + depreciation - capex - nwcChange;
    
    projections.push({
      year,
      revenue: currentRevenue,
      ebitda,
      ebit,
      nopat,
      depreciation,
      capex,
      nwcChange,
      freeCashFlow
    });
  }
  
  let pvOfProjectedFCF = 0;
  projections.forEach(proj => {
    const pv = proj.freeCashFlow / Math.pow(1 + wacc, proj.year);
    pvOfProjectedFCF += pv;
  });
  
  const terminalFCF = projections[projections.length - 1].freeCashFlow * (1 + terminalGrowth);
  const terminalValue = terminalFCF / (wacc - terminalGrowth);
  const pvOfTerminalValue = terminalValue / Math.pow(1 + wacc, projectionYears);
  
  const enterpriseValue = pvOfProjectedFCF + pvOfTerminalValue;
  const netDebt = inputs.netDebt || 0;
  const equityValue = enterpriseValue - netDebt;
  const sharesOutstanding = inputs.sharesOutstanding || 1000000;
  const pricePerShare = equityValue / sharesOutstanding;
  
  return {
    ticker: inputs.ticker,
    companyName: inputs.companyName || inputs.ticker,
    inputs,
    projections,
    valuation: {
      pvOfProjectedFCF,
      terminalValue,
      pvOfTerminalValue,
      enterpriseValue,
      netDebt,
      equityValue,
      sharesOutstanding,
      pricePerShare
    }
  };
}

export async function buildDcfWorkbook(output: DCFOutput): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('DCF Model');
  
  sheet.getCell('A1').value = `${output.companyName} DCF Valuation`;
  sheet.getCell('A1').font = { bold: true, size: 16 };
  
  sheet.getCell('A3').value = 'Projections';
  sheet.getCell('A3').font = { bold: true, size: 12 };
  
  const headers = ['Metric', ...output.projections.map(p => `Year ${p.year}`)];
  sheet.addRow(headers);
  sheet.getRow(4).font = { bold: true };
  
  sheet.addRow(['Revenue', ...output.projections.map(p => p.revenue)]);
  sheet.addRow(['EBITDA', ...output.projections.map(p => p.ebitda)]);
  sheet.addRow(['EBIT', ...output.projections.map(p => p.ebit)]);
  sheet.addRow(['NOPAT', ...output.projections.map(p => p.nopat)]);
  sheet.addRow(['+ Depreciation', ...output.projections.map(p => p.depreciation)]);
  sheet.addRow(['- Capex', ...output.projections.map(p => -p.capex)]);
  sheet.addRow(['- NWC Change', ...output.projections.map(p => -p.nwcChange)]);
  sheet.addRow(['= Free Cash Flow', ...output.projections.map(p => p.freeCashFlow)]);
  
  sheet.addRow([]);
  sheet.getCell('A13').value = 'Valuation';
  sheet.getCell('A13').font = { bold: true, size: 12 };
  
  sheet.addRow(['PV of Projected FCF', output.valuation.pvOfProjectedFCF]);
  sheet.addRow(['Terminal Value', output.valuation.terminalValue]);
  sheet.addRow(['PV of Terminal Value', output.valuation.pvOfTerminalValue]);
  sheet.addRow(['Enterprise Value', output.valuation.enterpriseValue]);
  sheet.addRow(['(-) Net Debt', output.valuation.netDebt]);
  sheet.addRow(['Equity Value', output.valuation.equityValue]);
  sheet.addRow(['Shares Outstanding', output.valuation.sharesOutstanding]);
  sheet.addRow(['Price Per Share', output.valuation.pricePerShare]);
  
  sheet.columns = [
    { key: 'metric', width: 25 },
    ...Array(output.projections.length).fill({ width: 15 })
  ];
  
  return workbook;
}
