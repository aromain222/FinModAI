import type {
  InvestmentAnalysisDocument,
  InvestmentMemoSections,
  InvestmentScenarioKey,
} from '@/lib/investment-analysis/types';
import type {
  InvestmentEventAssumptionApplicationResult,
  InvestmentEventClassificationResult,
} from '@/lib/investment-analysis/eventTypes';

function pickForecastHighlights(document: InvestmentAnalysisDocument, scenario: InvestmentScenarioKey) {
  const forecast = document.scenarios[scenario].result.forecast;
  if (forecast.length === 0) return [];
  const first = forecast[0];
  const last = forecast[forecast.length - 1];

  return [
    {
      year: first.year,
      revenue: first.revenue,
      ebit: first.ebit,
      unleveredFreeCashFlow: first.unleveredFreeCashFlow,
    },
    {
      year: last.year,
      revenue: last.revenue,
      ebit: last.ebit,
      unleveredFreeCashFlow: last.unleveredFreeCashFlow,
    },
  ];
}

export function buildInitialInvestmentMemoPayload(
  document: InvestmentAnalysisDocument,
): Record<string, unknown> {
  const activeScenario = document.activeScenario;
  const active = document.scenarios[activeScenario];

  return {
    company: document.company,
    activeScenario,
    assumptions: active.assumptions,
    currentScenarioValuation: active.result.valuation,
    forecastHighlights: pickForecastHighlights(document, activeScenario),
    scenarios: {
      bull: document.scenarios.bull.result.valuation,
      base: document.scenarios.base.result.valuation,
      bear: document.scenarios.bear.result.valuation,
    },
  };
}

export function buildInvestmentMemoRefreshPayload(args: {
  document: InvestmentAnalysisDocument;
  activeScenario: InvestmentScenarioKey;
  previousMemo?: InvestmentMemoSections | null;
}): Record<string, unknown> {
  const scenario = args.document.scenarios[args.activeScenario];

  return {
    company: args.document.company,
    activeScenario: args.activeScenario,
    previousMemo: args.previousMemo ?? null,
    assumptions: scenario.assumptions,
    valuation: scenario.result.valuation,
    forecastHighlights: pickForecastHighlights(args.document, args.activeScenario),
    scenarios: {
      bull: args.document.scenarios.bull.result.valuation,
      base: args.document.scenarios.base.result.valuation,
      bear: args.document.scenarios.bear.result.valuation,
      custom: args.document.scenarios.custom.result.valuation,
    },
  };
}

export function buildEventAwareInvestmentMemoPayload(args: {
  beforeDocument: InvestmentAnalysisDocument;
  afterDocument: InvestmentAnalysisDocument;
  classification: InvestmentEventClassificationResult;
  application: InvestmentEventAssumptionApplicationResult;
}): Record<string, unknown> {
  return {
    company: args.afterDocument.company,
    event: {
      category: args.classification.category,
      confidence: args.classification.confidence,
      normalizedEventSummary: args.classification.normalizedEventSummary,
      rationale: args.classification.rationale,
    },
    scenarioBias: args.application.scenarioBias,
    assumptionChanges: args.application.changes,
    valuationBefore: args.beforeDocument.scenarios.base.result.valuation,
    valuationAfter: args.afterDocument.scenarios.base.result.valuation,
    forecastHighlightsBefore: pickForecastHighlights(args.beforeDocument, 'base'),
    forecastHighlightsAfter: pickForecastHighlights(args.afterDocument, 'base'),
    scenarios: {
      bull: args.afterDocument.scenarios.bull.result.valuation,
      base: args.afterDocument.scenarios.base.result.valuation,
      bear: args.afterDocument.scenarios.bear.result.valuation,
    },
  };
}

export function buildEventAwareDeltaSummaryPayload(args: {
  beforeDocument: InvestmentAnalysisDocument;
  afterDocument: InvestmentAnalysisDocument;
  classification: InvestmentEventClassificationResult;
  application: InvestmentEventAssumptionApplicationResult;
}): Record<string, unknown> {
  return {
    company: args.afterDocument.company,
    event: {
      category: args.classification.category,
      confidence: args.classification.confidence,
      normalizedEventSummary: args.classification.normalizedEventSummary,
    },
    scenarioBias: args.application.scenarioBias,
    assumptionChanges: args.application.changes,
    valuationBefore: args.beforeDocument.scenarios.base.result.valuation,
    valuationAfter: args.afterDocument.scenarios.base.result.valuation,
  };
}
