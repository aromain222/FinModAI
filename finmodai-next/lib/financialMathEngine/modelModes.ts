/**
 * CapitalBase Financial Math Engine
 * Model-Specific Minimum Inputs (MVP vs Full Output Modes)
 * 
 * Defines MVP and Full output modes for each model type
 */

import type { FinancialKey, ModelRequirements } from './types';
import {
  COMPS_REQUIREMENTS,
  DCF_REQUIREMENTS,
  THREE_STATEMENT_REQUIREMENTS,
  LBO_REQUIREMENTS,
  MERGER_REQUIREMENTS,
} from './modelRequirements';

export type OutputMode = 'mvp' | 'full';

export interface ModelModeRequirements {
  mvp: {
    required: FinancialKey[];
    optional: FinancialKey[];
    suppressed: string[]; // What outputs are suppressed in MVP mode
    notes: string;
  };
  full: {
    required: FinancialKey[];
    optional: FinancialKey[];
    notes: string;
  };
}

/**
 * Trading Comps Model Modes
 */
export const COMPS_MODES: ModelModeRequirements = {
  mvp: {
    required: [
      // At least one of price or market_cap
      'price', // OR market_cap
      'revenue', // TTM for EV/Rev
      'ebitda', // TTM for EV/EBITDA (at least one multiple denominator)
    ],
    optional: [
      'market_cap',
      'shares_out_basic',
      'cash',
      'total_debt',
      'net_debt',
      'enterprise_value',
      'net_income', // For P/E
      'ev_to_ebitda',
      'ev_to_revenue',
      'pe',
    ],
    suppressed: [
      'P/E multiple (if net_income missing or <= 0)',
      'EV/EBITDA multiple (if EBITDA missing)',
      'EV/Revenue multiple (if revenue missing)',
      'Per-share outputs (if shares missing)',
      'Summary statistics for missing multiples',
    ],
    notes:
      'MVP mode shows table with available comps and medians only where denominators exist. Missing multiples are suppressed with notes.',
  },
  full: {
    required: [
      'price', // OR market_cap
      'revenue',
      'ebitda',
      'net_income',
      'shares_out_basic', // For per-share outputs
      'cash',
      'total_debt',
      'net_debt',
      'enterprise_value',
    ],
    optional: [
      'ev_to_ebitda',
      'ev_to_revenue',
      'pe',
      'implied_price',
    ],
    notes:
      'Full mode includes all multiples, per-share outputs, summary statistics, and sensitivity analysis.',
  },
};

/**
 * DCF Model Modes
 */
export const DCF_MODES: ModelModeRequirements = {
  mvp: {
    required: [
      'revenue', // Historical or projection seed
      'ebitda', // OR EBIT + D&A
      'ebit', // For NOPAT
      // WACC components (minimal set)
      'rf_rate',
      'equity_risk_premium',
      'beta',
      'cost_of_debt',
      'tax_rate_assumption', // OR tax_rate_effective
      // Terminal value (one method)
      'terminal_growth', // OR exit_multiple
    ],
    optional: [
      'exit_multiple', // Alternative to terminal_growth
      'da',
      'capex',
      'nwc',
      'delta_nwc',
      'fcf_unlevered',
      'enterprise_value',
      'net_debt',
      'shares_out_basic',
      'implied_price',
    ],
    suppressed: [
      'Per-share outputs (if shares missing)',
      'Exit multiple sensitivity (if exit_multiple not provided)',
      'Detailed WACC breakdown (if capital structure weights missing)',
      'Policy-based components labeled as assumption-driven',
    ],
    notes:
      'MVP mode produces EV-only output. Per-share outputs suppressed if shares missing. Policy-based components clearly labeled.',
  },
  full: {
    required: [
      'revenue',
      'ebitda',
      'ebit',
      'rf_rate',
      'equity_risk_premium',
      'beta',
      'cost_of_debt',
      'tax_rate_assumption',
      'terminal_growth',
      'shares_out_basic', // For per-share outputs
      'net_debt',
    ],
    optional: [
      'exit_multiple', // For exit multiple method
      'da',
      'capex',
      'nwc',
      'delta_nwc',
      'fcf_unlevered',
      'enterprise_value',
      'implied_price',
    ],
    notes:
      'Full mode includes per-share outputs, both terminal value methods, sensitivities, and detailed WACC breakdown.',
  },
};

/**
 * 3-Statement Model Modes
 */
export const THREE_STATEMENT_MODES: ModelModeRequirements = {
  mvp: {
    required: [
      // Base year (at least revenue)
      'revenue', // Base year
      // Driver assumptions (user/historical)
      'da_percent_revenue', // OR da (reported)
      'capex_percent_revenue', // OR capex (reported)
      'nwc_percent_revenue', // OR nwc (reported)
      'tax_rate_assumption', // OR tax_rate_effective
    ],
    optional: [
      'ebitda',
      'ebit',
      'net_income',
      'cash',
      'total_debt',
      'interest_expense',
      'tax_expense',
      'cfo',
      'capex',
      'da',
      'nwc',
      'fcf_levered',
    ],
    suppressed: [
      'Full balance sheet reconciliation (if components missing)',
      'Cash flow statement (if CFO missing)',
      'Detailed supporting schedules (if components missing)',
    ],
    notes:
      'MVP mode allows simple driver model with growth and margin assumptions. All assumption-driven values clearly labeled. Balance sheet may not fully balance if components missing.',
  },
  full: {
    required: [
      'revenue',
      'ebitda',
      'net_income',
      'cash',
      'total_debt',
      'interest_expense',
      'tax_expense',
      'cfo',
      'capex',
      'da',
      'nwc',
    ],
    optional: [
      'ebit',
      'fcf_levered',
      'delta_nwc',
    ],
    notes:
      'Full mode includes complete 3-statement model with balance sheet reconciliation, cash flow statement, and supporting schedules. All statements must balance.',
  },
};

/**
 * LBO Model Modes
 */
export const LBO_MODES: ModelModeRequirements = {
  mvp: {
    required: [
      'ebitda', // LTM EBITDA
      'enterprise_value', // OR purchase multiple (user)
      'debt_rate',
      'leverage_multiple', // Debt/EBITDA
      'exit_multiple', // Exit EV/EBITDA
      'holding_period_years',
    ],
    optional: [
      'revenue',
      'ebit',
      'net_income',
      'cash',
      'total_debt',
      'net_debt',
      'capex',
      'da',
      'nwc',
      'delta_nwc',
      'shares_out_basic',
      'implied_price',
    ],
    suppressed: [
      'Per-share outputs (if shares missing)',
      'Detailed debt schedule (if debt components missing)',
      'Operating forecast (if revenue/margins missing)',
    ],
    notes:
      'MVP mode produces returns (IRR/MOIC) and basic debt schedule. Per-share outputs suppressed if shares missing. Operating forecast simplified if drivers missing.',
  },
  full: {
    required: [
      'ebitda',
      'enterprise_value',
      'debt_rate',
      'leverage_multiple',
      'exit_multiple',
      'holding_period_years',
      'revenue', // For operating forecast
      'ebitda', // For margin assumptions
    ],
    optional: [
      'ebit',
      'net_income',
      'cash',
      'total_debt',
      'net_debt',
      'capex',
      'da',
      'nwc',
      'delta_nwc',
      'shares_out_basic',
      'implied_price',
    ],
    notes:
      'Full mode includes complete operating forecast, detailed debt schedule, per-share outputs, and comprehensive sensitivities.',
  },
};

/**
 * M&A Model Modes
 */
export const MERGER_MODES: ModelModeRequirements = {
  mvp: {
    required: [
      // Acquirer (at minimum)
      'revenue', // Acquirer TTM/FY
      'ebitda', // Acquirer TTM/FY
      'net_income', // Acquirer TTM/FY
      'shares_out_basic', // Acquirer
      // Target (at minimum)
      // Note: In practice, these would be prefixed (target_revenue, etc.)
      'revenue', // Target TTM/FY
      'ebitda', // Target TTM/FY
      'net_income', // Target TTM/FY
      // Deal terms
      'enterprise_value', // Deal value
    ],
    optional: [
      'cash',
      'total_debt',
      'net_debt',
      'interest_expense',
      'tax_expense',
      'ebit',
      'da',
      'debt_rate',
      'tax_rate_assumption',
    ],
    suppressed: [
      'Synergies (if not user-provided)',
      'Integration costs (if not user-provided)',
      'Detailed pro forma adjustments (if components missing)',
    ],
    notes:
      'MVP mode produces basic accretion/dilution analysis. Synergies and integration costs only included if user-provided. Pro forma simplified if components missing.',
  },
  full: {
    required: [
      'revenue', // Acquirer
      'ebitda', // Acquirer
      'net_income', // Acquirer
      'shares_out_basic', // Acquirer
      'revenue', // Target
      'ebitda', // Target
      'net_income', // Target
      'enterprise_value', // Deal value
      'debt_rate',
      'tax_rate_assumption',
    ],
    optional: [
      'cash',
      'total_debt',
      'net_debt',
      'interest_expense',
      'tax_expense',
      'ebit',
      'da',
      // Synergies (optional, user-entered only)
      // Integration costs (optional, user-entered)
    ],
    notes:
      'Full mode includes complete pro forma income statement, synergies (if provided), integration costs (if provided), and comprehensive sensitivities.',
  },
};

/**
 * Get mode requirements for a model type
 */
export function getModelModeRequirements(
  modelType: ModelRequirements['modelType'],
  mode: OutputMode
): ModelModeRequirements['mvp'] | ModelModeRequirements['full'] {
  let modes: ModelModeRequirements;
  
  switch (modelType) {
    case 'comps':
      modes = COMPS_MODES;
      break;
    case 'dcf':
      modes = DCF_MODES;
      break;
    case 'three_statement':
      modes = THREE_STATEMENT_MODES;
      break;
    case 'lbo':
      modes = LBO_MODES;
      break;
    case 'merger':
      modes = MERGER_MODES;
      break;
    default:
      throw new Error(`Unknown model type: ${modelType}`);
  }
  
  return mode === 'mvp' ? modes.mvp : modes.full;
}

/**
 * Check if model can run in MVP mode with given inputs
 */
export function canRunMVP(
  modelType: ModelRequirements['modelType'],
  state: Partial<Record<FinancialKey, { value: number | null }>>
): { canRun: boolean; missing: FinancialKey[] } {
  const mvpReqs = getModelModeRequirements(modelType, 'mvp');
  const missing: FinancialKey[] = [];
  
  for (const key of mvpReqs.required) {
    const entry = state[key];
    if (!entry || entry.value === null || entry.value === undefined) {
      missing.push(key);
    }
  }
  
  return {
    canRun: missing.length === 0,
    missing,
  };
}

/**
 * Check if model can run in Full mode with given inputs
 */
export function canRunFull(
  modelType: ModelRequirements['modelType'],
  state: Partial<Record<FinancialKey, { value: number | null }>>
): { canRun: boolean; missing: FinancialKey[] } {
  const fullReqs = getModelModeRequirements(modelType, 'full');
  const missing: FinancialKey[] = [];
  
  for (const key of fullReqs.required) {
    const entry = state[key];
    if (!entry || entry.value === null || entry.value === undefined) {
      missing.push(key);
    }
  }
  
  return {
    canRun: missing.length === 0,
    missing,
  };
}
