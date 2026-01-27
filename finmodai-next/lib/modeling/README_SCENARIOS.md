# Scenario Support for Computable Models

## Overview

When `buildModel=true`, models automatically generate Base, Upside, and Downside scenarios by shocking 1-2 key inputs and re-evaluating the model for each scenario.

## Usage

```typescript
import { evaluateModel } from '@/lib/modeling/evaluator';

// Auto-generate scenarios
const result = evaluateModel(artifact, inputOverrides, {
  generateScenarios: true, // Automatically creates Base, Upside, Downside
});

// Or provide pre-defined scenarios
const result = evaluateModel(artifact, inputOverrides, {
  scenarios: [
    { id: 'base', name: 'Base', inputShocks: {} },
    { id: 'upside', name: 'Upside', inputShocks: { growth_rate: 1.2 } },
  ],
});
```

## Series Keys

Output series are prefixed with scenario name:
- `revenue__Base`
- `revenue__Upside`
- `revenue__Downside`
- `profit__Base`
- `profit__Upside`
- `profit__Downside`

## Charts

Charts support multi-line rendering. When multiple scenarios exist, charts will have:
- `yKey`: Array of keys (e.g., `['revenue__Base', 'revenue__Upside', 'revenue__Downside']`)
- `scenarios`: Array of scenario IDs (e.g., `['Base', 'Upside', 'Downside']`)

## Key Input Selection

The system automatically identifies 1-2 key inputs to shock based on:
1. **Objective metric path**: Inputs that directly impact the objective metric
2. **Output dependencies**: Inputs referenced by many outputs
3. **Key driver patterns**: Inputs with names like "growth", "margin", "price", "churn", etc.

## Shock Magnitude

Default shock is ±20% (configurable via `generateScenarios(artifact, shockPercent)`):
- **Upside**: Positive inputs increased (+20%), negative inputs decreased (-20%)
- **Downside**: Positive inputs decreased (-20%), negative inputs increased (+20%)

## Example Output

```typescript
{
  rows: [
    { period: '2024 Q1', scenario: 'Base', revenue: 1000, profit: 300 },
    { period: '2024 Q1', scenario: 'Upside', revenue: 1200, profit: 400 },
    { period: '2024 Q1', scenario: 'Downside', revenue: 800, profit: 200 },
    // ... more periods
  ],
  series: {
    'revenue__Base': [1000, 1100, 1210, ...],
    'revenue__Upside': [1200, 1320, 1452, ...],
    'revenue__Downside': [800, 880, 968, ...],
    'profit__Base': [300, 330, 363, ...],
    // ...
  },
  charts: [
    {
      name: 'Revenue',
      chartType: 'line',
      xKey: 'period',
      yKey: ['revenue__Base', 'revenue__Upside', 'revenue__Downside'],
      scenarios: ['Base', 'Upside', 'Downside'],
      data: [...]
    }
  ],
  scenarios: [
    { id: 'base', name: 'Base', inputShocks: {} },
    { id: 'upside', name: 'Upside', inputShocks: { growth_rate: 1.2 } },
    { id: 'downside', name: 'Downside', inputShocks: { growth_rate: 0.8 } },
  ]
}
```

