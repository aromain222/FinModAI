export type {
  DeterministicForecastRow,
  DeterministicScenarioSet,
  DeterministicValuationAssumptions,
  DeterministicValuationResult,
  DeterministicValuationSummary,
  InvestmentAnalysisDocument,
  InvestmentAnalysisGenerationResult,
  InvestmentAnalysisScenarioDocument,
  InvestmentAssumptionPatch,
  InvestmentChartDefinition,
  InvestmentChartDocument,
  InvestmentEventChartBundle,
  InvestmentEventChartInput,
  InvestmentEventAnalysisRunListItem,
  InvestmentEventAnalysisRunRecord,
  InvestmentChartPoint,
  InvestmentChartSeries,
  InvestmentSavedScenarioCharts,
  InvestmentSavedScenarioListItem,
  InvestmentSavedScenarioRecord,
  InvestmentSensitivityCell,
  InvestmentSensitivityTable,
  InvestmentCompanyMetadata,
  InvestmentMemoSections,
  InvestmentModelRefreshInput,
  InvestmentModelRefreshResult,
  InvestmentModelRefreshWritePayload,
  InvestmentScenarioKey,
  InvestmentValuationMetric,
  InvestmentWorkspaceCharts,
  SaveInvestmentEventAnalysisRunInput,
  SaveInvestmentScenarioInput,
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

export {
  buildSaveScenarioInputFromDocument,
  buildSavedScenarioChartsFromDocument,
  getSavedInvestmentScenario,
  listSavedInvestmentScenarios,
  saveInvestmentScenario,
} from '@/lib/investment-analysis/scenarioPersistence';

export {
  getSavedInvestmentScenarioViaApi,
  listSavedInvestmentScenariosViaApi,
  saveInvestmentScenarioViaApi,
} from '@/lib/investment-analysis/scenarioClient';

export {
  getInvestmentEventAnalysisRunViaApi,
  listInvestmentEventAnalysisRunsViaApi,
  saveInvestmentEventAnalysisRunViaApi,
} from '@/lib/investment-analysis/eventAnalysisClient';

export {
  generateInvestmentAnalysisFromPrompt,
  refreshInvestmentMemo,
} from '@/lib/investment-analysis/generateAnalysis';

export type {
  InvestmentPromptAnalysisType,
  ParsedPromptEventContext,
  ParsedPromptTimeHorizon,
} from '@/lib/investment-analysis/promptParser';

export {
  parseInvestmentPromptContext,
} from '@/lib/investment-analysis/promptParser';

export type {
  InvestmentEventCategory,
  InvestmentEventClassificationInput,
  InvestmentEventClassificationResult,
  InvestmentEventConfidence,
  InvestmentEventTaxonomyEntry,
} from '@/lib/investment-analysis/eventTypes';

export {
  INVESTMENT_EVENT_TAXONOMY_V1,
} from '@/lib/investment-analysis/eventTypes';

export {
  classifyInvestmentEvent,
} from '@/lib/investment-analysis/eventClassifier';

export type {
  InvestmentEventAssumptionDelta,
  InvestmentEventAssumptionDeltaInput,
  InvestmentEventAssumptionDeltaResult,
  InvestmentEventAssumptionLever,
  InvestmentEventDeltaDirection,
  InvestmentEventDeltaUnit,
  InvestmentScenarioBias,
} from '@/lib/investment-analysis/eventTypes';

export {
  buildEventAdjustedAssumptions,
  deriveEventAwareAssumptionDeltas,
} from '@/lib/investment-analysis/eventAssumptions';

export type {
  InvestmentEventAppliedAssumptionChange,
  InvestmentEventAppliedField,
  InvestmentEventAssumptionApplicationResult,
  InvestmentEventAssumptionValidationIssue,
} from '@/lib/investment-analysis/eventTypes';

export {
  applyEventAssumptionDeltas,
} from '@/lib/investment-analysis/eventAssumptionApplication';

export {
  buildEventAwareCharts,
  buildEventFreeCashFlowForecastComparisonChart,
  buildEventRevenueForecastComparisonChart,
  buildEventValuationComparisonChart,
} from '@/lib/investment-analysis/eventChartSeries';

export {
  refreshInvestmentAnalysisModel,
} from '@/lib/investment-analysis/modelRefresh';

export {
  buildSaveInvestmentEventAnalysisRunInput,
  getInvestmentEventAnalysisRun,
  listInvestmentEventAnalysisRuns,
  saveInvestmentEventAnalysisRun,
} from '@/lib/investment-analysis/eventAnalysisPersistence';
