# CapitalBase Financial Math Engine - Implementation Structure

## File Organization

```
finmodai-next/lib/financialMathEngine/
├── types.ts                    # Canonical keys, FinancialValue, ProvenanceStatus
├── rules.ts                    # Derivation rules registry
├── solver.ts                   # Iterative solver with cycle prevention
├── financeMath.ts              # NPV/IRR/XNPV/XIRR implementations
├── missingDataMap.ts           # Comprehensive missing data categorization
├── modelRequirements.ts        # Model-specific required keys (legacy)
├── modelModes.ts               # MVP vs Full output mode requirements
├── userPrompts.ts              # Prioritized user prompt generation
├── qc.test.ts                  # Quality control test cases
├── examples.ts                 # Usage examples and documentation
├── index.ts                    # Main entry point (exports)
├── README.md                   # Comprehensive documentation
└── IMPLEMENTATION_STRUCTURE.md # This file

finmodai-next/lib/models/
├── comps/
│   └── requirements.ts        # Comps-specific requirements (if needed)
├── dcf/
│   └── requirements.ts        # DCF-specific requirements (if needed)
├── threeStatement/
│   └── requirements.ts        # 3-Statement-specific requirements (if needed)
├── lbo/
│   └── requirements.ts        # LBO-specific requirements (if needed)
└── merger/
    └── requirements.ts        # M&A-specific requirements (if needed)
```

## Module Responsibilities

### Core Engine (`financialMathEngine/`)

#### `types.ts`
- **Purpose**: Canonical data dictionary and type definitions
- **Exports**:
  - `FinancialKey` - All canonical keys
  - `FinancialValue` - Value with provenance
  - `ProvenanceStatus` - Status types
  - `ConfidenceLevel` - Confidence levels
  - `DerivationRule` - Rule interface
  - `ResolvedState` - Solver output
  - `ModelRequirements` - Model requirements interface

#### `rules.ts`
- **Purpose**: Extensible registry of derivation rules
- **Exports**:
  - `DERIVATION_RULES` - Array of all rules
  - `getRulesForOutput(key)` - Get rules for a specific output key
  - `getRulesByCategory()` - Get rules grouped by category
- **Structure**: Each rule includes:
  - `id`, `name`, `outputKey`, `requiredInputs`, `optionalInputs`
  - `derive()` function
  - `validate()` function (optional)
  - `confidence`, `category`

#### `solver.ts`
- **Purpose**: Iterative solver that applies rules until convergence
- **Exports**:
  - `resolve(inputs)` - Main solver function
  - `getProvenance(state, key)` - Get provenance for a key
  - `getKeysByStatus(state, status)` - Get keys by status
  - `formatResolvedState(state)` - Format for display
- **Algorithm**:
  1. Start with input state
  2. Iterate rules until no new values derived
  3. Track applied rules and warnings
  4. Never overwrite reported values
  5. Prevent cycles

#### `financeMath.ts`
- **Purpose**: Finance math library (NPV, IRR, XNPV, XIRR)
- **Exports**:
  - `discountFactor(rate, years)`
  - `discountFactorDays(rate, startDate, endDate)`
  - `npv(cashFlows, discountRate)`
  - `xnpv(cashFlows, dates, discountRate)`
  - `irr(cashFlows, guess)`
  - `xirr(cashFlows, dates, guess)`
- **Features**: Robust numerical methods with convergence checks

#### `missingDataMap.ts`
- **Purpose**: Comprehensive categorization of missing datapoints
- **Exports**:
  - `MISSING_DATA_MAP` - Array of all missing data points
  - `DerivationCategory` - Category types
  - `MissingDataPoint` - Data point interface
  - `getMissingDataPoint(key)` - Get by key
  - `getMissingDataPointsByCategory(category)` - Get by category
  - `getDerivableKeys()` - Get all derivable keys
  - `getNonDerivableKeys()` - Get all non-derivable keys

#### `modelModes.ts`
- **Purpose**: MVP vs Full output mode requirements
- **Exports**:
  - `ModelModeRequirements` - Interface
  - `COMPS_MODES`, `DCF_MODES`, `THREE_STATEMENT_MODES`, `LBO_MODES`, `MERGER_MODES`
  - `getModelModeRequirements(modelType, mode)` - Get requirements
  - `canRunMVP(modelType, state)` - Check if MVP can run
  - `canRunFull(modelType, state)` - Check if Full can run

#### `userPrompts.ts`
- **Purpose**: Prioritized user prompt generation
- **Exports**:
  - `PromptPlan` - Interface
  - `PromptField` - Field interface
  - `generatePromptPlan(modelType, mode, state)` - Generate prompt plan
  - `generateWACCPrompt(state)` - Generate WACC-specific prompt
- **Features**:
  - Prioritized fields (lower number = higher priority)
  - Unit preferences (shares, USD mm, percent)
  - Default values with labels
  - Validation rules
  - UI copy (title, description, hints)

#### `qc.test.ts`
- **Purpose**: Quality control test cases
- **Exports**:
  - `QCTestCase` - Test case interface
  - `QC_TEST_CASES` - Array of all test cases
  - `runQCTest(testCase)` - Run single test
  - `runAllQCTests()` - Run all tests
- **Test Coverage**:
  - Null vs 0 coercion
  - Negative NI suppresses P/E
  - Missing EBITDA suppresses EV/EBITDA
  - Shares derivation
  - Tax rate derivation
  - EV hierarchy
  - Outlier warnings
  - No object coercion
  - Never overwrite reported
  - Policy-based labeling
  - Missing denominator suppression

#### `modelRequirements.ts` (Legacy)
- **Purpose**: Model-specific required keys (kept for backward compatibility)
- **Exports**:
  - `COMPS_REQUIREMENTS`, `DCF_REQUIREMENTS`, etc.
  - `getModelRequirements(modelType)`
  - `getMissingRequiredKeys(modelType, state)`
  - `getMissingAssumptionKeys(modelType, state)`

#### `index.ts`
- **Purpose**: Main entry point
- **Exports**: All public APIs from above modules

### Model-Specific Modules (`models/{model}/`)

Each model type can have its own `requirements.ts` if needed for model-specific logic:

#### `models/comps/requirements.ts`
- Comps-specific validation
- Peer selection requirements
- Summary statistics requirements

#### `models/dcf/requirements.ts`
- DCF-specific validation
- Terminal value method requirements
- WACC calculation requirements

#### `models/threeStatement/requirements.ts`
- 3-Statement-specific validation
- Balance sheet reconciliation requirements
- Cash flow tie requirements

#### `models/lbo/requirements.ts`
- LBO-specific validation
- Debt schedule requirements
- Returns calculation requirements

#### `models/merger/requirements.ts`
- M&A-specific validation
- Pro forma requirements
- Accretion/dilution requirements

## Usage Patterns

### Basic Usage

```typescript
import { resolve, getModelModeRequirements } from '@/lib/financialMathEngine';

// Input: Reported values from API
const input = {
  price: { value: 150.50, status: 'reported', ... },
  market_cap: { value: 150000000000, status: 'reported', ... },
  // ... more reported values
};

// Resolve missing values
const resolved = resolve(input);

// Check if model can run in MVP mode
const { canRun, missing } = canRunMVP('dcf', resolved.resolved);
```

### Model Mode Check

```typescript
import { getModelModeRequirements, canRunMVP } from '@/lib/financialMathEngine';

const mvpReqs = getModelModeRequirements('dcf', 'mvp');
const { canRun, missing } = canRunMVP('dcf', state);
```

### User Prompt Generation

```typescript
import { generatePromptPlan } from '@/lib/financialMathEngine';

const promptPlan = generatePromptPlan('dcf', 'mvp', state, {
  shares_out_basic: 'shares_mm',
  revenue: 'usd_mm',
});
```

### QC Testing

```typescript
import { runAllQCTests } from '@/lib/financialMathEngine/qc.test';

const results = runAllQCTests();
console.log(`Passed: ${results.passed}, Failed: ${results.failed}`);
```

## Integration Points

### API Routes

```typescript
// app/api/generateModel/route.ts
import { resolve, canRunMVP, generatePromptPlan } from '@/lib/financialMathEngine';

// Before generating model
const resolved = resolve(apiData);
const { canRun, missing } = canRunMVP(modelType, resolved.resolved);

if (!canRun) {
  const promptPlan = generatePromptPlan(modelType, 'mvp', resolved.resolved);
  return Response.json({ missing: promptPlan });
}
```

### Excel Generators

```typescript
// lib/models/{model}/excel.ts
import { getProvenance } from '@/lib/financialMathEngine';

// When writing values to Excel
const sharesProvenance = getProvenance(resolvedState, 'shares_out_basic');
if (sharesProvenance?.status === 'derived') {
  // Add note about derivation
}
```

### Preview Components

```typescript
// components/models/previews/{Model}Preview.tsx
import { getProvenance } from '@/lib/financialMathEngine';

// Display provenance in tooltip
const provenance = getProvenance(state, 'shares_out_basic');
if (provenance?.status === 'derived') {
  // Show tooltip: "Derived from Market Cap ÷ Price"
}
```

## Extension Points

### Adding a New Derivation Rule

1. Add rule to `rules.ts` in `DERIVATION_RULES` array
2. Add corresponding entry to `missingDataMap.ts`
3. Add test case to `qc.test.ts` if applicable

### Adding a New Model Type

1. Add mode requirements to `modelModes.ts`
2. Add requirements to `modelRequirements.ts` (if needed)
3. Add prompt generation logic to `userPrompts.ts`
4. Create model-specific module in `models/{newModel}/`

### Adding a New Finance Math Function

1. Add function to `financeMath.ts`
2. Export from `index.ts`
3. Add usage example to `examples.ts`

## Testing Strategy

1. **Unit Tests**: Each module has focused unit tests
2. **QC Tests**: `qc.test.ts` contains regression prevention tests
3. **Integration Tests**: Test full solver with realistic inputs
4. **Model Tests**: Test each model type with MVP and Full modes

## Performance Considerations

- Solver has max iterations (50) to prevent infinite loops
- Rules are applied in order (no parallelization needed for correctness)
- Provenance tracking adds minimal overhead
- Finance math functions use efficient algorithms

## Security Considerations

- Never trust user input without validation
- All numeric inputs validated for range and type
- No eval() or dynamic code execution
- Provenance tracking provides audit trail
