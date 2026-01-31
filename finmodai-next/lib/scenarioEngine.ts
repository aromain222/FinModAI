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
  projections: Array<{
    year: number;
    revenue: number;
    ebitda: number;
    freeCashFlow: number;
  }>;
}

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
  const taxRate = base.taxRate || 0.25;
  const capexPct = base.capexPctRevenue || 0.04;
  const nwcPct = base.nwcPctRevenue || 0.10;
  
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
  const taxRate = base.taxRate || 0.25;
  const capexPct = base.capexPctRevenue || 0.04;
  const nwcPct = base.nwcPctRevenue || 0.10;
  const depreciationPct = 0.05;
  
  // Build projections
  const projections: DcfResult['projections'] = [];
  let currentRevenue = base.revenue;
  let previousNWC = currentRevenue * nwcPct;
  let pvOfFCF = 0;
  
  for (let year = 1; year <= years; year++) {
    currentRevenue = currentRevenue * (1 + revenueGrowth);
    const ebitda = currentRevenue * ebitdaMargin;
    const depreciation = currentRevenue * depreciationPct;
    const ebit = ebitda - depreciation;
    const nopat = ebit * (1 - taxRate);
    const capex = currentRevenue * capexPct;
    const currentNWC = currentRevenue * nwcPct;
    const nwcChange = currentNWC - previousNWC;
    previousNWC = currentNWC;
    
    const freeCashFlow = nopat + depreciation - capex - nwcChange;
    const pv = freeCashFlow / Math.pow(1 + wacc, year);
    pvOfFCF += pv;
    
    projections.push({
      year,
      revenue: currentRevenue,
      ebitda,
      freeCashFlow
    });
  }
  
  // Terminal value
  const terminalFCF = projections[projections.length - 1].freeCashFlow * (1 + terminalGrowth);
  const terminalValue = terminalFCF / (wacc - terminalGrowth);
  const pvOfTerminalValue = terminalValue / Math.pow(1 + wacc, years);
  
  // Valuation
  const enterpriseValue = pvOfFCF + pvOfTerminalValue;
  const netDebt = base.netDebt || 0;
  const equityValue = enterpriseValue - netDebt;
  const sharesOutstanding = base.sharesOutstanding || 1000000;
  const pricePerShare = equityValue / sharesOutstanding;
  
  return {
    scenario: scenario.name,
    enterpriseValue,
    equityValue,
    pricePerShare,
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
