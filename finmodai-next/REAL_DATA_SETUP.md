# Real Data Setup (No Demo Features)

All routes now use **real data providers only** - no demo fixtures.

## What You Need

To get real data working, you need API keys:

### 1. FRED API Key (FREE)
**Required for:** CPI, Unemployment, Fed Funds data

- Sign up at: https://fred.stlouisfed.org/docs/api/api_key.html
- Get your free API key
- Add to `.env.local`:
  ```bash
  FRED_API_KEY=your_key_here
  ```

### 2. Webz.io API Key (FREE tier available)
**Required for:** News headlines and events

- Sign up at: https://webz.io/
- Get your API key (free tier available)
- Add to `.env.local`:
  ```bash
  WEBZIO_API_KEY=your_key_here
  ```

### 3. DataBento API Key (Optional)
**Used for:** Premium news/events (falls back to Webz if unavailable)

- Sign up at: https://databento.com/
- Add to `.env.local`:
  ```bash
  DATABENTO_API_KEY=your_key_here
  DATABENTO_BASE_URL=https://hist.databento.com/v0
  DATABENTO_NEWS_DATASET=your_dataset
  DATABENTO_EQUITIES_DATASET=DBEQ
  ```

## Market Data (No Key Needed)

- **Stooq** - Public API, works without keys (SPY charts)
- **yfinance** - Python library, no keys needed (fallback)

## Quick Setup

1. Get FRED API key (free): https://fred.stlouisfed.org/docs/api/api_key.html
2. Get Webz.io API key (free tier): https://webz.io/
3. Create `.env.local` file:
   ```bash
   FRED_API_KEY=your_fred_key
   WEBZIO_API_KEY=your_webz_key
   ```
4. Restart dev server: `npm run dev`

## What Happens Without Keys?

- **No FRED key:** CPI, Unemployment, Fed Funds show "n/a" (as expected)
- **No Webz key:** Headlines show "No headlines available" (as expected)
- **No DataBento key:** Falls back to Webz (optional provider)

The app will work but show "unavailable" for missing data - this is correct behavior.

## Testing

Check if data is loading:
```bash
# Test macro summary (needs FRED_API_KEY)
curl http://localhost:3000/api/macro/summary

# Test headlines (needs WEBZIO_API_KEY)
curl http://localhost:3000/api/macro/news
curl http://localhost:3000/api/market/headlines
```

Check the Demo Health indicator (top-right) - it shows which keys are configured.

