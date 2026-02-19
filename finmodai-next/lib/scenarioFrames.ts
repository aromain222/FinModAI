/**
 * Scenario Frame Definitions
 * 
 * Defines 6 canonical scenario frames with automatic assumption deltas
 * Each frame represents a coherent market/business condition
 */

export type ScenarioFrameType = 
  | 'base'
  | 'upside_execution'
  | 'demand_compression'
  | 'margin_pressure'
  | 'multiple_compression'
  | 'macro_shock';

export interface AssumptionDelta {
  field: string;
  label: string;
  baseValue?: number;
  deltaType: 'absolute' | 'relative' | 'bps';
  deltaValue: number;
  explanation: string;
}

export interface ScenarioFrame {
  id: ScenarioFrameType;
  name: string;
  description: string;
  narrative: string;
  riskFraming: string[];
  assumptionDeltas: AssumptionDelta[];
  color: string; // For UI visualization
}

/**
 * Base Case - Consensus/historical continuation
 */
export const BASE_CASE: ScenarioFrame = {
  id: 'base',
  name: 'Base Case',
  description: 'Consensus expectations with historical continuation',
  narrative: 'Company continues on current trajectory with market-implied growth and margins. Reflects consensus analyst expectations and recent historical performance.',
  riskFraming: [
    'Assumes stable competitive environment',
    'No major macro disruptions',
    'Historical margins hold',
  ],
  assumptionDeltas: [], // Base has no deltas
  color: '#3b82f6', // blue
};

/**
 * Upside Execution - Strong growth and margin expansion
 */
export const UPSIDE_EXECUTION: ScenarioFrame = {
  id: 'upside_execution',
  name: 'Upside Execution',
  description: 'Strong execution with market share gains and operational leverage',
  narrative: 'Company captures market share through product innovation or competitive wins. Operating leverage drives margin expansion as revenue scales.',
  riskFraming: [
    'Requires sustained competitive advantage',
    'Margin expansion may attract competition',
    'Growth investments may pressure near-term profitability',
  ],
  assumptionDeltas: [
    {
      field: 'revenueGrowth',
      label: 'Revenue Growth',
      deltaType: 'relative',
      deltaValue: 0.20, // +20% relative increase (e.g., 10% → 12%)
      explanation: 'Market share gains and product momentum drive 15-25% higher growth',
    },
    {
      field: 'ebitdaMargin',
      label: 'EBITDA Margin',
      deltaType: 'bps',
      deltaValue: 300, // +300 basis points
      explanation: 'Operating leverage and efficiency gains expand margins by 200-400bps',
    },
    {
      field: 'capexPct',
      label: 'CapEx % of Revenue',
      deltaType: 'bps',
      deltaValue: -50, // -50 basis points
      explanation: 'Improved asset efficiency reduces reinvestment needs',
    },
  ],
  color: '#10b981', // green
};

/**
 * Demand Compression - Revenue pressure from market softness
 */
export const DEMAND_COMPRESSION: ScenarioFrame = {
  id: 'demand_compression',
  name: 'Demand Compression',
  description: 'Market softness reduces volumes and pricing power',
  narrative: 'Weakening demand environment pressures volumes and pricing. Company maintains margins through cost discipline but cannot fully offset revenue headwinds.',
  riskFraming: [
    'Market share losses may be permanent',
    'Price cuts are difficult to reverse',
    'Fixed cost deleverage if volumes fall sharply',
  ],
  assumptionDeltas: [
    {
      field: 'revenueGrowth',
      label: 'Revenue Growth',
      deltaType: 'relative',
      deltaValue: -0.15, // -15% relative decrease
      explanation: 'Volume pressure and pricing headwinds reduce growth by 10-20%',
    },
    {
      field: 'ebitdaMargin',
      label: 'EBITDA Margin',
      deltaType: 'bps',
      deltaValue: -100, // -100 basis points
      explanation: 'Some fixed cost deleverage, partially offset by cost actions',
    },
    {
      field: 'workingCapitalPct',
      label: 'Working Capital % of Revenue',
      deltaType: 'bps',
      deltaValue: 100, // +100 basis points
      explanation: 'Inventory builds and slower collections in weak demand',
    },
  ],
  color: '#f59e0b', // amber
};

/**
 * Margin Pressure - Cost inflation and competitive pricing
 */
export const MARGIN_PRESSURE: ScenarioFrame = {
  id: 'margin_pressure',
  name: 'Margin Pressure',
  description: 'Cost inflation and competitive dynamics compress margins',
  narrative: 'Rising input costs (labor, materials, energy) cannot be fully passed through to customers due to competitive pressure. Margins compress despite stable volumes.',
  riskFraming: [
    'Margin recovery requires pricing power or cost restructuring',
    'Sustained inflation may force strategic changes',
    'Competitors may be better positioned',
  ],
  assumptionDeltas: [
    {
      field: 'revenueGrowth',
      label: 'Revenue Growth',
      deltaType: 'relative',
      deltaValue: -0.05, // -5% relative decrease
      explanation: 'Modest volume impact from pricing constraints',
    },
    {
      field: 'cogsMargin',
      label: 'COGS % of Revenue',
      deltaType: 'bps',
      deltaValue: 200, // +200 basis points (higher costs)
      explanation: 'Input cost inflation increases COGS by 10-15%',
    },
    {
      field: 'ebitdaMargin',
      label: 'EBITDA Margin',
      deltaType: 'bps',
      deltaValue: -400, // -400 basis points
      explanation: 'Cost inflation and limited pricing power compress margins by 300-500bps',
    },
  ],
  color: '#ef4444', // red
};

/**
 * Multiple Compression - Market re-rating without fundamental change
 */
export const MULTIPLE_COMPRESSION: ScenarioFrame = {
  id: 'multiple_compression',
  name: 'Multiple Compression',
  description: 'Market re-rates valuation multiples lower',
  narrative: 'Market sentiment shifts or sector rotation drives lower valuation multiples, even as fundamentals remain stable. Exit multiples compress due to risk-off sentiment or sector-specific concerns.',
  riskFraming: [
    'Multiple compression can persist for extended periods',
    'May signal market concerns about long-term growth',
    'Sector rotation or macro factors',
  ],
  assumptionDeltas: [
    {
      field: 'exitMultiple',
      label: 'Exit EV/EBITDA Multiple',
      deltaType: 'relative',
      deltaValue: -0.25, // -25% relative decrease (e.g., 12x → 9x)
      explanation: 'Market re-rating or sector rotation compresses multiples by 20-30%',
    },
    {
      field: 'discountRate',
      label: 'Discount Rate (WACC)',
      deltaType: 'bps',
      deltaValue: 150, // +150 basis points
      explanation: 'Higher perceived risk increases required returns',
    },
  ],
  color: '#8b5cf6', // purple
};

/**
 * Macro Shock - Severe economic downturn
 */
export const MACRO_SHOCK: ScenarioFrame = {
  id: 'macro_shock',
  name: 'Macro Shock',
  description: 'Severe economic downturn impacts all dimensions',
  narrative: 'Recession or major economic disruption drives sharp demand contraction, margin pressure from deleverage, and multiple compression from risk-off sentiment. All key assumptions move adversely.',
  riskFraming: [
    'Recovery timeline highly uncertain',
    'May require balance sheet restructuring',
    'Permanent market share losses possible',
    'Survival becomes key consideration',
  ],
  assumptionDeltas: [
    {
      field: 'revenueGrowth',
      label: 'Revenue Growth',
      deltaType: 'relative',
      deltaValue: -0.20, // -20% relative decrease
      explanation: 'Severe demand contraction reduces growth by 15-25%',
    },
    {
      field: 'ebitdaMargin',
      label: 'EBITDA Margin',
      deltaType: 'bps',
      deltaValue: -400, // -400 basis points
      explanation: 'Fixed cost deleverage and pricing pressure compress margins',
    },
    {
      field: 'exitMultiple',
      label: 'Exit EV/EBITDA Multiple',
      deltaType: 'relative',
      deltaValue: -0.30, // -30% relative decrease
      explanation: 'Risk-off sentiment and uncertainty drive multiple compression',
    },
    {
      field: 'discountRate',
      label: 'Discount Rate (WACC)',
      deltaType: 'bps',
      deltaValue: 200, // +200 basis points
      explanation: 'Elevated risk premium in distressed environment',
    },
    {
      field: 'workingCapitalPct',
      label: 'Working Capital % of Revenue',
      deltaType: 'bps',
      deltaValue: 150, // +150 basis points
      explanation: 'Cash collection slows and inventory management deteriorates',
    },
  ],
  color: '#dc2626', // dark red
};

/**
 * All scenario frames
 */
export const SCENARIO_FRAMES: ScenarioFrame[] = [
  BASE_CASE,
  UPSIDE_EXECUTION,
  DEMAND_COMPRESSION,
  MARGIN_PRESSURE,
  MULTIPLE_COMPRESSION,
  MACRO_SHOCK,
];

/**
 * Get a scenario frame by ID
 */
export function getScenarioFrame(id: ScenarioFrameType): ScenarioFrame | undefined {
  return SCENARIO_FRAMES.find(frame => frame.id === id);
}

/**
 * Get scenario frame names for UI dropdowns
 */
export function getScenarioFrameOptions(): Array<{ value: ScenarioFrameType; label: string }> {
  return SCENARIO_FRAMES.map(frame => ({
    value: frame.id,
    label: frame.name,
  }));
}
