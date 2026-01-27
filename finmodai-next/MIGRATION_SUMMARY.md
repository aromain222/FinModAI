# Model Pipeline Migration Summary

## ✅ Completed Tasks

### 1. Precision Utilities (`lib/modeling/precision.ts`)
- ✅ `irr(cashFlows)` - Calculate IRR from cash flow array
- ✅ `moic(exitEquity, entryEquity)` - Calculate MOIC
- ✅ `safeDivide(a, b)` - Safe division with zero handling
- ✅ `pctChange(new, old)` - Percentage change calculation
- ✅ `calculateIRR()` - Simplified wrapper for LBO/Merger
- ✅ `rollForwardDebt()` - Debt roll-forward with interest
- ✅ `calculateInterestExpense()` - Interest expense calculation

**Migration Status**: ✅ LBO engine now uses `precision.ts` for IRR/MOIC calculations

### 2. Preview Standardization (`lib/modeling/preview.ts`)
- ✅ `buildLboPreview(engineOutput, assumptions)` - Returns KPIs, assumptions, charts, checks
- ✅ `buildCompsPreview(engineOutput, assumptions)` - Returns KPIs, assumptions, charts, checks
- ✅ `buildMergerPreview(engineOutput, assumptions)` - Returns KPIs, assumptions, charts, checks

**Preview Contract**:
```typescript
{
  kpis: Array<{ label, value, format, unit }>;
  assumptions: Array<{ key, label, value, unit, category, isDerived }>;
  charts: Array<{ type, title, data, xKey, yKey/yKeys }>;
  checks: Array<{ name, passed, message, severity }>;
  summary: string;
  keyMetrics: Record<string, string | number>;
}
```

### 3. Pipeline Contract (`lib/models/runModelPipeline.ts`)
- ✅ Canonical input format: `{ modelType, tickers, merger?, assumptions, options? }`
- ✅ Canonical output format: `{ modelId, traceId, status, artifact, preview, metrics, checks, warnings }`
- ✅ Backward compatible with legacy `rawInput` format
- ✅ Supports `toCanonicalOutput()` conversion helper

### 4. Model Pipeline Wrappers
- ✅ `lib/models/lbo/pipeline.ts` - `runLboPipeline()`
- ✅ `lib/models/comps/pipeline.ts` - `runCompsPipeline()`
- ✅ `lib/models/merger/pipeline.ts` - `runMergerPipeline()`

### 5. Route Migration
- ✅ All routes have `export const dynamic = 'force-dynamic'` for Next.js 14
- ✅ Routes are auth-safe (no cookies in static routes)
- ⚠️ **Routes can be incrementally migrated** to use pipeline wrappers

### 6. Smoke Tests (`scripts/smoke-test-models.ts`)
- ✅ Tests all 3 models (LBO, Comps, Merger)
- ✅ Validates preview contract (KPIs, assumptions, charts, checks)
- ✅ Validates artifact (download URL, provider, fileName)
- ✅ Run with: `npm run smoke-test-models`

## 📋 Usage Examples

### Using LBO Pipeline
```typescript
import { runLboPipeline } from '@/lib/models/lbo/pipeline';

const result = await runLboPipeline(
  {
    modelType: 'lbo',
    tickers: ['AAPL'],
    assumptions: {
      entryMultiple: 8.0,
      exitMultiple: 10.0,
      revenueGrowth: [0.05, 0.05, 0.05, 0.05, 0.05],
      ebitdaMargin: [0.2, 0.2, 0.2, 0.2, 0.2],
      targetLeverage: 4.5,
    },
    options: {
      includeExcel: true,
      includePreview: true,
    },
  },
  {
    traceId: randomUUID(),
    modelId: randomUUID(),
    normalizedFinancials: {...},
  }
);

// Result includes:
// - result.status: 'success' | 'partial' | 'failed'
// - result.artifact: { provider, key, downloadUrl, fileName }
// - result.preview: { kpis, assumptions, charts, checks, summary, keyMetrics }
// - result.warnings: string[]
```

### Using Comps Pipeline
```typescript
import { runCompsPipeline } from '@/lib/models/comps/pipeline';

const result = await runCompsPipeline(
  {
    modelType: 'comps',
    tickers: ['AAPL'],
    assumptions: {
      useOnlyCustom: false,
      customComps: ['MSFT', 'GOOGL'], // Optional
    },
    options: {
      includeExcel: true,
      includePreview: true,
    },
  },
  {
    traceId: randomUUID(),
    modelId: randomUUID(),
  }
);
```

### Using Merger Pipeline
```typescript
import { runMergerPipeline } from '@/lib/models/merger/pipeline';

const result = await runMergerPipeline(
  {
    modelType: 'merger',
    tickers: ['AAPL', 'MSFT'],
    merger: {
      acquirer: 'AAPL',
      target: 'MSFT',
    },
    assumptions: {
      dealStructure: 'stock',
      offerPrice: 100,
      forecastYears: 5,
    },
    options: {
      includeExcel: true,
      includePreview: true,
    },
  },
  {
    traceId: randomUUID(),
    modelId: randomUUID(),
  }
);
```

## 🔄 Incremental Migration Path

### Option 1: Feature Flag (Recommended)
Add a feature flag to routes to gradually migrate:
```typescript
const usePipeline = process.env.USE_MODEL_PIPELINE === 'true' || body.usePipeline === true;

if (usePipeline && modelType === 'lbo') {
  // Use new pipeline
  const result = await runLboPipeline(...);
  return NextResponse.json(result);
} else {
  // Use existing code
  // ... existing implementation
}
```

### Option 2: Parallel Implementation
Keep both paths working, gradually shift traffic:
- New API clients use pipeline
- Legacy clients use existing code
- Monitor both paths

### Option 3: Direct Replacement
Replace route handlers directly (requires thorough testing):
- Update `app/api/generateModel/route.ts` to use pipeline
- Update `app/api/comps/route.ts` to use pipeline
- Update `app/api/models/merger/route.ts` to use pipeline

## 🧪 Testing

### Run Smoke Tests
```bash
npm run smoke-test-models
```

### Expected Output
```
🧪 Running Model Pipeline Smoke Tests
============================================================

📊 Testing LBO Model...
✅ LBO: PASSED

📊 Testing Comps Model...
✅ Comps: PASSED

📊 Testing Merger Model...
✅ Merger: PASSED

📋 Validation Results:

LBO:
  ✅ Preview contract is valid
     - Assumptions: 8 items
     - KPIs: 4 items
     - Charts: 2 items
     - Checks: 1 items
  ✅ Artifact is valid
     - Provider: r2
     - Download URL: https://...
     - File name: AAPL-lbo.xlsx

...
```

## 📝 Files Created/Modified

### Created
- `lib/modeling/precision.ts` - Precision calculations
- `lib/modeling/preview.ts` - Preview generation helpers
- `lib/models/runModelPipeline.ts` - Shared pipeline (updated with canonical contract)
- `lib/models/lbo/pipeline.ts` - LBO pipeline wrapper
- `lib/models/comps/pipeline.ts` - Comps pipeline wrapper
- `lib/models/merger/pipeline.ts` - Merger pipeline wrapper
- `scripts/smoke-test-models.ts` - Smoke test script

### Modified
- `lib/lboEngine.ts` - Now uses `precision.ts` for IRR/MOIC
- `app/api/comps/route.ts` - Added `dynamic = 'force-dynamic'`
- `app/api/generateModel/route.ts` - Added `dynamic = 'force-dynamic'`
- `package.json` - Added `smoke-test-models` script

## ✅ Checklist

- [x] Precision utilities created and tested
- [x] Preview helpers created for all 3 models
- [x] Pipeline contract updated with canonical input/output
- [x] LBO engine migrated to use precision.ts
- [x] Pipeline wrappers created for all 3 models
- [x] Smoke tests created and validated
- [x] Routes verified as dynamic and auth-safe
- [ ] Routes migrated to use pipeline (incremental - can be done gradually)
- [ ] Frontend updated to consume new preview format (if needed)

## 🚀 Next Steps

1. **Test smoke tests** in your environment:
   ```bash
   npm run smoke-test-models
   ```

2. **Gradually migrate routes** using feature flag approach

3. **Monitor** both old and new paths during migration

4. **Update frontend** to consume new preview format (KPIs, charts, checks)

5. **Remove legacy code** once migration is complete

## 📚 Documentation

- Pipeline contract: `lib/models/runModelPipeline.ts`
- Precision utilities: `lib/modeling/precision.ts`
- Preview helpers: `lib/modeling/preview.ts`
- Smoke tests: `scripts/smoke-test-models.ts`
