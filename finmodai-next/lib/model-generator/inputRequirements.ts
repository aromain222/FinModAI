import type { ModelGeneratorType } from '@/lib/model-generator/classifyPrompt';
import { getModelDefaults } from '@/lib/model-generator/defaults';

export type CriticalRule = {
  allOf?: string[];
  anyOf?: string[];
};

export type ModelInputRequirement = {
  requiredInputs: string[];
  optionalInputs: string[];
  criticalInputs: string[];
  criticalRules: CriticalRule[];
  defaults: Record<string, unknown>;
};

export const MODEL_INPUT_REQUIREMENTS: Record<ModelGeneratorType, ModelInputRequirement> = {
  DCF: {
    requiredInputs: ['companyName', 'companyType'],
    optionalInputs: ['revenueGrowth', 'ebitMargin', 'wacc', 'terminalGrowth'],
    criticalInputs: ['companyName', 'companyType'],
    criticalRules: [{ anyOf: ['companyName', 'companyType'] }],
    defaults: getModelDefaults('DCF') as Record<string, unknown>,
  },
  THREE_STATEMENT: {
    requiredInputs: ['companyName', 'companyType', 'baseRevenue'],
    optionalInputs: ['revenueGrowth', 'grossMargin', 'opexPctRevenue', 'taxRate'],
    criticalInputs: ['companyName', 'companyType', 'baseRevenue'],
    criticalRules: [{ anyOf: ['companyName', 'companyType'] }, { anyOf: ['baseRevenue', 'companyType'] }],
    defaults: getModelDefaults('THREE_STATEMENT') as Record<string, unknown>,
  },
  CAP_TABLE: {
    requiredInputs: ['roundType', 'raiseAmount', 'preMoney'],
    optionalInputs: ['founderShares', 'optionPoolRefresh'],
    criticalInputs: ['raiseAmount', 'preMoney'],
    criticalRules: [{ allOf: ['raiseAmount', 'preMoney'] }],
    defaults: getModelDefaults('CAP_TABLE') as Record<string, unknown>,
  },
  SAAS_OPERATING_MODEL: {
    requiredInputs: ['startingArr', 'companyScale', 'companyType'],
    optionalInputs: ['growthRate', 'churn', 'grossMargin', 'cac', 'arpu'],
    criticalInputs: ['startingArr', 'companyScale'],
    criticalRules: [{ anyOf: ['startingArr', 'companyScale'] }],
    defaults: getModelDefaults('SAAS_OPERATING_MODEL') as Record<string, unknown>,
  },
  COMPS: {
    requiredInputs: ['companyName', 'companyType'],
    optionalInputs: ['peerSet', 'valuationMultiples'],
    criticalInputs: ['companyName', 'companyType'],
    criticalRules: [{ anyOf: ['companyName', 'companyType'] }],
    defaults: getModelDefaults('COMPS') as Record<string, unknown>,
  },
  DEBT_CAPACITY_LITE: {
    requiredInputs: ['companyName', 'ebitda'],
    optionalInputs: ['maxLeverage', 'minInterestCoverage', 'interestRate'],
    criticalInputs: ['companyName', 'ebitda'],
    criticalRules: [{ anyOf: ['companyName', 'companyType'] }, { allOf: ['ebitda'] }],
    defaults: getModelDefaults('DEBT_CAPACITY_LITE') as Record<string, unknown>,
  },
  FOOTBALL_FIELD: {
    requiredInputs: ['companyName', 'companyType'],
    optionalInputs: ['peerSet', 'revenue', 'ebitda', 'sharePrice', 'netDebt'],
    criticalInputs: ['companyName', 'companyType'],
    criticalRules: [{ anyOf: ['companyName', 'companyType'] }],
    defaults: getModelDefaults('FOOTBALL_FIELD') as Record<string, unknown>,
  },
  MERGER: {
    requiredInputs: ['acquirerTicker', 'targetTicker', 'purchasePrice'],
    optionalInputs: ['cashPct', 'stockPct', 'debtPct', 'newDebtRate', 'synergies'],
    criticalInputs: ['acquirerTicker', 'targetTicker', 'purchasePrice'],
    criticalRules: [{ allOf: ['acquirerTicker', 'targetTicker', 'purchasePrice'] }],
    defaults: getModelDefaults('MERGER') as Record<string, unknown>,
  },
  PRECEDENTS: {
    requiredInputs: ['companyName', 'companyType'],
    optionalInputs: ['transactionCount', 'revenueMultiple', 'ebitdaMultiple'],
    criticalInputs: ['companyName', 'companyType'],
    criticalRules: [{ anyOf: ['companyName', 'companyType'] }],
    defaults: getModelDefaults('PRECEDENTS') as Record<string, unknown>,
  },
  LBO: {
    requiredInputs: ['companyName', 'companyType', 'revenue', 'ebitda'],
    optionalInputs: ['entryMultiple', 'exitMultiple', 'debtPercent', 'revenueGrowth', 'ebitdaMargin'],
    criticalInputs: ['companyName', 'companyType', 'revenue', 'ebitda'],
    criticalRules: [{ anyOf: ['companyName', 'companyType'] }, { anyOf: ['revenue', 'companyType'] }, { anyOf: ['ebitda', 'companyType'] }],
    defaults: getModelDefaults('LBO') as Record<string, unknown>,
  },
};

export function getInputRequirements(modelType: ModelGeneratorType): ModelInputRequirement {
  return MODEL_INPUT_REQUIREMENTS[modelType];
}

export function evaluateCriticalInputs(modelType: ModelGeneratorType, providedInputs: Iterable<string>): string[] {
  const provided = new Set(providedInputs);
  const requirements = getInputRequirements(modelType);
  const missing = new Set<string>();

  for (const rule of requirements.criticalRules) {
    if (rule.anyOf && !rule.anyOf.some((field) => provided.has(field))) {
      rule.anyOf.forEach((field) => missing.add(field));
    }

    if (rule.allOf) {
      rule.allOf.forEach((field) => {
        if (!provided.has(field)) {
          missing.add(field);
        }
      });
    }
  }

  return Array.from(missing);
}
