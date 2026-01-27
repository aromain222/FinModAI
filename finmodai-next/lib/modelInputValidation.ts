/**
 * Input Classification System
 * 
 * Classifies all model inputs as:
 * - PULLABLE: Can be fetched from APIs/filings
 * - COMPUTABLE: Can be derived from other inputs
 * - USER_REQUIRED: Must be explicitly provided by user
 */

export type InputCategory = 'PULLABLE' | 'COMPUTABLE' | 'USER_REQUIRED';

export interface InputDefinition {
  key: string;
  label: string;
  category: InputCategory;
  dataSource?: string; // For PULLABLE: which API provides it
  formula?: string; // For COMPUTABLE: how it's calculated
  required?: boolean; // For USER_REQUIRED: whether it's mandatory
  defaultValue?: never; // Explicitly disallow defaults
}

/**
 * LBO Model Input Classifications
 */
export const LBO_INPUT_DEFINITIONS: InputDefinition[] = [
  // PULLABLE
  { key: 'basicSharesOutstanding', label: 'Shares Outstanding', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'ltmRevenue', label: 'LTM Revenue', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'ltmEBITDA', label: 'LTM EBITDA', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'cashOnBalance', label: 'Cash Balance', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'totalDebt', label: 'Total Debt', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'netDebt', label: 'Net Debt', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'currentStockPrice', label: 'Current Stock Price', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  
  // COMPUTABLE
  { key: 'enterpriseValue', label: 'Enterprise Value', category: 'COMPUTABLE', formula: 'Equity Value + Net Debt' },
  { key: 'exitEquityValue', label: 'Exit Equity Value', category: 'COMPUTABLE', formula: 'Exit EV - Net Debt at Exit' },
  { key: 'sponsorIRR', label: 'Sponsor IRR', category: 'COMPUTABLE', formula: 'Calculated from cash flows' },
  { key: 'sponsorMOIC', label: 'Sponsor MOIC', category: 'COMPUTABLE', formula: 'Exit Equity / Sponsor Equity' },
  
  // USER_REQUIRED
  { key: 'entryMultiple', label: 'Entry EBITDA Multiple', category: 'USER_REQUIRED', required: true },
  { key: 'exitEBITDAMultiple', label: 'Exit EBITDA Multiple', category: 'USER_REQUIRED', required: true },
  { key: 'offerPremium', label: 'Offer Premium (%)', category: 'USER_REQUIRED', required: true },
  { key: 'exitYear', label: 'Hold Period (years)', category: 'USER_REQUIRED', required: true },
  { key: 'leverageMultiple', label: 'Target Leverage (Debt/EBITDA)', category: 'USER_REQUIRED', required: true },
  { key: 'termLoanBRate', label: 'Term Loan B Interest Rate (%)', category: 'USER_REQUIRED', required: true },
  { key: 'revolverRate', label: 'Revolver Interest Rate (%)', category: 'USER_REQUIRED', required: true },
  { key: 'transactionFeesPercent', label: 'Transaction Fees (%)', category: 'USER_REQUIRED', required: true },
  { key: 'financingFeesPercent', label: 'Financing Fees (%)', category: 'USER_REQUIRED', required: true },
  { key: 'minimumCashBalance', label: 'Minimum Cash Balance ($MM)', category: 'USER_REQUIRED', required: true },
  { key: 'managementRolloverPct', label: 'Management Rollover (%)', category: 'USER_REQUIRED', required: false },
];

/**
 * DCF Model Input Classifications
 */
export const DCF_INPUT_DEFINITIONS: InputDefinition[] = [
  // PULLABLE
  { key: 'sharesOutstanding', label: 'Shares Outstanding', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'ltmRevenue', label: 'LTM Revenue', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'ltmEBITDA', label: 'LTM EBITDA', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'netDebt', label: 'Net Debt', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'historicalMargins', label: 'Historical Margins', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  
  // COMPUTABLE
  { key: 'enterpriseValue', label: 'Enterprise Value', category: 'COMPUTABLE', formula: 'Equity Value + Net Debt' },
  { key: 'terminalValue', label: 'Terminal Value', category: 'COMPUTABLE', formula: 'FCF × (1 + g) / (WACC - g)' },
  { key: 'equityValue', label: 'Equity Value', category: 'COMPUTABLE', formula: 'Enterprise Value - Net Debt' },
  
  // USER_REQUIRED
  { key: 'revenueGrowth', label: 'Revenue Growth Rate (%)', category: 'USER_REQUIRED', required: true },
  { key: 'ebitdaMargin', label: 'EBITDA Margin (%)', category: 'USER_REQUIRED', required: true },
  { key: 'wacc', label: 'WACC (%)', category: 'USER_REQUIRED', required: true },
  { key: 'terminalGrowth', label: 'Terminal Growth Rate (%)', category: 'USER_REQUIRED', required: true },
];

/**
 * 3-Statement Model Input Classifications
 */
export const THREE_STATEMENT_INPUT_DEFINITIONS: InputDefinition[] = [
  // PULLABLE
  { key: 'sharesOutstanding', label: 'Shares Outstanding', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'ltmRevenue', label: 'LTM Revenue', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'ltmEBITDA', label: 'LTM EBITDA', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'cashBalance', label: 'Cash Balance', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  { key: 'debtBalance', label: 'Debt Balance', category: 'PULLABLE', dataSource: 'Polygon/FMP' },
  
  // COMPUTABLE
  { key: 'ebitda', label: 'EBITDA', category: 'COMPUTABLE', formula: 'Revenue × EBITDA Margin' },
  { key: 'freeCashFlow', label: 'Free Cash Flow', category: 'COMPUTABLE', formula: 'EBITDA - Capex - ΔWC' },
  { key: 'netDebt', label: 'Net Debt', category: 'COMPUTABLE', formula: 'Total Debt - Cash' },
  
  // USER_REQUIRED
  { key: 'revenueGrowth', label: 'Revenue Growth Rate (%)', category: 'USER_REQUIRED', required: true },
  { key: 'ebitdaMargin', label: 'EBITDA Margin (%)', category: 'USER_REQUIRED', required: true },
  { key: 'capexPercent', label: 'Capex % of Revenue', category: 'USER_REQUIRED', required: true },
  { key: 'workingCapitalPercent', label: 'Working Capital % of Revenue', category: 'USER_REQUIRED', required: true },
];

export type ModelType = 'lbo' | 'dcf' | 'three-statement' | 'comps';

export function getInputDefinitions(modelType: ModelType): InputDefinition[] {
  switch (modelType) {
    case 'lbo':
      return LBO_INPUT_DEFINITIONS;
    case 'dcf':
      return DCF_INPUT_DEFINITIONS;
    case 'three-statement':
      return THREE_STATEMENT_INPUT_DEFINITIONS;
    case 'comps':
      return []; // Comps uses peer data, minimal user inputs
    default:
      return [];
  }
}

/**
 * Validation Result
 */
export interface ValidationResult {
  isValid: boolean;
  missingRequired: string[];
  missingPullable: string[];
  warnings: string[];
}

/**
 * Validate inputs for a model
 */
export function validateModelInputs(
  modelType: ModelType,
  inputs: Record<string, any>,
  pulledData: Record<string, any> = {}
): ValidationResult {
  const definitions = getInputDefinitions(modelType);
  const missingRequired: string[] = [];
  const missingPullable: string[] = [];
  const warnings: string[] = [];

  for (const def of definitions) {
    const value = inputs[def.key] ?? pulledData[def.key];

    if (def.category === 'USER_REQUIRED' && def.required) {
      if (value === undefined || value === null || value === '') {
        missingRequired.push(def.label);
      }
    }

    if (def.category === 'PULLABLE') {
      if (value === undefined || value === null) {
        missingPullable.push(def.label);
      }
    }
  }

  // Check for Sources = Uses in LBO
  if (modelType === 'lbo') {
    const sources = inputs.sourcesTotal ?? pulledData.sourcesTotal;
    const uses = inputs.usesTotal ?? pulledData.usesTotal;
    if (sources !== undefined && uses !== undefined && Math.abs(sources - uses) > 0.01) {
      warnings.push(`Sources (${sources}) does not equal Uses (${uses})`);
    }
  }

  return {
    isValid: missingRequired.length === 0,
    missingRequired,
    missingPullable,
    warnings,
  };
}

/**
 * Get required user inputs for a model type
 */
export function getRequiredUserInputs(modelType: ModelType): InputDefinition[] {
  return getInputDefinitions(modelType).filter(
    (def) => def.category === 'USER_REQUIRED' && def.required === true
  );
}

/**
 * Get pullable inputs that are missing
 */
export function getMissingPullableInputs(
  modelType: ModelType,
  pulledData: Record<string, any>
): InputDefinition[] {
  return getInputDefinitions(modelType).filter(
    (def) => def.category === 'PULLABLE' && (pulledData[def.key] === undefined || pulledData[def.key] === null)
  );
}
