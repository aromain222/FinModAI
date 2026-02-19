# CapitalBase Financial Math Engine v2 - Summary

## Overview

The Financial Math Engine v2 adds the operational layer that makes the engine usable across all model types (Comps, 3-Statement, DCF, LBO, M&A). It provides:

1. **Missing Data Map** - Comprehensive categorization of all datapoints
2. **Model-Specific Minimum Inputs** - MVP vs Full output modes
3. **User Prompt Plan** - Prioritized prompts with UI copy
4. **Quality Control Tests** - Regression prevention
5. **Implementation Structure** - Clear file organization

## Deliverables

### 1. Missing Data Map (`missingDataMap.ts`)

**Purpose**: Categorize every datapoint that may be missing from APIs

**Categories**:
- `derivable_hard_identity` - Always computable if inputs exist (accounting identity)
- `derivable_assumption_dependent` - Computable only if user/historical policy provided
- `not_derivable_user_choice` - Cannot be computed honestly - requires user input
- `parseable_ai_parse` - Can be obtained if user pastes text/table

**Structure**: Each datapoint includes:
- Canonical key
- Description
- Allowed derivation formulas
- Required inputs
- Validity checks
- Confidence level
- Fallbacks

**Coverage**: 30+ datapoints across:
- Market data (price, market_cap, shares)
- Capital structure (debt, cash, EV)
- Income statement (revenue, EBITDA, EBIT, D&A, taxes)
- Cash flow (CFO, Capex, FCF)
- Working capital (NWC, ΔNWC)
- Multiples (EV/EBITDA, EV/Revenue, P/E)
- Assumptions (WACC inputs, terminal growth, exit multiples)

### 2. Model-Specific Minimum Inputs (`modelModes.ts`)

**Purpose**: Define MVP vs Full output modes for each model type

**MVP Mode**:
- Minimum required inputs to generate useful output
- Some outputs suppressed (e.g., per-share if shares missing)
- Clearly labeled assumption-driven values

**Full Mode**:
- All inputs needed for complete analysis
- All outputs enabled (per-share, sensitivities, etc.)

**Model Coverage**:
- **Trading Comps**: MVP shows table + medians where possible; Full includes all multiples + per-share
- **DCF**: MVP produces EV-only; Full includes per-share + sensitivities
- **3-Statement**: MVP allows simple driver model; Full requires complete statements
- **LBO**: MVP produces returns + basic debt schedule; Full includes operating forecast + per-share
- **M&A**: MVP produces basic accretion/dilution; Full includes complete pro forma

**Functions**:
- `getModelModeRequirements(modelType, mode)` - Get requirements
- `canRunMVP(modelType, state)` - Check if MVP can run
- `canRunFull(modelType, state)` - Check if Full can run

### 3. User Prompt Plan (`userPrompts.ts`)

**Purpose**: Generate prioritized, user-friendly prompts for missing inputs

**Features**:
- **Prioritization**: Lower number = higher priority (1-10: Critical for MVP, 11-20: Important for Full, 21-30: Optional)
- **Unit Preferences**: Shares vs shares_mm, USD vs USD_mm, percent
- **Default Values**: Only for assumptions, clearly labeled (e.g., "Default: 4.0% (10Y Treasury)")
- **Validation**: Min/max ranges, required checks, format validation
- **UI Copy**: Title, description, hints, error messages

**Special Functions**:
- `generatePromptPlan(modelType, mode, state)` - Generate full prompt plan
- `generateWACCPrompt(state)` - Generate WACC-specific prompt (for DCF)

**Example Output**:
```typescript
{
  title: "Missing Inputs for DCF Valuation (MVP Mode)",
  description: "Please provide the following 5 required inputs...",
  fields: [
    {
      key: "rf_rate",
      label: "Risk-Free Rate",
      description: "Required for WACC calculation",
      hint: "Typically 3-5% for US markets",
      unit: "percent",
      default: 0.04,
      defaultLabel: "Default: 4.0% (10Y Treasury)",
      validation: { min: 0, max: 1, required: true, ... },
      priority: 1
    },
    // ... more fields
  ]
}
```

### 4. Quality Control Tests (`qc.test.ts`)

**Purpose**: Prevent regressions and ensure data integrity

**Test Coverage** (12 test cases):
1. **Null vs 0 Coercion** - Ensure null values never coerced to 0
2. **Negative NI Suppresses P/E** - P/E should be null if net income <= 0
3. **Missing EBITDA Suppresses EV/EBITDA** - Multiple should be null if denominator missing
4. **Shares Derived Only When Aligned** - Shares derived only if market_cap and price exist and aligned
5. **Tax Rate Derived Only When Pre-tax > 0** - Cannot compute if pre-tax income <= 0
6. **EV Derivation Hierarchy** - Proper order: market_cap + net_debt (with net_debt = total_debt - cash)
7. **Outlier Warnings** - Warn if shares outside plausible bounds (1M - 100B)
8. **Outlier Warnings (Multiples)** - Warn if multiples outside reasonable bounds
9. **No Object Coercion** - Ensure [object Object] never appears
10. **Never Overwrite Reported** - Derived values never overwrite reported values
11. **Policy-Based Labeling** - D&A from policy labeled as `derived_from_assumption`
12. **Missing Denominator Suppression** - Multiples null if denominator missing

**Functions**:
- `runQCTest(testCase)` - Run single test
- `runAllQCTests()` - Run all tests, return summary

### 5. Implementation Structure (`IMPLEMENTATION_STRUCTURE.md`)

**Purpose**: Document file organization and usage patterns

**Key Sections**:
- File organization (complete directory structure)
- Module responsibilities (what each file does)
- Usage patterns (code examples)
- Integration points (how to use in API routes, Excel generators, preview components)
- Extension points (how to add new rules, models, functions)
- Testing strategy
- Performance considerations
- Security considerations

## Integration Examples

### API Route Integration

```typescript
import { resolve, canRunMVP, generatePromptPlan } from '@/lib/financialMathEngine';

// Before generating model
const resolved = resolve(apiData);
const { canRun, missing } = canRunMVP(modelType, resolved.resolved);

if (!canRun) {
  const promptPlan = generatePromptPlan(modelType, 'mvp', resolved.resolved);
  return Response.json({ missing: promptPlan });
}

// Generate model with resolved state
const model = generateModel(modelType, resolved.resolved);
```

### Excel Generator Integration

```typescript
import { getProvenance } from '@/lib/financialMathEngine';

// When writing values to Excel
const sharesProvenance = getProvenance(resolvedState, 'shares_out_basic');
if (sharesProvenance?.status === 'derived') {
  // Add note: "Shares derived from Market Cap ÷ Price"
  sheet.getCell(row, col).note = sharesProvenance.method;
}
```

### Preview Component Integration

```typescript
import { getProvenance } from '@/lib/financialMathEngine';

// Display provenance in tooltip
const provenance = getProvenance(state, 'shares_out_basic');
if (provenance?.status === 'derived') {
  <Tooltip>
    <TooltipTrigger>Shares Outstanding</TooltipTrigger>
    <TooltipContent>
      {provenance.method} (Confidence: {provenance.confidence})
    </TooltipContent>
  </Tooltip>
}
```

## Key Principles Enforced

1. **Never Guess**: Only use provable accounting identities and defensible math
2. **Full Provenance**: Every value tracks source, method, confidence, warnings
3. **Never Coerce Null to 0**: Preserves data integrity
4. **Never Overwrite Reported**: Respects API data
5. **Assumption Tracking**: Policy-based derivations labeled as `derived_from_assumption`
6. **Missing Denominator Suppression**: Multiples null if denominator missing or <= 0
7. **Outlier Warnings**: Warn if values outside plausible bounds
8. **Prioritized Prompts**: Ask for smallest set of inputs first

## Files Created/Updated

### New Files
- `missingDataMap.ts` - Comprehensive missing data categorization
- `modelModes.ts` - MVP vs Full output mode requirements
- `userPrompts.ts` - Prioritized user prompt generation
- `qc.test.ts` - Quality control test cases
- `IMPLEMENTATION_STRUCTURE.md` - File organization documentation
- `V2_SUMMARY.md` - This file

### Updated Files
- `index.ts` - Added exports for new modules

## Next Steps

1. **Integration**: Integrate into API routes and Excel generators
2. **UI Components**: Build prompt modals using `generatePromptPlan` output
3. **Testing**: Run QC tests in CI/CD pipeline
4. **Documentation**: Add usage examples to README
5. **Monitoring**: Track which rules are applied most frequently
6. **Optimization**: Profile solver performance with large datasets

## Status

✅ **Complete**: All deliverables implemented and tested
✅ **Linted**: No linter errors
✅ **Documented**: Comprehensive documentation and examples
✅ **Ready for Integration**: Can be integrated into existing codebase
