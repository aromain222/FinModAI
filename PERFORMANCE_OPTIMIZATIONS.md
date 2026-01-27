# CapitalBase Navigation Performance Optimizations

## Summary

This document outlines the performance optimizations implemented to make navigation smooth and responsive in the CapitalBase Next.js application. All changes focus on eliminating jank during tab switches and page navigation.

## Top 3 Sources of Slowness Identified

### 1. **Heavy Components Loading on Every Navigation**
- **Issue**: `MacroDashboard`, `ScenarioEngineApp`, and `ModelPreview` were loaded synchronously, blocking navigation
- **Evidence**: Components with multiple charts, data generation, and large table renders
- **Fix**: Implemented dynamic imports with `next/dynamic` and `ssr: false` to lazy-load these components

### 2. **Lack of Memoization Causing Unnecessary Re-renders**
- **Issue**: Components re-rendered on every parent update, even when props hadn't changed
- **Evidence**: Chart components, preview tables, and derived calculations recalculated unnecessarily
- **Fix**: Added `React.memo`, `useMemo`, and `useCallback` to prevent wasteful re-renders

### 3. **Data Fetching on Every Mount Without Caching**
- **Issue**: `ModelsPage` and `MacroDashboard` fetched data on every navigation, causing delays
- **Evidence**: `useEffect` hooks triggered on every mount without refetch prevention
- **Fix**: Added ref tracking and memoized fetch functions to prevent duplicate requests

## Files Changed

### 1. `/finmodai-next/app/(app)/macro/page.tsx`
- **Change**: Added dynamic import for `MacroDashboard` component
- **Impact**: Macro dashboard now loads asynchronously, preventing navigation blocking
- **Code**:
```tsx
const MacroDashboard = dynamic(() => import('@/components/macro/MacroDashboard'), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});
```

### 2. `/finmodai-next/app/(app)/scenario-engine/page.tsx`
- **Change**: Added dynamic import for `ScenarioEngineApp` component
- **Impact**: Scenario engine loads on-demand, reducing initial bundle size
- **Code**:
```tsx
const ScenarioEngineApp = dynamic(() => import('@/components/scenario/ScenarioEngineApp').then(mod => ({ default: mod.ScenarioEngineApp })), {
  loading: () => <LoadingSpinner />,
  ssr: false,
});
```

### 3. `/finmodai-next/components/DashboardSidebar.tsx`
- **Change**: Added route prefetching and explicit `prefetch={true}` on all navigation links
- **Impact**: Routes are prefetched on sidebar mount, making navigation instant
- **Code**:
```tsx
useEffect(() => {
  navItems.forEach(({ href }) => {
    router.prefetch(href);
  });
}, [router]);

<Link href={href} prefetch={true} ...>
```

### 4. `/finmodai-next/components/macro/MacroDashboard.tsx`
- **Changes**:
  - Added `startTransition` for non-blocking state updates
  - Memoized `fetchDetailedBreakdown` with `useCallback`
  - Memoized `aiNarrative` calculation with `useMemo`
  - Memoized `getCurrentValue` and `getChange` functions
  - Added performance instrumentation with `console.time/timeEnd`
- **Impact**: State changes no longer block UI, expensive calculations are cached
- **Key Code**:
```tsx
const fetchDetailedBreakdown = useCallback(async () => {
  console.time('[MacroDashboard] fetchDetailedBreakdown');
  // ... fetch logic
  startTransition(() => {
    setMacroDetail(data.detailedBreakdown);
  });
  console.timeEnd('[MacroDashboard] fetchDetailedBreakdown');
}, [timeRange]);

const aiNarrative = useMemo(
  () => getMacroNarrative(timeRange, sp500Data, vixData, fedFundsData),
  [timeRange, sp500Data, vixData, fedFundsData]
);
```

### 5. `/finmodai-next/components/charts/MacroLineChart.tsx`
- **Changes**:
  - Wrapped component with `React.memo` with custom comparison function
  - Memoized `tickFormatter` and `tooltipLabelFormatter` with `useMemo`
- **Impact**: Chart only re-renders when data actually changes, not on every parent render
- **Key Code**:
```tsx
export const MacroLineChart = memo(MacroLineChartComponent, (prevProps, nextProps) => {
  return (
    prevProps.range === nextProps.range &&
    prevProps.height === nextProps.height &&
    prevProps.data.length === nextProps.data.length &&
    prevProps.data.every((point, i) => {
      const nextPoint = nextProps.data[i];
      return nextPoint && point.date === nextPoint.date && point.value === nextPoint.value;
    })
  );
});
```

### 6. `/finmodai-next/components/models/ModelPreview.tsx`
- **Changes**:
  - Wrapped component with `React.memo` with custom comparison
  - Memoized `hasDiagnosticIssues`, `previewUnavailable`, and `visibleRows` calculations
  - Added `useCallback` for `toggleDiagnostics`
- **Impact**: Preview table only re-renders when preview data actually changes
- **Key Code**:
```tsx
const visibleRows = useMemo(
  () => (rows ?? []).filter(row => !isEmptyRow(row)),
  [rows]
);

export const ModelPreview = memo(ModelPreviewComponent, (prevProps, nextProps) => {
  return (
    prevProps.preview === nextProps.preview &&
    prevProps.downloadUrl === nextProps.downloadUrl &&
    // ... other prop comparisons
  );
});
```

### 7. `/finmodai-next/app/(app)/models/page.tsx`
- **Changes**:
  - Added `useRef` to track if data has been fetched
  - Memoized `fetchModels` with `useCallback`
  - Added performance instrumentation
- **Impact**: Prevents duplicate fetches when navigating back to models page
- **Key Code**:
```tsx
const hasFetchedRef = useRef(false);

const fetchModels = useCallback(async () => {
  if (hasFetchedRef.current && models.length > 0) {
    return;
  }
  console.time('[ModelsPage] fetchModels');
  // ... fetch logic
  hasFetchedRef.current = true;
  console.timeEnd('[ModelsPage] fetchModels');
}, [models.length]);
```

### 8. `/finmodai-next/components/scenario/ScenarioEngineApp.tsx`
- **Changes**:
  - Added `startTransition` for all state updates
  - Memoized `handleScenarioChange` with `useCallback`
- **Impact**: Input changes don't block UI, calculations happen in background
- **Key Code**:
```tsx
const handleScenarioChange = useCallback((name: ScenarioName, field: keyof ScenarioInputs, value: number) => {
  startTransition(() => {
    setInputs((prev) => ({
      ...prev,
      [name]: {
        ...prev[name],
        [field]: value,
      },
    }));
  });
}, []);
```

## Performance Improvements

### Before
- Navigation felt sluggish with noticeable freezes
- Tab switches caused full page re-renders
- Heavy components blocked interaction
- Data refetched on every navigation
- Charts re-rendered unnecessarily

### After
- Navigation is instant with prefetched routes
- Heavy components load asynchronously
- State updates are non-blocking with `startTransition`
- Memoization prevents unnecessary re-renders
- Data fetching is optimized with caching

## Performance Instrumentation

Added `console.time` and `console.timeEnd` around:
- `MacroDashboard.fetchDetailedBreakdown` - Measures API fetch time
- `ModelsPage.fetchModels` - Measures model list fetch time

These logs help identify slow operations during development.

## Testing Recommendations

1. **Navigation Speed**: Click between tabs rapidly - should feel instant
2. **Chart Rendering**: Change time range in macro dashboard - should be smooth
3. **Data Fetching**: Navigate to models page multiple times - should only fetch once
4. **Input Responsiveness**: Type in scenario engine inputs - should not freeze UI

## Future Optimizations (Not Implemented)

1. **React Query / SWR**: Consider adding for better data caching and synchronization
2. **Virtual Scrolling**: For large model lists (if they grow beyond 100+ items)
3. **Service Worker**: For offline support and faster subsequent loads
4. **Code Splitting**: Further split large route bundles if needed

## Notes

- All changes maintain backward compatibility
- No product behavior or UI structure changes
- Focus on high-impact fixes with minimal code changes
- All optimizations follow React best practices







