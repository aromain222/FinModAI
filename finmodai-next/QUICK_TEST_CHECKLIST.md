# Quick Test Checklist

## 🚀 Start Development Server

```bash
cd /Users/averyromain/Scraper/finmodai-next
npm run dev
```

---

## ✅ Route Testing

### Core Routes
- [ ] `http://localhost:3000/app` - App home loads
- [ ] `http://localhost:3000/models` - Models list loads
- [ ] `http://localhost:3000/models/create` - Create model form loads
- [ ] `http://localhost:3000/startups` - Startups page loads (should use StartupsPageLive)
- [ ] `http://localhost:3000/macro` - Macro dashboard loads
- [ ] `http://localhost:3000/macro/news` - Macro news page loads with Market Pulse widget

### Model Detail (if you have existing models)
- [ ] `http://localhost:3000/models/[id]` - Model detail page loads without crash
- [ ] DCF preview shows valuation data without "Cannot read properties of undefined"

---

## ✅ API Route Testing

### Terminal Commands
```bash
# Test Market Pulse API
curl http://localhost:3000/api/market/pulse | jq

# Test Startups API (live mode)
curl "http://localhost:3000/api/startups?mode=live&window=7d" | jq

# Test IPO Watch API
curl "http://localhost:3000/api/ipo-watch?mode=live&window=90d" | jq

# Test Macro News API
curl "http://localhost:3000/api/macro/news?window=1W" | jq
```

### Expected Behaviors
- [ ] `/api/market/pulse` returns `dataMode: "live"` or `"demo"` depending on `POLYGON_API_KEY`
- [ ] `/api/startups` returns sorted startups (momentumScore DESC)
- [ ] `/api/ipo-watch` returns sorted IPO candidates (ipoProbabilityScore DESC)
- [ ] No API route crashes (all return valid JSON)

---

## ✅ UI Visual Checks

### Startups Page (`/startups`)
- [ ] Cards use emerald/rose/slate color palette (not green-600/red-600)
- [ ] High momentum startups show emerald "Hot" badge
- [ ] Momentum scores visible with emerald/blue/slate colors
- [ ] "Live data" badge appears if API keys are configured
- [ ] "Demo seed data" badge appears if no API keys
- [ ] Watchlist star button has good hover state
- [ ] Sorting: Hot Startups by momentum DESC, IPO Watch by probability DESC

### Macro News Page (`/macro/news`)
- [ ] Market Pulse widget appears in sidebar
- [ ] Market Pulse shows S&P 500, Dow, Nasdaq
- [ ] Market Pulse has "Live" or "Demo" badge
- [ ] Article cards show Bullish/Neutral/Bearish badges (emerald/slate/rose)
- [ ] Sentiment tabs show counts (e.g., "Bullish (12)")
- [ ] "Sector Sentiment Trends" shows Bull/Neutral/Bear breakdown
- [ ] "Hottest Macro Themes" shows sentiment badges
- [ ] "Updated X minutes ago" timestamp visible

### Models Page (`/models`)
- [ ] Table renders correctly
- [ ] Status badges show (Ready/Generating/Failed)
- [ ] "View" and "Download" buttons work
- [ ] No console errors

---

## ✅ Sorting Verification

### Hot Startups
Open browser console on `/startups` and run:
```javascript
// Should be sorted by momentumScore DESC, then name ASC
const cards = Array.from(document.querySelectorAll('[class*="StartupCard"]'));
console.log('First 5 startups:', cards.slice(0, 5).map(c => c.textContent));
```

### IPO Watch
Switch to "IPO Watch" tab and verify:
- [ ] Highest probability scores appear first
- [ ] Tie-breaker uses filing date (most recent first)

---

## ✅ Data Mode Testing

### With API Keys
1. Set environment variables:
   ```bash
   POLYGON_API_KEY=your_key
   FINNHUB_API_KEY=your_key
   ```
2. Restart dev server
3. Check:
   - [ ] Market Pulse shows "Live" badge with pulse animation
   - [ ] Startups page shows "Live data" badge
   - [ ] "Updated X min ago" shows recent timestamp

### Without API Keys
1. Remove/comment out API keys in `.env.local`
2. Restart dev server
3. Check:
   - [ ] Market Pulse shows "Demo" badge
   - [ ] Startups page shows "Demo seed data" badge
   - [ ] No crashes or errors
   - [ ] UI still looks good with placeholder data

---

## ✅ Console Error Check

Open browser DevTools console and verify:
- [ ] No "Cannot read properties of undefined" errors
- [ ] No "Unexpected token" errors
- [ ] No "Failed to fetch" errors (unless API keys are missing, which is expected)
- [ ] Only safe, informative logs (e.g., "[MarketPulse] Fetching data...")

---

## ✅ Build Verification

```bash
# Clean build
rm -rf .next
npm run build

# Check for errors
# Should complete without "Failed to compile"
```

Expected output:
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization
```

---

## ✅ Mobile Responsiveness

1. Open DevTools and toggle device toolbar (Cmd+Shift+M on Mac)
2. Test on iPhone 12 Pro viewport
3. Check:
   - [ ] Startups cards stack vertically
   - [ ] Filters wrap properly
   - [ ] Market Pulse widget is readable
   - [ ] Navigation sidebar collapses (if implemented)

---

## 🐛 Known Issues (If Any)

_None reported. If you encounter issues, document them here._

---

## ✅ Final Checklist

- [ ] All routes load without 404
- [ ] No runtime crashes
- [ ] Sorting is correct and deterministic
- [ ] Live/Demo mode labels are clear
- [ ] Colors are consistent (emerald/rose/slate)
- [ ] No false source claims (Bloomberg/WSJ)
- [ ] Build completes successfully
- [ ] No linter errors

---

**Status:** Ready for demo ✅  
**Last Updated:** December 25, 2025

