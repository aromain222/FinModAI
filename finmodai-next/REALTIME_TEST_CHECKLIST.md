# Real-Time Data Testing Checklist

## Quick Test Plan

### ✅ Test 1: Without API Key (Graceful Fallback)

**Setup:**
```bash
# Comment out or remove FINNHUB_API_KEY from .env.local
npm run dev
```

**Navigate to:** http://localhost:3000/macro/news

**Expected Results:**
- [ ] Market Pulse shows placeholder values (S&P 500: ~4783, Dow: ~37545, etc.)
- [ ] Macro News shows 2 fallback articles ("Market Update" and "Economic Data Releases")
- [ ] No console errors
- [ ] All UI components render correctly
- [ ] Refresh buttons work (return same data)
- [ ] "Rotated daily" indicator visible
- [ ] Sentiment filters work (bullish/neutral/bearish)

---

### ✅ Test 2: With API Key (Live Data)

**Setup:**
```bash
# Add to .env.local:
FINNHUB_API_KEY=your-actual-finnhub-key

# Restart server:
npm run dev
```

**Navigate to:** http://localhost:3000/macro/news

**Expected Results:**
- [ ] Market Pulse shows live index values
- [ ] Market Pulse shows green/red change indicators
- [ ] Macro News shows real headlines from Finnhub
- [ ] Articles have sentiment badges (bullish/bearish/neutral)
- [ ] "Updated X minutes ago" shows in header
- [ ] Console logs: `[marketData] ✅ Fetched from Finnhub`
- [ ] Console logs: `[newsData] ✅ Fetched X articles from Finnhub`
- [ ] Article sources show real news outlets (not "Bloomberg" or "WSJ" unless actually from those sources)

---

### ✅ Test 3: Cache Behavior

**Setup:**
```bash
# With FINNHUB_API_KEY configured
npm run dev
```

**Steps:**
1. Load page → Check console for "Fetched from Finnhub"
2. Refresh page immediately → Check console for "Returning cached data"
3. Wait 10+ minutes → Refresh → Check console for "Fetched from Finnhub" again

**Expected Console Logs:**
```
First load:  [marketData] ✅ Fetched from Finnhub
Within 10m:  [marketData] Returning cached data
After 10m:   [marketData] ✅ Fetched from Finnhub
```

---

### ✅ Test 4: API Failure Fallback

**Setup:**
```bash
# Use invalid API key in .env.local:
FINNHUB_API_KEY=invalid-key-12345

npm run dev
```

**Navigate to:** http://localhost:3000/macro/news

**Expected Results:**
- [ ] Market Pulse shows placeholder values (not broken)
- [ ] Macro News shows fallback articles (not broken)
- [ ] Console logs: `[marketData] Finnhub fetch failed: ...`
- [ ] Console logs: `[newsData] Finnhub fetch failed: ...`
- [ ] UI still fully functional
- [ ] No user-facing error messages (graceful degradation)

---

### ✅ Test 5: Article Rotation (Deterministic)

**Setup:**
```bash
# With or without API key
npm run dev
```

**Steps:**
1. Load page → Note the order of articles
2. Refresh page → Articles should be in SAME order
3. Open in incognito/private window → Articles should be in SAME order (same day)

**Expected Results:**
- [ ] Articles rotate deterministically by date
- [ ] Same order within a day across sessions
- [ ] "Rotated daily" indicator visible with sparkle icon
- [ ] Order is NOT random on every refresh

---

### ✅ Test 6: "Updated X minutes ago" Indicator

**Setup:**
```bash
# With FINNHUB_API_KEY configured
npm run dev
```

**Steps:**
1. Load page → Note timestamp ("Updated just now")
2. Wait 2 minutes → Refresh → Should show "Updated 2 minutes ago"
3. Click refresh button → Should reset to "Updated just now"

**Expected Results:**
- [ ] Timestamp shows in header next to "Rotated daily"
- [ ] Updates correctly based on time elapsed
- [ ] Resets when refresh button clicked

---

### ✅ Test 7: API Endpoints Directly

**Test Market Indices Endpoint:**
```bash
curl http://localhost:3000/api/market/indices | jq
```

**Expected Response:**
```json
{
  "indices": [
    {
      "symbol": "SPX",
      "name": "S&P 500",
      "value": 4783.45,
      "change": 23.15,
      "changePercent": 0.49,
      "lastUpdated": "2024-12-25T...",
      "status": "live" // or "cached" or "placeholder"
    },
    // ... more indices
  ],
  "generatedAt": "2024-12-25T..."
}
```

**Test Macro News Endpoint:**
```bash
curl http://localhost:3000/api/macro/news?window=1W | jq
```

**Expected Response:**
```json
{
  "articles": [
    {
      "id": "finnhub-...",
      "title": "...",
      "source": "...",
      "publishedAt": "...",
      "url": "...",
      "summary": "...",
      "aiInsight": "...",
      "sentiment": "bullish", // or "neutral" or "bearish"
      "tags": ["Fed", "Rates"]
    },
    // ... more articles
  ],
  "generatedAt": "2024-12-25T..."
}
```

---

### ✅ Test 8: Sentiment Classification

**Setup:**
```bash
# With FINNHUB_API_KEY configured
npm run dev
```

**Navigate to:** http://localhost:3000/macro/news

**Expected Results:**
- [ ] Articles have sentiment badges (bullish/bearish/neutral)
- [ ] Bullish articles have green indicator
- [ ] Bearish articles have red indicator
- [ ] Neutral articles have gray indicator
- [ ] Sentiment filter buttons show counts (e.g., "Bullish (3)")
- [ ] Clicking sentiment filter shows only matching articles

---

### ✅ Test 9: Market Pulse Refresh

**Setup:**
```bash
# With FINNHUB_API_KEY configured
npm run dev
```

**Navigate to:** http://localhost:3000/macro/news

**Steps:**
1. Note current market values
2. Click refresh button (circular arrow icon)
3. Watch for loading spinner
4. Note "Updated" timestamp

**Expected Results:**
- [ ] Refresh button shows loading spinner while fetching
- [ ] Market values update (or stay same if cached)
- [ ] "Updated" timestamp in Market Pulse card updates
- [ ] No console errors

---

### ✅ Test 10: No False Source Claims

**Setup:**
```bash
# Without FINNHUB_API_KEY (fallback mode)
npm run dev
```

**Navigate to:** http://localhost:3000/macro/news

**Expected Results:**
- [ ] Fallback articles show "Market Data" or "Economic Calendar" (generic sources)
- [ ] NO articles claim to be from "Bloomberg" or "WSJ" unless actually from those sources
- [ ] Market Pulse does NOT claim "Live from Bloomberg Terminal"
- [ ] All source attributions are accurate

---

## Summary Checklist

- [ ] All tests pass without API key (graceful fallback)
- [ ] All tests pass with valid API key (live data)
- [ ] Cache behavior works correctly (10-min TTL)
- [ ] API failures degrade gracefully (no UI breakage)
- [ ] Article rotation is deterministic (same order per day)
- [ ] "Updated X minutes ago" indicator works
- [ ] API endpoints return valid JSON
- [ ] Sentiment classification works
- [ ] Market Pulse refresh button works
- [ ] No false source claims in UI

---

## Quick Commands

```bash
# Start dev server
npm run dev

# Test with API key
echo "FINNHUB_API_KEY=your-key" >> .env.local
npm run dev

# Test without API key
# (comment out FINNHUB_API_KEY in .env.local)
npm run dev

# Test API endpoints
curl http://localhost:3000/api/market/indices | jq
curl http://localhost:3000/api/macro/news?window=1W | jq

# Check logs for fetch status
# Look for: [marketData] and [newsData] in terminal output
```

---

## Getting Finnhub API Key

1. Go to: https://finnhub.io/register
2. Sign up (free, no credit card required)
3. Copy API key from dashboard
4. Add to `.env.local`:
   ```bash
   FINNHUB_API_KEY=your-key-here
   ```
5. Restart dev server

---

## Expected Behavior Summary

| Scenario | Market Pulse | Macro News | UI Status |
|----------|--------------|------------|-----------|
| No API key | Placeholder values | Fallback articles | ✅ Works |
| Valid API key | Live data | Real headlines | ✅ Works |
| Invalid API key | Placeholder values | Fallback articles | ✅ Works |
| API timeout | Cached data (if available) | Cached articles (if available) | ✅ Works |
| No cache + no API | Placeholder values | Fallback articles | ✅ Works |

**Bottom Line:** UI NEVER breaks, regardless of API status.

