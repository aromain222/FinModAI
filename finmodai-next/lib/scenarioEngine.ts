/**
 * Scenario Engine for DCF Valuation Engine v7.0
 * 
 * Applies BULLISH, BEARISH, or BASE scenario adjustments to consensus estimates
 * and WACC calculations.
 */

import type { ConsensusEstimate } from './data/consensusEstimates';
import { normalizeSharesOutstanding } from '@/lib/normalization';

export type Scenario = 'BULLISH' | 'BEARISH' | 'BASE';

export interface ScenarioAdjustments {
  revenueGrowthAdjustment: number;  // +2% for BULLISH, -2% for BEARISH, 0 for BASE
  marginAdjustment: number;         // +1% for BULLISH, -1% for BEARISH, 0 for BASE
  waccAdjustment: 'lower' | 'higher' | 'base';  // Risk adjustment
}

export interface AdjustedEstimates {
  scenario: Scenario;
  originalEstimates: ConsensusEstimate | null;
  adjustedRevenueGrowthY1?: number;
  adjustedRevenueGrowthY2?: number;
  adjustedRevenueGrowthY3?: number;
  adjustedEbitdaMargin?: number;
  adjustedOperatingMargin?: number;
  adjustments: ScenarioAdjustments;
  adjustmentNotes: string[];
}

export interface WACCAdjustment {
  scenario: Scenario;
  baseWACC: number;
  adjustedWACC: number;
  adjustment: number;
  adjustmentReason: string;
}

/**
 * Get scenario adjustments
 */
export function getScenarioAdjustments(scenario: Scenario): ScenarioAdjustments {
  switch (scenario) {
    case 'BULLISH':
      return {
        revenueGrowthAdjustment: 0.02,  // +2%
        marginAdjustment: 0.01,          // +1%
        waccAdjustment: 'lower',         // Less risk
      };
    
    case 'BEARISH':
      return {
        revenueGrowthAdjustment: -0.02, // -2%
        marginAdjustment: -0.01,         // -1%
        waccAdjustment: 'higher',        // More risk
      };
    
    case 'BASE':
    default:
      return {
        revenueGrowthAdjustment: 0,
        marginAdjustment: 0,
        waccAdjustment: 'base',
      };
  }
}

/**
 * Apply scenario adjustments to consensus estimates
 */
export function applyScenarioToEstimates(
  consensusEstimates: ConsensusEstimate | null,
  scenario: Scenario
): AdjustedEstimates {
  const adjustments = getScenarioAdjustments(scenario);
  const adjustmentNotes: string[] = [];
  
  if (!consensusEstimates) {
    return {
      scenario,
      originalEstimates: null,
      adjustments,
      adjustmentNotes: ['No consensus estimates available to adjust'],
    };
  }
  
  const result: AdjustedEstimates = {
    scenario,
    originalEstimates: consensusEstimates,
    adjustments,
    adjustmentNotes: [],
  };
  
  // Adjust revenue growth Y1
  if (consensusEstimates.revenueGrowthY1 !== undefined) {
    result.adjustedRevenueGrowthY1 = consensusEstimates.revenueGrowthY1 + adjustments.revenueGrowthAdjustment;
    
    if (scenario !== 'BASE') {
      adjustmentNotes.push(
        `Revenue Growth Y1: ${(consensusEstimates.revenueGrowthY1 * 100).toFixed(1)}% → ` +
        `${(result.adjustedRevenueGrowthY1 * 100).toFixed(1)}% ` +
        `(${adjustments.revenueGrowthAdjustment > 0 ? '+' : ''}${(adjustments.revenueGrowthAdjustment * 100).toFixed(1)}%)`
      );
    }
  }
  
  // Adjust revenue growth Y2
  if (consensusEstimates.revenueGrowthY2 !== undefined) {
    result.adjustedRevenueGrowthY2 = consensusEstimates.revenueGrowthY2 + adjustments.revenueGrowthAdjustment;
    
    if (scenario !== 'BASE') {
      adjustmentNotes.push(
        `Revenue Growth Y2: ${(consensusEstimates.revenueGrowthY2 * 100).toFixed(1)}% → ` +
        `${(result.adjustedRevenueGrowthY2 * 100).toFixed(1)}% ` +
        `(${adjustments.revenueGrowthAdjustment > 0 ? '+' : ''}${(adjustments.revenueGrowthAdjustment * 100).toFixed(1)}%)`
      );
    }
  }
  
  // Adjust revenue growth Y3
  if (consensusEstimates.revenueGrowthY3 !== undefined) {
    result.adjustedRevenueGrowthY3 = consensusEstimates.revenueGrowthY3 + adjustments.revenueGrowthAdjustment;
  }
  
  // Adjust EBITDA margin
  if (consensusEstimates.ebitdaMarginTarget !== undefined) {
    result.adjustedEbitdaMargin = consensusEstimates.ebitdaMarginTarget + adjustments.marginAdjustment;
    
    if (scenario !== 'BASE') {
      adjustmentNotes.push(
        `EBITDA Margin: ${(consensusEstimates.ebitdaMarginTarget * 100).toFixed(1)}% → ` +
        `${(result.adjustedEbitdaMargin * 100).toFixed(1)}% ` +
        `(${adjustments.marginAdjustment > 0 ? '+' : ''}${(adjustments.marginAdjustment * 100).toFixed(1)}%)`
      );
    }
  }
  
  // Adjust operating margin
  if (consensusEstimates.operatingMarginTarget !== undefined) {
    result.adjustedOperatingMargin = consensusEstimates.operatingMarginTarget + adjustments.marginAdjustment;
  }
  
  result.adjustmentNotes = adjustmentNotes;
  
  return result;
}

/**
 * Apply scenario adjustment to WACC
 */
export function applyScenarioToWACC(
  baseWACC: number,
  scenario: Scenario,
  waccRange?: { min: number; max: number }
): WACCAdjustment {
  const adjustments = getScenarioAdjustments(scenario);
  
  let adjustedWACC = baseWACC;
  let adjustment = 0;
  let adjustmentReason = '';
  
  switch (adjustments.waccAdjustment) {
    case 'lower':
      // BULLISH: Use lower end of range (less risk)
      if (waccRange) {
        adjustedWACC = waccRange.min;
        adjustment = adjustedWACC - baseWACC;
        adjustmentReason = `BULLISH scenario: Using lower end of WACC range (${(waccRange.min * 100).toFixed(1)}% - ${(waccRange.max * 100).toFixed(1)}%)`;
      } else {
        // If no range, reduce by 0.5%
        adjustedWACC = Math.max(baseWACC - 0.005, 0.05); // Floor at 5%
        adjustment = adjustedWACC - baseWACC;
        adjustmentReason = 'BULLISH scenario: Reduced WACC by 0.5% (lower risk premium)';
      }
      break;
    
    case 'higher':
      // BEARISH: Use higher end of range (more risk)
      if (waccRange) {
        adjustedWACC = waccRange.max;
        adjustment = adjustedWACC - baseWACC;
        adjustmentReason = `BEARISH scenario: Using higher end of WACC range (${(waccRange.min * 100).toFixed(1)}% - ${(waccRange.max * 100).toFixed(1)}%)`;
      } else {
        // If no range, increase by 0.5%
        adjustedWACC = Math.min(baseWACC + 0.005, 0.18); // Cap at 18%
        adjustment = adjustedWACC - baseWACC;
        adjustmentReason = 'BEARISH scenario: Increased WACC by 0.5% (higher risk premium)';
      }
      break;
    
    case 'base':
    default:
      adjustedWACC = baseWACC;
      adjustment = 0;
      adjustmentReason = 'BASE scenario: Using calculated WACC without adjustment';
      break;
  }
  
  return {
    scenario,
    baseWACC,
    adjustedWACC,
    adjustment,
    adjustmentReason,
  };
}

/**
 * Apply scenario adjustments to revenue projections
 */
export function applyScenarioToRevenueProjections(
  baseRevenue: number[],
  scenario: Scenario,
  adjustedGrowthRates?: number[]
): number[] {
  if (scenario === 'BASE' || !adjustedGrowthRates || adjustedGrowthRates.length === 0) {
    return baseRevenue;
  }
  
  const adjustedRevenue: number[] = [baseRevenue[0]]; // Keep base year
  
  for (let i = 1; i < baseRevenue.length; i++) {
    const growthRate = adjustedGrowthRates[Math.min(i - 1, adjustedGrowthRates.length - 1)];
    const prevRevenue = adjustedRevenue[i - 1];
    adjustedRevenue.push(prevRevenue * (1 + growthRate));
  }
  
  return adjustedRevenue;
}

/**
 * Log scenario adjustments
 */
export function logScenarioAdjustments(
  scenario: Scenario,
  adjustedEstimates: AdjustedEstimates,
  waccAdjustment: WACCAdjustment
): void {
  console.log(`[Scenario Engine] ========== ${scenario} SCENARIO ==========`);
  
  if (adjustedEstimates.adjustmentNotes.length > 0) {
    console.log(`[Scenario Engine] Estimate Adjustments:`);
    adjustedEstimates.adjustmentNotes.forEach(note => {
      console.log(`  • ${note}`);
    });
  }
  
  console.log(`[Scenario Engine] WACC Adjustment:`);
  console.log(`  • Base WACC: ${(waccAdjustment.baseWACC * 100).toFixed(2)}%`);
  console.log(`  • Adjusted WACC: ${(waccAdjustment.adjustedWACC * 100).toFixed(2)}%`);
  console.log(`  • Adjustment: ${waccAdjustment.adjustment >= 0 ? '+' : ''}${(waccAdjustment.adjustment * 100).toFixed(2)}%`);
  console.log(`  • Reason: ${waccAdjustment.adjustmentReason}`);
  
  console.log(`[Scenario Engine] ================================================`);
}

/**
 * Create scenario summary for output
 */
export function createScenarioSummary(
  scenario: Scenario,
  adjustedEstimates: AdjustedEstimates,
  waccAdjustment: WACCAdjustment
): string[] {
  const summary: string[] = [];
  
  summary.push(`Scenario: ${scenario}`);
  summary.push('');
  
  if (scenario !== 'BASE') {
    summary.push('SCENARIO ADJUSTMENTS APPLIED:');
    
    if (adjustedEstimates.adjustmentNotes.length > 0) {
      adjustedEstimates.adjustmentNotes.forEach(note => {
        summary.push(`  • ${note}`);
      });
    }
    
    summary.push(`  • WACC: ${(waccAdjustment.baseWACC * 100).toFixed(1)}% → ${(waccAdjustment.adjustedWACC * 100).toFixed(1)}%`);
    summary.push(`    (${waccAdjustment.adjustmentReason})`);
  } else {
    summary.push('BASE CASE: Using consensus estimates without adjustments');
  }
  
  return summary;
}

export type ScenarioCase = 'base' | 'bull' | 'bear';

export interface WaccRange {
  min: number;
  max: number;
}

export interface BaseAssumptions {
  ticker?: string;
  revenue: number;
  revenueGrowth: number;
  ebitdaMargin: number;
  taxRate: number;
  capexPercent: number;
  wacc: number;
  terminalGrowth: number;
  netDebt?: number;
  sharesOutstanding?: number;
  forecastYears?: number;
  changeInNwcPercent?: number;
  daPercent?: number;
  waccRange?: WaccRange;
}

export interface ScenarioAssumptions extends BaseAssumptions {
  name: string;
  type: ScenarioCase | 'custom';
  adjustments?: string[];
}

export interface DcfResult {
  enterpriseValue: number;
  equityValue: number;
  impliedSharePrice?: number;
  cashFlows: number[];
  discountFactors: number[];
  presentValues: number[];
  terminalValue: number;
  pvTerminalValue: number;
}

export interface ForecastPoint {
  label: string;
  revenue: number;
  ebitda: number;
  fcf: number;
}

export interface ForecastResult {
  frequency: 'quarterly' | 'yearly';
  data: ForecastPoint[];
}

const clampNumber = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const sanitizePercent = (value: number | undefined, min: number, max: number, fallback: number): number => {
  if (value === undefined || value === null || !isFinite(value)) {
    return fallback;
  }
  return clampNumber(value, min, max);
};

const SCENARIO_LABELS: Record<ScenarioCase, string> = {
  base: 'Base Case',
  bull: 'Bull Case',
  bear: 'Bear Case',
};

const SCENARIO_NOTES: Record<ScenarioCase, string> = {
  base: 'Slider-defined baseline assumptions.',
  bull: 'Adds +200 bps growth, +100 bps margin, and low-end WACC.',
  bear: 'Subtracts 200 bps growth, 100 bps margin, and high-end WACC.',
};

type NormalizedScenario = Required<
  Pick<
    BaseAssumptions,
    'revenue' | 'revenueGrowth' | 'ebitdaMargin' | 'taxRate' | 'capexPercent' | 'wacc' | 'terminalGrowth'
  >
> & {
  ticker?: string;
  netDebt: number;
  sharesOutstanding?: number;
  forecastYears: number;
  changeInNwcPercent: number;
  daPercent: number;
  waccRange: WaccRange;
};

function normalizeScenario(input: BaseAssumptions): NormalizedScenario {
  const revenue = isFinite(input.revenue) && input.revenue > 0 ? input.revenue : 1;
  const revenueGrowth = sanitizePercent(input.revenueGrowth, -0.5, 0.5, 0.05);
  const ebitdaMargin = sanitizePercent(input.ebitdaMargin, 0, 0.6, 0.2);
  const taxRate = sanitizePercent(input.taxRate, 0, 0.5, 0.21);
  const capexPercent = sanitizePercent(input.capexPercent, 0, 0.25, 0.04);
  const wacc = sanitizePercent(input.wacc, 0.05, 0.2, 0.1);
  const terminalGrowth = sanitizePercent(input.terminalGrowth, 0, 0.04, 0.02);
  const netDebt = isFinite(input.netDebt || 0) ? Number(input.netDebt) : 0;
  const sharesOutstanding = input.sharesOutstanding !== undefined && input.sharesOutstanding !== null && isFinite(input.sharesOutstanding)
    ? normalizeSharesOutstanding(input.sharesOutstanding)
    : undefined;
  const forecastYears = clampNumber(Math.round(input.forecastYears || 5), 3, 10);
  const changeInNwcPercent = sanitizePercent(input.changeInNwcPercent, -0.1, 0.1, 0.01);
  const daPercent = sanitizePercent(input.daPercent, 0, 0.2, clampNumber(capexPercent * 0.6, 0.01, 0.08));
  const waccRange = input.waccRange || {
    min: clampNumber(wacc - 0.01, 0.05, 0.18),
    max: clampNumber(wacc + 0.01, 0.06, 0.22),
  };

  return {
    ticker: input.ticker,
    revenue,
    revenueGrowth,
    ebitdaMargin,
    taxRate,
    capexPercent,
    wacc,
    terminalGrowth,
    netDebt,
    sharesOutstanding,
    forecastYears,
    changeInNwcPercent,
    daPercent,
    waccRange,
  };
}

export function buildScenarioAssumptions(base: BaseAssumptions, preset: ScenarioCase): ScenarioAssumptions {
  const normalized = normalizeScenario(base);
  let revenueGrowth = normalized.revenueGrowth;
  let ebitdaMargin = normalized.ebitdaMargin;
  let wacc = normalized.wacc;
  const adjustments = [SCENARIO_NOTES[preset]];

  if (preset === 'bull') {
    revenueGrowth += 0.02;
    ebitdaMargin += 0.01;
    wacc = normalized.waccRange.min;
  } else if (preset === 'bear') {
    revenueGrowth -= 0.02;
    ebitdaMargin -= 0.01;
    wacc = normalized.waccRange.max;
  }

  return {
    ...normalized,
    name: SCENARIO_LABELS[preset],
    type: preset,
    revenueGrowth: clampNumber(revenueGrowth, -0.5, 0.5),
    ebitdaMargin: clampNumber(ebitdaMargin, 0, 0.7),
    wacc: clampNumber(wacc, 0.05, 0.25),
    adjustments,
  };
}

export const generateBaseCase = (base: BaseAssumptions): ScenarioAssumptions => buildScenarioAssumptions(base, 'base');
export const generateBullCase = (base: BaseAssumptions): ScenarioAssumptions => buildScenarioAssumptions(base, 'bull');
export const generateBearCase = (base: BaseAssumptions): ScenarioAssumptions => buildScenarioAssumptions(base, 'bear');

function calculateFreeCashFlow(revenue: number, scenario: NormalizedScenario): number {
  const ebitda = revenue * scenario.ebitdaMargin;
  const da = revenue * scenario.daPercent;
  const ebit = ebitda - da;
  const nopat = ebit * (1 - scenario.taxRate);
  const capex = revenue * scenario.capexPercent;
  const deltaWc = revenue * scenario.changeInNwcPercent;
  return nopat + da - capex - deltaWc;
}

export function runDcf(scenario: ScenarioAssumptions): DcfResult {
  const normalized = normalizeScenario(scenario);
  const cashFlows: number[] = [];
  const discountFactors: number[] = [];
  const presentValues: number[] = [];
  let revenue = normalized.revenue;

  for (let year = 1; year <= normalized.forecastYears; year++) {
    revenue = revenue * (1 + normalized.revenueGrowth);
    const fcf = calculateFreeCashFlow(revenue, normalized);
    cashFlows.push(fcf);
    const discountFactor = 1 / Math.pow(1 + normalized.wacc, year);
    discountFactors.push(discountFactor);
    presentValues.push(fcf * discountFactor);
  }

  const pvExplicit = presentValues.reduce((sum, value) => sum + value, 0);
  const sustainableGrowth = Math.min(normalized.terminalGrowth, normalized.wacc - 0.005);
  const finalCashFlow = cashFlows[cashFlows.length - 1] || 0;
  const terminalValue = finalCashFlow * (1 + sustainableGrowth) / Math.max(normalized.wacc - sustainableGrowth, 0.005);
  const pvTerminalValue = terminalValue / Math.pow(1 + normalized.wacc, normalized.forecastYears);
  const enterpriseValue = pvExplicit + pvTerminalValue;
  const equityValue = enterpriseValue - normalized.netDebt;
  const impliedSharePrice =
    normalized.sharesOutstanding && normalized.sharesOutstanding > 0
      ? equityValue / normalized.sharesOutstanding
      : undefined;

  return {
    enterpriseValue,
    equityValue,
    impliedSharePrice,
    cashFlows,
    discountFactors,
    presentValues,
    terminalValue,
    pvTerminalValue,
  };
}

export function runForecast(
  scenario: ScenarioAssumptions,
  options?: { periods?: number; frequency?: 'quarterly' | 'yearly' }
): ForecastResult {
  const normalized = normalizeScenario(scenario);
  const frequency = options?.frequency ?? 'yearly';
  const periods = options?.periods ?? (frequency === 'yearly' ? normalized.forecastYears : 8);
  const growthPerPeriod =
    frequency === 'yearly'
      ? normalized.revenueGrowth
      : Math.pow(1 + normalized.revenueGrowth, 1 / 4) - 1;

  const data: ForecastPoint[] = [];
  let revenue = normalized.revenue;

  for (let idx = 1; idx <= periods; idx++) {
    revenue = revenue * (1 + growthPerPeriod);
    const ebitda = revenue * normalized.ebitdaMargin;
    const fcf = calculateFreeCashFlow(revenue, normalized);
    const label = `${frequency === 'yearly' ? 'FY' : 'Q'}${idx}`;
    data.push({ label, revenue, ebitda, fcf });
  }

  return { frequency, data };
}
