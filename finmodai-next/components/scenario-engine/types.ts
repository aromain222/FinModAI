export type ScenarioName = 'Base' | 'Downside' | 'Upside' | 'Custom';

export type ScenarioDeltas = {
  revenueGrowthDelta: number; // percentage points
  ebitdaMarginDelta: number; // percentage points
  exitMultipleDelta: number; // turns
  interestRateDeltaBps: number; // bps
  leverageDelta: number; // turns
  macroPreset?: 'Recession' | 'Soft Landing' | 'Bull';
};

export type ScenarioSeriesPoint = {
  year: string;
  revenue: number;
  ebitda: number;
  cash: number;
  netDebt: number;
};

export type ScenarioOutputs = {
  name: ScenarioName;
  deltas: ScenarioDeltas;
  revenueCagr: number;
  ebitdaMargin: number;
  exitMultiple: number;
  exitEnterpriseValue: number;
  exitEquityValue: number;
  irr: number;
  moic: number;
  netDebtExit: number;
  cashExit: number;
  minCashBreach: boolean;
  covenantStress: boolean;
  series: ScenarioSeriesPoint[];
};
