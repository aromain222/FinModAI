import {
  buildBaseCase,
  buildBearCase,
  buildBullCase,
  buildCustomScenario,
} from '@/lib/investment-analysis/valuationEngine';
import type {
  DeterministicValuationAssumptions,
  InvestmentAnalysisDocument,
  InvestmentAnalysisScenarioDocument,
  InvestmentAssumptionPatch,
  InvestmentCompanyMetadata,
  InvestmentMemoSections,
  InvestmentScenarioKey,
} from '@/lib/investment-analysis/types';

export type InvestmentWorkspaceState = {
  document: InvestmentAnalysisDocument;
};

export type InvestmentWorkspaceAction =
  | { type: 'set_active_scenario'; scenario: InvestmentScenarioKey }
  | { type: 'activate_custom_from_current' }
  | { type: 'patch_active_assumptions'; patch: InvestmentAssumptionPatch }
  | { type: 'reset_active_scenario' }
  | { type: 'replace_memo'; memo: InvestmentMemoSections };

function mergeAssumptions(
  current: DeterministicValuationAssumptions,
  patch: InvestmentAssumptionPatch,
): DeterministicValuationAssumptions {
  return {
    ...current,
    ...patch,
    revenueGrowthByYear: patch.revenueGrowthByYear ?? current.revenueGrowthByYear,
    operatingMarginByYear: patch.operatingMarginByYear ?? current.operatingMarginByYear,
  };
}

function recalculateScenario(
  company: InvestmentCompanyMetadata,
  scenario: InvestmentAnalysisScenarioDocument,
): InvestmentAnalysisScenarioDocument {
  const { key, label, assumptions } = scenario;
  const result =
    key === 'base'
      ? buildBaseCase(assumptions, company)
      : key === 'bull'
        ? buildBullCase(assumptions, company, assumptions)
        : key === 'bear'
          ? buildBearCase(assumptions, company, assumptions)
          : buildCustomScenario(assumptions, {}, { company, label });

  return {
    ...scenario,
    result,
  };
}

export function createInvestmentAnalysisDocument(args: {
  company: InvestmentCompanyMetadata;
  assumptions: DeterministicValuationAssumptions;
  memo: InvestmentMemoSections;
  generatedAt?: string;
}): InvestmentAnalysisDocument {
  const generatedAt = args.generatedAt ?? new Date().toISOString();

  const baseAssumptions = args.assumptions;
  const bullAssumptions: DeterministicValuationAssumptions = {
    ...baseAssumptions,
    revenueGrowthByYear: baseAssumptions.revenueGrowthByYear.map((value) => value + 0.02),
    operatingMarginByYear: baseAssumptions.operatingMarginByYear.map((value) => value + 0.01),
    wacc: baseAssumptions.wacc - 0.01,
    terminalGrowthRate: baseAssumptions.terminalGrowthRate + 0.005,
  };
  const bearAssumptions: DeterministicValuationAssumptions = {
    ...baseAssumptions,
    revenueGrowthByYear: baseAssumptions.revenueGrowthByYear.map((value) => value - 0.02),
    operatingMarginByYear: baseAssumptions.operatingMarginByYear.map((value) => value - 0.01),
    wacc: baseAssumptions.wacc + 0.01,
    terminalGrowthRate: baseAssumptions.terminalGrowthRate - 0.005,
  };

  return {
    modelType: 'DCF',
    company: args.company,
    activeScenario: 'base',
    scenarios: {
      base: {
        key: 'base',
        label: 'Base',
        assumptions: baseAssumptions,
        result: buildBaseCase(baseAssumptions, args.company),
      },
      bull: {
        key: 'bull',
        label: 'Bull',
        assumptions: bullAssumptions,
        result: buildBullCase(baseAssumptions, args.company, bullAssumptions),
      },
      bear: {
        key: 'bear',
        label: 'Bear',
        assumptions: bearAssumptions,
        result: buildBearCase(baseAssumptions, args.company, bearAssumptions),
      },
      custom: {
        key: 'custom',
        label: 'Custom',
        assumptions: baseAssumptions,
        result: buildCustomScenario(baseAssumptions, {}, { company: args.company, label: 'Custom Scenario' }),
        dirty: false,
      },
    },
    memo: args.memo,
    generatedAt,
  };
}

export function createInvestmentWorkspaceState(document: InvestmentAnalysisDocument): InvestmentWorkspaceState {
  return { document };
}

export function investmentWorkspaceReducer(
  state: InvestmentWorkspaceState,
  action: InvestmentWorkspaceAction,
): InvestmentWorkspaceState {
  const { document } = state;
  const activeScenario = document.scenarios[document.activeScenario];

  switch (action.type) {
    case 'set_active_scenario':
      return {
        document: {
          ...document,
          activeScenario: action.scenario,
        },
      };

    case 'activate_custom_from_current': {
      const nextCustom: InvestmentAnalysisScenarioDocument = {
        key: 'custom',
        label: 'Custom',
        assumptions: activeScenario.assumptions,
        result: buildCustomScenario(activeScenario.assumptions, {}, { company: document.company, label: 'Custom Scenario' }),
        dirty: activeScenario.key !== 'custom',
      };

      return {
        document: {
          ...document,
          activeScenario: 'custom',
          scenarios: {
            ...document.scenarios,
            custom: nextCustom,
          },
        },
      };
    }

    case 'patch_active_assumptions': {
      const targetKey = document.activeScenario;
      const target = document.scenarios[targetKey];
      const patchedAssumptions = mergeAssumptions(target.assumptions, action.patch);
      const recalculated = recalculateScenario(document.company, {
        ...target,
        assumptions: patchedAssumptions,
        dirty: true,
      });

      return {
        document: {
          ...document,
          scenarios: {
            ...document.scenarios,
            [targetKey]: recalculated,
          },
        },
      };
    }

    case 'reset_active_scenario': {
      if (document.activeScenario === 'custom') {
        const base = document.scenarios.base;
        const nextCustom = {
          key: 'custom' as const,
          label: 'Custom',
          assumptions: base.assumptions,
          result: buildCustomScenario(base.assumptions, {}, { company: document.company, label: 'Custom Scenario' }),
          dirty: false,
        };
        return {
          document: {
            ...document,
            scenarios: {
              ...document.scenarios,
              custom: nextCustom,
            },
          },
        };
      }

      return {
        document: createInvestmentAnalysisDocument({
          company: document.company,
          assumptions: document.scenarios.base.assumptions,
          memo: document.memo,
          generatedAt: document.generatedAt,
        }),
      };
    }

    case 'replace_memo':
      return {
        document: {
          ...document,
          memo: action.memo,
        },
      };

    default:
      return state;
  }
}
