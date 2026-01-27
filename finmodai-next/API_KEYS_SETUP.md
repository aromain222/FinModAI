# API Keys Setup for Real Data

To get real data (not demo fixtures), you need to set up API keys for the data providers.

## Required API Keys

### 1. FRED API Key (for Macro Data: CPI, Unemployment, Fed Funds)

**Get it free at:** https://fred.stlouisfed.org/docs/api/api_key.html

Add to `.env.local`:
```bash
FRED_API_KEY=your_fred_api_key_here
```

**What it provides:**
- CPI (inflation) data
- Unemployment rate
- Fed funds rate

### 2. Webz.io API Key (for News Headlines)

**Get it at:** https://webz.io/ (free tier available)

Add to `.env.local`:
```bash
WEBZIO_API_KEY=your_webz_api_key_here
```

**What it provides:**
- Macro headlines (`/api/macro/news`)
- Market headlines (`/api/market/headlines`)
- Event feeds (`/api/macro/events`)

### 3. DataBento API Key (Optional - for Premium News)

**Get it at:** https://databento.com/

Add to `.env.local`:
```bash
DATABENTO_API_KEY=your_databento_key_here
DATABENTO_BASE_URL=https://hist.databento.com/v0
DATABENTO_NEWS_DATASET=your_dataset
DATABENTO_EQUITIES_DATASET=DBEQ
```

**What it provides:**
- Premium news/events (fallback if Webz unavailable)
- Market data (alternative to Stooq)

## Quick Setup

1. Get a free FRED API key: https://fred.stlouisfed.org/docs/api/api_key.html
2. Get a free Webz.io API key: https://webz.io/
3. Add to `.env.local`:
   ```bash
   FRED_API_KEY=your_key_here
   WEBZIO_API_KEY=your_key_here
   ```
4. Restart your dev server: `npm run dev`

## Market Data (No Key Required)

- **Stooq** - Public API, no key needed (used for SPY charts)
- **yfinance** - Public Python library, no key needed (fallback for market data)

## What Happens Without Keys

- **FRED missing:** CPI, Unemployment, Fed Funds show "n/a"
- **Webz missing:** Headlines show "No headlines available"
- **DataBento missing:** Falls back to Webz (optional)

## Testing Your Setup

1. Check if keys are loaded:
   ```bash
   # In your terminal
   echo $FRED_API_KEY
   echo $WEBZIO_API_KEY
   ```

2. Test the endpoints:
   ```bash
   # Macro summary (should return data if FRED_API_KEY is set)
   curl http://localhost:3000/api/macro/summary
   
   # Macro headlines (should return data if WEBZIO_API_KEY is set)
   curl http://localhost:3000/api/macro/news
   ```

3. Check the Demo Health indicator (top-right) - it will show which keys are missing

