/**
 * CapitalBase Financial Math Engine
 * Missing Data Map
 * 
 * Comprehensive categorization of all datapoints that may be missing from APIs
 * and how they can be derived or obtained
 */

import type { FinancialKey, ConfidenceLevel } from './types';

export type DerivationCategory =
  | 'derivable_hard_identity' // Always computable if inputs exist (accounting identity)
  | 'derivable_assumption_dependent' // Computable only if user/historical policy provided
  | 'not_derivable_user_choice' // Cannot be computed honestly - requires user input
  | 'parseable_ai_parse'; // Can be obtained if user pastes text/table

export interface MissingDataPoint {
  canonicalKey: FinancialKey;
  description: string;
  category: DerivationCategory;
  allowedDerivations: {
    formula: string;
    requiredInputs: FinancialKey[];
    optionalInputs?: FinancialKey[];
    validityChecks: string[];
    confidence: ConfidenceLevel;
    fallbacks?: string[]; // e.g., "ask user", "use historical ratio"
  }[];
  notes?: string;
}

/**
 * Complete Missing Data Map
 * Every datapoint that may be missing from APIs
 */
export const MISSING_DATA_MAP: MissingDataPoint[] = [
  // ============================================
  // MARKET DATA
  // ============================================
  {
    canonicalKey: 'shares_out_basic',
    description: 'Shares Outstanding (Basic)',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'shares_out_basic = market_cap / price',
        requiredInputs: ['market_cap', 'price'],
        validityChecks: [
          'market_cap > 0',
          'price > 0',
          'Same as_of date or trading day',
          'Implied shares in plausible bounds (1M - 100B)',
        ],
        confidence: 'medium',
        fallbacks: ['Ask user for shares outstanding'],
      },
    ],
    notes: 'Often missing from APIs. Can derive from market cap and price if both exist and are aligned.',
  },
  {
    canonicalKey: 'market_cap',
    description: 'Market Capitalization',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'market_cap = price * shares_out_basic',
        requiredInputs: ['price', 'shares_out_basic'],
        validityChecks: ['price > 0', 'shares_out_basic > 0'],
        confidence: 'high',
      },
    ],
    notes: 'Sometimes missing but easily derivable.',
  },
  {
    canonicalKey: 'price',
    description: 'Current Share Price',
    category: 'not_derivable_user_choice',
    allowedDerivations: [
      {
        formula: 'price = market_cap / shares_out_basic',
        requiredInputs: ['market_cap', 'shares_out_basic'],
        validityChecks: ['market_cap > 0', 'shares_out_basic > 0'],
        confidence: 'medium',
        fallbacks: ['Ask user for current price'],
      },
    ],
    notes: 'Can derive if market cap and shares exist, but price is usually reported.',
  },

  // ============================================
  // CAPITAL STRUCTURE
  // ============================================
  {
    canonicalKey: 'net_debt',
    description: 'Net Debt',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'net_debt = total_debt - cash',
        requiredInputs: ['total_debt', 'cash'],
        validityChecks: [
          'total_debt >= 0',
          'cash >= 0',
          'Can be negative (cash > debt)',
        ],
        confidence: 'high',
      },
    ],
  },
  {
    canonicalKey: 'enterprise_value',
    description: 'Enterprise Value',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'enterprise_value = market_cap + net_debt',
        requiredInputs: ['market_cap', 'net_debt'],
        validityChecks: ['market_cap > 0'],
        confidence: 'high',
        fallbacks: [
          'If market_cap missing, derive from price * shares',
          'If net_debt missing, derive from total_debt - cash',
        ],
      },
    ],
    notes: 'High confidence if both inputs reported; medium if one is derived.',
  },
  {
    canonicalKey: 'total_debt',
    description: 'Total Debt',
    category: 'not_derivable_user_choice',
    allowedDerivations: [
      {
        formula: 'total_debt = short_term_debt + long_term_debt',
        requiredInputs: ['short_term_debt', 'long_term_debt'],
        validityChecks: ['Both components >= 0'],
        confidence: 'high',
        fallbacks: ['Ask user for total debt'],
      },
    ],
    notes: 'Can derive from components if both exist, but usually reported.',
  },

  // ============================================
  // INCOME STATEMENT
  // ============================================
  {
    canonicalKey: 'pre_tax_income',
    description: 'Pre-tax Income',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'pre_tax_income = net_income + tax_expense',
        requiredInputs: ['net_income', 'tax_expense'],
        validityChecks: [
          'Can be negative (loss)',
          'Both values exist (can be negative)',
        ],
        confidence: 'medium',
      },
    ],
  },
  {
    canonicalKey: 'tax_rate_effective',
    description: 'Effective Tax Rate',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'tax_rate_effective = tax_expense / pre_tax_income',
        requiredInputs: ['tax_expense', 'pre_tax_income'],
        validityChecks: [
          'pre_tax_income > 0 (cannot compute if loss)',
          'Rate typically 0% - 40% (warn if outside)',
        ],
        confidence: 'medium',
        fallbacks: ['Ask user for tax rate assumption'],
      },
    ],
    notes: 'Cannot derive if pre-tax income is negative.',
  },
  {
    canonicalKey: 'ebitda',
    description: 'EBITDA',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'ebitda = ebit + da',
        requiredInputs: ['ebit', 'da'],
        validityChecks: ['Both values exist'],
        confidence: 'medium',
      },
    ],
    notes: 'Can derive if EBIT and D&A are reported.',
  },
  {
    canonicalKey: 'ebit',
    description: 'EBIT (Operating Income)',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'ebit = ebitda - da',
        requiredInputs: ['ebitda', 'da'],
        validityChecks: ['Both values exist'],
        confidence: 'medium',
      },
    ],
  },
  {
    canonicalKey: 'da',
    description: 'Depreciation & Amortization',
    category: 'derivable_assumption_dependent',
    allowedDerivations: [
      {
        formula: 'da = da_percent_revenue * revenue',
        requiredInputs: ['da_percent_revenue', 'revenue'],
        validityChecks: [
          'da_percent_revenue between 0% and 30%',
          'revenue > 0',
        ],
        confidence: 'low',
        fallbacks: [
          'Ask user for D&A % of revenue',
          'Use historical D&A % if available',
        ],
      },
    ],
    notes: 'Policy-based derivation. Status: derived_from_assumption.',
  },
  {
    canonicalKey: 'interest_expense',
    description: 'Interest Expense',
    category: 'derivable_assumption_dependent',
    allowedDerivations: [
      {
        formula: 'interest_expense = total_debt * debt_rate',
        requiredInputs: ['total_debt', 'debt_rate'],
        validityChecks: [
          'debt_rate between 0% and 25%',
          'total_debt >= 0',
        ],
        confidence: 'medium',
        fallbacks: ['Ask user for debt interest rate'],
      },
    ],
    notes: 'For LBO/M&A models. Requires user-provided debt rate.',
  },

  // ============================================
  // CASH FLOW
  // ============================================
  {
    canonicalKey: 'fcf_levered',
    description: 'Levered Free Cash Flow',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'fcf_levered = cfo - capex',
        requiredInputs: ['cfo', 'capex'],
        validityChecks: ['Both values exist'],
        confidence: 'high',
      },
    ],
    notes: 'Do NOT derive CFO from net income without full cash flow schedule.',
  },
  {
    canonicalKey: 'capex',
    description: 'Capital Expenditures',
    category: 'derivable_assumption_dependent',
    allowedDerivations: [
      {
        formula: 'capex = capex_percent_revenue * revenue',
        requiredInputs: ['capex_percent_revenue', 'revenue'],
        validityChecks: [
          'capex_percent_revenue between 0% and 50%',
          'revenue > 0',
        ],
        confidence: 'low',
        fallbacks: [
          'Ask user for Capex % of revenue',
          'Use historical Capex % if available',
        ],
      },
    ],
    notes: 'Policy-based derivation. Status: derived_from_assumption.',
  },
  {
    canonicalKey: 'fcf_unlevered',
    description: 'Unlevered Free Cash Flow (for DCF)',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'fcf_unlevered = nopat + da - capex - delta_nwc',
        requiredInputs: ['ebit', 'tax_rate_effective', 'da', 'capex', 'delta_nwc'],
        validityChecks: [
          'tax_rate_effective within plausible range (0% - 40%)',
          'All components exist (can be policy-based)',
        ],
        confidence: 'medium',
        fallbacks: [
          'If D&A policy-based, confidence = low',
          'If Capex policy-based, confidence = low',
          'If ΔNWC policy-based, confidence = low',
        ],
      },
    ],
    notes: 'Confidence depends on whether components are reported or policy-based.',
  },
  {
    canonicalKey: 'cfo',
    description: 'Cash Flow from Operations',
    category: 'not_derivable_user_choice',
    allowedDerivations: [],
    notes: 'Do NOT fabricate CFO from net income. Requires full cash flow statement.',
  },

  // ============================================
  // WORKING CAPITAL
  // ============================================
  {
    canonicalKey: 'nwc',
    description: 'Net Working Capital',
    category: 'derivable_assumption_dependent',
    allowedDerivations: [
      {
        formula: 'nwc = nwc_percent_revenue * revenue',
        requiredInputs: ['nwc_percent_revenue', 'revenue'],
        validityChecks: [
          'nwc_percent_revenue between -20% and +40%',
          'revenue > 0',
        ],
        confidence: 'low',
        fallbacks: [
          'Ask user for NWC % of revenue',
          'Use historical NWC % if available',
        ],
      },
    ],
    notes: 'Policy-based derivation. Status: derived_from_assumption.',
  },
  {
    canonicalKey: 'delta_nwc',
    description: 'Change in Net Working Capital',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'delta_nwc = nwc_t - nwc_{t-1}',
        requiredInputs: ['nwc'], // Requires time series
        validityChecks: ['Both periods exist'],
        confidence: 'medium',
        fallbacks: ['Requires historical NWC data'],
      },
    ],
    notes: 'Requires NWC for current and prior period.',
  },

  // ============================================
  // MULTIPLES
  // ============================================
  {
    canonicalKey: 'ev_to_ebitda',
    description: 'EV/EBITDA Multiple',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'ev_to_ebitda = enterprise_value / ebitda',
        requiredInputs: ['enterprise_value', 'ebitda'],
        validityChecks: ['ebitda > 0'],
        confidence: 'medium',
        fallbacks: ['Suppress if EBITDA missing or <= 0'],
      },
    ],
    notes: 'Confidence mirrors EV confidence. Suppress if denominator missing.',
  },
  {
    canonicalKey: 'ev_to_revenue',
    description: 'EV/Revenue Multiple',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'ev_to_revenue = enterprise_value / revenue',
        requiredInputs: ['enterprise_value', 'revenue'],
        validityChecks: ['revenue > 0'],
        confidence: 'medium',
        fallbacks: ['Suppress if revenue missing or <= 0'],
      },
    ],
  },
  {
    canonicalKey: 'pe',
    description: 'P/E Multiple',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'pe = market_cap / net_income',
        requiredInputs: ['market_cap', 'net_income'],
        validityChecks: ['net_income > 0'],
        confidence: 'medium',
        fallbacks: ['Suppress if net income <= 0 (negative NI)'],
      },
    ],
    notes: 'Leave blank with note "Negative NI" if net income <= 0.',
  },

  // ============================================
  // IMPLIED VALUES
  // ============================================
  {
    canonicalKey: 'implied_price',
    description: 'Implied Price per Share',
    category: 'derivable_hard_identity',
    allowedDerivations: [
      {
        formula: 'implied_price = (enterprise_value - net_debt) / shares_out_basic',
        requiredInputs: ['enterprise_value', 'net_debt', 'shares_out_basic'],
        validityChecks: ['shares_out_basic > 0'],
        confidence: 'medium',
        fallbacks: ['Suppress if shares missing'],
      },
    ],
    notes: 'For DCF/LBO models. Requires shares outstanding.',
  },

  // ============================================
  // ASSUMPTIONS (Not Derivable)
  // ============================================
  {
    canonicalKey: 'rf_rate',
    description: 'Risk-Free Rate',
    category: 'not_derivable_user_choice',
    allowedDerivations: [],
    notes: 'User must provide. Typically 10Y Treasury yield.',
  },
  {
    canonicalKey: 'equity_risk_premium',
    description: 'Equity Risk Premium',
    category: 'not_derivable_user_choice',
    allowedDerivations: [],
    notes: 'User must provide. Typically 5-7% for US markets.',
  },
  {
    canonicalKey: 'beta',
    description: 'Beta',
    category: 'not_derivable_user_choice',
    allowedDerivations: [],
    notes: 'User must provide. Cannot estimate without historical data.',
  },
  {
    canonicalKey: 'cost_of_debt',
    description: 'Cost of Debt',
    category: 'not_derivable_user_choice',
    allowedDerivations: [
      {
        formula: 'cost_of_debt = debt_rate (if provided)',
        requiredInputs: ['debt_rate'],
        validityChecks: ['debt_rate between 0% and 25%'],
        confidence: 'medium',
        fallbacks: ['Ask user for cost of debt'],
      },
    ],
    notes: 'Can use debt_rate if provided, otherwise user must provide.',
  },
  {
    canonicalKey: 'tax_rate_assumption',
    description: 'Tax Rate (Assumption)',
    category: 'not_derivable_user_choice',
    allowedDerivations: [
      {
        formula: 'tax_rate_assumption = tax_rate_effective (if available)',
        requiredInputs: ['tax_rate_effective'],
        validityChecks: ['tax_rate_effective between 0% and 40%'],
        confidence: 'medium',
        fallbacks: ['Ask user for tax rate assumption'],
      },
    ],
    notes: 'Can use effective tax rate if available, otherwise user must provide.',
  },
  {
    canonicalKey: 'terminal_growth',
    description: 'Terminal Growth Rate',
    category: 'not_derivable_user_choice',
    allowedDerivations: [],
    notes: 'User must provide. Typically 2-3% for mature companies.',
  },
  {
    canonicalKey: 'exit_multiple',
    description: 'Exit Multiple (EV/EBITDA)',
    category: 'not_derivable_user_choice',
    allowedDerivations: [],
    notes: 'User must provide for LBO/M&A models.',
  },
  {
    canonicalKey: 'leverage_multiple',
    description: 'Leverage Multiple (Debt/EBITDA)',
    category: 'not_derivable_user_choice',
    allowedDerivations: [],
    notes: 'User must provide for LBO models.',
  },
  {
    canonicalKey: 'debt_rate',
    description: 'Debt Interest Rate',
    category: 'not_derivable_user_choice',
    allowedDerivations: [],
    notes: 'User must provide for LBO/M&A models.',
  },
  {
    canonicalKey: 'holding_period_years',
    description: 'Holding Period (Years)',
    category: 'not_derivable_user_choice',
    allowedDerivations: [],
    notes: 'User must provide for LBO models.',
  },
];

/**
 * Get missing data point by canonical key
 */
export function getMissingDataPoint(key: FinancialKey): MissingDataPoint | undefined {
  return MISSING_DATA_MAP.find(point => point.canonicalKey === key);
}

/**
 * Get all missing data points by category
 */
export function getMissingDataPointsByCategory(
  category: DerivationCategory
): MissingDataPoint[] {
  return MISSING_DATA_MAP.filter(point => point.category === category);
}

/**
 * Get all derivable keys (hard identity or assumption-dependent)
 */
export function getDerivableKeys(): FinancialKey[] {
  return MISSING_DATA_MAP
    .filter(
      point =>
        point.category === 'derivable_hard_identity' ||
        point.category === 'derivable_assumption_dependent'
    )
    .map(point => point.canonicalKey);
}

/**
 * Get all non-derivable keys (require user input)
 */
export function getNonDerivableKeys(): FinancialKey[] {
  return MISSING_DATA_MAP.filter(
    point => point.category === 'not_derivable_user_choice'
  ).map(point => point.canonicalKey);
}
