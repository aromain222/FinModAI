/**
 * Enhanced Inference Protocol
 * 
 * CONDITIONAL INFERENCE: Only infer values when ALL APIs have been queried
 * and a core DCF input is null, zero, or missing.
 * 
 * All inferred values are explicitly flagged and logged.
 */

import { ensureMillions, formatMillions } from '../unitConversion';

export interface InferredValue {
  value: number;
  isInferred: true;
  inferenceMethod: string;
  inferenceReason: string;
  sourceData?: Record<string, any>;
}

export interface InferenceResult {
  value: number;
  isInferred: boolean;
  inferenceMethod?: string;
  inferenceReason?: string;
  sourceData?: Record<string, any>;
}

export interface HistoricalDataPoint {
  year: number;
  value: number;
}

/**
 * Calculate 3-year historical average percentage
 */
function calculate3YearAverage(
  historical: HistoricalDataPoint[],
  baseMetric: 'revenue' | 'ebitda'
): number | null {
  if (!historical || historical.length < 2) {
    return null;
  }
  
  // Sort by year
  const sorted = [...historical].sort((a, b) => a.year - b.year);
  
  // Take last 3 years
  const recent = sorted.slice(-3);
  
  if (recent.length < 2) {
    return null;
  }
  
  // Calculate average
  const sum = recent.reduce((acc, point) => acc + point.value, 0);
  const avg = sum / recent.length;
  
  return avg;
}

/**
 * Infer CapEx as percentage of revenue
 */
export function inferCapexPercentage(
  historicalRevenue: HistoricalDataPoint[],
  historicalCapex: HistoricalDataPoint[],
  sector: string
): InferenceResult {
  // Try to calculate from historical data
  if (historicalRevenue.length >= 3 && historicalCapex.length >= 3) {
    const percentages: number[] = [];
    
    for (let i = 0; i < Math.min(historicalRevenue.length, historicalCapex.length); i++) {
      const rev = historicalRevenue[i];
      const capex = historicalCapex[i];
      
      if (rev.year === capex.year && rev.value > 0) {
        percentages.push(Math.abs(capex.value) / rev.value);
      }
    }
    
    if (percentages.length >= 2) {
      const avg = percentages.slice(-3).reduce((sum, p) => sum + p, 0) / Math.min(3, percentages.length);
      
      return {
        value: avg,
        isInferred: true,
        inferenceMethod: '3-year historical average',
        inferenceReason: 'CapEx not provided by APIs, calculated from historical data',
        sourceData: { percentages, average: avg },
      };
    }
  }
  
  // Fall back to sector defaults
  const sectorDefaults: Record<string, number> = {
    software: 0.04,
    internet: 0.05,
    fintech: 0.05,
    consumer: 0.06,
    luxury: 0.05,
    industrial: 0.08,
    staples: 0.06,
    telecom: 0.12,
    energy: 0.15,
    financials: 0.03,
  };
  
  const defaultValue = sectorDefaults[sector.toLowerCase()] || 0.06;
  
  return {
    value: defaultValue,
    isInferred: true,
    inferenceMethod: 'sector default',
    inferenceReason: `CapEx not available from APIs or historical data, using ${sector} sector default`,
    sourceData: { sector, defaultValue },
  };
}

/**
 * Infer D&A as percentage of revenue
 */
export function inferDAPercentage(
  historicalRevenue: HistoricalDataPoint[],
  historicalDA: HistoricalDataPoint[],
  capexPercentage: number,
  sector: string
): InferenceResult {
  // Try to calculate from historical data
  if (historicalRevenue.length >= 3 && historicalDA.length >= 3) {
    const percentages: number[] = [];
    
    for (let i = 0; i < Math.min(historicalRevenue.length, historicalDA.length); i++) {
      const rev = historicalRevenue[i];
      const da = historicalDA[i];
      
      if (rev.year === da.year && rev.value > 0) {
        percentages.push(Math.abs(da.value) / rev.value);
      }
    }
    
    if (percentages.length >= 2) {
      const avg = percentages.slice(-3).reduce((sum, p) => sum + p, 0) / Math.min(3, percentages.length);
      
      return {
        value: avg,
        isInferred: true,
        inferenceMethod: '3-year historical average',
        inferenceReason: 'D&A not provided by APIs, calculated from historical data',
        sourceData: { percentages, average: avg },
      };
    }
  }
  
  // D&A typically 100-120% of CapEx
  const estimatedDA = capexPercentage * 1.1;
  
  return {
    value: estimatedDA,
    isInferred: true,
    inferenceMethod: 'capex relationship',
    inferenceReason: 'D&A not available, estimated as 110% of CapEx (typical depreciation schedule)',
    sourceData: { capexPercentage, multiplier: 1.1 },
  };
}

/**
 * Infer Working Capital change as percentage of revenue
 */
export function inferWorkingCapitalPercentage(
  historicalRevenue: HistoricalDataPoint[],
  historicalWC: HistoricalDataPoint[],
  sector: string
): InferenceResult {
  // Try to calculate from historical data
  if (historicalRevenue.length >= 3 && historicalWC.length >= 3) {
    const percentages: number[] = [];
    
    for (let i = 1; i < Math.min(historicalRevenue.length, historicalWC.length); i++) {
      const rev = historicalRevenue[i];
      const revPrev = historicalRevenue[i - 1];
      const wcChange = historicalWC[i].value - historicalWC[i - 1].value;
      const revChange = rev.value - revPrev.value;
      
      if (revChange > 0) {
        percentages.push(wcChange / revChange);
      }
    }
    
    if (percentages.length >= 2) {
      const avg = percentages.slice(-3).reduce((sum, p) => sum + p, 0) / Math.min(3, percentages.length);
      
      return {
        value: Math.abs(avg),
        isInferred: true,
        inferenceMethod: '3-year historical average',
        inferenceReason: 'Working capital change not provided by APIs, calculated from historical data',
        sourceData: { percentages, average: avg },
      };
    }
  }
  
  // Fall back to sector defaults
  const sectorDefaults: Record<string, number> = {
    software: 0.01,
    internet: 0.01,
    fintech: 0.01,
    consumer: 0.03,
    luxury: 0.03,
    industrial: 0.04,
    staples: 0.02,
    telecom: 0.01,
    energy: 0.03,
    financials: 0.00,
  };
  
  const defaultValue = sectorDefaults[sector.toLowerCase()] || 0.02;
  
  return {
    value: defaultValue,
    isInferred: true,
    inferenceMethod: 'sector default',
    inferenceReason: `Working capital change not available, using ${sector} sector default`,
    sourceData: { sector, defaultValue },
  };
}

/**
 * Infer WACC (Weighted Average Cost of Capital)
 */
export function inferWACC(
  sector: string,
  beta?: number,
  debtToEquity?: number
): InferenceResult {
  // Conservative industry-standard WACC by sector
  const sectorWACC: Record<string, number> = {
    software: 0.09,
    internet: 0.10,
    fintech: 0.10,
    consumer: 0.08,
    luxury: 0.08,
    industrial: 0.09,
    staples: 0.07,
    telecom: 0.08,
    energy: 0.10,
    financials: 0.09,
  };
  
  let baseWACC = sectorWACC[sector.toLowerCase()] || 0.10;
  
  // Adjust for beta if available
  if (beta && isFinite(beta)) {
    // Risk-free rate ~4.5%, market risk premium ~6%
    const riskFreeRate = 0.045;
    const marketRiskPremium = 0.06;
    const costOfEquity = riskFreeRate + (beta * marketRiskPremium);
    
    // If we have debt-to-equity, calculate weighted WACC
    if (debtToEquity && isFinite(debtToEquity)) {
      const costOfDebt = 0.05; // Assume 5% cost of debt
      const taxRate = 0.21;
      const equityWeight = 1 / (1 + debtToEquity);
      const debtWeight = debtToEquity / (1 + debtToEquity);
      
      baseWACC = (equityWeight * costOfEquity) + (debtWeight * costOfDebt * (1 - taxRate));
    } else {
      baseWACC = costOfEquity;
    }
  }
  
  return {
    value: baseWACC,
    isInferred: true,
    inferenceMethod: beta ? 'CAPM with sector adjustment' : 'sector default',
    inferenceReason: `WACC not provided by APIs, using ${sector} sector baseline${beta ? ' adjusted for beta' : ''}`,
    sourceData: { sector, beta, debtToEquity, baseWACC },
  };
}

/**
 * Infer Terminal Growth Rate
 */
export function inferTerminalGrowth(
  sector: string,
  historicalGrowth?: number[]
): InferenceResult {
  // Conservative terminal growth (should be <= GDP growth)
  const sectorTerminalGrowth: Record<string, number> = {
    software: 0.03,
    internet: 0.03,
    fintech: 0.025,
    consumer: 0.02,
    luxury: 0.025,
    industrial: 0.02,
    staples: 0.015,
    telecom: 0.015,
    energy: 0.02,
    financials: 0.02,
  };
  
  let terminalGrowth = sectorTerminalGrowth[sector.toLowerCase()] || 0.025;
  
  // If historical growth is available, use 50% of average (conservative)
  if (historicalGrowth && historicalGrowth.length >= 3) {
    const avgHistorical = historicalGrowth.slice(-3).reduce((sum, g) => sum + g, 0) / 3;
    const conservativeGrowth = Math.min(avgHistorical * 0.5, 0.04); // Cap at 4%
    
    if (conservativeGrowth > 0 && conservativeGrowth < terminalGrowth * 2) {
      terminalGrowth = conservativeGrowth;
    }
  }
  
  return {
    value: terminalGrowth,
    isInferred: true,
    inferenceMethod: historicalGrowth ? 'historical growth (50% conservative)' : 'sector default',
    inferenceReason: `Terminal growth not provided, using conservative ${sector} sector rate`,
    sourceData: { sector, historicalGrowth, terminalGrowth },
  };
}

/**
 * Log inferred value
 */
export function logInferredValue(
  fieldName: string,
  result: InferenceResult
): void {
  if (!result.isInferred) {
    return;
  }
  
  console.log(`[INFERENCE] ${fieldName}:`);
  console.log(`  ✓ Value: ${typeof result.value === 'number' && result.value < 1 ? (result.value * 100).toFixed(2) + '%' : result.value}`);
  console.log(`  ✓ Method: ${result.inferenceMethod}`);
  console.log(`  ✓ Reason: ${result.inferenceReason}`);
  if (result.sourceData) {
    console.log(`  ✓ Source Data:`, result.sourceData);
  }
}

/**
 * Create inference summary for reporting
 */
export function createInferenceSummary(
  inferences: Record<string, InferenceResult>
): string[] {
  const summary: string[] = [];
  
  for (const [fieldName, result] of Object.entries(inferences)) {
    if (result.isInferred) {
      const valueStr = typeof result.value === 'number' && result.value < 1 
        ? `${(result.value * 100).toFixed(2)}%` 
        : result.value.toString();
      
      summary.push(
        `⚠️ ${fieldName}: ${valueStr} (${result.inferenceMethod}) - ${result.inferenceReason}`
      );
    }
  }
  
  return summary;
}

