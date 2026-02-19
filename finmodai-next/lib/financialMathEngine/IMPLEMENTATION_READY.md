# CapitalBase Financial Math Engine - Implementation-Ready Output

## 1. Missing Data Map

### Complete Categorization

See `missingDataMap.ts` for the complete implementation. Summary:

**Derivable (Hard Identity)**: 15 datapoints
- Shares Outstanding, Market Cap, Net Debt, Enterprise Value
- Pre-tax Income, Effective Tax Rate, EBITDA, EBIT
- Levered FCF, Unlevered FCF, ΔNWC
- EV/EBITDA, EV/Revenue, P/E, Implied Price

**Derivable (Assumption-Dependent)**: 4 datapoints
- D&A (from da_percent_revenue)
- Capex (from capex_percent_revenue)
- NWC (from nwc_percent_revenue)
- Interest Expense (from debt_rate)

**Not Derivable (Requires User Choice)**: 11 datapoints
- Risk-Free Rate, Equity Risk Premium, Beta, Cost of Debt
- Tax Rate Assumption, Terminal Growth, Exit Multiple
- Leverage Multiple, Debt Rate, Holding Period Years
- Total Debt (can derive from components, but usually reported)

**Parseable (AI Parse)**: 0 datapoints
- Reserved for future: parsing user-pasted text/tables

### Access Functions

```typescript
import {
  MISSING_DATA_MAP,
  getMissingDataPoint,
  getMissingDataPointsByCategory,
  getDerivableKeys,
  getNonDerivableKeys,
} from '@/lib/financialMathEngine';
```

## 2. MVP vs Full Input Tables

### Trading Comps

| Mode | Required Inputs | Optional Inputs | Suppressed Outputs |
|------|----------------|-----------------|-------------------|
| **MVP** | • price OR market_cap<br>• revenue (TTM)<br>• ebitda (TTM) | • market_cap<br>• shares_out_basic<br>• cash, total_debt<br>• net_debt, enterprise_value<br>• net_income<br>• multiples | • P/E (if net_income missing/≤0)<br>• EV/EBITDA (if ebitda missing)<br>• EV/Revenue (if revenue missing)<br>• Per-share outputs (if shares missing)<br>• Summary stats for missing multiples |
| **Full** | • price OR market_cap<br>• revenue, ebitda, net_income<br>• shares_out_basic<br>• cash, total_debt<br>• net_debt, enterprise_value | • All multiples<br>• implied_price | • None (all outputs enabled) |

### DCF

| Mode | Required Inputs | Optional Inputs | Suppressed Outputs |
|------|----------------|-----------------|-------------------|
| **MVP** | • revenue (historical/seed)<br>• ebitda OR ebit + da<br>• ebit<br>• rf_rate, equity_risk_premium<br>• beta, cost_of_debt<br>• tax_rate_assumption<br>• terminal_growth OR exit_multiple | • exit_multiple (alt to growth)<br>• da, capex, nwc, delta_nwc<br>• fcf_unlevered<br>• enterprise_value<br>• net_debt, shares_out_basic<br>• implied_price | • Per-share outputs (if shares missing)<br>• Exit multiple sensitivity (if exit_multiple not provided)<br>• Detailed WACC breakdown (if weights missing)<br>• Policy-based components labeled as assumption-driven |
| **Full** | • All MVP inputs<br>• shares_out_basic<br>• net_debt | • exit_multiple (for exit method)<br>• All FCF components<br>• enterprise_value, implied_price | • None (all outputs enabled) |

### 3-Statement

| Mode | Required Inputs | Optional Inputs | Suppressed Outputs |
|------|----------------|-----------------|-------------------|
| **MVP** | • revenue (base year)<br>• da_percent_revenue OR da<br>• capex_percent_revenue OR capex<br>• nwc_percent_revenue OR nwc<br>• tax_rate_assumption OR tax_rate_effective | • ebitda, ebit, net_income<br>• cash, total_debt<br>• interest_expense, tax_expense<br>• cfo, fcf_levered | • Full balance sheet reconciliation (if components missing)<br>• Cash flow statement (if CFO missing)<br>• Detailed supporting schedules (if components missing) |
| **Full** | • revenue, ebitda, net_income<br>• cash, total_debt<br>• interest_expense, tax_expense<br>• cfo, capex, da, nwc | • ebit, fcf_levered, delta_nwc | • None (all statements must balance) |

### LBO

| Mode | Required Inputs | Optional Inputs | Suppressed Outputs |
|------|----------------|-----------------|-------------------|
| **MVP** | • ebitda (LTM)<br>• enterprise_value OR purchase multiple<br>• debt_rate<br>• leverage_multiple<br>• exit_multiple<br>• holding_period_years | • revenue, ebit, net_income<br>• cash, total_debt, net_debt<br>• capex, da, nwc, delta_nwc<br>• shares_out_basic, implied_price | • Per-share outputs (if shares missing)<br>• Detailed debt schedule (if debt components missing)<br>• Operating forecast (if revenue/margins missing) |
| **Full** | • All MVP inputs<br>• revenue (for operating forecast)<br>• ebitda (for margin assumptions) | • All optional inputs | • None (all outputs enabled) |

### M&A

| Mode | Required Inputs | Optional Inputs | Suppressed Outputs |
|------|----------------|-----------------|-------------------|
| **MVP** | • Acquirer: revenue, ebitda, net_income, shares_out_basic<br>• Target: revenue, ebitda, net_income<br>• enterprise_value (deal value) | • cash, total_debt, net_debt<br>• interest_expense, tax_expense<br>• ebit, da<br>• debt_rate, tax_rate_assumption | • Synergies (if not user-provided)<br>• Integration costs (if not user-provided)<br>• Detailed pro forma adjustments (if components missing) |
| **Full** | • All MVP inputs<br>• debt_rate<br>• tax_rate_assumption | • Synergies (optional, user-entered only)<br>• Integration costs (optional, user-entered) | • None (all outputs enabled) |

## 3. User Prompt Plan UI Copy

### Example: DCF MVP Mode

```typescript
{
  title: "Missing Inputs for DCF Valuation (MVP Mode)",
  description: "Please provide the following 5 required inputs to generate the MVP output. Some outputs may be suppressed in MVP mode.",
  fields: [
    {
      key: "rf_rate",
      label: "Risk-Free Rate",
      description: "Required for WACC calculation (typically 10Y Treasury yield)",
      hint: "Typically 3-5% for US markets. Current 10Y Treasury yield recommended.",
      unit: "percent",
      default: 0.04,
      defaultLabel: "Default: 4.0% (10Y Treasury)",
      validation: {
        min: 0,
        max: 1,
        required: true,
        errorMessages: {
          required: "Risk-free rate is required",
          min: "Rate must be >= 0%",
          max: "Rate must be <= 100%",
          format: "Please enter a valid percentage (e.g., 0.04 for 4%)"
        }
      },
      priority: 1
    },
    {
      key: "equity_risk_premium",
      label: "Equity Risk Premium",
      description: "Required for WACC calculation",
      hint: "Typically 5-7% for US markets. Historical average recommended.",
      unit: "percent",
      default: 0.06,
      defaultLabel: "Default: 6.0% (US Market Average)",
      validation: {
        min: 0,
        max: 1,
        required: true,
        errorMessages: {
          required: "Equity risk premium is required",
          min: "Rate must be >= 0%",
          max: "Rate must be <= 100%",
          format: "Please enter a valid percentage"
        }
      },
      priority: 2
    },
    {
      key: "beta",
      label: "Beta",
      description: "Required for WACC calculation (measures stock volatility vs market)",
      hint: "Typically 0.5-2.0. Use 1.0 if unavailable.",
      unit: "decimal",
      default: 1.0,
      defaultLabel: "Default: 1.0 (Market Average)",
      validation: {
        min: 0,
        max: 5,
        required: true,
        errorMessages: {
          required: "Beta is required",
          min: "Beta must be >= 0",
          max: "Beta must be <= 5",
          format: "Please enter a valid number"
        }
      },
      priority: 3
    },
    {
      key: "cost_of_debt",
      label: "Cost of Debt",
      description: "Required for WACC calculation (interest rate on debt)",
      hint: "Typically 3-8% for investment-grade companies. Use debt yield if available.",
      unit: "percent",
      validation: {
        min: 0,
        max: 1,
        required: true,
        errorMessages: {
          required: "Cost of debt is required",
          min: "Rate must be >= 0%",
          max: "Rate must be <= 100%",
          format: "Please enter a valid percentage"
        }
      },
      priority: 4
    },
    {
      key: "tax_rate_assumption",
      label: "Tax Rate",
      description: "Required for WACC and FCF calculations",
      hint: "Can use effective tax rate from financials if available. Typically 20-25% for US companies.",
      unit: "percent",
      default: 0.25,
      defaultLabel: "Default: 25.0% (US Corporate Rate)",
      validation: {
        min: 0,
        max: 1,
        required: true,
        errorMessages: {
          required: "Tax rate is required",
          min: "Rate must be >= 0%",
          max: "Rate must be <= 100%",
          format: "Please enter a valid percentage"
        }
      },
      priority: 6
    },
    {
      key: "terminal_growth",
      label: "Terminal Growth Rate",
      description: "Required for DCF terminal value calculation",
      hint: "Typically 2-3% for mature companies. Should be less than WACC.",
      unit: "percent",
      default: 0.025,
      defaultLabel: "Default: 2.5% (Long-term GDP Growth)",
      validation: {
        min: 0,
        max: 0.1,
        required: true,
        errorMessages: {
          required: "Terminal growth rate is required",
          min: "Rate must be >= 0%",
          max: "Rate must be <= 10%",
          format: "Please enter a valid percentage"
        }
      },
      priority: 7
    }
  ]
}
```

### UI Component Structure

```tsx
<Modal title={promptPlan.title}>
  <p>{promptPlan.description}</p>
  {promptPlan.fields.map(field => (
    <FormField key={field.key}>
      <Label>{field.label}</Label>
      <Description>{field.description}</Description>
      <Input
        type="number"
        unit={field.unit}
        defaultValue={field.default}
        hint={field.hint}
        validation={field.validation}
      />
      {field.defaultLabel && (
        <DefaultLabel>{field.defaultLabel}</DefaultLabel>
      )}
    </FormField>
  ))}
</Modal>
```

## 4. QC Test Specs

### Test Case Format

```typescript
{
  name: "Test Name",
  description: "What the test validates",
  input: {
    // Input state with reported/derived values
  },
  expected: {
    resolved: {
      // Expected resolved values with status and method
    },
    missing: [
      // Expected missing keys
    ],
    warnings: [
      // Expected warnings
    ]
  }
}
```

### Complete Test Suite

See `qc.test.ts` for all 12 test cases:

1. **Null vs 0 Coercion** - Ensures null never coerced to 0
2. **Negative NI Suppresses P/E** - P/E null if net_income <= 0
3. **Missing EBITDA Suppresses EV/EBITDA** - Multiple null if denominator missing
4. **Shares Derived Only When Aligned** - Shares derived only if market_cap and price exist
5. **Tax Rate Derived Only When Pre-tax > 0** - Cannot compute if pre-tax <= 0
6. **EV Derivation Hierarchy** - Proper order: market_cap + net_debt
7. **Outlier Warnings** - Warn if shares outside bounds
8. **Outlier Warnings (Multiples)** - Warn if multiples outside bounds
9. **No Object Coercion** - Ensure [object Object] never appears
10. **Never Overwrite Reported** - Derived never overwrites reported
11. **Policy-Based Labeling** - D&A from policy labeled correctly
12. **Missing Denominator Suppression** - Multiples null if denominator missing

### Running Tests

```typescript
import { runAllQCTests } from '@/lib/financialMathEngine';

const results = runAllQCTests();
console.log(`Passed: ${results.passed}, Failed: ${results.failed}`);
results.results.forEach(result => {
  if (!result.passed) {
    console.error(`${result.test}: ${result.errors.join(', ')}`);
  }
});
```

## 5. Module Structure

### File Organization

```
finmodai-next/lib/financialMathEngine/
├── types.ts                    # Canonical keys, FinancialValue, ProvenanceStatus
├── rules.ts                    # Derivation rules registry (18 rules)
├── solver.ts                   # Iterative solver
├── financeMath.ts              # NPV/IRR/XNPV/XIRR
├── missingDataMap.ts           # Missing data categorization (30+ datapoints)
├── modelRequirements.ts        # Model-specific required keys (legacy)
├── modelModes.ts               # MVP vs Full output modes
├── userPrompts.ts              # Prioritized user prompt generation
├── qc.test.ts                  # QC test cases (12 tests)
├── SUPPRESSION_RULES.ts        # Explicit suppression rules
├── GUARDRAILS.md               # Non-negotiable rules
├── index.ts                    # Main entry point
├── README.md                   # Documentation
├── IMPLEMENTATION_STRUCTURE.md # File organization
├── IMPLEMENTATION_READY.md     # This file
└── V2_SUMMARY.md               # v2 summary
```

### Key Exports

```typescript
// Core Engine
export { resolve, getProvenance, getKeysByStatus } from './solver';
export { DERIVATION_RULES, getRulesForOutput } from './rules';
export { npv, irr, xnpv, xirr } from './financeMath';

// Missing Data Map
export { MISSING_DATA_MAP, getMissingDataPoint } from './missingDataMap';

// Model Modes
export { getModelModeRequirements, canRunMVP, canRunFull } from './modelModes';

// User Prompts
export { generatePromptPlan, generateWACCPrompt } from './userPrompts';

// Suppression Rules
export { shouldSuppress, getSuppressedOutputs } from './SUPPRESSION_RULES';

// QC Tests
export { runAllQCTests } from './qc.test';
```

### Integration Points

1. **API Routes**: Use `canRunMVP()` / `canRunFull()` to check mode, `generatePromptPlan()` for missing inputs
2. **Excel Generators**: Use `getProvenance()` for notes, `shouldSuppress()` for conditional outputs
3. **Preview Components**: Use `getProvenance()` for tooltips, `getSuppressedOutputs()` for warnings
4. **User Modals**: Use `generatePromptPlan()` output directly for form fields

## Implementation Checklist

- [x] Missing Data Map complete (30+ datapoints)
- [x] MVP vs Full input tables for all 5 models
- [x] User Prompt Plan with UI copy
- [x] QC test specs (12 test cases)
- [x] Module structure documented
- [x] Guardrails documented
- [x] Suppression rules explicit
- [x] No unauthorized derivations
- [x] No estimates/consensus
- [x] All outputs typed and exported

## Status: ✅ Implementation-Ready

All deliverables complete, guardrails enforced, suppression rules explicit, and ready for integration.
