/**
 * CapitalBase Financial Math Engine
 * Explicit Suppression Rules
 * 
 * Documents what outputs are suppressed when inputs are missing
 */

import type { FinancialKey } from './types';

export interface SuppressionRule {
  outputKey: FinancialKey | string; // Can be a computed output like "per_share_outputs"
  condition: string; // When to suppress
  suppressionNote: string; // What to show to user
  requiredInputs: FinancialKey[]; // What inputs are needed
}

/**
 * All suppression rules
 */
export const SUPPRESSION_RULES: SuppressionRule[] = [
  // ============================================
  // MULTIPLES SUPPRESSION
  // ============================================
  {
    outputKey: 'ev_to_ebitda',
    condition: 'ebitda missing or <= 0',
    suppressionNote: 'EV/EBITDA not calculated (EBITDA missing or negative)',
    requiredInputs: ['enterprise_value', 'ebitda'],
  },
  {
    outputKey: 'ev_to_revenue',
    condition: 'revenue missing or <= 0',
    suppressionNote: 'EV/Revenue not calculated (Revenue missing or negative)',
    requiredInputs: ['enterprise_value', 'revenue'],
  },
  {
    outputKey: 'pe',
    condition: 'net_income missing or <= 0',
    suppressionNote: 'P/E not calculated (Net Income missing or negative)',
    requiredInputs: ['market_cap', 'net_income'],
  },

  // ============================================
  // PER-SHARE OUTPUTS SUPPRESSION
  // ============================================
  {
    outputKey: 'implied_price',
    condition: 'shares_out_basic missing or <= 0',
    suppressionNote: 'Per-share outputs not available (Shares outstanding missing)',
    requiredInputs: ['enterprise_value', 'net_debt', 'shares_out_basic'],
  },
  {
    outputKey: 'eps',
    condition: 'shares_out_basic missing or <= 0',
    suppressionNote: 'EPS not calculated (Shares outstanding missing)',
    requiredInputs: ['net_income', 'shares_out_basic'],
  },
  {
    outputKey: 'per_share_outputs',
    condition: 'shares_out_basic missing or <= 0',
    suppressionNote: 'All per-share outputs suppressed (Shares outstanding missing)',
    requiredInputs: ['shares_out_basic'],
  },

  // ============================================
  // TAX RATE SUPPRESSION
  // ============================================
  {
    outputKey: 'tax_rate_effective',
    condition: 'pre_tax_income <= 0',
    suppressionNote: 'Tax rate not calculated (Pre-tax income negative or zero)',
    requiredInputs: ['tax_expense', 'pre_tax_income'],
  },

  // ============================================
  // TERMINAL VALUE SUPPRESSION
  // ============================================
  {
    outputKey: 'terminal_value_exit_multiple',
    condition: 'exit_multiple not provided',
    suppressionNote: 'Exit multiple method not used (Exit multiple not provided)',
    requiredInputs: ['exit_multiple', 'ebitda'],
  },
  {
    outputKey: 'terminal_value_growth',
    condition: 'terminal_growth not provided',
    suppressionNote: 'Terminal growth method not used (Terminal growth not provided)',
    requiredInputs: ['terminal_growth', 'fcf_unlevered'],
  },

  // ============================================
  // WACC SUPPRESSION
  // ============================================
  {
    outputKey: 'wacc',
    condition: 'any required component missing (rf_rate, equity_risk_premium, beta, cost_of_debt, tax_rate)',
    suppressionNote: 'WACC not calculated (Missing required inputs)',
    requiredInputs: ['rf_rate', 'equity_risk_premium', 'beta', 'cost_of_debt', 'tax_rate_assumption'],
  },

  // ============================================
  // FCF SUPPRESSION
  // ============================================
  {
    outputKey: 'fcf_unlevered',
    condition: 'any required component missing (ebit, tax_rate, da, capex, delta_nwc)',
    suppressionNote: 'Unlevered FCF not calculated (Missing required inputs)',
    requiredInputs: ['ebit', 'tax_rate_effective', 'da', 'capex', 'delta_nwc'],
  },
  {
    outputKey: 'fcf_levered',
    condition: 'cfo or capex missing',
    suppressionNote: 'Levered FCF not calculated (CFO or Capex missing)',
    requiredInputs: ['cfo', 'capex'],
  },

  // ============================================
  // SUMMARY STATISTICS SUPPRESSION
  // ============================================
  {
    outputKey: 'median_multiple',
    condition: '< 3 comps available',
    suppressionNote: 'Median not calculated (Insufficient data: < 3 companies)',
    requiredInputs: [], // N/A - depends on comps count
  },
  {
    outputKey: 'mean_multiple',
    condition: '< 2 comps available',
    suppressionNote: 'Mean not calculated (Insufficient data: < 2 companies)',
    requiredInputs: [], // N/A - depends on comps count
  },

  // ============================================
  // MODEL-SPECIFIC SUPPRESSION
  // ============================================
  {
    outputKey: 'dcf_per_share_outputs',
    condition: 'shares_out_basic missing or <= 0',
    suppressionNote: 'DCF per-share outputs suppressed (Shares outstanding missing)',
    requiredInputs: ['shares_out_basic'],
  },
  {
    outputKey: 'lbo_per_share_outputs',
    condition: 'shares_out_basic missing or <= 0',
    suppressionNote: 'LBO per-share outputs suppressed (Shares outstanding missing)',
    requiredInputs: ['shares_out_basic'],
  },
  {
    outputKey: 'merger_per_share_outputs',
    condition: 'shares_out_basic missing or <= 0',
    suppressionNote: 'M&A per-share outputs suppressed (Shares outstanding missing)',
    requiredInputs: ['shares_out_basic'],
  },
  {
    outputKey: 'dcf_sensitivities',
    condition: 'exit_multiple not provided (for exit multiple sensitivity)',
    suppressionNote: 'Exit multiple sensitivity not shown (Exit multiple not provided)',
    requiredInputs: ['exit_multiple'],
  },
  {
    outputKey: 'comps_summary_statistics',
    condition: 'insufficient comps or missing denominators',
    suppressionNote: 'Summary statistics suppressed (Insufficient data or missing denominators)',
    requiredInputs: [], // N/A - depends on data quality
  },
];

/**
 * Check if an output should be suppressed
 */
export function shouldSuppress(
  outputKey: FinancialKey | string,
  state: Partial<Record<FinancialKey, { value: number | null }>>
): { suppress: boolean; note?: string } {
  const rule = SUPPRESSION_RULES.find(r => r.outputKey === outputKey);
  
  if (!rule) {
    return { suppress: false };
  }
  
  // Check if required inputs are missing or invalid
  const missingInputs = rule.requiredInputs.filter(
    key => {
      const entry = state[key];
      return !entry || entry.value === null || entry.value === undefined || entry.value <= 0;
    }
  );
  
  if (missingInputs.length > 0) {
    return {
      suppress: true,
      note: rule.suppressionNote,
    };
  }
  
  // Special cases
  if (outputKey === 'tax_rate_effective') {
    const preTaxIncome = state['pre_tax_income']?.value;
    if (preTaxIncome === null || preTaxIncome === undefined || preTaxIncome <= 0) {
      return {
        suppress: true,
        note: rule.suppressionNote,
      };
    }
  }
  
  if (outputKey === 'pe') {
    const netIncome = state['net_income']?.value;
    if (netIncome === null || netIncome === undefined || netIncome <= 0) {
      return {
        suppress: true,
        note: rule.suppressionNote,
      };
    }
  }
  
  if (outputKey === 'ev_to_ebitda') {
    const ebitda = state['ebitda']?.value;
    if (ebitda === null || ebitda === undefined || ebitda <= 0) {
      return {
        suppress: true,
        note: rule.suppressionNote,
      };
    }
  }
  
  if (outputKey === 'ev_to_revenue') {
    const revenue = state['revenue']?.value;
    if (revenue === null || revenue === undefined || revenue <= 0) {
      return {
        suppress: true,
        note: rule.suppressionNote,
      };
    }
  }
  
  if (outputKey === 'implied_price' || outputKey === 'eps' || outputKey === 'per_share_outputs') {
    const shares = state['shares_out_basic']?.value;
    if (shares === null || shares === undefined || shares <= 0) {
      return {
        suppress: true,
        note: rule.suppressionNote,
      };
    }
  }
  
  return { suppress: false };
}

/**
 * Get all suppressed outputs for a state
 */
export function getSuppressedOutputs(
  state: Partial<Record<FinancialKey, { value: number | null }>>
): Array<{ key: string; note: string }> {
  const suppressed: Array<{ key: string; note: string }> = [];
  
  for (const rule of SUPPRESSION_RULES) {
    const check = shouldSuppress(rule.outputKey, state);
    if (check.suppress && check.note) {
      suppressed.push({
        key: rule.outputKey,
        note: check.note,
      });
    }
  }
  
  return suppressed;
}

/**
 * Get suppression note for a specific output
 */
export function getSuppressionNote(
  outputKey: FinancialKey | string
): string | null {
  const rule = SUPPRESSION_RULES.find(r => r.outputKey === outputKey);
  return rule?.suppressionNote || null;
}
