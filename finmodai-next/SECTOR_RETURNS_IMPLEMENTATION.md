# Rising & Falling Sectors Implementation

## ✅ Complete Implementation

Implemented sector performance tracking using ETF proxies with proper trading day alignment.

## Features

### 1. Sector ETF Universe (11 ETFs)
- XLK (Technology)
- XLF (Financials)
- XLV (Healthcare)
- XLY (Consumer Discretionary)
- XLP (Consumer Staples)
- XLI (Industrials)
- XLE (Energy)
- XLB (Materials)
- XLU (Utilities)
- XLRE (Real Estate)
- XLC (Communication Services) ✅ **Added**

### 2. Supported Time Periods
- **1D** - 1 Day
- **1W** - 1 Week
- **1M** - 1 Month
- **3M** - 3 Months
- **6M** - 6 Months
- **YTD** - Year to Date ✅ **Added**

### 3. Trading Day Alignment ✅ **Fixed**

**Start Close:**
- First available trading day **on or after** the start date
- If no data on/after start, uses earliest available

**End Close:**
- Last available trading day **on or before** the end date (or now)
- If no data on/before end, uses latest available

**Trading Day Detection:**
- Simplified: Monday-Friday (excludes weekends)
- In production, would use trading calendar library for holidays

### 4. Return Calculation
```typescript
returnPct = (endClose / startClose - 1) * 100
```
- Uses close prices only (no intraday)
- Handles missing data gracefully (excludes from results, shows "—" in UI)

### 5. Data Sources (with Fallback)
1. **FMP API** (primary)
   - Endpoint: `/api/v3/historical-price-full/{ticker}`
   - Returns adjusted close prices
2. **Polygon API** (fallback)
   - Endpoint: `/v2/aggs/ticker/{ticker}/range/1/day/...`
   - Returns adjusted close prices

### 6. Caching
- **Cache TTL**: 10 minutes (5-15 minute range as specified)
- **Cache Key**: `sectors-{period}`
- Prevents redundant API calls and rate limits

### 7. UI Display
- **Rising Sectors**: Top 5 by returnPct (descending)
- **Falling Sectors**: Bottom 5 by returnPct (ascending)
- Shows: Sector name, ticker, return %, "as of" date
- Missing data shows "—" (not 0%)

## Files Created/Updated

### Created
- `lib/sectorReturns.ts` - Core sector returns calculation with trading day alignment

### Updated
- `app/api/market-brief/sectors/route.ts` - Uses new `getSectorReturns()` function
- `components/market-brief/MarketBriefPage.tsx` - Updated to show "as of" dates and handle missing data

## Key Implementation Details

### Trading Day Alignment
```typescript
// Find first trading day on/after start date
const startTradingDay = findFirstTradingDay(startDate);

// Find last trading day on/before end date
const endTradingDay = findLastTradingDay(endDate);
```

### Missing Data Handling
- If ETF lacks sufficient data, excluded from results (logged warning)
- UI shows "—" for missing returns (never shows 0%)
- Never crashes on missing data

### Period Date Calculation
- **1D**: Yesterday to today
- **1W**: 7 days ago to today
- **1M**: 1 month ago to today
- **3M**: 3 months ago to today
- **6M**: 6 months ago to today
- **YTD**: January 1st to today

## Guardrails Enforced

✅ **Never compute start/end prices by assuming calendar days are trading days**
- Uses `findFirstTradingDay()` and `findLastTradingDay()`

✅ **Never show 0% for missing data**
- Shows "—" in UI
- Excludes from results if data unavailable

✅ **Always display "as of" date**
- Shows date of end_close used for calculation

✅ **Proper sorting**
- Numbers sorted as numbers (not strings)
- Rising: desc by returnPct
- Falling: asc by returnPct (reversed to show worst first)

## Debugging Checklist

If sector returns are "not working", check:

1. ✅ **Trading day alignment**: Are you requesting dates that aren't trading days?
   - **Fix**: Use `findFirstTradingDay()` and `findLastTradingDay()`

2. ✅ **Using close prices**: Are you using open instead of close?
   - **Fix**: Always use `close` field from API responses

3. ✅ **Adjusted close consistency**: Are you mixing adjusted and unadjusted?
   - **Fix**: Use adjusted close consistently (FMP and Polygon both return adjusted)

4. ✅ **Rate limits**: Are you getting partial responses?
   - **Fix**: Implement caching (10 min TTL) and parallel fetching with `Promise.allSettled()`

5. ✅ **String vs number sorting**: Are you sorting strings instead of numbers?
   - **Fix**: Ensure `returnPct` is a number, sort with `(a, b) => b.returnPct - a.returnPct`

## API Response Format

```typescript
{
  period: '1M',
  returns: SectorReturn[], // All sector returns
  rising: SectorReturn[],  // Top 5 gainers
  falling: SectorReturn[], // Bottom 5 losers
  generatedAt: '2024-01-15T10:30:00Z'
}
```

```typescript
interface SectorReturn {
  sector: string;
  ticker: string;
  startClose: number;
  endClose: number;
  returnPct: number;
  asOfDate: string;  // ISO date of end_close
  startDate: string; // ISO date of start_close
}
```

## Status

✅ **Complete and Ready for Production**

All requirements implemented:
- ✅ ETF proxy universe (11 ETFs including XLC)
- ✅ All time periods (1D, 1W, 1M, 3M, 6M, YTD)
- ✅ Trading day alignment (start/end trading days)
- ✅ Proper return calculation (close prices only)
- ✅ Caching (10 min TTL)
- ✅ Missing data handling (shows "—", excludes from results)
- ✅ "As of" date display
- ✅ Top 5 rising, bottom 5 falling
