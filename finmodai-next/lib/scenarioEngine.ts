/**
 * Scenario Engine
 * Runs scenario analysis for DCF and forecast models
 */

export interface BaseAssumptions {
  ticker: string;
  companyName?: string;
  revenue: number;
  revenueGrowth: number;
  ebitdaMargin: number;
  daPctRevenue?: number;
  taxRate?: number;
  wacc?: number;
  terminalGrowth?: number;
  capexPctRevenue?: number;
  nwcPctRevenue?: number;
  netDebt?: number;
  sharesOutstanding?: number;
}

export interface ScenarioAssumptions {
  name: string;
  revenueGrowthDelta?: number;
  ebitdaMarginDelta?: number;
  daPctRevenueDelta?: number;
  taxRateDelta?: number;
  capexPctRevenueDelta?: number;
  nwcPctRevenueDelta?: number;
  waccDelta?: number;
  terminalGrowthDelta?: number;
}

export interface ForecastResult {
  scenario: string;
  projections: Array<{
    year: number;
    revenue: number;
    ebitda: number;
    ebitdaMargin: number;
    freeCashFlow: number;
  }>;
}

export interface DcfResult {
  scenario: string;
  enterpriseValue: number;
  equityValue: number;
  pricePerShare: number;
  impliedReturn?: number;
  pvExplicitFcf?: number;
  pvTerminalValue?: number;
  projections: Array<{
    year: number;
    revenue: number;
    ebitda: number;
    freeCashFlow: number;
  }>;
}

export type ScenarioDelta = {
  enterpriseValue: number;
  equityValue: number;
  pricePerShare: number;
  revenueGrowth: number;
  ebitdaMargin: number;
  wacc: number;
  terminalGrowth: number;
  taxRate: number;
  capexPctRevenue: number;
  nwcPctRevenue: number;
  daPctRevenue: number;
};

export type ScenarioRunWithDelta = {
  scenario: ScenarioAssumptions;
  dcf: DcfResult;
  forecast: ForecastResult;
  deltaVsBase: ScenarioDelta;
};

/**
 * Run forecast scenario
 */
export async function runForecast(
  base: BaseAssumptions,
  scenario: ScenarioAssumptions,
  years: number = 5
): Promise<ForecastResult> {
  const revenueGrowth = base.revenueGrowth + (scenario.revenueGrowthDelta || 0);
  const ebitdaMargin = base.ebitdaMargin + (scenario.ebitdaMarginDelta || 0);
  const taxRate = (base.taxRate ?? 0.25) + (scenario.taxRateDelta || 0);
  const capexPct = (base.capexPctRevenue ?? 0.04) + (scenario.capexPctRevenueDelta || 0);
  const nwcPct = (base.nwcPctRevenue ?? 0.10) + (scenario.nwcPctRevenueDelta || 0);
  
  const projections: ForecastResult['projections'] = [];
  let currentRevenue = base.revenue;
  let previousNWC = currentRevenue * nwcPct;
  
  for (let year = 1; year <= years; year++) {
    currentRevenue = currentRevenue * (1 + revenueGrowth);
    const ebitda = currentRevenue * ebitdaMargin;
    const nopat = ebitda * (1 - taxRate);
    const capex = currentRevenue * capexPct;
    const currentNWC = currentRevenue * nwcPct;
    const nwcChange = currentNWC - previousNWC;
    previousNWC = currentNWC;
    
    const freeCashFlow = nopat - capex - nwcChange;
    
    projections.push({
      year,
      revenue: currentRevenue,
      ebitda,
      ebitdaMargin,
      freeCashFlow
    });
  }
  
  return {
    scenario: scenario.name,
    projections
  };
}

/**
 * Run DCF scenario
 */
export async function runDcf(
  base: BaseAssumptions,
  scenario: ScenarioAssumptions,
  years: number = 5
): Promise<DcfResult> {
  const revenueGrowth = base.revenueGrowth + (scenario.revenueGrowthDelta || 0);
  const ebitdaMargin = base.ebitdaMargin + (scenario.ebitdaMarginDelta || 0);
  const wacc = (base.wacc || 0.10) + (scenario.waccDelta || 0);
  const terminalGrowth = (base.terminalGrowth || 0.025) + (scenario.terminalGrowthDelta || 0);
  const taxRate = (base.taxRate ?? 0.25) + (scenario.taxRateDelta || 0);
  const capexPct = (base.capexPctRevenue ?? 0.04) + (scenario.capexPctRevenueDelta || 0);
  const nwcPct = (base.nwcPctRevenue ?? 0.10) + (scenario.nwcPctRevenueDelta || 0);
  const depreciationPct = (base.daPctRevenue ?? 0.05) + (scenario.daPctRevenueDelta || 0);
  
  // Build projections
  const projections: DcfResult['projections'] = [];
  let currentRevenue = base.revenue;
  let previousNWC = currentRevenue * nwcPct;
  let pvOfFCF = 0;
  const pvList: number[] = [];
  
  for (let year = 1; year <= years; year++) {
    currentRevenue = currentRevenue * (1 + revenueGrowth);
    const ebitda = currentRevenue * ebitdaMargin;
    const depreciation = currentRevenue * depreciationPct;
    const ebit = ebitda - depreciation;
    const taxes = ebit > 0 ? ebit * taxRate : 0;
    const nopat = ebit - taxes;
    const capex = currentRevenue * capexPct;
    const currentNWC = currentRevenue * nwcPct;
    const nwcChange = currentNWC - previousNWC;
    previousNWC = currentNWC;
    
    const freeCashFlow = nopat + depreciation - capex - nwcChange;
    const pv = freeCashFlow / Math.pow(1 + wacc, year);
    pvOfFCF += pv;
    pvList.push(pv);
    
    projections.push({
      year,
      revenue: currentRevenue,
      ebitda,
      freeCashFlow
    });
  }
  
  // Terminal value
  const terminalFCF = projections[projections.length - 1].freeCashFlow * (1 + terminalGrowth);
  const terminalValue = wacc > terminalGrowth ? terminalFCF / (wacc - terminalGrowth) : NaN;
  const pvOfTerminalValue = terminalValue / Math.pow(1 + wacc, years);
  
  // Valuation
  const enterpriseValue = pvOfFCF + pvOfTerminalValue;
  const netDebt = base.netDebt || 0;
  const equityValue = enterpriseValue - netDebt;
  const sharesOutstanding = base.sharesOutstanding || 0;
  const safeShares = sharesOutstanding > 0 ? sharesOutstanding : 1;
  const pricePerShare = equityValue / safeShares;
  
  return {
    scenario: scenario.name,
    enterpriseValue,
    equityValue,
    pricePerShare,
    pvExplicitFcf: pvOfFCF,
    pvTerminalValue: pvOfTerminalValue,
    projections
  };
}

/**
 * Run multiple scenarios
 */
export async function runScenarios(
  base: BaseAssumptions,
  scenarios: ScenarioAssumptions[]
): Promise<DcfResult[]> {
  const results: DcfResult[] = [];
  
  for (const scenario of scenarios) {
    const result = await runDcf(base, scenario);
    results.push(result);
  }
  
  return results;
}

/**
 * Create standard scenario set (Base, Bull, Bear)
 */
export function createStandardScenarios(): ScenarioAssumptions[] {
  return [
    {
      name: 'Base Case',
      revenueGrowthDelta: 0,
      ebitdaMarginDelta: 0,
      waccDelta: 0
    },
    {
      name: 'Bull Case',
      revenueGrowthDelta: 0.03,
      ebitdaMarginDelta: 0.02,
      waccDelta: -0.01
    },
    {
      name: 'Bear Case',
      revenueGrowthDelta: -0.03,
      ebitdaMarginDelta: -0.02,
      waccDelta: 0.01
    }
  ];
}

export function computeDeltaVsBase(baseCase: DcfResult, scenarioCase: DcfResult, base: BaseAssumptions, scenario: ScenarioAssumptions): ScenarioDelta {
  const baseDrivers = {
    revenueGrowth: base.revenueGrowth,
    ebitdaMargin: base.ebitdaMargin,
    wacc: base.wacc ?? 0.1,
    terminalGrowth: base.terminalGrowth ?? 0.025,
    taxRate: base.taxRate ?? 0.25,
    capexPctRevenue: base.capexPctRevenue ?? 0.04,
    nwcPctRevenue: base.nwcPctRevenue ?? 0.1,
    daPctRevenue: base.daPctRevenue ?? 0.05,
  };
  return {
    enterpriseValue: scenarioCase.enterpriseValue - baseCase.enterpriseValue,
    equityValue: scenarioCase.equityValue - baseCase.equityValue,
    pricePerShare: scenarioCase.pricePerShare - baseCase.pricePerShare,
    revenueGrowth: (baseDrivers.revenueGrowth + (scenario.revenueGrowthDelta || 0)) - baseDrivers.revenueGrowth,
    ebitdaMargin: (baseDrivers.ebitdaMargin + (scenario.ebitdaMarginDelta || 0)) - baseDrivers.ebitdaMargin,
    wacc: (baseDrivers.wacc + (scenario.waccDelta || 0)) - baseDrivers.wacc,
    terminalGrowth: (baseDrivers.terminalGrowth + (scenario.terminalGrowthDelta || 0)) - baseDrivers.terminalGrowth,
    taxRate: (baseDrivers.taxRate + (scenario.taxRateDelta || 0)) - baseDrivers.taxRate,
    capexPctRevenue: (baseDrivers.capexPctRevenue + (scenario.capexPctRevenueDelta || 0)) - baseDrivers.capexPctRevenue,
    nwcPctRevenue: (baseDrivers.nwcPctRevenue + (scenario.nwcPctRevenueDelta || 0)) - baseDrivers.nwcPctRevenue,
    daPctRevenue: (baseDrivers.daPctRevenue + (scenario.daPctRevenueDelta || 0)) - baseDrivers.daPctRevenue,
  };
}

export async function generateBaseCase(base: BaseAssumptions): Promise<DcfResult> {
  return runDcf(base, { name: 'Base Case' });
}

export async function generateBullCase(base: BaseAssumptions): Promise<DcfResult> {
  return runDcf(base, {
    name: 'Bull Case',
    revenueGrowthDelta: 0.03,
    ebitdaMarginDelta: 0.02,
    waccDelta: -0.01
  });
}

export async function generateBearCase(base: BaseAssumptions): Promise<DcfResult> {
  return runDcf(base, {
    name: 'Bear Case',
    revenueGrowthDelta: -0.03,
    ebitdaMarginDelta: -0.02,
    waccDelta: 0.01
  });
}

// Return a safe, normalized scenario estimates object
export function applyScenarioToEstimates(estimates: any, scenario: ScenarioAssumptions | string): any {
  const base = estimates && typeof estimates === 'object' ? estimates : {};
  return {
    ...base,
    adjustmentNotes: Array.isArray(base.adjustmentNotes) ? base.adjustmentNotes : [],
    adjustedRevenueGrowthY1: base.adjustedRevenueGrowthY1,
    adjustedRevenueGrowthY2: base.adjustedRevenueGrowthY2,
    adjustedRevenueGrowthY3: base.adjustedRevenueGrowthY3,
    adjustedEbitdaMargin: base.adjustedEbitdaMargin,
    adjustedOperatingMargin: base.adjustedOperatingMargin,
    originalEstimates: base.originalEstimates ?? null,
    scenario: typeof scenario === 'string' ? scenario : scenario.name,
  };
}

export function applyScenarioToWACC(wacc: number, scenario: ScenarioAssumptions): { adjustedWACC: number; delta: number } {
  const delta = scenario.waccDelta || 0;
  return {
    adjustedWACC: wacc + delta,
    delta
  };
}

export function applyScenarioToRevenueProjections(
  projections: number[], 
  scenario: ScenarioAssumptions | string,
  adjustedGrowthRates?: number[]
): number[] {
  // If adjustedGrowthRates provided, use them to adjust projections
  if (adjustedGrowthRates && adjustedGrowthRates.length > 0) {
    return projections.map((p, idx) => {
      const growthRate = adjustedGrowthRates[idx] ?? adjustedGrowthRates[adjustedGrowthRates.length - 1] ?? 0;
      return p * (1 + growthRate);
    });
  }
  
  // Otherwise use scenario delta
  const scenarioObj = typeof scenario === 'string' 
    ? { name: scenario, revenueGrowthDelta: 0 } 
    : scenario;
  const delta = scenarioObj.revenueGrowthDelta || 0;
  return (projections || [])
    .filter(p => typeof p === 'number' && isFinite(p))
    .map(p => p * (1 + delta));
}

export function logScenarioAdjustments(scenario: ScenarioAssumptions | string, adjustments: Record<string, any>): void {
  const name = typeof scenario === 'string' ? scenario : scenario.name;
  console.log(`[Scenario] ${name}:`, adjustments);
}

export function createScenarioSummary(scenario: ScenarioAssumptions | string, results: any, waccAdjustment?: any): string {
  const scenarioName = typeof scenario === 'string' ? scenario : scenario.name;
  return `Scenario: ${scenarioName}`;
}
