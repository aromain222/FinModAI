export type {
  DeterministicForecastRow,
  DeterministicScenarioSet,
  DeterministicValuationAssumptions,
  DeterministicValuationResult,
  DeterministicValuationSummary,
  InvestmentAnalysisDocument,
  InvestmentAnalysisScenarioDocument,
  InvestmentAssumptionPatch,
  InvestmentChartDefinition,
  InvestmentChartDocument,
  InvestmentChartPoint,
  InvestmentChartSeries,
  InvestmentSensitivityCell,
  InvestmentSensitivityTable,
  InvestmentCompanyMetadata,
  InvestmentMemoSections,
  InvestmentScenarioKey,
  InvestmentValuationMetric,
  ScenarioHelperOverrides,
} from '@/lib/investment-analysis/types';

export {
  buildBaseCase,
  buildBearCase,
  buildBullCase,
  buildCustomScenario,
  buildStandardScenarioSet,
  calculateDeterministicValuation,
} from '@/lib/investment-analysis/valuationEngine';

export {
  createInvestmentAnalysisDocument,
  createInvestmentWorkspaceState,
  investmentWorkspaceReducer,
} from '@/lib/investment-analysis/workspaceState';

export {
  buildFreeCashFlowForecastChart,
  buildInvestmentWorkspaceCharts,
  buildRevenueForecastChart,
  buildScenarioComparisonChart,
  buildSensitivityTable,
} from '@/lib/investment-analysis/chartSeries';
