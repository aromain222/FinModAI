# Startups Page - Real Data by Default + Expandable Analysis

## Summary
Updated the Startups page to use **real data by default** (GDELT + SEC EDGAR) with demo mode only as a dev fallback. Enhanced empty states and error handling to be informative and actionable. Confirmed expandable analysis is already fully implemented.

---

## Changes Made

### 1. **API Route: `app/api/startups/route.ts`** ✅

**Key Changes:**
- ✅ **Demo mode is now opt-in only**: Requires `?mode=demo` query param OR `NEXT_PUBLIC_DEMO_MODE=true` env var
- ✅ **Default behavior is live data**: No mode parameter = live data from GDELT/SEC EDGAR
- ✅ **Better error handling**: Returns 500 with error details instead of silently falling back to demo
- ✅ **Clear demo labeling**: When demo mode is active, response includes `dataMode: 'demo'`

**Before:**
```typescript
const mode = searchParams.get('mode') || 'live';
// Always returned demo data on error
```

**After:**
```typescript
const isDemoMode = mode === 'demo' || process.env.NEXT_PUBLIC_DEMO_MODE === 'true';
// Only returns demo data if explicitly requested or env var set
// Otherwise returns 500 error with details
```

**Error Response (Live Mode):**
```json
{
  "dataMode": "live",
  "startups": [],
  "error": "Failed to fetch startup data",
  "status": 500
}
```

**Demo Mode Response:**
```json
{
  "dataMode": "demo",
  "startups": [...],
  "error": null
}
```

---

### 2. **Client Page: `app/(app)/startups/page.tsx`** ✅

**Key Changes:**

#### A) Removed `mode=live` from fetch
```typescript
// Before: fetch('/api/startups?mode=live')
// After:  fetch('/api/startups')
```

#### B) Enhanced DEMO MODE badge
- ✅ Clear yellow badge with 🎭 emoji when in demo mode
- ✅ Green "Live Data" badge with pulse animation for real data
- ✅ No ambiguous "Demo Seed Data" label

```typescript
{isDemoMode ? (
  <Badge className="bg-yellow-500/20 text-yellow-300 border border-yellow-500/40">
    🎭 DEMO MODE
  </Badge>
) : (
  <Badge className="bg-emerald-500/10 text-emerald-400">
    <span className="animate-pulse mr-2">●</span>
    Live Data
  </Badge>
)}
```

#### C) Improved Empty States
**Before:**
```
No startups found
Try adjusting your filters
```

**After:**
```
No trending up startups

No results matching your filters:
[Search: "query"] [Sector: AI] [Window: 7d]

No startups with positive momentum in the 7d window.
Try expanding the time window or check "Trending Down".

[Reset Filters Button]
```

Shows:
- ✅ Active filters as badges
- ✅ Specific guidance (expand time window, check other tab)
- ✅ Reset button when filters are active

#### D) Enhanced Error State
**Before:**
```
Failed to load startup data
[Try Again]
```

**After:**
```
Failed to load startup data

{error message from API}

Possible reasons:
• API rate limits exceeded
• Network connectivity issues
• GDELT or SEC EDGAR temporarily unavailable

[Try Again] [View Demo Data]
```

Shows:
- ✅ Actual error message from API
- ✅ Helpful troubleshooting context
- ✅ Option to view demo data as fallback
- ✅ Retry button

---

### 3. **Expandable Analysis** ✅ (Already Implemented)

The expandable analysis feature is **already fully implemented** in `components/startups/StartupLeaderboard.tsx`:

#### Features:
✅ **"Explain score" tooltip** - Shows what momentum score means (-100 to +100)
✅ **Momentum explanation** - 1-2 sentence summary of why trending up/down
✅ **Expandable breakdown** - Click to show detailed drivers
✅ **Bull Drivers section** - Shows positive contributions with details
✅ **Bear Drivers section** - Shows negative contributions with details
✅ **Formula reference** - Shows the exact scoring formula
✅ **Smooth transitions** - Uses Tailwind transitions for expand/collapse

#### Example Expanded View:
```
Momentum +46 (Strong Upward) ℹ️

"Momentum is strongly positive as news mentions and funding signals 
outweighed negative coverage."

[Show detailed breakdown ▼]

BULLISH DRIVERS
News Mentions                           +22.5
  45 mentions (1.5σ above baseline)
Funding Signals                         +20.0
  2 funding announcements detected

BEARISH DRIVERS
Negative Coverage                       -3.6
  30% of coverage has negative tone

Score Formula: 15×mentions(z-score) + 10×funding + 6×hiring 
- 12×negativeTone - 8×regulation - 6×lawsuits - 5×layoffs
```

---

## Data Source Behavior

### Live Mode (Default)
1. Fetches from `/api/startups` (no mode param)
2. API calls GDELT for news signals + SEC EDGAR for IPO filings
3. Returns real startup data with momentum scores
4. If API fails → returns 500 error with details
5. UI shows error state with retry option

### Demo Mode (Opt-In)
1. Requires `?mode=demo` OR `NEXT_PUBLIC_DEMO_MODE=true`
2. Returns 17 hardcoded demo startups
3. Clearly labeled with 🎭 DEMO MODE badge
4. Used for development/testing only

---

## Endpoint Reference

### Primary Endpoint
```
GET /api/startups
```

**Query Parameters:**
- `window` (optional): `7d` | `30d` | `90d` - Default: `7d`
- `sector` (optional): `AI` | `Fintech` | `DevTools` | etc.
- `mode` (optional): `demo` - Only use for testing

**Response Shape:**
```typescript
{
  dataMode: 'live' | 'demo',
  updatedAt: string,
  startups: StartupCard[],
  ipoWatch: IpoCard[],
  themes: ThemeSummary[],
  activeSectors: SectorSummary[],
  error?: string  // Only present on error
}
```

**Data Sources:**
- **GDELT**: News mentions, sentiment, themes, signals
- **SEC EDGAR**: IPO filings (S-1, S-1/A)
- **Momentum calculation**: Deterministic formula with z-score normalization

---

## Filter Defaults

All filters have safe defaults that never hide everything:

| Filter | Default | Options |
|--------|---------|---------|
| Time Window | `7d` | 7D, 30D, 90D |
| Sector | `All Sectors` | AI, Fintech, DevTools, Healthcare, Climate, Consumer, Enterprise, Crypto |
| Search | `` (empty) | Free text |

---

## Verification Checklist

### ✅ Demo Mode is Off by Default
- Visit `/startups` → Should show "Live Data" badge (or error if no API keys)
- Should NOT show "🎭 DEMO MODE" badge unless explicitly enabled

### ✅ Empty State is Informative
- Apply filters that return 0 results
- Should show active filters as badges
- Should show "Reset Filters" button
- Should suggest next steps (expand time window, etc.)

### ✅ Error State is Helpful
- Simulate API failure (disconnect network or remove API keys)
- Should show actual error message
- Should show troubleshooting tips
- Should offer "Try Again" and "View Demo Data" buttons

### ✅ Expandable Analysis Works
- Click any startup card
- Should see momentum explanation
- Click "Show detailed breakdown"
- Should see bull/bear drivers with contributions
- Should see formula reference at bottom

### ✅ No Runtime Errors
- Open browser console
- Should see no TypeScript errors
- Should see no "map is not a function" errors
- Should see no hydration mismatches

---

## Files Changed

1. **`app/api/startups/route.ts`**
   - Changed demo mode to opt-in only
   - Return 500 error instead of silent fallback
   - Better error messages

2. **`app/(app)/startups/page.tsx`**
   - Removed `mode=live` from fetch
   - Enhanced DEMO MODE badge
   - Improved empty state messages
   - Enhanced error state with troubleshooting

3. **`components/startups/StartupLeaderboard.tsx`**
   - No changes needed (already has expandable analysis)

---

## Build Status

```bash
✓ Compiled successfully

Routes:
├ ƒ /api/startups                        0 B                0 B
├ ○ /startups                            6.64 kB         207 kB
```

No TypeScript errors, no runtime errors.

---

## Testing Commands

### Test Live Mode (Default)
```bash
curl http://localhost:3000/api/startups
# Should return live data or 500 error
```

### Test Demo Mode
```bash
curl http://localhost:3000/api/startups?mode=demo
# Should return demo data with dataMode: 'demo'
```

### Test with Env Var
```bash
NEXT_PUBLIC_DEMO_MODE=true npm run dev
# Visit /startups → Should show 🎭 DEMO MODE badge
```

---

## Summary

✅ **Real data by default** - No more demo data unless explicitly requested
✅ **Clear demo labeling** - 🎭 DEMO MODE badge when active
✅ **Informative empty states** - Shows active filters and next steps
✅ **Helpful error states** - Shows error details and troubleshooting
✅ **Expandable analysis** - Already fully implemented with bull/bear drivers
✅ **Build passes** - No TypeScript or runtime errors

The Startups page now prioritizes real data from GDELT and SEC EDGAR, with demo mode only available as a development fallback when explicitly enabled.

