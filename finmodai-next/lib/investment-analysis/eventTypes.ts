export type InvestmentEventCategory =
  | 'management_transition'
  | 'geopolitical_conflict'
  | 'macro_slowdown'
  | 'regulatory_shift'
  | 'major_contract_win'
  | 'product_catalyst'
  | 'unknown';

export type InvestmentEventConfidence = 'low' | 'medium' | 'high';

export type InvestmentEventClassificationInput = {
  rawEventText: string;
  companyName?: string | null;
  sector?: string | null;
};

export type InvestmentEventTaxonomyEntry = {
  id: InvestmentEventCategory;
  label: string;
  description: string;
  caveats?: string[];
};

export type InvestmentEventClassificationResult = {
  category: InvestmentEventCategory;
  confidence: InvestmentEventConfidence;
  score: number;
  normalizedEventSummary: string;
  rationale: string;
  matchedSignals: string[];
};

export type InvestmentEventAssumptionLever =
  | 'revenueGrowthByYear'
  | 'operatingMarginByYear'
  | 'wacc'
  | 'terminalGrowthRate';

export type InvestmentEventDeltaDirection = 'up' | 'down' | 'flat' | 'mixed';

export type InvestmentEventDeltaUnit = 'bps' | 'pct_points';

export type InvestmentScenarioBias = 'bullish' | 'base' | 'bearish' | 'mixed' | 'neutral';

export type InvestmentEventAssumptionDelta = {
  lever: InvestmentEventAssumptionLever;
  direction: InvestmentEventDeltaDirection;
  unit: InvestmentEventDeltaUnit;
  amount: number | number[];
  rationale: string;
  confidence: InvestmentEventConfidence;
};

export type InvestmentEventAssumptionDeltaInput = {
  baseAssumptions: {
    revenueGrowthByYear: number[];
    operatingMarginByYear: number[];
    wacc: number;
    terminalGrowthRate: number;
  };
  event: InvestmentEventClassificationResult;
  company?: {
    companyName?: string | null;
    sector?: string | null;
    industry?: string | null;
  };
};

export type InvestmentEventAssumptionDeltaResult = {
  eventCategory: InvestmentEventCategory;
  confidence: InvestmentEventConfidence;
  normalizedEventSummary: string;
  scenarioBias: InvestmentScenarioBias;
  deltas: InvestmentEventAssumptionDelta[];
  adjustedAssumptions: {
    revenueGrowthByYear: number[];
    operatingMarginByYear: number[];
    wacc: number;
    terminalGrowthRate: number;
  };
  rationaleSummary: string;
};

export type InvestmentEventAppliedField =
  | 'revenueGrowthByYear'
  | 'operatingMarginByYear'
  | 'wacc'
  | 'terminalGrowthRate';

export type InvestmentEventAppliedAssumptionChange = {
  field: InvestmentEventAppliedField;
  label: string;
  unit: 'percent' | 'bps';
  originalValue: number | number[];
  deltaValue: number | number[];
  updatedValue: number | number[];
  rationale: string;
  confidence: InvestmentEventConfidence;
  display: {
    original: string;
    delta: string;
    updated: string;
  };
};

export type InvestmentEventAssumptionValidationIssue = {
  field: InvestmentEventAppliedField;
  severity: 'warning' | 'error';
  message: string;
};

export type InvestmentEventAssumptionApplicationResult = {
  scenarioBias: InvestmentScenarioBias;
  baseAssumptions: {
    revenueGrowthByYear: number[];
    operatingMarginByYear: number[];
    wacc: number;
    terminalGrowthRate: number;
  };
  adjustedAssumptions: {
    revenueGrowthByYear: number[];
    operatingMarginByYear: number[];
    wacc: number;
    terminalGrowthRate: number;
  };
  changes: InvestmentEventAppliedAssumptionChange[];
  validationIssues: InvestmentEventAssumptionValidationIssue[];
  summary: string;
  hasMaterialChanges: boolean;
};

export const INVESTMENT_EVENT_TAXONOMY_V1: Record<
  Exclude<InvestmentEventCategory, 'unknown'>,
  InvestmentEventTaxonomyEntry
> = {
  management_transition: {
    id: 'management_transition',
    label: 'CEO Departure / Management Transition',
    description: 'Leadership change that may alter execution confidence, strategic continuity, or valuation support.',
    caveats: ['Magnitude depends on founder dependence, succession quality, and company maturity.'],
  },
  geopolitical_conflict: {
    id: 'geopolitical_conflict',
    label: 'War / Geopolitical Conflict',
    description: 'War, sanctions, or geopolitical escalation with multi-sector demand, cost, or risk-premium effects.',
    caveats: ['Direction is sector-sensitive. Defense can benefit while other sectors can see margin or demand pressure.'],
  },
  macro_slowdown: {
    id: 'macro_slowdown',
    label: 'Recession / Macro Slowdown',
    description: 'Demand pressure from weaker economic activity, enterprise caution, or consumer pullback.',
    caveats: ['Countercyclical or defensive businesses may not fit the default mapping.'],
  },
  regulatory_shift: {
    id: 'regulatory_shift',
    label: 'Regulation Shift',
    description: 'A policy, compliance, export-control, or legal rule change affecting growth, margins, or risk premium.',
    caveats: ['Some regulation is protective rather than punitive, so direction can be mixed.'],
  },
  major_contract_win: {
    id: 'major_contract_win',
    label: 'Major Contract Win',
    description: 'A large customer, enterprise, or government award that can move backlog, revenue visibility, or mix.',
    caveats: ['Only high-signal if the contract is material relative to the revenue base.'],
  },
  product_catalyst: {
    id: 'product_catalyst',
    label: 'Product Catalyst',
    description: 'A launch, approval, cycle, or commercialization milestone that can accelerate demand or improve mix.',
    caveats: ['Often easier to identify than to size; timing and ramp matter.'],
  },
};
