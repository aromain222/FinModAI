/**
 * CapitalBase Financial Math Engine
 * Derivation Rules Registry
 * 
 * Each rule defines how to derive a missing financial datapoint
 * using only provable accounting identities and defensible math
 */

import type {
  FinancialKey,
  FinancialValue,
  DerivationRule,
  ProvenanceStatus,
  ConfidenceLevel,
} from './types';

/**
 * Helper to create a FinancialValue with provenance
 */
function createValue(
  value: number | null,
  status: ProvenanceStatus,
  method: string,
  inputsUsed: FinancialKey[],
  confidence: ConfidenceLevel,
  warnings?: string[],
  asOf?: string
): FinancialValue {
  return {
    value,
    status,
    method,
    inputs_used: inputsUsed,
    confidence,
    warnings,
    as_of: asOf,
  };
}

/**
 * Helper to safely get numeric value (never coerces null to 0)
 */
function getNumericValue(
  state: Partial<Record<FinancialKey, FinancialValue>>,
  key: FinancialKey
): number | null {
  const entry = state[key];
  if (!entry || entry.value === null || entry.value === undefined) {
    return null;
  }
  return entry.value;
}

/**
 * Helper to check if all required inputs exist and are numeric
 */
function hasAllInputs(
  state: Partial<Record<FinancialKey, FinancialValue>>,
  requiredKeys: FinancialKey[]
): boolean {
  return requiredKeys.every(key => {
    const value = getNumericValue(state, key);
    return value !== null && isFinite(value);
  });
}

/**
 * Helper to get the most recent as_of date from inputs
 */
function getAsOfDate(
  state: Partial<Record<FinancialKey, FinancialValue>>,
  keys: FinancialKey[]
): string | undefined {
  const dates = keys
    .map(key => state[key]?.as_of)
    .filter((d): d is string => !!d);
  return dates.length > 0 ? dates.sort().reverse()[0] : undefined;
}

/**
 * All derivation rules
 */
export const DERIVATION_RULES: DerivationRule[] = [
  // ============================================
  // 1. Shares Outstanding
  // ============================================
  {
    id: 'shares_from_market_cap_price',
    name: 'Shares Outstanding from Market Cap and Price',
    outputKey: 'shares_out_basic',
    requiredInputs: ['market_cap', 'price'],
    derive: (state) => {
      const marketCap = getNumericValue(state, 'market_cap');
      const price = getNumericValue(state, 'price');
      
      if (marketCap === null || price === null || price <= 0) {
        return null;
      }
      
      const shares = marketCap / price;
      const warnings: string[] = [];
      
      // Validity check: shares in plausible bounds
      if (shares < 1e6) {
        warnings.push('Implied shares outstanding < 1M (unusually low)');
      }
      if (shares > 1e11) {
        warnings.push('Implied shares outstanding > 100B (unusually high)');
      }
      
      return createValue(
        shares,
        'derived',
        'shares_out_basic = market_cap / price',
        ['market_cap', 'price'],
        'medium',
        warnings.length > 0 ? warnings : undefined,
        getAsOfDate(state, ['market_cap', 'price'])
      );
    },
    validate: (shares) => {
      const warnings: string[] = [];
      if (shares < 1e6) warnings.push('Shares < 1M');
      if (shares > 1e11) warnings.push('Shares > 100B');
      return { isValid: shares > 0 && shares < 1e12, warnings };
    },
    confidence: 'medium',
    category: 'math_derivation',
  },

  // ============================================
  // 2. Market Cap
  // ============================================
  {
    id: 'market_cap_from_price_shares',
    name: 'Market Cap from Price and Shares',
    outputKey: 'market_cap',
    requiredInputs: ['price', 'shares_out_basic'],
    derive: (state) => {
      const price = getNumericValue(state, 'price');
      const shares = getNumericValue(state, 'shares_out_basic');
      
      if (price === null || shares === null || price <= 0 || shares <= 0) {
        return null;
      }
      
      const marketCap = price * shares;
      
      return createValue(
        marketCap,
        'derived',
        'market_cap = price * shares_out_basic',
        ['price', 'shares_out_basic'],
        state['shares_out_basic']?.status === 'derived' ? 'medium' : 'high',
        undefined,
        getAsOfDate(state, ['price', 'shares_out_basic'])
      );
    },
    confidence: 'high',
    category: 'math_derivation',
  },

  // ============================================
  // 3. Net Debt
  // ============================================
  {
    id: 'net_debt_from_debt_cash',
    name: 'Net Debt from Total Debt and Cash',
    outputKey: 'net_debt',
    requiredInputs: ['total_debt', 'cash'],
    derive: (state) => {
      const totalDebt = getNumericValue(state, 'total_debt');
      const cash = getNumericValue(state, 'cash');
      
      if (totalDebt === null || cash === null) {
        return null;
      }
      
      // Allow negative net debt (cash > debt)
      const netDebt = totalDebt - cash;
      
      return createValue(
        netDebt,
        'derived',
        'net_debt = total_debt - cash',
        ['total_debt', 'cash'],
        'high',
        undefined,
        getAsOfDate(state, ['total_debt', 'cash'])
      );
    },
    confidence: 'high',
    category: 'accounting_identity',
  },

  // ============================================
  // 4. Enterprise Value
  // ============================================
  {
    id: 'enterprise_value_from_market_cap_net_debt',
    name: 'Enterprise Value from Market Cap and Net Debt',
    outputKey: 'enterprise_value',
    requiredInputs: ['market_cap', 'net_debt'],
    derive: (state) => {
      const marketCap = getNumericValue(state, 'market_cap');
      const netDebt = getNumericValue(state, 'net_debt');
      
      if (marketCap === null || netDebt === null || marketCap <= 0) {
        return null;
      }
      
      const enterpriseValue = marketCap + netDebt;
      
      return createValue(
        enterpriseValue,
        'derived',
        'enterprise_value = market_cap + net_debt',
        ['market_cap', 'net_debt'],
        (state['market_cap']?.status === 'derived' || state['net_debt']?.status === 'derived')
          ? 'medium'
          : 'high',
        undefined,
        getAsOfDate(state, ['market_cap', 'net_debt'])
      );
    },
    confidence: 'high',
    category: 'accounting_identity',
  },

  // ============================================
  // 5. Pre-tax Income
  // ============================================
  {
    id: 'pre_tax_income_from_net_income_tax',
    name: 'Pre-tax Income from Net Income and Tax Expense',
    outputKey: 'pre_tax_income',
    requiredInputs: ['net_income', 'tax_expense'],
    derive: (state) => {
      const netIncome = getNumericValue(state, 'net_income');
      const taxExpense = getNumericValue(state, 'tax_expense');
      
      if (netIncome === null || taxExpense === null) {
        return null;
      }
      
      // Can be negative (loss)
      const preTaxIncome = netIncome + taxExpense;
      
      return createValue(
        preTaxIncome,
        'derived',
        'pre_tax_income = net_income + tax_expense',
        ['net_income', 'tax_expense'],
        'medium',
        undefined,
        getAsOfDate(state, ['net_income', 'tax_expense'])
      );
    },
    confidence: 'medium',
    category: 'accounting_identity',
  },

  // ============================================
  // 6. Effective Tax Rate
  // ============================================
  {
    id: 'tax_rate_effective_from_tax_pre_tax',
    name: 'Effective Tax Rate from Tax Expense and Pre-tax Income',
    outputKey: 'tax_rate_effective',
    requiredInputs: ['tax_expense', 'pre_tax_income'],
    derive: (state) => {
      const taxExpense = getNumericValue(state, 'tax_expense');
      const preTaxIncome = getNumericValue(state, 'pre_tax_income');
      
      if (taxExpense === null || preTaxIncome === null || preTaxIncome <= 0) {
        return null;
      }
      
      const taxRate = taxExpense / preTaxIncome;
      const warnings: string[] = [];
      
      // Clamp check: warn if outside 0%-40%
      if (taxRate < 0) {
        warnings.push('Tax rate < 0% (negative pre-tax income)');
      }
      if (taxRate > 0.4) {
        warnings.push('Tax rate > 40% (unusually high)');
      }
      
      return createValue(
        taxRate,
        'derived',
        'tax_rate_effective = tax_expense / pre_tax_income',
        ['tax_expense', 'pre_tax_income'],
        'medium',
        warnings.length > 0 ? warnings : undefined,
        getAsOfDate(state, ['tax_expense', 'pre_tax_income'])
      );
    },
    validate: (rate) => {
      const warnings: string[] = [];
      if (rate < 0) warnings.push('Tax rate < 0%');
      if (rate > 0.4) warnings.push('Tax rate > 40%');
      return { isValid: rate >= 0 && rate <= 0.5, warnings };
    },
    confidence: 'medium',
    category: 'math_derivation',
  },

  // ============================================
  // 7. EBITDA from EBIT + D&A
  // ============================================
  {
    id: 'ebitda_from_ebit_da',
    name: 'EBITDA from EBIT and D&A',
    outputKey: 'ebitda',
    requiredInputs: ['ebit', 'da'],
    derive: (state) => {
      const ebit = getNumericValue(state, 'ebit');
      const da = getNumericValue(state, 'da');
      
      if (ebit === null || da === null) {
        return null;
      }
      
      const ebitda = ebit + da;
      
      return createValue(
        ebitda,
        'derived',
        'ebitda = ebit + da',
        ['ebit', 'da'],
        'medium',
        undefined,
        getAsOfDate(state, ['ebit', 'da'])
      );
    },
    confidence: 'medium',
    category: 'accounting_identity',
  },

  // ============================================
  // 8. EBIT from EBITDA - D&A
  // ============================================
  {
    id: 'ebit_from_ebitda_da',
    name: 'EBIT from EBITDA and D&A',
    outputKey: 'ebit',
    requiredInputs: ['ebitda', 'da'],
    derive: (state) => {
      const ebitda = getNumericValue(state, 'ebitda');
      const da = getNumericValue(state, 'da');
      
      if (ebitda === null || da === null) {
        return null;
      }
      
      const ebit = ebitda - da;
      
      return createValue(
        ebit,
        'derived',
        'ebit = ebitda - da',
        ['ebitda', 'da'],
        'medium',
        undefined,
        getAsOfDate(state, ['ebitda', 'da'])
      );
    },
    confidence: 'medium',
    category: 'accounting_identity',
  },

  // ============================================
  // 9. D&A from Policy (Assumption-based)
  // ============================================
  {
    id: 'da_from_policy',
    name: 'D&A from Revenue Policy (User/Historical Assumption)',
    outputKey: 'da',
    requiredInputs: ['da_percent_revenue', 'revenue'],
    derive: (state) => {
      const daPercent = getNumericValue(state, 'da_percent_revenue');
      const revenue = getNumericValue(state, 'revenue');
      
      if (daPercent === null || revenue === null || revenue <= 0) {
        return null;
      }
      
      const warnings: string[] = [];
      
      // Validity check: percent between 0% and 30%
      if (daPercent < 0) {
        warnings.push('D&A % < 0% (invalid)');
      }
      if (daPercent > 0.3) {
        warnings.push('D&A % > 30% (unusually high)');
      }
      
      const da = daPercent * revenue;
      
      return createValue(
        da,
        'derived_from_assumption',
        'da = da_percent_revenue * revenue (policy-based)',
        ['da_percent_revenue', 'revenue'],
        'low',
        warnings.length > 0 ? warnings : undefined,
        getAsOfDate(state, ['revenue'])
      );
    },
    validate: (da, state) => {
      const daPercent = getNumericValue(state, 'da_percent_revenue');
      const warnings: string[] = [];
      if (daPercent !== null) {
        if (daPercent < 0) warnings.push('D&A % < 0%');
        if (daPercent > 0.3) warnings.push('D&A % > 30%');
      }
      return { isValid: da >= 0 && daPercent !== null && daPercent >= 0 && daPercent <= 0.3, warnings };
    },
    confidence: 'low',
    category: 'policy_based',
  },

  // ============================================
  // 10. Capex from Policy (Assumption-based)
  // ============================================
  {
    id: 'capex_from_policy',
    name: 'Capex from Revenue Policy (User/Historical Assumption)',
    outputKey: 'capex',
    requiredInputs: ['capex_percent_revenue', 'revenue'],
    derive: (state) => {
      const capexPercent = getNumericValue(state, 'capex_percent_revenue');
      const revenue = getNumericValue(state, 'revenue');
      
      if (capexPercent === null || revenue === null || revenue <= 0) {
        return null;
      }
      
      const warnings: string[] = [];
      
      // Validity check: percent between 0% and 50%
      if (capexPercent < 0) {
        warnings.push('Capex % < 0% (invalid)');
      }
      if (capexPercent > 0.5) {
        warnings.push('Capex % > 50% (unusually high)');
      }
      
      const capex = capexPercent * revenue;
      
      return createValue(
        capex,
        'derived_from_assumption',
        'capex = capex_percent_revenue * revenue (policy-based)',
        ['capex_percent_revenue', 'revenue'],
        'low',
        warnings.length > 0 ? warnings : undefined,
        getAsOfDate(state, ['revenue'])
      );
    },
    validate: (capex, state) => {
      const capexPercent = getNumericValue(state, 'capex_percent_revenue');
      const warnings: string[] = [];
      if (capexPercent !== null) {
        if (capexPercent < 0) warnings.push('Capex % < 0%');
        if (capexPercent > 0.5) warnings.push('Capex % > 50%');
      }
      return { isValid: capex >= 0 && capexPercent !== null && capexPercent >= 0 && capexPercent <= 0.5, warnings };
    },
    confidence: 'low',
    category: 'policy_based',
  },

  // ============================================
  // 11. Levered FCF
  // ============================================
  {
    id: 'fcf_levered_from_cfo_capex',
    name: 'Levered FCF from CFO and Capex',
    outputKey: 'fcf_levered',
    requiredInputs: ['cfo', 'capex'],
    derive: (state) => {
      const cfo = getNumericValue(state, 'cfo');
      const capex = getNumericValue(state, 'capex');
      
      if (cfo === null || capex === null) {
        return null;
      }
      
      const fcf = cfo - capex;
      
      return createValue(
        fcf,
        'derived',
        'fcf_levered = cfo - capex',
        ['cfo', 'capex'],
        'high',
        undefined,
        getAsOfDate(state, ['cfo', 'capex'])
      );
    },
    confidence: 'high',
    category: 'accounting_identity',
  },

  // ============================================
  // 12. Unlevered FCF (for DCF)
  // ============================================
  {
    id: 'fcf_unlevered_from_components',
    name: 'Unlevered FCF from NOPAT, D&A, Capex, and ΔNWC',
    outputKey: 'fcf_unlevered',
    requiredInputs: ['ebit', 'tax_rate_effective', 'da', 'capex', 'delta_nwc'],
    derive: (state) => {
      const ebit = getNumericValue(state, 'ebit');
      const taxRate = getNumericValue(state, 'tax_rate_effective');
      const da = getNumericValue(state, 'da');
      const capex = getNumericValue(state, 'capex');
      const deltaNwc = getNumericValue(state, 'delta_nwc');
      
      if (ebit === null || taxRate === null || da === null || capex === null || deltaNwc === null) {
        return null;
      }
      
      // NOPAT = EBIT * (1 - tax_rate)
      const nopat = ebit * (1 - taxRate);
      
      // FCF Unlevered = NOPAT + D&A - Capex - ΔNWC
      const fcfUnlevered = nopat + da - capex - deltaNwc;
      
      const warnings: string[] = [];
      const policyBasedComponents: string[] = [];
      
      // Check which components are policy-based
      if (state['da']?.status === 'derived_from_assumption') {
        policyBasedComponents.push('D&A');
      }
      if (state['capex']?.status === 'derived_from_assumption') {
        policyBasedComponents.push('Capex');
      }
      if (state['delta_nwc']?.status === 'derived_from_assumption') {
        policyBasedComponents.push('ΔNWC');
      }
      
      if (policyBasedComponents.length > 0) {
        warnings.push(`Policy-based components used: ${policyBasedComponents.join(', ')}`);
      }
      
      const confidence: ConfidenceLevel = policyBasedComponents.length > 0 ? 'low' : 'medium';
      
      return createValue(
        fcfUnlevered,
        policyBasedComponents.length > 0 ? 'derived_from_assumption' : 'derived',
        'fcf_unlevered = ebit * (1 - tax_rate) + da - capex - delta_nwc',
        ['ebit', 'tax_rate_effective', 'da', 'capex', 'delta_nwc'],
        confidence,
        warnings.length > 0 ? warnings : undefined,
        getAsOfDate(state, ['ebit', 'tax_rate_effective', 'da', 'capex', 'delta_nwc'])
      );
    },
    confidence: 'medium',
    category: 'accounting_identity',
  },

  // ============================================
  // 13. NWC from Policy
  // ============================================
  {
    id: 'nwc_from_policy',
    name: 'NWC from Revenue Policy (User/Historical Assumption)',
    outputKey: 'nwc',
    requiredInputs: ['nwc_percent_revenue', 'revenue'],
    derive: (state) => {
      const nwcPercent = getNumericValue(state, 'nwc_percent_revenue');
      const revenue = getNumericValue(state, 'revenue');
      
      if (nwcPercent === null || revenue === null || revenue <= 0) {
        return null;
      }
      
      const warnings: string[] = [];
      
      // Validity check: percent between -20% and +40%
      if (nwcPercent < -0.2) {
        warnings.push('NWC % < -20% (unusually negative)');
      }
      if (nwcPercent > 0.4) {
        warnings.push('NWC % > 40% (unusually high)');
      }
      
      const nwc = nwcPercent * revenue;
      
      return createValue(
        nwc,
        'derived_from_assumption',
        'nwc = nwc_percent_revenue * revenue (policy-based)',
        ['nwc_percent_revenue', 'revenue'],
        'low',
        warnings.length > 0 ? warnings : undefined,
        getAsOfDate(state, ['revenue'])
      );
    },
    validate: (nwc, state) => {
      const nwcPercent = getNumericValue(state, 'nwc_percent_revenue');
      const warnings: string[] = [];
      if (nwcPercent !== null) {
        if (nwcPercent < -0.2) warnings.push('NWC % < -20%');
        if (nwcPercent > 0.4) warnings.push('NWC % > 40%');
      }
      return { isValid: nwcPercent !== null && nwcPercent >= -0.2 && nwcPercent <= 0.4, warnings };
    },
    confidence: 'low',
    category: 'policy_based',
  },

  // ============================================
  // 14. Interest Expense from Debt Schedule
  // ============================================
  {
    id: 'interest_expense_from_debt_rate',
    name: 'Interest Expense from Debt Balance and Rate (Assumption)',
    outputKey: 'interest_expense',
    requiredInputs: ['total_debt', 'debt_rate'],
    derive: (state) => {
      const totalDebt = getNumericValue(state, 'total_debt');
      const debtRate = getNumericValue(state, 'debt_rate');
      
      if (totalDebt === null || debtRate === null) {
        return null;
      }
      
      const warnings: string[] = [];
      
      // Validity check: rate between 0% and 25%
      if (debtRate < 0) {
        warnings.push('Debt rate < 0% (invalid)');
      }
      if (debtRate > 0.25) {
        warnings.push('Debt rate > 25% (unusually high)');
      }
      
      const interestExpense = totalDebt * debtRate;
      
      return createValue(
        interestExpense,
        'derived_from_assumption',
        'interest_expense = total_debt * debt_rate (assumption-based)',
        ['total_debt', 'debt_rate'],
        'medium',
        warnings.length > 0 ? warnings : undefined,
        getAsOfDate(state, ['total_debt'])
      );
    },
    validate: (interest, state) => {
      const debtRate = getNumericValue(state, 'debt_rate');
      const warnings: string[] = [];
      if (debtRate !== null) {
        if (debtRate < 0) warnings.push('Debt rate < 0%');
        if (debtRate > 0.25) warnings.push('Debt rate > 25%');
      }
      return { isValid: interest >= 0 && debtRate !== null && debtRate >= 0 && debtRate <= 0.25, warnings };
    },
    confidence: 'medium',
    category: 'policy_based',
  },

  // ============================================
  // 15. EV/EBITDA Multiple
  // ============================================
  {
    id: 'ev_to_ebitda',
    name: 'EV/EBITDA Multiple',
    outputKey: 'ev_to_ebitda',
    requiredInputs: ['enterprise_value', 'ebitda'],
    derive: (state) => {
      const ev = getNumericValue(state, 'enterprise_value');
      const ebitda = getNumericValue(state, 'ebitda');
      
      if (ev === null || ebitda === null || ebitda <= 0) {
        return null;
      }
      
      const multiple = ev / ebitda;
      
      return createValue(
        multiple,
        'derived',
        'ev_to_ebitda = enterprise_value / ebitda',
        ['enterprise_value', 'ebitda'],
        state['enterprise_value']?.confidence || 'medium',
        undefined,
        getAsOfDate(state, ['enterprise_value', 'ebitda'])
      );
    },
    confidence: 'medium',
    category: 'multiple',
  },

  // ============================================
  // 16. EV/Revenue Multiple
  // ============================================
  {
    id: 'ev_to_revenue',
    name: 'EV/Revenue Multiple',
    outputKey: 'ev_to_revenue',
    requiredInputs: ['enterprise_value', 'revenue'],
    derive: (state) => {
      const ev = getNumericValue(state, 'enterprise_value');
      const revenue = getNumericValue(state, 'revenue');
      
      if (ev === null || revenue === null || revenue <= 0) {
        return null;
      }
      
      const multiple = ev / revenue;
      
      return createValue(
        multiple,
        'derived',
        'ev_to_revenue = enterprise_value / revenue',
        ['enterprise_value', 'revenue'],
        state['enterprise_value']?.confidence || 'medium',
        undefined,
        getAsOfDate(state, ['enterprise_value', 'revenue'])
      );
    },
    confidence: 'medium',
    category: 'multiple',
  },

  // ============================================
  // 17. P/E Multiple
  // ============================================
  {
    id: 'pe_from_market_cap_net_income',
    name: 'P/E Multiple from Market Cap and Net Income',
    outputKey: 'pe',
    requiredInputs: ['market_cap', 'net_income'],
    derive: (state) => {
      const marketCap = getNumericValue(state, 'market_cap');
      const netIncome = getNumericValue(state, 'net_income');
      
      if (marketCap === null || netIncome === null || netIncome <= 0) {
        return null; // Leave blank if negative NI
      }
      
      const pe = marketCap / netIncome;
      
      return createValue(
        pe,
        'derived',
        'pe = market_cap / net_income',
        ['market_cap', 'net_income'],
        'medium',
        undefined,
        getAsOfDate(state, ['market_cap', 'net_income'])
      );
    },
    confidence: 'medium',
    category: 'multiple',
  },

  // ============================================
  // 18. Implied Price per Share
  // ============================================
  {
    id: 'implied_price_from_equity_value_shares',
    name: 'Implied Price per Share from Equity Value and Shares',
    outputKey: 'implied_price',
    requiredInputs: ['enterprise_value', 'net_debt', 'shares_out_basic'],
    derive: (state) => {
      const ev = getNumericValue(state, 'enterprise_value');
      const netDebt = getNumericValue(state, 'net_debt');
      const shares = getNumericValue(state, 'shares_out_basic');
      
      if (ev === null || netDebt === null || shares === null || shares <= 0) {
        return null;
      }
      
      const equityValue = ev - netDebt;
      const impliedPrice = equityValue / shares;
      
      return createValue(
        impliedPrice,
        'derived',
        'implied_price = (enterprise_value - net_debt) / shares_out_basic',
        ['enterprise_value', 'net_debt', 'shares_out_basic'],
        'medium',
        undefined,
        getAsOfDate(state, ['enterprise_value', 'net_debt', 'shares_out_basic'])
      );
    },
    confidence: 'medium',
    category: 'math_derivation',
  },
];

/**
 * Get all rules that can derive a specific key
 */
export function getRulesForOutput(outputKey: FinancialKey): DerivationRule[] {
  return DERIVATION_RULES.filter(rule => rule.outputKey === outputKey);
}

/**
 * Get all rules grouped by category
 */
export function getRulesByCategory(): Record<string, DerivationRule[]> {
  const grouped: Record<string, DerivationRule[]> = {};
  DERIVATION_RULES.forEach(rule => {
    if (!grouped[rule.category]) {
      grouped[rule.category] = [];
    }
    grouped[rule.category].push(rule);
  });
  return grouped;
}
