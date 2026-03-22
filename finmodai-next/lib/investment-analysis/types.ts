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

export type SaveInvestmentEventAnalysisRunInput = {
  companyId?: string | null;
  company: InvestmentCompanyMetadata;
  modelType?: 'DCF';
  originalPrompt: string;
  parsedPromptContext: Record<string, unknown>;
  detectedEvent: Record<string, unknown> | null;
  baseAssumptions: DeterministicValuationAssumptions;
  assumptionDeltas: Record<string, unknown>;
  adjustedAssumptions: DeterministicValuationAssumptions;
  valuationOutputs: {
    activeScenario: InvestmentScenarioKey;
    forecast: DeterministicForecastRow[];
    valuation: DeterministicValuationSummary;
    scenarios?: Record<string, DeterministicValuationSummary>;
  };
  generatedSummary?: Record<string, unknown> | null;
};

export type InvestmentEventAnalysisRunRecord = {
  id: string;
  userId: string;
  companyId?: string | null;
  companyTicker: string;
  companyName: string;
  modelType: 'DCF';
  originalPrompt: string;
  parsedPromptContext: Record<string, unknown>;
  eventCategory?: string | null;
  eventConfidence?: string | null;
  detectedEvent: Record<string, unknown> | null;
  baseAssumptions: DeterministicValuationAssumptions;
  assumptionDeltas: Record<string, unknown>;
  adjustedAssumptions: DeterministicValuationAssumptions;
  valuationOutputs: SaveInvestmentEventAnalysisRunInput['valuationOutputs'];
  generatedSummary?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
};

export type InvestmentEventAnalysisRunListItem = Pick<
  InvestmentEventAnalysisRunRecord,
  | 'id'
  | 'companyId'
  | 'companyTicker'
  | 'companyName'
  | 'modelType'
  | 'originalPrompt'
  | 'eventCategory'
  | 'eventConfidence'
  | 'valuationOutputs'
  | 'createdAt'
  | 'updatedAt'
>;

export type InvestmentWorkspaceCharts = {
  revenueForecast: InvestmentChartDefinition;
  freeCashFlowForecast: InvestmentChartDefinition;
  scenarioComparison: InvestmentChartDefinition;
  sensitivity: InvestmentSensitivityTable;
};

export type InvestmentModelRefreshInput = {
  company: InvestmentCompanyMetadata;
  adjustedAssumptions: DeterministicValuationAssumptions;
  existingDocument?: InvestmentAnalysisDocument | null;
  generatedAt?: string;
};

export type InvestmentModelRefreshWritePayload = {
  company: InvestmentCompanyMetadata;
  activeScenario: InvestmentScenarioKey;
  assumptions: DeterministicValuationAssumptions;
  valuation: DeterministicValuationSummary;
  forecastHighlights: Array<{
    year: number;
    revenue: number;
    ebit: number;
    unleveredFreeCashFlow: number;
  }>;
  scenarios: {
    base: DeterministicValuationSummary;
    bull: DeterministicValuationSummary;
    bear: DeterministicValuationSummary;
    custom: DeterministicValuationSummary;
  };
  warnings: string[];
  assumptionsAdjusted: string[];
};

export type InvestmentModelRefreshResult = {
  document: InvestmentAnalysisDocument;
  activeScenario: InvestmentAnalysisScenarioDocument;
  refreshedForecast: DeterministicForecastRow[];
  refreshedValuation: DeterministicValuationSummary;
  workspaceCharts: InvestmentWorkspaceCharts;
  writePayload: InvestmentModelRefreshWritePayload;
};

export type InvestmentAnalysisGenerationResult = {
  document: InvestmentAnalysisDocument;
  eventImpact?: {
    classification: import('@/lib/investment-analysis/eventTypes').InvestmentEventClassificationResult;
    application: import('@/lib/investment-analysis/eventTypes').InvestmentEventAssumptionApplicationResult;
    valuationStatusLabel?: string;
    interpretationNote?: string | null;
  } | null;
  eventChartInput?: InvestmentEventChartInput | null;
};

export type InvestmentEventChartInput = {
  beforeScenario: InvestmentAnalysisScenarioDocument;
  afterScenario: InvestmentAnalysisScenarioDocument;
  refreshedDocument?: InvestmentChartDocument | null;
};

export type InvestmentEventChartBundle = {
  revenueForecastComparison: InvestmentChartDefinition;
  freeCashFlowForecastComparison: InvestmentChartDefinition;
  valuationComparison: InvestmentChartDefinition;
  scenarioComparison?: InvestmentChartDefinition | null;
};
