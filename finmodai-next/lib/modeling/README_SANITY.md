# Model Sanity Checks

## Overview

Model sanity checks automatically validate and clamp invalid input values, preventing unrealistic models while providing warnings instead of failing.

## Sanity Checks

### 1. **Revenue, Price, Units >= 0**
- Negative values are clamped to 0
- Warning: `negative_revenue_price_units`

### 2. **Churn, Margins <= 100%**
- Values exceeding 100% (or 1.0 if decimal) are clamped
- Supports both percentage format (0-100) and decimal format (0-1)
- Warning: `exceeds_max_percentage`

### 3. **Growth Rate Bounds [-50%, +100%]**
- Growth rates must be within [-50%, +100%] (or [-0.5, +1.0] if decimal)
- Values outside bounds are clamped
- Detects format based on unit field or value magnitude
- Warnings: `growth_too_negative`, `growth_too_high`

### 4. **Exponential Blowups**
- Detects growth rates > 100% per period between consecutive periods
- Detects values exceeding reasonable bounds (> 1 trillion)
- Warning: `exponential_blowup`, `value_too_large`

## Usage

Sanity checks run automatically when calling `evaluateModel()`:

```typescript
import { evaluateModel } from '@/lib/modeling/evaluator';

const result = evaluateModel(artifact);

// Check sanity results
if (result.sanity) {
  console.log('Sanity checks:', result.sanity.passed);
  console.log('Issues:', result.sanity.issues);
  console.log('Clamped inputs:', result.sanity.clamped_inputs);
}
```

## Decision Signal

The evaluator automatically computes a decision signal based on the objective metric trajectory:

```typescript
if (result.decision_signal) {
  console.log('Direction:', result.decision_signal.direction); // 'up' | 'down' | 'neutral'
  console.log('Magnitude:', result.decision_signal.magnitude); // 0-1 scale
  console.log('Explanation:', result.decision_signal.explanation);
}
```

The decision signal:
- Analyzes objective metric from start to end of time series
- Determines direction: up (positive trajectory), down (negative), or neutral (< 5% change)
- Calculates magnitude: 0-1 scale based on percentage change
- Includes scenario context if multiple scenarios exist

## Input Tagging

Inputs support `source` and confidence tagging:

### Source Field
Already supported in `ModelInputSchema`:
- `source: 'user'` - User-provided input
- `source: 'inferred'` - Inferred or estimated from data
- `source: 'placeholder'` - Placeholder/default value

### Confidence (Future Enhancement)
While not yet in the schema, confidence can be tracked:
- `high` - User-provided or well-validated
- `medium` - Inferred with reasonable confidence
- `low` - Placeholder or unvalidated

### Helper Function

```typescript
import { tagInputsWithConfidence } from '@/lib/modeling/sanity';

const taggedArtifact = tagInputsWithConfidence(artifact, {
  revenue: 'high',
  growth_rate: 'medium',
}, {
  revenue: 'user',
  growth_rate: 'inferred',
});
```

## Behavior

- **Clamp, don't fail**: Invalid values are clamped to valid ranges
- **Warn, don't error**: Issues are logged as warnings, not errors
- **Preserve structure**: Model structure is preserved, only values are adjusted
- **Traceable**: All clamped values are tracked in `sanity.clamped_inputs`

## Example

```typescript
const artifact = {
  model: {
    inputs: [
      { key: 'revenue', label: 'Revenue', value: -1000 }, // Will be clamped to 0
      { key: 'churn_rate', label: 'Churn Rate', value: 150, unit: '%' }, // Will be clamped to 100%
      { key: 'growth_rate', label: 'Growth Rate', value: 1.5 }, // Will be clamped to 1.0
    ],
    // ...
  }
};

const result = evaluateModel(artifact);

// result.sanity.issues will contain warnings for each clamped value
// result.sanity.clamped_inputs will show the clamped values
// The model will still evaluate, but with valid inputs
```

