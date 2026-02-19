/**
 * Frame Engine
 * 
 * Applies scenario frames to base case assumptions and computes valuation outputs
 * Uses mathjs for simple expression evaluation; cash-flow discounting is implemented explicitly.
 */

import { evaluate } from 'mathjs';
import { type ScenarioFrame, type AssumptionDelta } from './scenarioFrames';
import { validateNumeric, safeDivide } from './dataQuality';

export interface BaseAssumptions {
  // Revenue & Growth
  revenue: number; // Current/LTM revenue
  revenueGrowth: number; // Annual growth rate (e.g., 0.10 = 10%)
  
  // Margins
  ebitdaMargin: number; // EBITDA margin (e.g., 0.25 = 25%)
  cogsMargin?: number; // COGS as % of revenue
  taxRate: number; // Tax rate (e.g., 0.21 = 21%)
  
  // Reinvestment
  capexPct: number; // CapEx as % of revenue
  nwcPct: number; // Net working capital as % of revenue
  workingCapitalPct?: number; // Alternative name
  
  // Valuation
  discountRate: number; // WACC (e.g., 0.10 = 10%)
  exitMultiple: number; // Exit EV/EBITDA multiple
  terminalGrowth?: number; // Terminal growth rate (alternative to exit multiple)
  
  // Time
  projectionYears: number; // Number of years to project (default 5)
}

export interface ScenarioAssumptions extends BaseAssumptions {
  scenarioId: string;
  scenarioName: string;
}

export interface ValuationResult {
  enterpriseValue: number;
  impliedEquityValue: number;
  impliedSharePrice?: number;
  
  // Breakdown
  pvOfProjectedCashFlows: number;
  terminalValue: number;
  pvOfTerminalValue: number;
  
  // Metrics
  irr?: number;
  moic?: number; // Multiple of invested capital (if applicable)
  
  // Validation
  validationWarnings: string[];
  
  // Projections
  projections: Array<{
    year: number;
    revenue: number;
    ebitda: number;
    ebit: number;
    nopat: number;
    capex: number;
    nwcChange: number;
    freeCashFlow: number;
    discountFactor: number;
    pvOfFcf: number;
  }>;
}

/**
 * Applies a scenario frame to base case assumptions
 */
export function applyScenarioFrame(
  baseCase: BaseAssumptions,
  frame: ScenarioFrame
): ScenarioAssumptions {
  const adjusted = { ...baseCase } as any;
  
  for (const delta of frame.assumptionDeltas) {
    const currentValue = adjusted[delta.field];
    
    if (currentValue === undefined) {
      console.warn(`[frameEngine] Field ${delta.field} not found in base case, skipping delta`);
      continue;
    }
    
    let newValue: number;
    
    switch (delta.deltaType) {
      case 'absolute':
        // Absolute change (e.g., +100)
        newValue = currentValue + delta.deltaValue;
        break;
        
      case 'relative':
        // Relative change (e.g., +20% = multiply by 1.20)
        newValue = currentValue * (1 + delta.deltaValue);
        break;
        
      case 'bps':
        // Basis points (e.g., +300bps = +0.03)
        newValue = currentValue + (delta.deltaValue / 10000);
        break;
        
      default:
        console.warn(`[frameEngine] Unknown delta type: ${delta.deltaType}`);
        newValue = currentValue;
    }
    
    // Validate the new value
    const validation = validateNumeric(newValue, delta.field);
    if (validation.valid && validation.value !== null) {
      adjusted[delta.field] = validation.value;
    } else {
      console.warn(`[frameEngine] Invalid value for ${delta.field}: ${newValue}, keeping original`);
    }
  }
  
  return {
    ...adjusted,
    scenarioId: frame.id,
    scenarioName: frame.name,
  };
}

/**
 * Computes valuation using DCF-lite methodology
 */
export function computeValuation(
  assumptions: BaseAssumptions | ScenarioAssumptions,
  netDebt: number = 0,
  sharesOutstanding?: number
): ValuationResult {
  const validationWarnings: string[] = [];
  
  // Validate critical assumptions
  if (!assumptions.revenue || assumptions.revenue <= 0) {
    validationWarnings.push('Revenue must be greater than zero');
  }
  
  if (!assumptions.discountRate || assumptions.discountRate <= 0 || assumptions.discountRate >= 1) {
    validationWarnings.push('Discount rate must be between 0% and 100%');
  }
  
  if (!assumptions.exitMultiple || assumptions.exitMultiple <= 0) {
    validationWarnings.push('Exit multiple must be greater than zero');
  }
  
  if (assumptions.ebitdaMargin < 0 || assumptions.ebitdaMargin > 1) {
    validationWarnings.push('EBITDA margin must be between 0% and 100%');
  }
  
  // If critical validations fail, return zero values
  if (validationWarnings.length > 0 && (!assumptions.revenue || !assumptions.discountRate || !assumptions.exitMultiple)) {
    return {
      enterpriseValue: 0,
      impliedEquityValue: 0,
      impliedSharePrice: undefined,
      pvOfProjectedCashFlows: 0,
      terminalValue: 0,
      pvOfTerminalValue: 0,
      validationWarnings,
      projections: [],
    };
  }
  
  const years = assumptions.projectionYears || 5;
  const projections: ValuationResult['projections'] = [];
  
  let previousRevenue = assumptions.revenue;
  let previousNwc = assumptions.revenue * (assumptions.nwcPct || assumptions.workingCapitalPct || 0);
  
  // Project cash flows
  for (let year = 1; year <= years; year++) {
    // Revenue projection
    const revenue = previousRevenue * (1 + assumptions.revenueGrowth);
    
    // EBITDA
    const ebitda = revenue * assumptions.ebitdaMargin;
    
    // EBIT (assume D&A is 50% of CapEx as a proxy)
    const capex = revenue * assumptions.capexPct;
    const depreciation = capex * 0.5;
    const ebit = ebitda - depreciation;
    
    // NOPAT (Net Operating Profit After Tax)
    const nopat = ebit * (1 - assumptions.taxRate);
    
    // Add back D&A
    const operatingCashFlow = nopat + depreciation;
    
    // Working capital change
    const nwc = revenue * (assumptions.nwcPct || assumptions.workingCapitalPct || 0);
    const nwcChange = nwc - previousNwc;
    
    // Free Cash Flow
    const freeCashFlow = operatingCashFlow - capex - nwcChange;
    
    // Discount factor
    const discountFactor = 1 / Math.pow(1 + assumptions.discountRate, year);
    const pvOfFcf = freeCashFlow * discountFactor;
    
    projections.push({
      year,
      revenue,
      ebitda,
      ebit,
      nopat,
      capex,
      nwcChange,
      freeCashFlow,
      discountFactor,
      pvOfFcf,
    });
    
    previousRevenue = revenue;
    previousNwc = nwc;
  }
  
  // Sum PV of projected cash flows
  const pvOfProjectedCashFlows = projections.reduce((sum, p) => sum + p.pvOfFcf, 0);
  
  // Terminal value
  const finalYearEbitda = projections[projections.length - 1].ebitda;
  const terminalValue = finalYearEbitda * assumptions.exitMultiple;
  
  // PV of terminal value
  const terminalDiscountFactor = 1 / Math.pow(1 + assumptions.discountRate, years);
  const pvOfTerminalValue = terminalValue * terminalDiscountFactor;
  
  // Enterprise value
  const enterpriseValue = pvOfProjectedCashFlows + pvOfTerminalValue;
  
  // Implied equity value
  const impliedEquityValue = enterpriseValue - netDebt;
  
  // Implied share price (if shares outstanding provided)
  const impliedSharePrice = sharesOutstanding 
    ? safeDivide(impliedEquityValue, sharesOutstanding) || undefined
    : undefined;
  
  return {
    enterpriseValue,
    impliedEquityValue,
    impliedSharePrice,
    pvOfProjectedCashFlows,
    terminalValue,
    pvOfTerminalValue,
    validationWarnings,
    projections,
  };
}

/**
 * Projects time series for revenue and FCF (for charting)
 */
export function projectTimeSeries(
  assumptions: BaseAssumptions | ScenarioAssumptions,
  years: number = 10
): Array<{
  year: number;
  revenue: number;
  fcf: number;
  ebitda: number;
}> {
  const series: Array<{ year: number; revenue: number; fcf: number; ebitda: number }> = [];
  
  let revenue = assumptions.revenue;
  let previousNwc = revenue * (assumptions.nwcPct || assumptions.workingCapitalPct || 0);
  
  for (let year = 1; year <= years; year++) {
    revenue = revenue * (1 + assumptions.revenueGrowth);
    const ebitda = revenue * assumptions.ebitdaMargin;
    const capex = revenue * assumptions.capexPct;
    const depreciation = capex * 0.5;
    const ebit = ebitda - depreciation;
    const nopat = ebit * (1 - assumptions.taxRate);
    const operatingCashFlow = nopat + depreciation;
    
    const nwc = revenue * (assumptions.nwcPct || assumptions.workingCapitalPct || 0);
    const nwcChange = nwc - previousNwc;
    
    const fcf = operatingCashFlow - capex - nwcChange;
    
    series.push({ year, revenue, ebitda, fcf });
    
    previousNwc = nwc;
  }
  
  return series;
}

/**
 * Calculates sensitivity of valuation to a single assumption
 * Used for tornado charts and driver attribution
 */
export function calculateSensitivity(
  baseAssumptions: BaseAssumptions,
  field: keyof BaseAssumptions,
  deltaPercent: number, // e.g., 0.10 for +10%
  netDebt: number = 0
): {
  baseValue: number;
  adjustedValue: number;
  delta: number;
  deltaPercent: number;
} {
  const baseValuation = computeValuation(baseAssumptions, netDebt);
  
  const adjustedAssumptions = { ...baseAssumptions };
  const currentValue = adjustedAssumptions[field] as number;
  (adjustedAssumptions[field] as number) = currentValue * (1 + deltaPercent);
  
  const adjustedValuation = computeValuation(adjustedAssumptions, netDebt);
  
  const delta = adjustedValuation.enterpriseValue - baseValuation.enterpriseValue;
  const deltaPercentResult = safeDivide(delta, baseValuation.enterpriseValue) || 0;
  
  return {
    baseValue: baseValuation.enterpriseValue,
    adjustedValue: adjustedValuation.enterpriseValue,
    delta,
    deltaPercent: deltaPercentResult,
  };
}
