/**
 * CapitalBase Financial Math Engine
 * Example Usage and Output Format
 * 
 * Demonstrates how to use the engine and shows example resolved outputs
 */

import type { FinancialKey, FinancialValue, FinancialState } from './types';
import { resolve, formatResolvedState } from './solver';
import { getModelRequirements, getMissingRequiredKeys, getMissingAssumptionKeys } from './modelRequirements';

/**
 * Example: Resolve financial state for a sample company
 */
export function exampleResolveCompany(): {
  input: Partial<Record<FinancialKey, FinancialValue>>;
  resolved: FinancialState;
  summary: string;
} {
  // Example input: Some reported values from API
  const input: Partial<Record<FinancialKey, FinancialValue>> = {
    price: {
      value: 150.50,
      status: 'reported',
      method: 'From market data API',
      source: 'FMP',
      confidence: 'high',
      as_of: '2024-01-15',
    },
    market_cap: {
      value: 150000000000, // $150B
      status: 'reported',
      method: 'From market data API',
      source: 'FMP',
      confidence: 'high',
      as_of: '2024-01-15',
    },
    revenue: {
      value: 50000000000, // $50B
      status: 'reported',
      method: 'From financial statements',
      source: 'SEC EDGAR',
      confidence: 'high',
      as_of: '2023-12-31',
    },
    ebitda: {
      value: 15000000000, // $15B
      status: 'reported',
      method: 'From financial statements',
      source: 'SEC EDGAR',
      confidence: 'high',
      as_of: '2023-12-31',
    },
    ebit: {
      value: 12000000000, // $12B
      status: 'reported',
      method: 'From financial statements',
      source: 'SEC EDGAR',
      confidence: 'high',
      as_of: '2023-12-31',
    },
    net_income: {
      value: 8000000000, // $8B
      status: 'reported',
      method: 'From financial statements',
      source: 'SEC EDGAR',
      confidence: 'high',
      as_of: '2023-12-31',
    },
    tax_expense: {
      value: 2000000000, // $2B
      status: 'reported',
      method: 'From financial statements',
      source: 'SEC EDGAR',
      confidence: 'high',
      as_of: '2023-12-31',
    },
    cash: {
      value: 10000000000, // $10B
      status: 'reported',
      method: 'From balance sheet',
      source: 'SEC EDGAR',
      confidence: 'high',
      as_of: '2023-12-31',
    },
    total_debt: {
      value: 50000000000, // $50B
      status: 'reported',
      method: 'From balance sheet',
      source: 'SEC EDGAR',
      confidence: 'high',
      as_of: '2023-12-31',
    },
    cfo: {
      value: 18000000000, // $18B
      status: 'reported',
      method: 'From cash flow statement',
      source: 'SEC EDGAR',
      confidence: 'high',
      as_of: '2023-12-31',
    },
    capex: {
      value: 5000000000, // $5B
      status: 'reported',
      method: 'From cash flow statement',
      source: 'SEC EDGAR',
      confidence: 'high',
      as_of: '2023-12-31',
    },
  };
  
  // Resolve missing values
  const resolvedState = resolve(input);
  
  // Format summary
  const summary = formatResolvedState(resolvedState.resolved);
  
  return {
    input,
    resolved: resolvedState.resolved,
    summary,
  };
}

/**
 * Example: Check missing inputs for DCF model
 */
export function exampleDCFMissingInputs(): {
  missingRequired: FinancialKey[];
  missingAssumptions: FinancialKey[];
  canProceed: boolean;
} {
  // Example state with some DCF inputs
  const state: Partial<Record<FinancialKey, { value: number | null }>> = {
    revenue: { value: 50000000000 },
    ebitda: { value: 15000000000 },
    ebit: { value: 12000000000 },
    // Missing: rf_rate, equity_risk_premium, beta, cost_of_debt, tax_rate_assumption, terminal_growth
  };
  
  const missingRequired = getMissingRequiredKeys('dcf', state);
  const missingAssumptions = getMissingAssumptionKeys('dcf', state);
  const canProceed = missingRequired.length === 0;
  
  return {
    missingRequired,
    missingAssumptions,
    canProceed,
  };
}

/**
 * Example: Complete missing datapoints list (documentation)
 */
export const MISSING_DATAPOINTS_DOCUMENTATION = `
# Missing Datapoints from APIs and How to Derive

## 1. Shares Outstanding (often missing)
- **Rule**: shares_out_basic = market_cap / price
- **Requires**: market_cap, price
- **Valid if**: both > 0 and same as_of/source
- **Confidence**: medium
- **Warning if**: implied shares out of plausible bounds (<1M or >100B)

## 2. Market Cap (sometimes missing)
- **Rule**: market_cap = price * shares_out_basic
- **Requires**: price, shares_out_basic
- **Valid if**: both > 0
- **Confidence**: medium-high

## 3. Net Debt (sometimes missing)
- **Rule**: net_debt = total_debt - cash
- **Requires**: total_debt, cash
- **Valid if**: inputs non-null and >= 0
- **Confidence**: high

## 4. Enterprise Value (sometimes missing)
- **Rule**: enterprise_value = market_cap + net_debt
- **Requires**: market_cap, net_debt
- **Valid if**: market_cap > 0
- **Confidence**: high if both reported; medium if shares-derived

## 5. Pre-tax Income (sometimes missing)
- **Rule**: pre_tax_income = net_income + tax_expense
- **Requires**: net_income, tax_expense
- **Valid if**: both exist (can be negative net income)
- **Confidence**: medium

## 6. Effective Tax Rate (often missing)
- **Rule**: tax_rate_effective = tax_expense / pre_tax_income
- **Requires**: tax_expense, pre_tax_income
- **Valid if**: pre_tax_income > 0
- **Clamp**: 0%-40% (warn if outside)
- **Confidence**: medium

## 7. EBITDA (sometimes missing but components exist)
- **Rule**: ebitda = ebit + da
- **Requires**: ebit, da
- **Valid if**: both exist
- **Confidence**: medium

## 8. EBIT (sometimes missing)
- **Rule**: ebit = ebitda - da
- **Requires**: ebitda, da
- **Valid if**: both exist
- **Confidence**: medium

## 9. D&A (often missing)
- **Rule (policy-based)**: da = da_percent_revenue * revenue
- **Requires**: da_percent_revenue (user/historical), revenue
- **Valid if**: percent between 0% and 30%
- **Confidence**: low-medium (assumption-based)
- **Status**: derived_from_assumption

## 10. Capex (often missing)
- **Rule (policy-based)**: capex = capex_percent_revenue * revenue
- **Requires**: capex_percent_revenue (user/historical), revenue
- **Valid if**: percent between 0% and 50%
- **Confidence**: low-medium
- **Status**: derived_from_assumption

## 11. Levered FCF (often missing)
- **Rule**: fcf_levered = cfo - capex
- **Requires**: cfo, capex
- **Valid if**: both exist
- **Confidence**: high

## 12. Unlevered FCF (for DCF)
- **Rule**: 
  - nopat = ebit * (1 - tax_rate)
  - fcf_unlevered = nopat + da - capex - delta_nwc
- **Requires**: ebit, tax_rate, da, capex, delta_nwc
- **Valid if**: tax_rate within plausible range
- **Confidence**: medium if mix of reported + derived; low if policy-based
- **Must label**: which components were policy-based

## 13. NWC and ΔNWC (often missing)
- **Rule (policy-based)**:
  - nwc = nwc_percent_revenue * revenue
  - delta_nwc = nwc_t - nwc_{t-1}
- **Requires**: nwc_percent_revenue (user/historical), revenue series
- **Valid if**: percent between -20% and +40%
- **Confidence**: low-medium
- **Status**: derived_from_assumption

## 14. Interest Expense (missing for LBO/M&A)
- **Rule**: interest_expense = avg_debt_balance * debt_rate
- **Requires**: debt_rate (user), debt balances
- **Valid if**: rate within 0%-25%
- **Confidence**: medium (assumption-driven)
- **Status**: derived_from_assumption

## 15. EV Multiples
- **Rule**: ev_to_ebitda = enterprise_value / ebitda
- **Requires**: enterprise_value, ebitda
- **Valid if**: ebitda > 0
- **Confidence**: mirrors EV confidence

- **Rule**: ev_to_revenue = enterprise_value / revenue
- **Requires**: enterprise_value, revenue
- **Valid if**: revenue > 0

## 16. P/E (often missing when NI negative)
- **Rule**: pe = market_cap / net_income
- **Valid if**: net_income > 0
- **Else**: leave blank with note "Negative NI"

## 17. Implied Price per Share
- **Rule**: 
  - equity_value = enterprise_value - net_debt
  - implied_price = equity_value / shares_out_basic
- **Requires**: enterprise_value, net_debt, shares_out_basic
- **Valid if**: shares_out_basic > 0
`;

/**
 * Example output format for resolved state
 */
export function exampleResolvedOutput(): string {
  const example = exampleResolveCompany();
  
  return `
# Example Resolved Financial State

## Input (Reported Values)
- price: $150.50 (reported, FMP)
- market_cap: $150B (reported, FMP)
- revenue: $50B (reported, SEC EDGAR)
- ebitda: $15B (reported, SEC EDGAR)
- ebit: $12B (reported, SEC EDGAR)
- net_income: $8B (reported, SEC EDGAR)
- tax_expense: $2B (reported, SEC EDGAR)
- cash: $10B (reported, SEC EDGAR)
- total_debt: $50B (reported, SEC EDGAR)
- cfo: $18B (reported, SEC EDGAR)
- capex: $5B (reported, SEC EDGAR)

## Derived Values
${example.summary}

## Missing Inputs for DCF Model
${(() => {
  const dcfMissing = exampleDCFMissingInputs();
  return `
- Required: ${dcfMissing.missingRequired.length > 0 ? dcfMissing.missingRequired.join(', ') : 'None'}
- Assumptions: ${dcfMissing.missingAssumptions.length > 0 ? dcfMissing.missingAssumptions.join(', ') : 'None'}
- Can Proceed: ${dcfMissing.canProceed ? 'Yes' : 'No'}
`;
})()}
`;
}
