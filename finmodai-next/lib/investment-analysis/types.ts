export type InvestmentScenarioKey = 'base' | 'bull' | 'bear' | 'custom';

export type InvestmentCompanyMetadata = {
  ticker: string;
  companyName: string;
  sector?: string | null;
  industry?: string | null;
  currency?: string;
  asOfDate?: string | null;
};

export type InvestmentChartFormat = 'currency' | 'percent' | 'number';

export type InvestmentChartPoint = {
  x: string | number;
  [key: string]: string | number | null;
};

export type InvestmentChartSeries = {
  key: string;
  label: string;
  color: string;
  format: InvestmentChartFormat;
  axis?: 'left' | 'right';
};

export type InvestmentChartDefinition = {
  kind: 'line' | 'bar';
  title: string;
  subtitle?: string;
  data: InvestmentChartPoint[];
  series: InvestmentChartSeries[];
};

export type InvestmentValuationMetric =
  | 'enterpriseValue'
  | 'equityValue'
  | 'impliedPerShareValue';

export type InvestmentSensitivityCell = {
  rowValue: number;
  columnValue: number;
  enterpriseValue: number;
  equityValue: number;
  impliedPerShareValue: number | null;
};

export type InvestmentSensitivityTable = {
  title: string;
  subtitle?: string;
  rowLabel: string;
  columnLabel: string;
  rowValues: number[];
  columnValues: number[];
  metric: InvestmentValuationMetric;
  format: InvestmentChartFormat;
  cells: InvestmentSensitivityCell[][];
};

export type DeterministicValuationAssumptions = {
  baseRevenue: number;
  revenueGrowthByYear: number[];
  operatingMarginByYear: number[];
  taxRate: number;
  capexPctRevenue: number;
  nwcChangePctRevenue: number;
  wacc: number;
  terminalGrowthRate: number;
  shareCount?: number | null;
  netDebt?: number | null;
};

export type DeterministicForecastRow = {
  year: number;
  revenue: number;
  operatingMargin: number;
  ebit: number;
  taxes: number;
  nopat: number;
  capex: number;
  workingCapitalChange: number;
  unleveredFreeCashFlow: number;
  discountFactor: number;
  presentValueOfFcff: number;
};

export type DeterministicValuationSummary = {
  presentValueOfForecastCashFlows: number;
  terminalValue: number;
  presentValueOfTerminalValue: number;
  enterpriseValue: number;
  equityValue: number;
  impliedPerShareValue: number | null;
};

export type DeterministicFinanceWarnings = {
  warnings: string[];
  assumptionsAdjusted: string[];
};

export type DeterministicValuationResult = DeterministicFinanceWarnings & {
  company?: InvestmentCompanyMetadata;
  scenario: {
    key: InvestmentScenarioKey;
    label: string;
  };
  assumptions: DeterministicValuationAssumptions;
  forecast: DeterministicForecastRow[];
  valuation: DeterministicValuationSummary;
  charts: {
    operatingForecast: InvestmentChartDefinition;
    valuationBridge: InvestmentChartDefinition;
  };
};

export type ScenarioHelperOverrides = Partial<DeterministicValuationAssumptions>;

export type DeterministicScenarioSet = {
  base: DeterministicValuationResult;
  bull: DeterministicValuationResult;
  bear: DeterministicValuationResult;
};

export type InvestmentMemoSections = {
  summary: string;
  whyItMatters: string;
  analysis: string;
  updatedAt?: string | null;
};

export type InvestmentAnalysisScenarioDocument = {
  key: InvestmentScenarioKey;
  label: string;
  assumptions: DeterministicValuationAssumptions;
  result: DeterministicValuationResult;
  dirty?: boolean;
};

export type InvestmentAnalysisDocument = {
  modelType: 'DCF';
  company: InvestmentCompanyMetadata;
  activeScenario: InvestmentScenarioKey;
  scenarios: Record<InvestmentScenarioKey, InvestmentAnalysisScenarioDocument>;
  memo: InvestmentMemoSections;
  generatedAt: string;
};

export type InvestmentChartDocument = Pick<InvestmentAnalysisDocument, 'activeScenario' | 'scenarios'>;

export type InvestmentAssumptionPatch = Partial<DeterministicValuationAssumptions>;

export type InvestmentSavedScenarioCharts = {
  revenueForecast: InvestmentChartDefinition;
  freeCashFlowForecast: InvestmentChartDefinition;
  sensitivity: InvestmentSensitivityTable;
};

export type SaveInvestmentScenarioInput = {
  companyId?: string | null;
  company: InvestmentCompanyMetadata;
  scenarioName: string;
  scenarioKey: InvestmentScenarioKey;
  modelType?: 'DCF';
  assumptions: DeterministicValuationAssumptions;
  valuation: DeterministicValuationSummary;
  chartPayload: InvestmentSavedScenarioCharts;
};

export type InvestmentSavedScenarioRecord = {
  id: string;
  userId: string;
  companyId?: string | null;
  companyTicker: string;
  companyName: string;
  modelType: 'DCF';
  scenarioName: string;
  scenarioKey: InvestmentScenarioKey;
  assumptions: DeterministicValuationAssumptions;
  valuation: DeterministicValuationSummary;
  chartPayload: InvestmentSavedScenarioCharts;
  createdAt: string;
  updatedAt: string;
};

export type InvestmentSavedScenarioListItem = Pick<
  InvestmentSavedScenarioRecord,
  | 'id'
  | 'companyId'
  | 'companyTicker'
  | 'companyName'
  | 'modelType'
  | 'scenarioName'
  | 'scenarioKey'
  | 'valuation'
  | 'createdAt'
  | 'updatedAt'
>;
