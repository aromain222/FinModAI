/**
 * CapitalBase Financial Math Engine
 * Model-Specific Required Keys Lists
 * 
 * Defines what inputs are required, optional, and assumption-based
 * for each model type
 */

import type { FinancialKey, ModelRequirements } from './types';

/**
 * Trading Comps Model Requirements
 */
export const COMPS_REQUIREMENTS: ModelRequirements = {
  modelType: 'comps',
  required: [],
  optional: [
    // Core market data (public)
    'price', // OR market_cap
    'market_cap',
    'revenue', // TTM for EV/Rev
    'ebitda', // TTM for EV/EBITDA (optional)
    'net_income', // TTM for P/E (optional)
    'shares_out_basic',
    'cash',
    'total_debt',
    'net_debt',
    'enterprise_value',
    'ev_to_ebitda',
    'ev_to_revenue',
    'pe',
  ],
  assumptions: [
    // If shares missing but market_cap present, can derive shares
    // No other assumptions needed for basic comps
  ],
};

/**
 * DCF Model Requirements
 */
export const DCF_REQUIREMENTS: ModelRequirements = {
  modelType: 'dcf',
  required: [
    // Base financials
    'revenue', // Historical or projection seed
    'ebitda', // Or EBIT + D&A (EBIT can be derived from EBITDA - D&A)
    // WACC components
    'rf_rate', // Risk-free rate (user)
    'equity_risk_premium', // ERP (user)
    'beta', // Beta (user)
    'cost_of_debt', // Or debt_rate (user)
    'tax_rate_assumption', // Or tax_rate_effective (user/historical)
    // Terminal value
    'terminal_growth', // OR exit_multiple (user)
  ],
  optional: [
    'ebit', // Can be derived from EBITDA - D&A if EBITDA exists
    'exit_multiple', // Alternative to terminal_growth
    'da', // D&A (reported or policy)
    'capex', // Capex (reported or policy)
    'nwc', // NWC (reported or policy)
    'delta_nwc', // ΔNWC (reported or policy)
    'fcf_unlevered', // Can be derived
    'enterprise_value',
    'net_debt',
    'shares_out_basic',
    'implied_price',
  ],
  assumptions: [
    // Policy-based assumptions (user/historical)
    'da_percent_revenue', // If D&A not reported
    'capex_percent_revenue', // If Capex not reported
    'nwc_percent_revenue', // If NWC not reported
    // WACC inputs (must be user-provided if missing)
    'rf_rate',
    'equity_risk_premium',
    'beta',
    'cost_of_debt',
    'tax_rate_assumption',
    'terminal_growth',
    'exit_multiple',
  ],
};

/**
 * 3-Statement Model Requirements
 */
export const THREE_STATEMENT_REQUIREMENTS: ModelRequirements = {
  modelType: 'three_statement',
  required: [
    // Base year statements (at least one of revenue, EBITDA, net income)
    'revenue', // Base year
    'ebitda', // OR user seed values
    'net_income', // Base year
    'cash', // Base year
    'total_debt', // Base year
  ],
  optional: [
    'ebit',
    'da',
    'interest_expense',
    'tax_expense',
    'cfo',
    'capex',
    'nwc',
    'fcf_levered',
  ],
  assumptions: [
    // Driver assumptions (user/historical)
    'da_percent_revenue', // If D&A not reported
    'capex_percent_revenue', // If Capex not reported
    'nwc_percent_revenue', // If NWC not reported
    'tax_rate_assumption', // Tax rate (user/historical)
    // Growth and margin assumptions (user)
    // Note: These are typically model-specific and not in canonical keys
    // but would be: revenue_growth, ebitda_margin, etc.
  ],
};

/**
 * LBO Model Requirements
 */
export const LBO_REQUIREMENTS: ModelRequirements = {
  modelType: 'lbo',
  required: [
    // Entry assumptions
    'ebitda', // LTM EBITDA
    'entry_multiple', // Entry EV/EBITDA
    'transaction_fees_percent', // % of entry EV
    // Financing
    'debt_percent',
    'equity_percent',
    'interest_rate',
    'amortization_percent',
    'cash_sweep_percent',
    // Operating assumptions
    'revenue_growth',
    'ebitda_margin',
    'capex_pct_revenue',
    'delta_nwc_pct_revenue',
    'tax_rate',
    // Exit
    'exit_multiple',
    'exit_fees_percent',
    'holding_period_years',
  ],
  optional: [
    'revenue', // For operating forecast
    'ebit',
    'net_income',
    'cash',
    'total_debt',
    'net_debt',
    'capex',
    'da',
    'nwc',
    'delta_nwc',
  ],
  assumptions: [
    // Operating forecast drivers (user/historical)
    'revenue_growth',
    'ebitda_margin',
    'capex_pct_revenue',
    'delta_nwc_pct_revenue',
    'tax_rate',
    // Deal assumptions (user)
    'entry_multiple',
    'transaction_fees_percent',
    'debt_percent',
    'equity_percent',
    'interest_rate',
    'amortization_percent',
    'cash_sweep_percent',
    'exit_multiple',
    'exit_fees_percent',
    'holding_period_years',
  ],
};

/**
 * M&A Model Requirements
 */
export const MERGER_REQUIREMENTS: ModelRequirements = {
  modelType: 'merger',
  required: [
    // Acquirer financials
    'revenue', // Acquirer TTM/FY
    'ebitda', // Acquirer TTM/FY
    'net_income', // Acquirer TTM/FY
    'shares_out_basic', // Acquirer
    // Target financials
    // Note: These would be prefixed (target_revenue, etc.) in practice
    // For now, we assume they're in the same state with different keys
    'revenue', // Target TTM/FY (would be target_revenue)
    'ebitda', // Target TTM/FY
    'net_income', // Target TTM/FY
    // Deal terms
    'enterprise_value', // Deal value (user)
  ],
  optional: [
    'cash',
    'total_debt',
    'net_debt',
    'interest_expense',
    'tax_expense',
    'ebit',
    'da',
  ],
  assumptions: [
    // Financing mix (user)
    // Note: These would be: cash_pct, stock_pct, debt_pct
    'debt_rate', // Interest rate on new debt (user)
    'tax_rate_assumption', // Tax rate (user/historical)
    // Synergies (optional, user-entered only)
    // Integration costs (optional, user-entered)
  ],
};

/**
 * Get requirements for a specific model type
 */
export function getModelRequirements(
  modelType: ModelRequirements['modelType']
): ModelRequirements {
  switch (modelType) {
    case 'comps':
      return COMPS_REQUIREMENTS;
    case 'dcf':
      return DCF_REQUIREMENTS;
    case 'three_statement':
      return THREE_STATEMENT_REQUIREMENTS;
    case 'lbo':
      return LBO_REQUIREMENTS;
    case 'merger':
      return MERGER_REQUIREMENTS;
    default:
      throw new Error(`Unknown model type: ${modelType}`);
  }
}

/**
 * Check which required keys are missing for a model
 */
export function getMissingRequiredKeys(
  modelType: ModelRequirements['modelType'],
  state: Partial<Record<FinancialKey, { value: number | null }>>
): FinancialKey[] {
  const requirements = getModelRequirements(modelType);
  const missing: FinancialKey[] = [];
  
  for (const key of requirements.required) {
    const entry = state[key];
    if (!entry || entry.value === null || entry.value === undefined) {
      missing.push(key);
    }
  }
  
  return missing;
}

/**
 * Check which assumption keys are missing for a model
 */
export function getMissingAssumptionKeys(
  modelType: ModelRequirements['modelType'],
  state: Partial<Record<FinancialKey, { value: number | null }>>
): FinancialKey[] {
  const requirements = getModelRequirements(modelType);
  const missing: FinancialKey[] = [];
  
  for (const key of requirements.assumptions) {
    const entry = state[key];
    if (!entry || entry.value === null || entry.value === undefined) {
      missing.push(key);
    }
  }
  
  return missing;
}
