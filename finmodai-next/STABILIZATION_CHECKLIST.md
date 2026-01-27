# App Stabilization Checklist ✅

## Status: COMPLETE

All stabilization tasks have been implemented. This document serves as a verification checklist.

---

## ✅ 1. Charts Migration: @ant-design/plots → Recharts

**Status:** ✅ COMPLETE

**Implementation:**
- ✅ All charts migrated to Recharts client components
- ✅ No dynamic imports for charts
- ✅ Created dedicated Recharts components:
  - `components/charts/recharts/BenchmarkLine.tsx` - Market Brief benchmark charts
  - `components/charts/recharts/MacroCompositeLine.tsx` - Macro IQ composite charts
  - `components/charts/recharts/GrowthInflationScatter.tsx` - Growth vs Inflation scatter
- ✅ All old Ant Design plot components deleted:
  - `components/charts/PlotComponents.tsx` - DELETED
  - `components/charts/DynamicScatter.tsx` - DELETED
  - `components/charts/AntPlotLine.tsx` - DELETED
  - `components/charts/TimeSeriesLine.tsx` - DELETED

**Verification:**
- [ ] Run `npm run build` - should pass without chunk load errors
- [ ] Navigate to `/market-brief` - benchmark chart should render
- [ ] Navigate to `/macro-iq` - both charts should render
- [ ] Check browser console - no chunk load errors

**Next Step:** Remove `@ant-design/plots` from `package.json`:
```bash
npm uninstall @ant-design/plots
```

---

## ✅ 2. Axes Visibility + Dark Mode Formatting

**Status:** ✅ COMPLETE

**Implementation:**
- ✅ All Recharts components use dark-mode friendly axis styling:
  - Axis lines: `#d1d5db` (gray-300)
  - Tick labels: `#e5e7eb` (gray-200), `fontSize: 12`
  - Grid lines: `#9ca3af` (gray-400), `opacity: 0.25`
- ✅ X-axis date formatting:
  - `1D`: `HH:mm` format
  - `1W`, `1M`, `3M`: `MMM d` format
  - `YTD`, `1Y`: `MMM` format
- ✅ Y-axis number formatting:
  - Price: `$1,234` (rounded, with commas)
  - Return%: `0.00%`
- ✅ Tooltips styled for dark mode

**Verification:**
- [ ] Open `/market-brief` - axes should be clearly visible
- [ ] Open `/macro-iq` - axes should be clearly visible
- [ ] Check axis labels are readable (not white-on-white)
- [ ] Hover over chart - tooltip should be readable

---

## ✅ 3. Timeframe Updates for Charts + Metric Cards

**Status:** ✅ COMPLETE

**Implementation:**
- ✅ KPI cards (`Period Return`, `Last Level`, `Volatility`) recompute from `chartDataRawNormalized`
- ✅ Charts refetch when `range` changes
- ✅ All `useMemo` dependencies include `range`, `benchmark`, and chart data
- ✅ KPIs calculate from raw price data (always absolute prices)

**Verification:**
- [ ] Change timeframe on Market Brief - chart should update
- [ ] KPI cards should update with new values
- [ ] Change benchmark symbol - chart + KPIs should update
- [ ] Check browser network tab - API calls should fire on change

---

## ✅ 4. Market Brief Layout: Movers + Sector Momentum In-Grid

**Status:** ✅ COMPLETE

**Implementation:**
- ✅ Converted to Tailwind CSS grid layout
- ✅ Main content grid: `grid grid-cols-1 xl:grid-cols-3 gap-4`
- ✅ Benchmark Chart: `xl:col-span-2`
- ✅ Headlines: `xl:col-span-1`
- ✅ Top Movers: `xl:col-span-1` (second row)
- ✅ Sector Momentum: `xl:col-span-1` (second row)
- ✅ Removed min-h/mt-[xxx] spacing hacks

**Verification:**
- [ ] Open `/market-brief` on desktop (xl breakpoint)
- [ ] Chart + Headlines should be on first row
- [ ] Movers + Momentum should be on second row (balanced)
- [ ] Mobile view should stack vertically
- [ ] No excessive whitespace at bottom

---

## ✅ 5. Headlines Truncation: 2-Line Clamp

**Status:** ✅ COMPLETE

**Implementation:**
- ✅ Headlines use Ant Design `Paragraph` with `ellipsis={{ rows: 2 }}`
- ✅ CSS fallback: `WebkitLineClamp: 2`, `display: -webkit-box`
- ✅ Applied to both Market Brief and Macro IQ headline lists

**Verification:**
- [ ] Open `/market-brief` - headline titles should clamp to 2 lines
- [ ] Open `/macro-iq` - headline titles should clamp to 2 lines
- [ ] Long titles should show ellipsis (...)
- [ ] Headlines should not push layout off-screen

---

## ✅ 6. Region Filtering: US/Europe/Asia/Global

**Status:** ✅ COMPLETE

**Implementation:**
- ✅ Region selector in Market Brief and Macro IQ headers
- ✅ URL query parameter: `?region=us|europe|asia|global`
- ✅ API routes accept `region` parameter:
  - `/api/market-brief/headlines?region=...`
  - `/api/events/intelligence?region=...`
- ✅ Client-side filtering fallback using `inferRegion()` helper
- ✅ Headlines and events refetch when region changes

**Verification:**
- [ ] Select "US" region - headlines should update
- [ ] Select "Europe" region - headlines should update
- [ ] Select "Asia" region - headlines should update
- [ ] URL should update: `?region=us`
- [ ] Refresh page - region should persist from URL

---

## ✅ 7. Event Intelligence: "Why It Matters" Upgrade

**Status:** ✅ COMPLETE

**Implementation:**
- ✅ New structured fields in Event Intelligence:
  - `whyItMatters` (string[] - 2-3 bullet points)
  - `likelyMarketChannels` (string[] - rates, FX, commodities, equities)
  - `watchlistAssets` (string[] - 3-6 tickers/ETFs)
  - `baseCase` (string - one sentence)
  - `riskCase` (string - one sentence)
- ✅ Compact UI with expandable drawer
- ✅ Shows headline + 1-line summary by default
- ✅ "More/Less" button expands to show full details

**Verification:**
- [ ] Open `/event-intelligence`
- [ ] Events should show compact view by default
- [ ] Click "More" - should expand to show:
  - Why It Matters (bullets)
  - Likely Market Channels (badges)
  - Watchlist Assets (badges)
  - Base Case / Risk Case (sentences)
- [ ] No vague percentages in main view

---

## ✅ 8. AI Agent: Disabled with "Coming Soon"

**Status:** ✅ COMPLETE

**Implementation:**
- ✅ `handleRun` function returns early with error message
- ✅ Health check disabled (commented out)
- ✅ Error message: "AI Agent is not yet available. This feature is coming soon."

**Verification:**
- [ ] Navigate to `/agent`
- [ ] Input should be visible but disabled
- [ ] Submit button should show "Coming soon" or be disabled
- [ ] Attempting to submit should show error message
- [ ] No API calls should fire

---

## ✅ 9. generateModel Route: TDZ Errors Fixed

**Status:** ✅ COMPLETE

**Implementation:**
- ✅ `sanitizedAssumptions` declared as `let` with `null` default
- ✅ Only assigned after sanitization succeeds
- ✅ `enrichedAssumptions` added to error context
- ✅ `createModelError` uses safe stringify with optional chaining
- ✅ `handleModelError` import verified with sanity check

**Verification:**
- [ ] Attempt to generate a model
- [ ] Should not see "Cannot access before initialization" errors
- [ ] Errors should show proper traceId
- [ ] Check server logs - no TDZ errors

---

## Final Cleanup Step

**Remove @ant-design/plots from package.json:**
```bash
cd finmodai-next
npm uninstall @ant-design/plots
```

**Files to verify deletion:**
- ✅ `components/charts/PlotComponents.tsx` - DELETED
- ✅ `components/charts/DynamicScatter.tsx` - DELETED
- ✅ `components/charts/AntPlotLine.tsx` - DELETED
- ✅ `components/charts/TimeSeriesLine.tsx` - DELETED

---

## Quick Dev Verification Checklist

Run these checks in development:

1. **Build Check:**
   ```bash
   npm run build
   ```
   - Should complete without errors
   - No chunk load errors in output

2. **Market Brief:**
   - [ ] Navigate to `/market-brief`
   - [ ] Chart renders correctly
   - [ ] Axes are visible
   - [ ] Headlines truncate to 2 lines
   - [ ] Change timeframe - chart + KPIs update
   - [ ] Change region - headlines update
   - [ ] Movers + Momentum sit in grid (not pushed down)

3. **Macro IQ:**
   - [ ] Navigate to `/macro-iq`
   - [ ] Both charts render
   - [ ] Axes are visible
   - [ ] Headlines truncate to 2 lines
   - [ ] Change region - headlines + events update

4. **Event Intelligence:**
   - [ ] Navigate to `/event-intelligence`
   - [ ] Events show "Why It Matters" details
   - [ ] Expandable drawer works
   - [ ] Change region - events update

5. **AI Agent:**
   - [ ] Navigate to `/agent`
   - [ ] Shows "Coming soon" message
   - [ ] No API calls fire

6. **Model Generation:**
   - [ ] Navigate to `/models/create`
   - [ ] Generate a model
   - [ ] No TDZ errors in console
   - [ ] Errors show traceId

---

## Summary

All stabilization tasks are **COMPLETE**. The app should now:
- ✅ Use Recharts exclusively (no Ant Design plots)
- ✅ Have readable axes in dark mode
- ✅ Update charts/metrics when timeframe changes
- ✅ Have proper grid layout on Market Brief
- ✅ Truncate headlines to 2 lines
- ✅ Support region filtering (US/Europe/Asia/Global)
- ✅ Show structured Event Intelligence explanations
- ✅ Disable AI Agent with "Coming soon"
- ✅ Handle errors without TDZ issues

**Remaining:** Remove `@ant-design/plots` package (it's already marked extraneous).

