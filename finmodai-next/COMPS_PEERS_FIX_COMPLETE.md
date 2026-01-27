# COMPS Generation Crash Fix - COMPLETE

## Problem
Zod validation error: `path ["compsOutput","peers"] expected array received undefined`

The COMPS model generation was crashing because the `peers` field in `compsOutput` could be undefined, but the schema expected an array.

## Root Causes

1. **Schema didn't have default**: `CompsOutputSchema.peers` was required but had no default value
2. **CompsModel → CompsOutput mismatch**: `buildCompsModel` returns `CompsModel` with `comps` field, but schema expects `peers` field
3. **No array guards**: `parseCompsOutput` didn't ensure `peers` was always an array
4. **Frontend assumed peers exists**: Components accessed `output.peers` without null checks

## Fixes Applied

### 1. Schema: Add default empty array

**File:** `lib/schemas/model-output.ts` (Line 145)

```typescript
// BEFORE
peers: z.array(z.object({
  ticker: z.string(),
  name: z.string().optional(),
  evToRevenue: z.number().finite().optional(),
  evToEBITDA: z.number().finite().optional(),
  evToEBIT: z.number().finite().optional(),
  pe: z.number().finite().optional(),
})),

// AFTER
peers: z.array(z.object({
  ticker: z.string(),
  name: z.string().optional(),
  evToRevenue: z.number().finite().optional(),
  evToEBITDA: z.number().finite().optional(),
  evToEBIT: z.number().finite().optional(),
  pe: z.number().finite().optional(),
})).default([]),
```

### 2. Pipeline: Transform CompsModel to CompsOutput

**File:** `lib/models/comps/pipeline.ts` (Lines 103-154)

**Problem:** `buildCompsModel` returns `CompsModel` with `comps` field, but schema expects `peers`.

**Solution:** Transform the output to match the schema:

```typescript
// Build comps model
const compsModel = buildCompsModel(target, peerCompanies as CompanyFinancials[]);

// Transform CompsModel to match CompsOutputSchema
// CompsModel has 'comps' field, but schema expects 'peers'
const compsOutput = {
  target: {
    ticker: compsModel.target.ticker,
    name: compsModel.target.name,
    revenue: compsModel.target.revenue,
    ebitda: compsModel.target.ebitda,
    ebit: compsModel.target.ebit,
    netIncome: compsModel.target.netIncome,
  },
  peers: Array.isArray(compsModel.comps) ? compsModel.comps.map(comp => ({
    ticker: comp.ticker,
    name: comp.name,
    evToRevenue: comp.evToRevenue,
    evToEBITDA: comp.evToEbitda,
    evToEBIT: comp.evToEbit,
    pe: comp.pe,
  })) : [],
  multiplesDistribution: {
    evToRevenue: {
      min: compsModel.stats.evRevenue.min,
      median: compsModel.stats.evRevenue.median,
      max: compsModel.stats.evRevenue.max,
      mean: compsModel.stats.evRevenue.mean,
    },
    evToEBITDA: {
      min: compsModel.stats.evEbitda.min,
      median: compsModel.stats.evEbitda.median,
      max: compsModel.stats.evEbitda.max,
      mean: compsModel.stats.evEbitda.mean,
    },
    pe: {
      min: compsModel.stats.pe.min,
      median: compsModel.stats.pe.median,
      max: compsModel.stats.pe.max,
      mean: compsModel.stats.pe.mean,
    },
  },
  impliedValuation: {
    evToRevenue: compsModel.impliedValuation.evRevenueMedian,
    evToEBITDA: compsModel.impliedValuation.evEbitdaMedian,
    evToEBIT: compsModel.impliedValuation.evEbitMedian,
    pe: compsModel.impliedValuation.peMedian,
  },
};

return {
  output: compsOutput,
  warnings: [],
};
```

### 3. Parser: Ensure peers is always an array

**File:** `lib/models/parseModelOutput.ts` (Lines 313-318)

```typescript
// BEFORE
export function parseCompsOutput(data: any): CompsOutput | null {
  try {
    const compsData = data.compsModel || data.comps || {};
    const peers = compsData.peers || compsData.comps || [];
    const target = compsData.target || {};
    const checks = data.modelChecks ?? data.results?.modelChecks ?? undefined;

// AFTER
export function parseCompsOutput(data: any): CompsOutput | null {
  try {
    const compsData = data.compsModel || data.comps || {};
    const rawPeers = compsData.peers || compsData.comps;
    const peers = Array.isArray(rawPeers) ? rawPeers : [];
    const target = compsData.target || {};
    const checks = data.modelChecks ?? data.results?.modelChecks ?? undefined;
```

### 4. Frontend: Add guards and empty state

#### CompsPreview.tsx

**File:** `components/models/previews/CompsPreview.tsx`

**Line 129:** Guard in outlier calculation
```typescript
// BEFORE
const peerValues = output.peers
  .map((peer) => getMetricValue(peer, selectedMetric))
  .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));

// AFTER
const peers = output.peers ?? [];
const peerValues = peers
  .map((peer) => getMetricValue(peer, selectedMetric))
  .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
```

**Line 212:** Guard in peer table
```typescript
// BEFORE
const peerTableRows = [
  { ...output.target, ticker: output.target.ticker || 'Target', isTarget: true },
  ...output.peers.map((peer) => ({ ...peer, isTarget: false })),
];

// AFTER
const peers = output.peers ?? [];
const peerTableRows = [
  { ...output.target, ticker: output.target.ticker || 'Target', isTarget: true },
  ...peers.map((peer) => ({ ...peer, isTarget: false })),
];
```

**Lines 218-240:** Empty state when no peers
```typescript
// Empty state when no peers
if (peers.length === 0) {
  return (
    <PreviewShell
      title="Comps Preview"
      subtitle="Peer multiples, distributions, and implied valuation range"
      badgeText="Comps"
      ticker={safeTicker}
    >
      <Card className="border-[var(--cb-border-subtle)] bg-[var(--cb-surface)]">
        <CardContent className="py-12">
          <div className="text-center">
            <p className="text-sm text-[var(--cb-text-muted)]">
              No peer companies found for comparison.
            </p>
            <p className="mt-2 text-xs text-[var(--cb-text-muted)]">
              Try adding custom comparables or check if the ticker is valid.
            </p>
          </div>
        </CardContent>
      </Card>
    </PreviewShell>
  );
}
```

#### CompsDistributionChart.tsx

**File:** `components/comps/CompsDistributionChart.tsx`

**Line 47:** Guard in distribution stats
```typescript
// BEFORE
const peerValues = output.peers
  .map((peer) => {

// AFTER
const peers = output.peers ?? [];
const peerValues = peers
  .map((peer) => {
```

**Line 83:** Guard in chart data
```typescript
// BEFORE
const peers = output.peers.map((peer) => {

// AFTER
const peers = (output.peers ?? []).map((peer) => {
```

#### CompsAssumptions.tsx

**File:** `components/comps/CompsAssumptions.tsx`

**Lines 50-54:** Guard in peer count display
```typescript
// BEFORE
{output.peers.length > 0 && (
  <div className="pt-2 border-t border-[var(--cb-border-subtle)]">
    <p className="text-xs text-[var(--cb-text-muted)]">
      Analysis based on {output.peers.length} peer{output.peers.length !== 1 ? 's' : ''} selected for{' '}
      {targetTicker}.
    </p>

// AFTER
{(output.peers ?? []).length > 0 && (
  <div className="pt-2 border-t border-[var(--cb-border-subtle)]">
    <p className="text-xs text-[var(--cb-text-muted)]">
      Analysis based on {(output.peers ?? []).length} peer{(output.peers ?? []).length !== 1 ? 's' : ''} selected for{' '}
      {targetTicker}.
    </p>
```

## Branch Coverage

All three branches that construct compsOutput now ensure `peers` is always set:

### Branch 1: Auto-generate peers
- `identifyPeers(ticker)` returns peer list
- Transformed to `peers` array in pipeline
- ✅ Always sets `peers` (empty array if no peers found)

### Branch 2: Blend custom + auto
- `mergePeerSets(autoPeers, customComps, useOnlyCustom)` returns merged list
- Transformed to `peers` array in pipeline
- ✅ Always sets `peers` (empty array if no peers found)

### Branch 3: Use only custom
- `cleanTickerArray(customComps)` returns custom list
- Transformed to `peers` array in pipeline
- ✅ Always sets `peers` (empty array if no custom comps provided)

## Verification

### Schema Validation
- ✅ `peers` field has `.default([])` fallback
- ✅ Zod will never fail validation due to undefined `peers`

### Pipeline Transformation
- ✅ `compsModel.comps` → `compsOutput.peers` mapping
- ✅ `Array.isArray()` check ensures array type
- ✅ Empty array fallback if `comps` is undefined

### Parser Guards
- ✅ `Array.isArray(rawPeers) ? rawPeers : []` ensures array
- ✅ Handles both `compsData.peers` and `compsData.comps` paths

### Frontend Safety
- ✅ All components use `output.peers ?? []` guards
- ✅ Empty state UI when `peers.length === 0`
- ✅ No crashes on undefined `peers`

## Files Changed

| File | Changes | Lines |
|------|---------|-------|
| `lib/schemas/model-output.ts` | Add `.default([])` to peers schema | 145 |
| `lib/models/comps/pipeline.ts` | Transform CompsModel → CompsOutput | 103-154 |
| `lib/models/parseModelOutput.ts` | Add array guard for peers | 316-317 |
| `components/models/previews/CompsPreview.tsx` | Add guards + empty state | 129, 212, 218-240 |
| `components/comps/CompsDistributionChart.tsx` | Add guards | 47, 83 |
| `components/comps/CompsAssumptions.tsx` | Add guards | 50, 53 |

## Testing Checklist

- [x] Schema validation passes with empty peers array
- [x] Pipeline transformation maps `comps` → `peers` correctly
- [x] Parser handles undefined peers gracefully
- [x] Frontend components don't crash on empty peers
- [x] Empty state UI displays when no peers found
- [x] No linter errors

## Result

✅ **COMPS generation will never crash due to undefined peers**

- Schema has default empty array
- Pipeline always sets peers (even if empty)
- Parser ensures array type
- Frontend guards all access
- Empty state UI for zero peers

The fix is complete, systemic, and production-ready.
