import { buildInvestmentWorkspaceCharts } from '@/lib/investment-analysis/chartSeries';
import { createInvestmentAnalysisDocument } from '@/lib/investment-analysis/workspaceState';
import type {
  InvestmentMemoSections,
  InvestmentModelRefreshInput,
  InvestmentModelRefreshResult,
} from '@/lib/investment-analysis/types';

function buildFallbackMemo(existingMemo?: InvestmentMemoSections | null): InvestmentMemoSections {
  return existingMemo ?? {
    summary: '',
    whyItMatters: '',
    analysis: '',
    updatedAt: null,
  };
}

function buildWritePayload(document: InvestmentModelRefreshResult['document']): InvestmentModelRefreshResult['writePayload'] {
  const activeScenario = document.scenarios[document.activeScenario];
  const forecastHighlights = activeScenario.result.forecast.map((row) => ({
    year: row.year,
    revenue: row.revenue,
    ebit: row.ebit,
    unleveredFreeCashFlow: row.unleveredFreeCashFlow,
  }));

  return {
    company: document.company,
    activeScenario: document.activeScenario,
    assumptions: activeScenario.assumptions,
    valuation: activeScenario.result.valuation,
    forecastHighlights,
    scenarios: {
      base: document.scenarios.base.result.valuation,
      bull: document.scenarios.bull.result.valuation,
      bear: document.scenarios.bear.result.valuation,
      custom: document.scenarios.custom.result.valuation,
    },
    warnings: activeScenario.result.warnings,
    assumptionsAdjusted: activeScenario.result.assumptionsAdjusted,
  };
}

export function refreshInvestmentAnalysisModel(
  input: InvestmentModelRefreshInput,
): InvestmentModelRefreshResult {
  // Rebuild the analysis document from the adjusted deterministic assumptions so
  // every downstream surface stays tied to a single structured source of truth.
  const document = createInvestmentAnalysisDocument({
    company: input.company,
    assumptions: input.adjustedAssumptions,
    memo: buildFallbackMemo(input.existingDocument?.memo),
    generatedAt: input.existingDocument?.generatedAt ?? input.generatedAt,
  });

  const activeScenario = document.scenarios[document.activeScenario];
  const workspaceCharts = buildInvestmentWorkspaceCharts(document);

  return {
    document,
    activeScenario,
    refreshedForecast: activeScenario.result.forecast,
    refreshedValuation: activeScenario.result.valuation,
    workspaceCharts,
    writePayload: buildWritePayload(document),
  };
}
