/**
 * DCF Generator
 * Generates Discounted Cash Flow valuation models
 */

import ExcelJS from 'exceljs';
import { setColumnWidths } from './excel/formatting';
import type { DCFInputs as ExcelDCFInputs, DCFOutput as ExcelDCFOutput } from './models/dcf/excel';

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
  waccComponents?: {
    riskFreeRate?: number;
    equityRiskPremium?: number;
    beta?: number;
    costOfDebt?: number;
    taxRate?: number;
    debtPct?: number;
    equityPct?: number;
  };
  terminalGrowth?: number;
  projectionYears?: number;
  netDebt?: number | null;
  netDebtSource?: 'reported' | 'estimated_rules' | 'estimated_ai' | 'unknown';
  netDebtNote?: string;
  sharesOutstanding?: number | null;
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
    unleveredFCF?: number; // Added for new Excel generator compatibility
  }>;
  valuation: {
    pvOfProjectedFCF: number;
    terminalValue: number;
    pvOfTerminalValue: number;
    enterpriseValue: number;
    netDebt: number | null;
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
    const unleveredFCF = freeCashFlow; // Unlevered FCF = NOPAT + D&A - Capex - Change in NWC
    
    projections.push({
      year,
      revenue: currentRevenue,
      ebitda,
      ebit,
      nopat,
      depreciation,
      capex,
      nwcChange,
      freeCashFlow,
      unleveredFCF // Add unleveredFCF for new Excel generator
    } as any);
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
  const netDebtInput = typeof inputs.netDebt === 'number' && Number.isFinite(inputs.netDebt) ? inputs.netDebt : null;
  const netDebtForMath = netDebtInput ?? 0;
  const equityValue = enterpriseValue - netDebtForMath;
  const sharesOutstanding =
    inputs.sharesOutstanding ?? (inputs as any).sharesOutstandingMillions ?? 0;
  const pricePerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;
  
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
      netDebt: netDebtInput,
      equityValue,
      sharesOutstanding,
      pricePerShare
    }
  };
}

// Stub functions for compatibility
export function normalizeDCFInputs(inputs: Partial<DCFInputs> & { netDebtMillions?: number | null; sharesOutstandingMillions?: number | null }): DCFInputs & { netDebtMillions: number | null; sharesOutstandingMillions: number | null } {
  return {
    ticker: inputs.ticker || '',
    companyName: inputs.companyName || inputs.ticker || '',
    revenue: Array.isArray(inputs.revenue) ? inputs.revenue[0] : (inputs.revenue || 1000),
    revenueGrowth: inputs.revenueGrowth || 0.10,
    ebitdaMargin: inputs.ebitdaMargin || 0.25,
    ebitMargin: inputs.ebitMargin || 0.20,
    taxRate: inputs.taxRate || 0.25,
    depreciationPctRevenue: inputs.depreciationPctRevenue || 0.05,
    capexPctRevenue: inputs.capexPctRevenue || 0.04,
    nwcPctRevenue: inputs.nwcPctRevenue || 0.10,
    wacc: inputs.wacc || 0.10,
    terminalGrowth: inputs.terminalGrowth || 0.025,
    projectionYears: inputs.projectionYears || 5,
    netDebt: inputs.netDebt ?? inputs.netDebtMillions ?? null,
    sharesOutstanding: inputs.sharesOutstanding ?? inputs.sharesOutstandingMillions ?? 0,
    currency: inputs.currency || 'USD',
    // Additional properties for compatibility
    netDebtMillions: inputs.netDebtMillions ?? inputs.netDebt ?? null,
    sharesOutstandingMillions: inputs.sharesOutstandingMillions ?? inputs.sharesOutstanding ?? 0,
  };
}

export function computeDCFSeries(
  inputs: DCFInputs
): DCFOutput['valuation'] & {
  // Legacy aliases used in logs/UI.
  pvExplicitFCF: number;
  pvTerminalValue: number;
} {
  // Simple DCF calculation
  const projectionYears = inputs.projectionYears || 5;
  const taxRate = inputs.taxRate || 0.25;
  const wacc = inputs.wacc || 0.10;
  const terminalGrowth = inputs.terminalGrowth || 0.025;
  const baseRevenue = Array.isArray(inputs.revenue) ? inputs.revenue[0] : inputs.revenue;
  const growth = Array.isArray(inputs.revenueGrowth) ? inputs.revenueGrowth[0] : (inputs.revenueGrowth || 0.10);
  const ebitdaMargin = Array.isArray(inputs.ebitdaMargin) ? inputs.ebitdaMargin[0] : (inputs.ebitdaMargin || 0.25);
  const capexPct = inputs.capexPctRevenue || 0.04;
  const nwcPct = inputs.nwcPctRevenue || 0.10;
  
  // Calculate FCF for each year
  let currentRevenue = baseRevenue;
  let previousNWC = currentRevenue * nwcPct;
  let pvExplicitFCF = 0;
  
  for (let year = 1; year <= projectionYears; year++) {
    currentRevenue = currentRevenue * (1 + growth);
    const ebitda = currentRevenue * ebitdaMargin;
    const nopat = ebitda * (1 - taxRate);
    const capex = currentRevenue * capexPct;
    const currentNWC = currentRevenue * nwcPct;
    const nwcChange = currentNWC - previousNWC;
    previousNWC = currentNWC;
    
    const fcf = nopat - capex - nwcChange;
    pvExplicitFCF += fcf / Math.pow(1 + wacc, year);
  }
  
  // Terminal value
  const finalFCF = currentRevenue * ebitdaMargin * (1 - taxRate) - currentRevenue * capexPct;
  const waccMinusGrowth = wacc - terminalGrowth;
  const terminalValue = waccMinusGrowth > 0.001 ? (finalFCF * (1 + terminalGrowth) / waccMinusGrowth) : finalFCF * 10; // Fallback if wacc too close to growth
  const pvTerminalValue = terminalValue / Math.pow(1 + wacc, projectionYears);
  
  const enterpriseValue = (pvExplicitFCF || 0) + (pvTerminalValue || 0);
  const netDebtInput = typeof inputs.netDebt === 'number' && Number.isFinite(inputs.netDebt) ? inputs.netDebt : null;
  const netDebtForMath = netDebtInput ?? 0;
  const equityValue = enterpriseValue - netDebtForMath;
  const sharesOutstanding = Number(inputs.sharesOutstanding ?? (inputs as any).sharesOutstandingMillions ?? 0) || 0;
  const pricePerShare = sharesOutstanding > 0 ? equityValue / sharesOutstanding : 0;
  
  return {
    // Canonical names (used by DCFOutput.valuation)
    pvOfProjectedFCF: pvExplicitFCF || 0,
    terminalValue: terminalValue || 0,
    pvOfTerminalValue: pvTerminalValue || 0,
    enterpriseValue: enterpriseValue || 0,
    netDebt: netDebtInput,
    equityValue: equityValue || 0,
    sharesOutstanding: sharesOutstanding || 0,
    pricePerShare: pricePerShare || 0,

    // Legacy aliases
    pvExplicitFCF: pvExplicitFCF || 0,
    pvTerminalValue: pvTerminalValue || 0,
  };
}

export async function buildDcfWorkbook(output: DCFOutput): Promise<ExcelJS.Workbook> {
  // Use the new comprehensive DCF Excel generator
  const { generateDCFWorkbook } = await import('./models/dcf/excel');
  
  // Convert this module's DCFOutput into the canonical DCF Excel generator types.
  const dcfInputs: ExcelDCFInputs = {
    ticker: output.ticker,
    companyName: output.companyName,
    revenue: output.inputs.revenue,
    revenueGrowth: output.inputs.revenueGrowth,
    ebitdaMargin: output.inputs.ebitdaMargin,
    ebitMargin: output.inputs.ebitMargin,
    taxRate: output.inputs.taxRate,
    depreciationPctRevenue: output.inputs.depreciationPctRevenue,
    capexPctRevenue: output.inputs.capexPctRevenue,
    nwcPctRevenue: output.inputs.nwcPctRevenue,
    wacc: output.inputs.wacc,
    waccComponents: output.inputs.waccComponents,
    terminalGrowth: output.inputs.terminalGrowth,
    projectionYears: output.inputs.projectionYears,
    netDebt: output.inputs.netDebt,
    netDebtSource: (output.inputs as any).netDebtSource,
    netDebtNote: (output.inputs as any).netDebtNote,
    sharesOutstanding: output.inputs.sharesOutstanding,
    sharesSource: (output.inputs as any).sharesSource,
    dataSources: (output.inputs as any).dataSources,
  };

  const projections: ExcelDCFOutput['projections'] = output.projections.map((p) => ({
    year: p.year,
    revenue: p.revenue,
    ebitda: p.ebitda,
    ebit: p.ebit,
    nopat: p.nopat,
    depreciation: p.depreciation,
    capex: p.capex,
    nwcChange: p.nwcChange,
    unleveredFCF: p.unleveredFCF ?? (p as any).freeCashFlow ?? 0,
  }));

  const valuation: ExcelDCFOutput['valuation'] = {
    pvOfProjectedFCF: (output.valuation as any).pvOfProjectedFCF ?? (output.valuation as any).pvExplicitFCF ?? 0,
    terminalValue: (output.valuation as any).terminalValue ?? 0,
    pvOfTerminalValue: (output.valuation as any).pvOfTerminalValue ?? (output.valuation as any).pvTerminalValue ?? 0,
    enterpriseValue: (output.valuation as any).enterpriseValue ?? 0,
    netDebt: (output.valuation as any).netDebt ?? null,
    equityValue: (output.valuation as any).equityValue ?? 0,
    sharesOutstanding: (output.valuation as any).sharesOutstanding ?? 0,
    pricePerShare: (output.valuation as any).pricePerShare ?? 0,
  };

  const excelOutput: ExcelDCFOutput = {
    ticker: output.ticker,
    companyName: output.companyName,
    inputs: dcfInputs,
    projections,
    valuation,
    waccBreakdown: (output as any).waccBreakdown,
  };

  return generateDCFWorkbook(excelOutput);
}
