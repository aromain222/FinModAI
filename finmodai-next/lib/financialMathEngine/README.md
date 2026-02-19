# CapitalBase Financial Math Engine

A deterministic system that fills missing or unreliable financial datapoints from APIs using only:
- Provable accounting identities
- Defensible math derivations
- Finance math libraries (NPV/IRR/XNPV/XIRR/day-count)
- User input as a last resort

## Non-Negotiable Principles

1. **Never guess core financial numbers**
2. **Every computed field includes full provenance:**
   - `status`: reported | derived | derived_from_assumption | user_provided | ai_parse | missing
   - `method`: string explanation
   - `inputs_used`: list of keys
   - `as_of`: date (if known)
   - `confidence`: high | medium | low
   - `warnings`: string[]
3. **Never coerce null to 0**
4. **Never overwrite reported values with derived values**
5. **If a number depends on an assumption, it is `derived_from_assumption` unless the assumption is explicitly provided**

## Architecture

### Core Components

1. **Types** (`types.ts`): Canonical data dictionary and provenance tracking
2. **Rules** (`rules.ts`): Extensible registry of derivation rules
3. **Solver** (`solver.ts`): Iterative solver that applies rules until convergence
4. **Finance Math** (`financeMath.ts`): NPV, IRR, XNPV, XIRR, discount factors
5. **Model Requirements** (`modelRequirements.ts`): Required/optional keys per model type
6. **Examples** (`examples.ts`): Usage examples and documentation

### Canonical Data Dictionary

All financial keys are standardized to avoid API naming mismatches:

```typescript
type FinancialKey =
  // Market
  | 'price' | 'market_cap' | 'shares_out_basic' | 'shares_out_diluted'
  // Capital structure
  | 'cash' | 'total_debt' | 'short_term_debt' | 'long_term_debt'
  | 'net_debt' | 'enterprise_value'
  // Income statement
  | 'revenue' | 'gross_profit' | 'ebitda' | 'da' | 'ebit'
  | 'interest_expense' | 'pre_tax_income' | 'tax_expense' | 'net_income'
  // Cash flow
  | 'cfo' | 'capex' | 'cfi' | 'cff' | 'fcf_levered' | 'fcf_unlevered'
  // Working capital
  | 'nwc' | 'nwc_percent_revenue' | 'delta_nwc'
  // Multiples
  | 'ev_to_ebitda' | 'ev_to_revenue' | 'pe'
  // Assumptions
  | 'rf_rate' | 'equity_risk_premium' | 'beta' | 'cost_of_debt'
  | 'tax_rate_assumption' | 'tax_rate_effective' | 'terminal_growth'
  | 'exit_multiple' | 'leverage_multiple' | 'debt_rate' | 'holding_period_years'
  | 'da_percent_revenue' | 'capex_percent_revenue' | 'nwc_percent_revenue'
  | 'implied_price'
```

## Usage

### Basic Example

```typescript
import { resolve, getModelRequirements } from '@/lib/financialMathEngine';

// Input: Some reported values from API
const input = {
  price: {
    value: 150.50,
    status: 'reported',
    method: 'From market data API',
    source: 'FMP',
    confidence: 'high',
    as_of: '2024-01-15',
  },
  market_cap: {
    value: 150000000000,
    status: 'reported',
    method: 'From market data API',
    source: 'FMP',
    confidence: 'high',
    as_of: '2024-01-15',
  },
  revenue: {
    value: 50000000000,
    status: 'reported',
    method: 'From financial statements',
    source: 'SEC EDGAR',
    confidence: 'high',
    as_of: '2023-12-31',
  },
  ebitda: {
    value: 15000000000,
    status: 'reported',
    method: 'From financial statements',
    source: 'SEC EDGAR',
    confidence: 'high',
    as_of: '2023-12-31',
  },
  // ... more reported values
};

// Resolve missing values
const resolved = resolve(input);

// Check what's missing for a DCF model
const dcfRequirements = getModelRequirements('dcf');
const missingRequired = dcfRequirements.required.filter(
  key => !resolved.resolved[key] || resolved.resolved[key]?.value === null
);
```

### Derivation Rules

The engine includes 18 derivation rules covering:

1. **Shares Outstanding** from Market Cap and Price
2. **Market Cap** from Price and Shares
3. **Net Debt** from Total Debt and Cash
4. **Enterprise Value** from Market Cap and Net Debt
5. **Pre-tax Income** from Net Income and Tax Expense
6. **Effective Tax Rate** from Tax Expense and Pre-tax Income
7. **EBITDA** from EBIT + D&A
8. **EBIT** from EBITDA - D&A
9. **D&A** from Revenue Policy (assumption-based)
10. **Capex** from Revenue Policy (assumption-based)
11. **Levered FCF** from CFO - Capex
12. **Unlevered FCF** from NOPAT + D&A - Capex - ΔNWC
13. **NWC** from Revenue Policy (assumption-based)
14. **Interest Expense** from Debt and Rate (assumption-based)
15. **EV/EBITDA Multiple**
16. **EV/Revenue Multiple**
17. **P/E Multiple** (only if Net Income > 0)
18. **Implied Price per Share**

### Model-Specific Requirements

Each model type has defined requirements:

#### Trading Comps
- **Required**: price (OR market_cap), revenue, ebitda, net_income
- **Optional**: market_cap, shares_out_basic, cash, total_debt, net_debt, enterprise_value, multiples
- **Assumptions**: None (shares can be derived if market_cap present)

#### DCF
- **Required**: revenue, ebitda, ebit, rf_rate, equity_risk_premium, beta, cost_of_debt, tax_rate_assumption, terminal_growth (OR exit_multiple)
- **Optional**: da, capex, nwc, delta_nwc, fcf_unlevered, enterprise_value, net_debt, shares_out_basic, implied_price
- **Assumptions**: da_percent_revenue, capex_percent_revenue, nwc_percent_revenue, WACC inputs, terminal_growth/exit_multiple

#### 3-Statement
- **Required**: revenue, ebitda (OR user seed), net_income, cash, total_debt
- **Optional**: ebit, da, interest_expense, tax_expense, cfo, capex, nwc, fcf_levered
- **Assumptions**: da_percent_revenue, capex_percent_revenue, nwc_percent_revenue, tax_rate_assumption

#### LBO
- **Required**: ebitda, enterprise_value (OR purchase multiple), debt_rate, leverage_multiple, exit_multiple, holding_period_years
- **Optional**: revenue, ebit, net_income, cash, total_debt, net_debt, capex, da, nwc, delta_nwc
- **Assumptions**: da_percent_revenue, capex_percent_revenue, nwc_percent_revenue, tax_rate_assumption, deal assumptions

#### M&A
- **Required**: Acquirer and Target financials (revenue, ebitda, net_income, shares), deal value
- **Optional**: cash, total_debt, net_debt, interest_expense, tax_expense, ebit, da
- **Assumptions**: debt_rate, tax_rate_assumption, synergies (optional, user-entered only)

## Finance Math Library

The engine includes robust implementations of:

- **NPV**: Net Present Value with regular cash flows
- **XNPV**: Net Present Value with irregular dates
- **IRR**: Internal Rate of Return (Newton-Raphson with bisection fallback)
- **XIRR**: Extended IRR with irregular dates
- **Discount Factors**: With day-count conventions (ACTUAL/365, ACTUAL/360)

All methods include:
- Convergence checks
- Bounds validation
- Error handling
- Tolerance controls

## Solver Algorithm

The solver iteratively applies derivation rules until no more values can be derived:

1. Start with input state (reported/user-provided values)
2. For each rule:
   - Skip if output key already has a value
   - Skip if output key is reported (never overwrite)
   - Check if all required inputs exist
   - Try to derive the value
   - Run validation if provided
   - Add warnings if validation fails
3. Repeat until no new values are derived
4. Track applied rules and warnings
5. Return resolved state with provenance

## Output Format

The resolved state includes:

```typescript
interface ResolvedState {
  resolved: FinancialState; // All keys with values and provenance
  missing: {
    required: FinancialKey[];
    optional: FinancialKey[];
  };
  warnings: string[];
  appliedRules: string[]; // Rule IDs that were applied
  cannotDerive: FinancialKey[]; // Keys that couldn't be derived
}
```

Each value in the resolved state has full provenance:

```typescript
interface FinancialValue {
  value: number | null; // Never coerced to 0
  status: 'reported' | 'derived' | 'derived_from_assumption' | 'user_provided' | 'ai_parse' | 'missing';
  method?: string; // How value was obtained
  inputs_used?: FinancialKey[]; // Keys used in derivation
  as_of?: string; // Date (ISO format)
  confidence?: 'high' | 'medium' | 'low';
  warnings?: string[];
  source?: string; // API source name
}
```

## AI Usage (Strict)

AI may be used ONLY for:
- Parsing user-pasted text into numeric fields (`ai_parse` status)
- Mapping field names from messy sources into canonical keys

AI must NOT be used to "estimate" missing financials unless the user explicitly opts in.

If AI estimate mode exists, it must:
- Be OFF by default
- Label status as `ai_estimate`
- Exclude `ai_estimate` values from valuation outputs unless user confirms

## Extending the Engine

### Adding a New Derivation Rule

```typescript
import { DerivationRule } from './types';
import { DERIVATION_RULES } from './rules';

const newRule: DerivationRule = {
  id: 'my_new_rule',
  name: 'My New Rule',
  outputKey: 'my_output_key',
  requiredInputs: ['input1', 'input2'],
  optionalInputs: ['input3'],
  derive: (state) => {
    // Derivation logic
    const input1 = getNumericValue(state, 'input1');
    const input2 = getNumericValue(state, 'input2');
    if (input1 === null || input2 === null) return null;
    
    return createValue(
      input1 + input2, // Example calculation
      'derived',
      'my_output_key = input1 + input2',
      ['input1', 'input2'],
      'medium'
    );
  },
  validate: (value, state) => {
    // Optional validation
    return { isValid: value > 0, warnings: [] };
  },
  confidence: 'medium',
  category: 'math_derivation',
};

// Add to DERIVATION_RULES array
```

### Adding a New Model Type

```typescript
import { ModelRequirements } from './types';

export const MY_MODEL_REQUIREMENTS: ModelRequirements = {
  modelType: 'my_model',
  required: ['key1', 'key2'],
  optional: ['key3'],
  assumptions: ['assumption1'],
};
```

## Testing

The engine is designed to be deterministic and testable:

- All rules are pure functions
- No side effects
- Full provenance tracking enables auditability
- Validation warnings catch edge cases

## License

Part of CapitalBase Financial Modeling Platform
