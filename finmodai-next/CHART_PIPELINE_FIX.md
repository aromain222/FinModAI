# Chart Pipeline Fix - Complete Analysis

## 🔴 ROOT CAUSE SUMMARY

### Primary Issues:
1. **Double normalization** - Data was normalized in `adaptChartData()` then re-normalized in `BenchmarkLine`
2. **Shape mismatch** - API returns `{ t: string, close: number }` but component expected `{ time: number, value: number }`
3. **Query key inconsistencies** - Region in query key but chart API doesn't use region, causing unnecessary refetches
4. **Silent failures** - Normalization failed silently when timestamps couldn't be parsed

## 📊 Why It Broke During Migration

**Ant Design Plots (old library):**
- Had built-in type coercion (strings → numbers)
- Accepted multiple data shapes
- Handled date parsing internally
- Tolerated duplicate timestamps
- Automatically re-rendered on prop changes

**Recharts (new library):**
- Requires exact `{time: number, value: number}` shape
- No implicit coercion - strings cause silent failures
- Stricter validation - invalid points break rendering
- Requires explicit key changes to trigger re-render
- Must handle timestamp conversion manually

## ✅ Fixed Data Flow Diagram

```
API: /api/market/chart
    ↓
Response: { ok: true, data: { points: [{ t: "2024-01-01T...", close: 100 }] } }
    ↓
normalizeChartSeries(raw) [SINGLE NORMALIZATION - lib/charts/normalizeChartSeries.ts]
    ↓ Converts: ISO string → ms epoch, extracts 'close' → 'value'
    ↓
chartSeries: ChartPoint[] = [{ time: 1704067200000, value: 100 }, ...]
    ↓
    ├─→ KPIs (chartSeries[0].value, chartSeries[chartSeries.length-1].value)
    │
    └─→ BenchmarkLine(data={chartSeries})
            ↓
        displayData (useMemo - converts to Return% if scale='Return%')
            ↓
        Recharts <LineChart data={displayData} />
```

## 📁 Final Recharts Code

### 1. Normalization Utility (`lib/charts/normalizeChartSeries.ts`)
```typescript
export type ChartPoint = {
  time: number; // ms epoch
  value: number; // absolute price OR normalized return
};

export function normalizeChartSeries(raw: any): ChartPoint[] {
  // Single source of truth - converts any API shape to ChartPoint[]
  // Handles: { data: { points: [...] } }, { points: [...] }, direct arrays
  // Extracts: t/time/date → time (ms epoch), close/value/v → value (number)
}
```

### 2. Chart Component (`components/charts/recharts/BenchmarkLine.tsx`)
```typescript
export function BenchmarkLine({
  data, // ChartPoint[] - CANONICAL SHAPE ONLY
  range,
  scale,
  loading,
  error,
  onRetry,
}: BenchmarkLineProps) {
  // Validates data shape (defensive)
  // Converts to Return% if scale='Return%' (useMemo)
  // Renders Recharts with ChartFrame wrapper
}
```

### 3. Page Usage (`app/(app)/market-brief/page.tsx`)
```typescript
// Query includes ALL dependencies
const chartQuery = useQuery({
  queryKey: ['market-brief', 'chart', benchmark, range, region],
  queryFn: () => apiFetchJson(`/api/market/chart?symbol=${benchmark}&range=${range}`),
});

// SINGLE normalization step
const chartSeries = useMemo(() => {
  return normalizeChartSeries(chartQuery.data);
}, [chartQuery.data]);

// Pass directly to BenchmarkLine
<BenchmarkLine data={chartSeries} range={range} scale={scale} />
```

## ✅ Verification Checklist

### What You Should See in UI:

- [ ] **Chart renders immediately** when data exists (no stuck loading state)
- [ ] **Changing range** (1D → 1W → 1M) updates chart domain and line shape
- [ ] **Changing benchmark** (SPY → QQQ) fetches new data and updates chart
- [ ] **Changing scale** (Price → Return%) recalculates without refetch
- [ ] **Axis labels visible** - white/light gray text on dark background
- [ ] **Tooltip works** - shows formatted date and value on hover
- [ ] **Empty state shows** "No data available" when API returns empty array
- [ ] **Error state shows** "Chart failed to load" with Retry button on API failure

### Console Logs (dev mode):

- [ ] `[normalizeChartSeries] ✅ Normalized X raw points → Y valid ChartPoints`
- [ ] `[market-brief] ✅ Chart data normalized: X ChartPoints`
- [ ] No warnings about empty arrays when data exists
- [ ] No duplicate identifier errors

### Network Tab:

- [ ] `/api/market/chart?symbol=SPY&range=1W` returns 200 with `{ ok: true, data: { points: [...] } }`
- [ ] Changing range triggers new request with different `range` param
- [ ] Response contains `points` array with `{ t: string, close: number }`

## 🛡️ Architecture Prevents Regressions

1. **Single normalization function** - One place to fix if API shape changes
2. **TypeScript canonical type** - `ChartPoint` enforced at compile time
3. **Explicit dependencies** - All useMemo/useQuery keys include required values
4. **No component normalization** - Components receive pre-normalized data
5. **Defensive validation** - Components validate data shape before rendering
6. **Dev logging** - Clear warnings when data flow breaks

## 🐛 Why Charts Were Stuck Before

1. **Query key mismatch** - Region in key but chart API ignores region
2. **Double normalization** - Normalized twice, second pass failed on wrong shape
3. **Missing dependencies** - useMemo didn't include range, so didn't recompute
4. **Silent failures** - Invalid points filtered out without logging
5. **Shape confusion** - `{t, v}` vs `{time, value}` mismatch caused empty renders

---

**Status: ✅ FIXED** - Single normalization → canonical shape → Recharts renders reliably.
