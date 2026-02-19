/**
 * Driver Attribution
 * 
 * Decomposes valuation changes into driver contributions
 * Generates waterfall/tornado chart data
 */

import { type BaseAssumptions, calculateSensitivity } from './frameEngine';
import { safeDivide, formatForDisplay } from './dataQuality';

export interface DriverContribution {
  driver: string;
  label: string;
  impact: number; // Absolute $ impact
  impactPercent: number; // % of total valuation change
  direction: 'positive' | 'negative' | 'neutral';
  explanation: string;
}

export interface WaterfallData {
  baseValuation: number;
  scenarioValuation: number;
  totalDelta: number;
  totalDeltaPercent: number;
  drivers: DriverContribution[];
  sortedDrivers: DriverContribution[]; // Sorted by absolute impact
}

/**
 * Calculates waterfall attribution for valuation change
 * 
 * Decomposes the difference between base and scenario valuations
 * into contributions from each assumption change
 */
export function waterfallAttribution(
  baseAssumptions: BaseAssumptions,
  scenarioAssumptions: BaseAssumptions,
  baseValuation: number,
  scenarioValuation: number,
  netDebt: number = 0
): WaterfallData {
  const totalDelta = scenarioValuation - baseValuation;
  const totalDeltaPercent = safeDivide(totalDelta, baseValuation) || 0;
  
  const drivers: DriverContribution[] = [];
  
  // Define key drivers to analyze
  const driverDefinitions: Array<{
    field: keyof BaseAssumptions;
    label: string;
    formatter?: (val: number) => string;
  }> = [
    { field: 'revenueGrowth', label: 'Revenue Growth', formatter: (v) => `${(v * 100).toFixed(1)}%` },
    { field: 'ebitdaMargin', label: 'EBITDA Margin', formatter: (v) => `${(v * 100).toFixed(1)}%` },
    { field: 'capexPct', label: 'CapEx %', formatter: (v) => `${(v * 100).toFixed(1)}%` },
    { field: 'nwcPct', label: 'NWC %', formatter: (v) => `${(v * 100).toFixed(1)}%` },
    { field: 'discountRate', label: 'Discount Rate', formatter: (v) => `${(v * 100).toFixed(1)}%` },
    { field: 'exitMultiple', label: 'Exit Multiple', formatter: (v) => `${v.toFixed(1)}x` },
    { field: 'taxRate', label: 'Tax Rate', formatter: (v) => `${(v * 100).toFixed(1)}%` },
  ];
  
  for (const def of driverDefinitions) {
    const baseValue = baseAssumptions[def.field] as number;
    const scenarioValue = scenarioAssumptions[def.field] as number;
    
    if (baseValue === undefined || scenarioValue === undefined) {
      continue;
    }
    
    // Skip if no change
    if (Math.abs(scenarioValue - baseValue) < 0.0001) {
      continue;
    }
    
    // Calculate isolated impact of this driver change
    const isolatedAssumptions = { ...baseAssumptions };
    (isolatedAssumptions[def.field] as number) = scenarioValue;
    
    // Use sensitivity calculation to estimate impact
    const deltaPercent = safeDivide(scenarioValue - baseValue, baseValue) || 0;
    const sensitivity = calculateSensitivity(baseAssumptions, def.field, deltaPercent, netDebt);
    
    const impact = sensitivity.delta;
    const impactPercent = safeDivide(impact, Math.abs(totalDelta)) || 0;
    
    const direction: 'positive' | 'negative' | 'neutral' = 
      impact > 0.01 ? 'positive' : impact < -0.01 ? 'negative' : 'neutral';
    
    const formatter = def.formatter || ((v) => v.toFixed(2));
    const explanation = `Changed from ${formatter(baseValue)} to ${formatter(scenarioValue)}`;
    
    drivers.push({
      driver: def.field,
      label: def.label,
      impact,
      impactPercent,
      direction,
      explanation,
    });
  }
  
  // Sort by absolute impact (largest first)
  const sortedDrivers = [...drivers].sort((a, b) => 
    Math.abs(b.impact) - Math.abs(a.impact)
  );
  
  return {
    baseValuation,
    scenarioValuation,
    totalDelta,
    totalDeltaPercent,
    drivers,
    sortedDrivers,
  };
}

/**
 * Ranks drivers by impact magnitude
 */
export function rankDrivers(attribution: WaterfallData): DriverContribution[] {
  return attribution.sortedDrivers;
}

/**
 * Explains the delta for a specific driver in natural language
 */
export function explainDelta(driver: DriverContribution): string {
  const impactStr = formatImpact(driver.impact);
  const directionStr = driver.direction === 'positive' ? 'increased' : 'decreased';
  const percentStr = `${Math.abs(driver.impactPercent * 100).toFixed(1)}%`;
  
  return `${driver.label} ${directionStr} valuation by ${impactStr} (${percentStr} of total change). ${driver.explanation}`;
}

/**
 * Formats impact value for display
 */
function formatImpact(impact: number): string {
  const absImpact = Math.abs(impact);
  
  if (absImpact >= 1e9) {
    return `$${(absImpact / 1e9).toFixed(2)}B`;
  } else if (absImpact >= 1e6) {
    return `$${(absImpact / 1e6).toFixed(1)}M`;
  } else if (absImpact >= 1e3) {
    return `$${(absImpact / 1e3).toFixed(0)}K`;
  } else {
    return `$${absImpact.toFixed(0)}`;
  }
}

/**
 * Generates tornado chart data (sensitivity analysis)
 * Shows impact of +/- X% change in each driver
 */
export function generateTornadoData(
  baseAssumptions: BaseAssumptions,
  baseValuation: number,
  sensitivityPercent: number = 0.10, // +/- 10%
  netDebt: number = 0
): Array<{
  driver: string;
  label: string;
  lowValue: number;
  baseValue: number;
  highValue: number;
  range: number;
  lowLabel: string;
  highLabel: string;
}> {
  const drivers: Array<keyof BaseAssumptions> = [
    'revenueGrowth',
    'ebitdaMargin',
    'exitMultiple',
    'discountRate',
    'capexPct',
    'nwcPct',
  ];
  
  const tornadoData = drivers.map(driver => {
    const currentValue = baseAssumptions[driver] as number;
    
    if (currentValue === undefined) {
      return null;
    }
    
    // Calculate low and high scenarios
    const lowSensitivity = calculateSensitivity(baseAssumptions, driver, -sensitivityPercent, netDebt);
    const highSensitivity = calculateSensitivity(baseAssumptions, driver, sensitivityPercent, netDebt);
    
    const range = highSensitivity.adjustedValue - lowSensitivity.adjustedValue;
    
    // Format labels
    const lowValue = currentValue * (1 - sensitivityPercent);
    const highValue = currentValue * (1 + sensitivityPercent);
    
    const formatter = getDriverFormatter(driver);
    
    return {
      driver,
      label: getDriverLabel(driver),
      lowValue: lowSensitivity.adjustedValue,
      baseValue: baseValuation,
      highValue: highSensitivity.adjustedValue,
      range,
      lowLabel: formatter(lowValue),
      highLabel: formatter(highValue),
    };
  }).filter(Boolean) as Array<{
    driver: string;
    label: string;
    lowValue: number;
    baseValue: number;
    highValue: number;
    range: number;
    lowLabel: string;
    highLabel: string;
  }>;
  
  // Sort by range (most sensitive first)
  return tornadoData.sort((a, b) => Math.abs(b.range) - Math.abs(a.range));
}

/**
 * Gets human-readable label for a driver
 */
function getDriverLabel(driver: string): string {
  const labels: Record<string, string> = {
    revenueGrowth: 'Revenue Growth',
    ebitdaMargin: 'EBITDA Margin',
    exitMultiple: 'Exit Multiple',
    discountRate: 'Discount Rate',
    capexPct: 'CapEx %',
    nwcPct: 'NWC %',
    taxRate: 'Tax Rate',
  };
  
  return labels[driver] || driver;
}

/**
 * Gets formatter function for a driver
 */
function getDriverFormatter(driver: string): (val: number) => string {
  const formatters: Record<string, (val: number) => string> = {
    revenueGrowth: (v) => `${(v * 100).toFixed(1)}%`,
    ebitdaMargin: (v) => `${(v * 100).toFixed(1)}%`,
    exitMultiple: (v) => `${v.toFixed(1)}x`,
    discountRate: (v) => `${(v * 100).toFixed(1)}%`,
    capexPct: (v) => `${(v * 100).toFixed(1)}%`,
    nwcPct: (v) => `${(v * 100).toFixed(1)}%`,
    taxRate: (v) => `${(v * 100).toFixed(1)}%`,
  };
  
  return formatters[driver] || ((v) => v.toFixed(2));
}
