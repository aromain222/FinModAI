/**
 * CapitalBase Financial Math Engine
 * User Prompt Plan
 * 
 * Prioritized list of missing fields to ask for with UI copy
 */

import type { FinancialKey } from './types';
import { getMissingDataPoint } from './missingDataMap';
import {
  getModelModeRequirements,
  canRunMVP,
  canRunFull,
} from './modelModes';

export type UnitPreference = 'shares' | 'shares_mm' | 'usd' | 'usd_mm' | 'percent';

export interface PromptField {
  key: FinancialKey;
  label: string;
  description: string;
  hint: string;
  unit: UnitPreference;
  default?: number | null;
  defaultLabel?: string; // e.g., "Historical: 25%"
  validation?: {
    min?: number;
    max?: number;
    required: boolean;
    errorMessages: {
      required?: string;
      min?: string;
      max?: string;
      format?: string;
    };
  };
  priority: number; // Lower = higher priority
}

export interface PromptPlan {
  title: string;
  description: string;
  fields: PromptField[];
  mode: 'mvp' | 'full';
}

/**
 * Generate prioritized prompt plan for a model
 */
export function generatePromptPlan(
  modelType: 'comps' | 'dcf' | 'three_statement' | 'lbo' | 'merger',
  mode: 'mvp' | 'full',
  state: Partial<Record<FinancialKey, { value: number | null }>>,
  unitPreferences?: Partial<Record<FinancialKey, UnitPreference>>
): PromptPlan {
  const requirements = getModelModeRequirements(modelType, mode);
  const missing: FinancialKey[] = [];
  
  // Find missing required fields
  for (const key of requirements.required) {
    const entry = state[key];
    if (!entry || entry.value === null || entry.value === undefined) {
      missing.push(key);
    }
  }
  
  // Generate prompt fields with priority
  const fields = missing
    .map(key => createPromptField(key, unitPreferences?.[key]))
    .sort((a, b) => a.priority - b.priority);
  
  const title = getPromptTitle(modelType, mode);
  const description = getPromptDescription(modelType, mode, missing.length);
  
  return {
    title,
    description,
    fields,
    mode,
  };
}

/**
 * Create prompt field for a financial key
 */
function createPromptField(
  key: FinancialKey,
  unitPreference?: UnitPreference
): PromptField {
  const dataPoint = getMissingDataPoint(key);
  const unit = unitPreference || getDefaultUnit(key);
  
  // Priority: Lower = higher priority
  // 1-10: Critical for MVP
  // 11-20: Important for Full mode
  // 21-30: Optional enhancements
  
  let priority = 20;
  let label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  let description = dataPoint?.description || key;
  let hint = '';
  let defaultVal: number | null = null;
  let defaultLabel: string | undefined;
  
  // Model-specific priorities and hints
  switch (key) {
    case 'shares_out_basic':
      priority = 5;
      label = 'Shares Outstanding';
      description = 'Required for per-share outputs (price per share, EPS)';
      hint = 'Can be derived from Market Cap ÷ Price if both are available';
      break;
    
    case 'rf_rate':
      priority = 1;
      label = 'Risk-Free Rate';
      description = 'Required for WACC calculation (typically 10Y Treasury yield)';
      hint = 'Typically 3-5% for US markets. Current 10Y Treasury yield recommended.';
      defaultVal = 0.04;
      defaultLabel = 'Default: 4.0% (10Y Treasury)';
      break;
    
    case 'equity_risk_premium':
      priority = 2;
      label = 'Equity Risk Premium';
      description = 'Required for WACC calculation';
      hint = 'Typically 5-7% for US markets. Historical average recommended.';
      defaultVal = 0.06;
      defaultLabel = 'Default: 6.0% (US Market Average)';
      break;
    
    case 'beta':
      priority = 3;
      label = 'Beta';
      description = 'Required for WACC calculation (measures stock volatility vs market)';
      hint = 'Typically 0.5-2.0. Use 1.0 if unavailable.';
      defaultVal = 1.0;
      defaultLabel = 'Default: 1.0 (Market Average)';
      break;
    
    case 'cost_of_debt':
      priority = 4;
      label = 'Cost of Debt';
      description = 'Required for WACC calculation (interest rate on debt)';
      hint = 'Typically 3-8% for investment-grade companies. Use debt yield if available.';
      break;
    
    case 'tax_rate_assumption':
      priority = 6;
      label = 'Tax Rate';
      description = 'Required for WACC and FCF calculations';
      hint = 'Can use effective tax rate from financials if available. Typically 20-25% for US companies.';
      defaultVal = 0.25;
      defaultLabel = 'Default: 25.0% (US Corporate Rate)';
      break;
    
    case 'terminal_growth':
      priority = 7;
      label = 'Terminal Growth Rate';
      description = 'Required for DCF terminal value calculation';
      hint = 'Typically 2-3% for mature companies. Should be less than WACC.';
      defaultVal = 0.025;
      defaultLabel = 'Default: 2.5% (Long-term GDP Growth)';
      break;
    
    case 'exit_multiple':
      priority = 8;
      label = 'Exit Multiple (EV/EBITDA)';
      description = 'Required for LBO/M&A exit valuation';
      hint = 'Use comparable company multiples or transaction multiples.';
      break;
    
    case 'debt_rate':
      priority = 9;
      label = 'Debt Interest Rate';
      description = 'Required for LBO/M&A interest expense calculation';
      hint = 'Typically 5-10% for leveraged transactions. Use debt yield if available.';
      defaultVal = 0.07;
      defaultLabel = 'Default: 7.0% (Leveraged Debt Rate)';
      break;
    
    case 'leverage_multiple':
      priority = 10;
      label = 'Leverage Multiple (Debt/EBITDA)';
      description = 'Required for LBO debt sizing';
      hint = 'Typically 3-6x EBITDA for leveraged buyouts.';
      break;
    
    case 'holding_period_years':
      priority = 11;
      label = 'Holding Period (Years)';
      description = 'Required for LBO returns calculation';
      hint = 'Typically 3-7 years for private equity hold periods.';
      defaultVal = 5;
      defaultLabel = 'Default: 5 years';
      break;
    
    case 'da_percent_revenue':
      priority = 12;
      label = 'D&A % of Revenue';
      description = 'Required if D&A not reported (for FCF calculation)';
      hint = 'Use historical D&A % if available. Typically 2-10% of revenue.';
      break;
    
    case 'capex_percent_revenue':
      priority = 13;
      label = 'Capex % of Revenue';
      description = 'Required if Capex not reported (for FCF calculation)';
      hint = 'Use historical Capex % if available. Typically 3-15% of revenue.';
      break;
    
    case 'nwc_percent_revenue':
      priority = 14;
      label = 'NWC % of Revenue';
      description = 'Required if NWC not reported (for FCF calculation)';
      hint = 'Use historical NWC % if available. Can be negative for cash businesses.';
      break;
    
    default:
      priority = 15;
      break;
  }
  
  // Validation rules
  const validation = getValidationRules(key, unit);
  
  return {
    key,
    label,
    description,
    hint,
    unit,
    default: defaultVal,
    defaultLabel,
    validation,
    priority,
  };
}

/**
 * Get default unit for a key
 */
function getDefaultUnit(key: FinancialKey): UnitPreference {
  if (key.includes('percent') || key.includes('rate') || key.includes('multiple')) {
    return 'percent';
  }
  if (key.includes('shares')) {
    return 'shares';
  }
  if (key.includes('price') || key.includes('value') || key.includes('debt') || key.includes('cash')) {
    return 'usd_mm';
  }
  return 'usd_mm';
}

/**
 * Get validation rules for a key
 */
function getValidationRules(
  key: FinancialKey,
  unit: UnitPreference
): PromptField['validation'] {
  const errorMessages = {
    required: `${key.replace(/_/g, ' ')} is required`,
    format: `Please enter a valid number`,
  };
  
  switch (key) {
    case 'rf_rate':
    case 'equity_risk_premium':
    case 'cost_of_debt':
    case 'debt_rate':
    case 'tax_rate_assumption':
    case 'tax_rate_effective':
    case 'terminal_growth':
      return {
        min: 0,
        max: 1, // 100%
        required: true,
        errorMessages: {
          ...errorMessages,
          min: 'Rate must be >= 0%',
          max: 'Rate must be <= 100%',
        },
      };
    
    case 'beta':
      return {
        min: 0,
        max: 5,
        required: true,
        errorMessages: {
          ...errorMessages,
          min: 'Beta must be >= 0',
          max: 'Beta must be <= 5',
        },
      };
    
    case 'shares_out_basic':
      return {
        min: 1,
        required: true,
        errorMessages: {
          ...errorMessages,
          min: 'Shares must be > 0',
        },
      };
    
    case 'holding_period_years':
      return {
        min: 1,
        max: 20,
        required: true,
        errorMessages: {
          ...errorMessages,
          min: 'Holding period must be >= 1 year',
          max: 'Holding period must be <= 20 years',
        },
      };
    
    case 'da_percent_revenue':
    case 'capex_percent_revenue':
      return {
        min: 0,
        max: 0.5, // 50%
        required: true,
        errorMessages: {
          ...errorMessages,
          min: 'Percentage must be >= 0%',
          max: 'Percentage must be <= 50%',
        },
      };
    
    case 'nwc_percent_revenue':
      return {
        min: -0.2, // -20%
        max: 0.4, // 40%
        required: true,
        errorMessages: {
          ...errorMessages,
          min: 'NWC % must be >= -20%',
          max: 'NWC % must be <= 40%',
        },
      };
    
    default:
      return {
        required: true,
        errorMessages,
      };
  }
}

/**
 * Get prompt title
 */
function getPromptTitle(
  modelType: 'comps' | 'dcf' | 'three_statement' | 'lbo' | 'merger',
  mode: 'mvp' | 'full'
): string {
  const modelNames = {
    comps: 'Trading Comps',
    dcf: 'DCF Valuation',
    three_statement: '3-Statement Model',
    lbo: 'LBO Model',
    merger: 'M&A Model',
  };
  
  return `Missing Inputs for ${modelNames[modelType]} (${mode.toUpperCase()} Mode)`;
}

/**
 * Get prompt description
 */
function getPromptDescription(
  modelType: 'comps' | 'dcf' | 'three_statement' | 'lbo' | 'merger',
  mode: 'mvp' | 'full',
  missingCount: number
): string {
  const base = `Please provide the following ${missingCount} required input${missingCount !== 1 ? 's' : ''} to generate the ${mode.toUpperCase()} output.`;
  
  if (mode === 'mvp') {
    return `${base} Some outputs may be suppressed in MVP mode.`;
  }
  
  return `${base} Full mode requires all inputs for complete analysis.`;
}

/**
 * Generate minimal WACC prompt (for DCF)
 */
export function generateWACCPrompt(
  state: Partial<Record<FinancialKey, { value: number | null }>>,
  unitPreferences?: Partial<Record<FinancialKey, UnitPreference>>
): PromptPlan {
  const waccKeys: FinancialKey[] = [
    'rf_rate',
    'equity_risk_premium',
    'beta',
    'cost_of_debt',
    'tax_rate_assumption',
  ];
  
  const missing = waccKeys.filter(
    key => !state[key] || state[key]?.value === null || state[key]?.value === undefined
  );
  
  const fields = missing
    .map(key => createPromptField(key, unitPreferences?.[key]))
    .sort((a, b) => a.priority - b.priority);
  
  return {
    title: 'WACC Inputs Required',
    description: 'Please provide the following inputs to calculate WACC for the DCF model:',
    fields,
    mode: 'mvp',
  };
}
