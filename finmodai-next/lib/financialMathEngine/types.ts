/**
 * CapitalBase Financial Math Engine
 * Canonical Data Dictionary and Provenance Tracking
 */

/**
 * Canonical financial data keys
 * These are the standard keys used across all models to avoid API naming mismatches
 */
export type FinancialKey =
  // Market
  | 'price'
  | 'market_cap'
  | 'shares_out_basic'
  | 'shares_out_diluted'
  // Capital structure
  | 'cash'
  | 'total_debt'
  | 'short_term_debt'
  | 'long_term_debt'
  | 'net_debt'
  | 'enterprise_value'
  // Income statement (TTM or FY)
  | 'revenue'
  | 'gross_profit'
  | 'ebitda'
  | 'da'
  | 'ebit'
  | 'interest_expense'
  | 'pre_tax_income'
  | 'tax_expense'
  | 'net_income'
  // Cash flow (TTM or FY)
  | 'cfo'
  | 'capex'
  | 'cfi'
  | 'cff'
  | 'fcf_levered'
  | 'fcf_unlevered'
  // Working capital
  | 'nwc'
  | 'nwc_percent_revenue'
  | 'delta_nwc'
  // Multiples
  | 'ev_to_ebitda'
  | 'ev_to_revenue'
  | 'pe'
  // Deal / modeling assumptions (must be user-provided if needed)
  | 'rf_rate'
  | 'equity_risk_premium'
  | 'beta'
  | 'cost_of_debt'
  | 'tax_rate_assumption'
  | 'tax_rate_effective'
  | 'terminal_growth'
  | 'exit_multiple'
  | 'entry_multiple'
  | 'leverage_multiple'
  | 'debt_rate'
  | 'interest_rate'
  | 'debt_percent'
  | 'equity_percent'
  | 'amortization_percent'
  | 'cash_sweep_percent'
  | 'transaction_fees_percent'
  | 'exit_fees_percent'
  | 'revenue_growth'
  | 'ebitda_margin'
  | 'capex_pct_revenue'
  | 'delta_nwc_pct_revenue'
  | 'tax_rate'
  | 'holding_period_years'
  // Policy-based assumptions
  | 'da_percent_revenue'
  | 'capex_percent_revenue'
  | 'nwc_percent_revenue'
  // Implied values
  | 'implied_price';

/**
 * Provenance status for each financial datapoint
 */
export type ProvenanceStatus =
  | 'reported' // From API or data provider
  | 'derived' // Computed from accounting identity or math
  | 'derived_from_assumption' // Computed using user/historical assumption
  | 'user_provided' // Explicitly provided by user
  | 'ai_parse' // Parsed from user-pasted text
  | 'missing'; // Cannot be determined

/**
 * Confidence level for derived values
 */
export type ConfidenceLevel = 'high' | 'medium' | 'low';

/**
 * Financial value with full provenance tracking
 */
export interface FinancialValue {
  value: number | null; // Never coerced to 0 if null
  status: ProvenanceStatus;
  method?: string; // Explanation of how value was obtained
  inputs_used?: FinancialKey[]; // Keys used in derivation
  as_of?: string; // Date (ISO format) if known
  confidence?: ConfidenceLevel;
  warnings?: string[]; // Array of warnings
  source?: string; // API source name if reported
}

/**
 * Complete financial state (all keys with values)
 */
export type FinancialState = Partial<Record<FinancialKey, FinancialValue>>;

/**
 * Rule definition for deriving missing values
 */
export interface DerivationRule {
  id: string;
  name: string;
  outputKey: FinancialKey;
  requiredInputs: FinancialKey[];
  optionalInputs?: FinancialKey[];
  derive: (inputs: Partial<Record<FinancialKey, FinancialValue>>) => FinancialValue | null;
  validate?: (value: number, inputs: Partial<Record<FinancialKey, FinancialValue>>) => {
    isValid: boolean;
    warnings?: string[];
  };
  confidence: ConfidenceLevel;
  category: 'accounting_identity' | 'math_derivation' | 'policy_based' | 'multiple';
}

/**
 * Resolved state after applying all derivation rules
 */
export interface ResolvedState {
  resolved: FinancialState;
  missing: {
    required: FinancialKey[];
    optional: FinancialKey[];
  };
  warnings: string[];
  appliedRules: string[]; // Rule IDs that were applied
  cannotDerive: FinancialKey[]; // Keys that couldn't be derived
}

/**
 * Model-specific required keys
 */
export interface ModelRequirements {
  modelType: 'comps' | 'dcf' | 'three_statement' | 'lbo' | 'merger';
  required: FinancialKey[];
  optional: FinancialKey[];
  assumptions: FinancialKey[]; // Keys that must be user-provided if missing
}
