/**
 * Universal Input Protocol for Financial Modeling Engine v10.0
 * 
 * UI Slider values take ABSOLUTE PRIORITY over API consensus estimates.
 * This protocol handles input prioritization for ALL model types.
 */

import type { Scenario } from './scenarioEngine';

/**
 * UI Slider Inputs - These take absolute priority
 */
export interface UISliderInputs {
  // Core Assumptions (from sliders)
  wacc?: number;                    // WACC slider (0.05 - 0.18)
  revenueGrowth?: number;           // Revenue Growth slider (-0.10 to 0.30)
  ebitdaMargin?: number;            // EBITDA Margin slider (0.05 to 0.60)
  terminalGrowth?: number;          // Terminal Growth slider (0.01 to 0.04)
  
  // Operating Assumptions
  taxRate?: number;                 // Tax Rate slider (0.15 to 0.35)
  capexPercentRevenue?: number;     // CapEx % Revenue slider (0.02 to 0.20)
  daPercentRevenue?: number;        // D&A % Revenue slider (0.02 to 0.15)
  nwcPercentRevenue?: number;       // NWC % Revenue slider (0.01 to 0.10)
  
  // LBO-Specific
  entryMultiple?: number;           // Entry EV/EBITDA multiple
  exitMultiple?: number;            // Exit EV/EBITDA multiple
  debtToEquity?: number;            // Debt/Equity ratio
  interestRate?: number;            // Blended interest rate
  
  // Scenario Configuration
  includeScenarios?: boolean;       // Include Bull/Bear scenarios checkbox
  scenario?: Scenario;              // Single scenario mode (if includeScenarios is false)
}

/**
 * API-Sourced Estimates (fallback when UI not provided)
 */
export interface APIEstimates {
  revenueGrowthY1?: number;
  revenueGrowthY2?: number;
  revenueGrowthY3?: number;
  ebitdaMargin?: number;
  operatingMargin?: number;
  analystCount?: number;
  source: 'fmp' | 'finnhub' | 'consensus' | 'none';
}

/**
 * Resolved Inputs - Final values after priority resolution
 */
export interface ResolvedInputs {
  // Core Assumptions
  wacc: number;
  waccSource: 'ui-slider' | 'calculated' | 'inferred';
  revenueGrowth: number;
  revenueGrowthSource: 'ui-slider' | 'api-consensus' | 'inferred';
  ebitdaMargin: number;
  ebitdaMarginSource: 'ui-slider' | 'api-consensus' | 'inferred';
  terminalGrowth: number;
  terminalGrowthSource: 'ui-slider' | 'inferred';
  
  // Operating Assumptions
  taxRate: number;
  capexPercentRevenue: number;
  daPercentRevenue: number;
  nwcPercentRevenue: number;
  
  // LBO-Specific (if applicable)
  entryMultiple?: number;
  exitMultiple?: number;
  debtToEquity?: number;
  interestRate?: number;
  
  // Resolution Notes
  resolutionNotes: string[];
}

/**
 * Scenario-Adjusted Inputs
 */
export interface ScenarioAdjustedInputs {
  base: ResolvedInputs;
  bullish?: ResolvedInputs;
  bearish?: ResolvedInputs;
  scenariosEnabled: boolean;
}

/**
 * Sector defaults for fallback
 */
const SECTOR_DEFAULTS: Record<string, Partial<ResolvedInputs>> = {
  software: {
    wacc: 0.09,
    revenueGrowth: 0.12,
    ebitdaMargin: 0.28,
    terminalGrowth: 0.03,
    taxRate: 0.21,
    capexPercentRevenue: 0.04,
    daPercentRevenue: 0.05,
    nwcPercentRevenue: 0.01,
  },
  internet: {
    wacc: 0.10,
    revenueGrowth: 0.15,
    ebitdaMargin: 0.25,
    terminalGrowth: 0.03,
    taxRate: 0.21,
    capexPercentRevenue: 0.05,
    daPercentRevenue: 0.05,
    nwcPercentRevenue: 0.01,
  },
  consumer: {
    wacc: 0.08,
    revenueGrowth: 0.06,
    ebitdaMargin: 0.18,
    terminalGrowth: 0.02,
    taxRate: 0.21,
    capexPercentRevenue: 0.06,
    daPercentRevenue: 0.06,
    nwcPercentRevenue: 0.03,
  },
  industrial: {
    wacc: 0.09,
    revenueGrowth: 0.05,
    ebitdaMargin: 0.17,
    terminalGrowth: 0.02,
    taxRate: 0.21,
    capexPercentRevenue: 0.08,
    daPercentRevenue: 0.07,
    nwcPercentRevenue: 0.04,
  },
  financials: {
    wacc: 0.09,
    revenueGrowth: 0.04,
    ebitdaMargin: 0.25,
    terminalGrowth: 0.02,
    taxRate: 0.21,
    capexPercentRevenue: 0.03,
    daPercentRevenue: 0.03,
    nwcPercentRevenue: 0.00,
  },
  default: {
    wacc: 0.10,
    revenueGrowth: 0.08,
    ebitdaMargin: 0.20,
    terminalGrowth: 0.025,
    taxRate: 0.21,
    capexPercentRevenue: 0.06,
    daPercentRevenue: 0.05,
    nwcPercentRevenue: 0.02,
  },
};

/**
 * Resolve inputs with UI slider priority
 * 
 * PRIORITY ORDER:
 * 1. UI Slider Value (highest)
 * 2. API Consensus Estimate
 * 3. Sector Default (lowest)
 */
export function resolveInputs(
  uiInputs: UISliderInputs,
  apiEstimates: APIEstimates | null,
  sector: string
): ResolvedInputs {
  const defaults = SECTOR_DEFAULTS[sector.toLowerCase()] || SECTOR_DEFAULTS.default;
  const resolutionNotes: string[] = [];
  
  // WACC Resolution
  let wacc: number;
  let waccSource: 'ui-slider' | 'calculated' | 'inferred';
  
  if (uiInputs.wacc !== undefined && isValidNumber(uiInputs.wacc)) {
    wacc = uiInputs.wacc;
    waccSource = 'ui-slider';
    resolutionNotes.push(`WACC: ${(wacc * 100).toFixed(1)}% (UI Slider - PRIORITY)`);
  } else {
    wacc = defaults.wacc!;
    waccSource = 'inferred';
    resolutionNotes.push(`WACC: ${(wacc * 100).toFixed(1)}% (Sector Default: ${sector})`);
  }
  
  // Revenue Growth Resolution
  let revenueGrowth: number;
  let revenueGrowthSource: 'ui-slider' | 'api-consensus' | 'inferred';
  
  if (uiInputs.revenueGrowth !== undefined && isValidNumber(uiInputs.revenueGrowth)) {
    revenueGrowth = uiInputs.revenueGrowth;
    revenueGrowthSource = 'ui-slider';
    resolutionNotes.push(`Revenue Growth: ${(revenueGrowth * 100).toFixed(1)}% (UI Slider - PRIORITY)`);
  } else if (apiEstimates?.revenueGrowthY1 !== undefined && isValidNumber(apiEstimates.revenueGrowthY1)) {
    revenueGrowth = apiEstimates.revenueGrowthY1;
    revenueGrowthSource = 'api-consensus';
    resolutionNotes.push(`Revenue Growth: ${(revenueGrowth * 100).toFixed(1)}% (API Consensus: ${apiEstimates.source})`);
  } else {
    revenueGrowth = defaults.revenueGrowth!;
    revenueGrowthSource = 'inferred';
    resolutionNotes.push(`Revenue Growth: ${(revenueGrowth * 100).toFixed(1)}% (Sector Default: ${sector})`);
  }
  
  // EBITDA Margin Resolution
  let ebitdaMargin: number;
  let ebitdaMarginSource: 'ui-slider' | 'api-consensus' | 'inferred';
  
  if (uiInputs.ebitdaMargin !== undefined && isValidNumber(uiInputs.ebitdaMargin)) {
    ebitdaMargin = uiInputs.ebitdaMargin;
    ebitdaMarginSource = 'ui-slider';
    resolutionNotes.push(`EBITDA Margin: ${(ebitdaMargin * 100).toFixed(1)}% (UI Slider - PRIORITY)`);
  } else if (apiEstimates?.ebitdaMargin !== undefined && isValidNumber(apiEstimates.ebitdaMargin)) {
    ebitdaMargin = apiEstimates.ebitdaMargin;
    ebitdaMarginSource = 'api-consensus';
    resolutionNotes.push(`EBITDA Margin: ${(ebitdaMargin * 100).toFixed(1)}% (API Consensus: ${apiEstimates.source})`);
  } else {
    ebitdaMargin = defaults.ebitdaMargin!;
    ebitdaMarginSource = 'inferred';
    resolutionNotes.push(`EBITDA Margin: ${(ebitdaMargin * 100).toFixed(1)}% (Sector Default: ${sector})`);
  }
  
  // Terminal Growth Resolution
  let terminalGrowth: number;
  let terminalGrowthSource: 'ui-slider' | 'inferred';
  
  if (uiInputs.terminalGrowth !== undefined && isValidNumber(uiInputs.terminalGrowth)) {
    terminalGrowth = uiInputs.terminalGrowth;
    terminalGrowthSource = 'ui-slider';
    resolutionNotes.push(`Terminal Growth: ${(terminalGrowth * 100).toFixed(1)}% (UI Slider - PRIORITY)`);
  } else {
    terminalGrowth = defaults.terminalGrowth!;
    terminalGrowthSource = 'inferred';
    resolutionNotes.push(`Terminal Growth: ${(terminalGrowth * 100).toFixed(1)}% (Sector Default: ${sector})`);
  }
  
  // Ensure terminal growth < WACC
  if (terminalGrowth >= wacc) {
    terminalGrowth = wacc - 0.01;
    resolutionNotes.push(`⚠️ Terminal Growth adjusted to ${(terminalGrowth * 100).toFixed(1)}% (must be < WACC)`);
  }
  
  // Operating Assumptions Resolution
  const taxRate = uiInputs.taxRate ?? defaults.taxRate!;
  const capexPercentRevenue = uiInputs.capexPercentRevenue ?? defaults.capexPercentRevenue!;
  const daPercentRevenue = uiInputs.daPercentRevenue ?? defaults.daPercentRevenue!;
  const nwcPercentRevenue = uiInputs.nwcPercentRevenue ?? defaults.nwcPercentRevenue!;
  
  return {
    wacc,
    waccSource,
    revenueGrowth,
    revenueGrowthSource,
    ebitdaMargin,
    ebitdaMarginSource,
    terminalGrowth,
    terminalGrowthSource,
    taxRate,
    capexPercentRevenue,
    daPercentRevenue,
    nwcPercentRevenue,
    entryMultiple: uiInputs.entryMultiple,
    exitMultiple: uiInputs.exitMultiple,
    debtToEquity: uiInputs.debtToEquity,
    interestRate: uiInputs.interestRate,
    resolutionNotes,
  };
}

/**
 * Apply scenario adjustments to resolved inputs
 */
export function applyScenarioAdjustments(
  baseInputs: ResolvedInputs,
  includeScenarios: boolean
): ScenarioAdjustedInputs {
  if (!includeScenarios) {
    return {
      base: baseInputs,
      scenariosEnabled: false,
    };
  }
  
  // BULLISH adjustments
  const bullishInputs: ResolvedInputs = {
    ...baseInputs,
    revenueGrowth: baseInputs.revenueGrowth + 0.02, // +2%
    ebitdaMargin: baseInputs.ebitdaMargin + 0.01,   // +1%
    wacc: Math.max(baseInputs.wacc - 0.005, 0.05),  // Lower WACC (less risk)
    resolutionNotes: [
      ...baseInputs.resolutionNotes,
      '',
      '🐂 BULLISH ADJUSTMENTS:',
      `  Revenue Growth: ${(baseInputs.revenueGrowth * 100).toFixed(1)}% → ${((baseInputs.revenueGrowth + 0.02) * 100).toFixed(1)}% (+2.0%)`,
      `  EBITDA Margin: ${(baseInputs.ebitdaMargin * 100).toFixed(1)}% → ${((baseInputs.ebitdaMargin + 0.01) * 100).toFixed(1)}% (+1.0%)`,
      `  WACC: ${(baseInputs.wacc * 100).toFixed(1)}% → ${(Math.max(baseInputs.wacc - 0.005, 0.05) * 100).toFixed(1)}% (lower risk)`,
    ],
  };
  
  // BEARISH adjustments
  const bearishInputs: ResolvedInputs = {
    ...baseInputs,
    revenueGrowth: baseInputs.revenueGrowth - 0.02, // -2%
    ebitdaMargin: Math.max(baseInputs.ebitdaMargin - 0.01, 0.05), // -1% (floor at 5%)
    wacc: Math.min(baseInputs.wacc + 0.005, 0.18),  // Higher WACC (more risk)
    resolutionNotes: [
      ...baseInputs.resolutionNotes,
      '',
      '🐻 BEARISH ADJUSTMENTS:',
      `  Revenue Growth: ${(baseInputs.revenueGrowth * 100).toFixed(1)}% → ${((baseInputs.revenueGrowth - 0.02) * 100).toFixed(1)}% (-2.0%)`,
      `  EBITDA Margin: ${(baseInputs.ebitdaMargin * 100).toFixed(1)}% → ${(Math.max(baseInputs.ebitdaMargin - 0.01, 0.05) * 100).toFixed(1)}% (-1.0%)`,
      `  WACC: ${(baseInputs.wacc * 100).toFixed(1)}% → ${(Math.min(baseInputs.wacc + 0.005, 0.18) * 100).toFixed(1)}% (higher risk)`,
    ],
  };
  
  return {
    base: baseInputs,
    bullish: bullishInputs,
    bearish: bearishInputs,
    scenariosEnabled: true,
  };
}

/**
 * Log input resolution
 */
export function logInputResolution(resolved: ResolvedInputs): void {
  console.log('[Input Protocol] ========== INPUT RESOLUTION ==========');
  resolved.resolutionNotes.forEach(note => {
    console.log(`[Input Protocol] ${note}`);
  });
  console.log('[Input Protocol] ================================================');
}

/**
 * Log scenario adjustments
 */
export function logScenarioInputs(adjusted: ScenarioAdjustedInputs): void {
  console.log('[Input Protocol] ========== SCENARIO INPUTS ==========');
  
  console.log('[Input Protocol] 📊 BASE CASE:');
  console.log(`  WACC: ${(adjusted.base.wacc * 100).toFixed(1)}%`);
  console.log(`  Revenue Growth: ${(adjusted.base.revenueGrowth * 100).toFixed(1)}%`);
  console.log(`  EBITDA Margin: ${(adjusted.base.ebitdaMargin * 100).toFixed(1)}%`);
  
  if (adjusted.scenariosEnabled) {
    console.log('[Input Protocol] 🐂 BULLISH CASE:');
    console.log(`  WACC: ${(adjusted.bullish!.wacc * 100).toFixed(1)}%`);
    console.log(`  Revenue Growth: ${(adjusted.bullish!.revenueGrowth * 100).toFixed(1)}%`);
    console.log(`  EBITDA Margin: ${(adjusted.bullish!.ebitdaMargin * 100).toFixed(1)}%`);
    
    console.log('[Input Protocol] 🐻 BEARISH CASE:');
    console.log(`  WACC: ${(adjusted.bearish!.wacc * 100).toFixed(1)}%`);
    console.log(`  Revenue Growth: ${(adjusted.bearish!.revenueGrowth * 100).toFixed(1)}%`);
    console.log(`  EBITDA Margin: ${(adjusted.bearish!.ebitdaMargin * 100).toFixed(1)}%`);
  }
  
  console.log('[Input Protocol] ================================================');
}

/**
 * Helper: Check if number is valid
 */
function isValidNumber(value: any): boolean {
  return typeof value === 'number' && isFinite(value) && !isNaN(value);
}

/**
 * Extract UI inputs from request body
 */
export function extractUIInputs(body: any): UISliderInputs {
  return {
    wacc: body.wacc,
    revenueGrowth: body.revenueGrowth,
    ebitdaMargin: body.ebitdaMargin,
    terminalGrowth: body.terminalGrowth,
    taxRate: body.taxRate,
    capexPercentRevenue: body.capexPercentRevenue,
    daPercentRevenue: body.daPercentRevenue,
    nwcPercentRevenue: body.nwcPercentRevenue,
    entryMultiple: body.entryMultiple,
    exitMultiple: body.exitMultiple,
    debtToEquity: body.debtToEquity,
    interestRate: body.interestRate,
    includeScenarios: body.includeScenarios ?? false,
    scenario: body.scenario,
  };
}

