/**
 * Explanation Engine
 * 
 * Generates natural language explanations for scenario outcomes
 * Tone: Precise, honest, judgment-focused (not promotional)
 */
import { type BaseAssumptions, type ScenarioAssumptions, type ValuationResult } from './frameEngine';
import { type WaterfallData, type DriverContribution } from './attribution';
import { type ScenarioFrame } from './scenarioFrames';
import { safeDivide } from './dataQuality';
import { generateTextWithProviderFallback } from '@/lib/llm/generateText';

/**
 * Explains valuation change between base and scenario
 */
export function explainValuationChange(
  baseValuation: ValuationResult,
  scenarioValuation: ValuationResult,
  attribution: WaterfallData,
  frame: ScenarioFrame
): string {
  const deltaAbs = scenarioValuation.enterpriseValue - baseValuation.enterpriseValue;
  const deltaPercent = safeDivide(deltaAbs, baseValuation.enterpriseValue) || 0;
  
  const direction = deltaAbs > 0 ? 'increased' : 'decreased';
  const deltaStr = formatCurrency(Math.abs(deltaAbs));
  const percentStr = `${Math.abs(deltaPercent * 100).toFixed(1)}%`;
  
  // Get top 3 drivers
  const topDrivers = attribution.sortedDrivers.slice(0, 3);
  const driverSummary = topDrivers
    .map(d => `${d.label} (${formatCurrency(Math.abs(d.impact))})`)
    .join(', ');
  
  return `Under the ${frame.name} scenario, enterprise value ${direction} by ${deltaStr} (${percentStr}) to ${formatCurrency(scenarioValuation.enterpriseValue)}. This change is primarily driven by ${driverSummary}. ${frame.narrative}`;
}

/**
 * Explains risk framing for a scenario
 */
export function explainRiskFraming(frame: ScenarioFrame): string {
  const risks = frame.riskFraming.map((risk, i) => `${i + 1}. ${risk}`).join('\n');
  
  return `Key considerations for the ${frame.name} scenario:\n\n${risks}`;
}

/**
 * Explains a specific assumption change
 */
export function explainAssumptionChange(
  field: string,
  baseValue: number,
  scenarioValue: number,
  label?: string
): string {
  const fieldLabel = label || formatFieldName(field);
  const delta = scenarioValue - baseValue;
  const deltaPercent = safeDivide(delta, baseValue) || 0;
  
  const direction = delta > 0 ? 'increased' : 'decreased';
  const changeStr = formatAssumptionValue(field, Math.abs(delta));
  const percentStr = `${Math.abs(deltaPercent * 100).toFixed(1)}%`;
  
  const baseStr = formatAssumptionValue(field, baseValue);
  const scenarioStr = formatAssumptionValue(field, scenarioValue);
  
  return `${fieldLabel} ${direction} by ${changeStr} (${percentStr}), from ${baseStr} to ${scenarioStr}.`;
}

/**
 * Generates a comprehensive scenario summary
 */
export function generateScenarioSummary(
  baseAssumptions: BaseAssumptions,
  scenarioAssumptions: ScenarioAssumptions,
  baseValuation: ValuationResult,
  scenarioValuation: ValuationResult,
  attribution: WaterfallData,
  frame: ScenarioFrame
): {
  headline: string;
  valuationSummary: string;
  driverBreakdown: string;
  riskFraming: string;
  assumptions: string;
} {
  // Headline
  const deltaPercent = safeDivide(
    scenarioValuation.enterpriseValue - baseValuation.enterpriseValue,
    baseValuation.enterpriseValue
  ) || 0;
  const direction = deltaPercent > 0 ? 'Upside' : 'Downside';
  const headline = `${frame.name}: ${Math.abs(deltaPercent * 100).toFixed(1)}% ${direction}`;
  
  // Valuation summary
  const valuationSummary = explainValuationChange(
    baseValuation,
    scenarioValuation,
    attribution,
    frame
  );
  
  // Driver breakdown
  const driverLines = attribution.sortedDrivers.slice(0, 5).map(driver => {
    const impactStr = formatCurrency(Math.abs(driver.impact));
    const percentStr = `${Math.abs(driver.impactPercent * 100).toFixed(1)}%`;
    const sign = driver.impact > 0 ? '+' : '-';
    return `• ${driver.label}: ${sign}${impactStr} (${percentStr} of change) — ${driver.explanation}`;
  });
  const driverBreakdown = `**Driver Attribution:**\n\n${driverLines.join('\n')}`;
  
  // Risk framing
  const riskFraming = explainRiskFraming(frame);
  
  // Key assumptions
  const assumptionChanges: string[] = [];
  const fields: Array<keyof BaseAssumptions> = [
    'revenueGrowth',
    'ebitdaMargin',
    'exitMultiple',
    'discountRate',
    'capexPct',
  ];
  
  for (const field of fields) {
    const baseValue = baseAssumptions[field] as number;
    const scenarioValue = scenarioAssumptions[field] as number;
    
    if (baseValue !== undefined && scenarioValue !== undefined && Math.abs(scenarioValue - baseValue) > 0.0001) {
      assumptionChanges.push(explainAssumptionChange(field, baseValue, scenarioValue));
    }
  }
  
  const assumptions = assumptionChanges.length > 0
    ? `**Key Assumption Changes:**\n\n${assumptionChanges.map(a => `• ${a}`).join('\n')}`
    : 'No significant assumption changes.';
  
  return {
    headline,
    valuationSummary,
    driverBreakdown,
    riskFraming,
    assumptions,
  };
}

/**
 * Explains cash flow trajectory
 */
export function explainCashFlowTrajectory(
  projections: ValuationResult['projections']
): string {
  if (projections.length === 0) {
    return 'No projection data available.';
  }
  
  const firstYear = projections[0];
  const lastYear = projections[projections.length - 1];
  
  const revenueCagr = Math.pow(lastYear.revenue / firstYear.revenue, 1 / projections.length) - 1;
  const fcfCagr = Math.pow(
    Math.abs(lastYear.freeCashFlow) / Math.abs(firstYear.freeCashFlow),
    1 / projections.length
  ) - 1;
  
  const revenueGrowthStr = `${(revenueCagr * 100).toFixed(1)}%`;
  const fcfGrowthStr = `${(fcfCagr * 100).toFixed(1)}%`;
  
  const firstYearFcf = formatCurrency(firstYear.freeCashFlow);
  const lastYearFcf = formatCurrency(lastYear.freeCashFlow);
  
  return `Revenue grows at a ${revenueGrowthStr} CAGR over the projection period. Free cash flow expands from ${firstYearFcf} in Year 1 to ${lastYearFcf} in Year ${projections.length}, representing a ${fcfGrowthStr} CAGR.`;
}

/**
 * Explains terminal value assumptions
 */
export function explainTerminalValue(
  valuation: ValuationResult,
  exitMultiple: number
): string {
  const terminalValueStr = formatCurrency(valuation.terminalValue);
  const pvTerminalStr = formatCurrency(valuation.pvOfTerminalValue);
  const percentOfEV = safeDivide(valuation.pvOfTerminalValue, valuation.enterpriseValue) || 0;
  const percentStr = `${(percentOfEV * 100).toFixed(0)}%`;
  
  return `Terminal value of ${terminalValueStr} (${exitMultiple.toFixed(1)}x exit multiple) contributes ${pvTerminalStr} in present value, representing ${percentStr} of total enterprise value.`;
}

/**
 * Formats currency values
 */
function formatCurrency(value: number): string {
  const absValue = Math.abs(value);
  
  if (absValue >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  } else if (absValue >= 1e6) {
    return `$${(value / 1e6).toFixed(1)}M`;
  } else if (absValue >= 1e3) {
    return `$${(value / 1e3).toFixed(0)}K`;
  } else {
    return `$${value.toFixed(0)}`;
  }
}

/**
 * Formats assumption values based on field type
 */
function formatAssumptionValue(field: string, value: number): string {
  const percentFields = [
    'revenueGrowth',
    'ebitdaMargin',
    'taxRate',
    'capexPct',
    'nwcPct',
    'discountRate',
    'terminalGrowth',
  ];
  
  if (percentFields.includes(field)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  
  if (field === 'exitMultiple') {
    return `${value.toFixed(1)}x`;
  }
  
  if (field === 'revenue') {
    return formatCurrency(value);
  }
  
  return value.toFixed(2);
}

/**
 * Formats field names for display
 */
function formatFieldName(field: string): string {
  const names: Record<string, string> = {
    revenueGrowth: 'Revenue Growth',
    ebitdaMargin: 'EBITDA Margin',
    taxRate: 'Tax Rate',
    capexPct: 'CapEx % of Revenue',
    nwcPct: 'NWC % of Revenue',
    discountRate: 'Discount Rate (WACC)',
    exitMultiple: 'Exit Multiple',
    terminalGrowth: 'Terminal Growth Rate',
    revenue: 'Revenue',
  };
  
  return names[field] || field;
}

/**
 * Generates a one-line summary for quick display
 */
export function generateQuickSummary(
  scenarioName: string,
  baseEV: number,
  scenarioEV: number
): string {
  const delta = scenarioEV - baseEV;
  const deltaPercent = safeDivide(delta, baseEV) || 0;
  const sign = delta > 0 ? '+' : '';
  
  return `${scenarioName}: ${formatCurrency(scenarioEV)} (${sign}${(deltaPercent * 100).toFixed(1)}%)`;
}

/**
 * Generates AI-powered scenario explanation using OpenAI
 * Used as fallback when data quality is low or for richer insights
 */
export async function generateAIScenarioExplanation(
  ticker: string,
  baseValuation: ValuationResult,
  scenarioValuation: ValuationResult,
  scenarioName: string,
  scenarioDescription: string,
  assumptionDeltas: Array<{ field: string; baseValue: number; scenarioValue: number }>,
  dataQuality: 'high' | 'medium' | 'low'
): Promise<{
  aiSummary: string;
  confidence: 'high' | 'medium' | 'low';
  error?: string;
}> {
  try {
    const delta = scenarioValuation.enterpriseValue - baseValuation.enterpriseValue;
    const deltaPercent = safeDivide(delta, baseValuation.enterpriseValue) || 0;
    
    // Build assumption changes summary
    const assumptionSummary = assumptionDeltas
      .map(d => {
        const fieldLabel = formatFieldName(d.field);
        const baseStr = formatAssumptionValue(d.field, d.baseValue);
        const scenarioStr = formatAssumptionValue(d.field, d.scenarioValue);
        return `- ${fieldLabel}: ${baseStr} → ${scenarioStr}`;
      })
      .join('\n');
    
    const prompt = `You are a financial analyst. Explain the scenario analysis below for ${ticker} in plain English.

**Scenario:** ${scenarioName}
**Description:** ${scenarioDescription}

**Valuation Results:**
- Base Case Enterprise Value: ${formatCurrency(baseValuation.enterpriseValue)}
- ${scenarioName} Enterprise Value: ${formatCurrency(scenarioValuation.enterpriseValue)}
- Change: ${delta > 0 ? '+' : ''}${formatCurrency(delta)} (${(deltaPercent * 100).toFixed(1)}%)

**Key Assumption Changes:**
${assumptionSummary}

**Data Quality:** ${dataQuality}

Write the response using this exact structure:
Summary:
- 2-4 short bullets, plain language, no jargon.

Key Drivers:
- 3-5 bullets on what moved valuation and why.

What To Watch Next:
- 2-4 bullets with practical monitoring signals and invalidation conditions.

Rules:
- Keep sentences short and concrete.
- Avoid dense paragraph blocks.
- Use the numeric inputs above directly.
- ${dataQuality === 'low' ? 'State clearly that outputs are directional because data quality is low.' : 'Briefly mention key model limits without overstating certainty.'}`;

    const response = await generateTextWithProviderFallback({
      clientType: 'user',
      preferredProvider: 'anthropic',
      temperature: 0.7,
      maxTokens: 500,
      messages: [
        {
          role: 'system',
          content:
            'You are a professional financial analyst. Use direct, plain language, short bullets, and clear reasoning. Avoid jargon-heavy writing.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const aiSummary = response?.text || '';
    if (!aiSummary) {
      throw new Error('LLM explanation failed across all provider candidates');
    }
    
    // Determine confidence based on data quality and response quality
    let confidence: 'high' | 'medium' | 'low' = 'medium';
    if (dataQuality === 'high' && aiSummary.length > 200) {
      confidence = 'high';
    } else if (dataQuality === 'low' || aiSummary.length < 100) {
      confidence = 'low';
    }
    
    return {
      aiSummary,
      confidence,
    };
  } catch (error: any) {
    console.error('[explanationEngine] AI explanation failed:', error);
    return {
      aiSummary: '',
      confidence: 'low',
      error: error.message || 'Failed to generate AI explanation',
    };
  }
}
