# Complete API Keys Guide

This document lists **all** API keys needed for the FinModAI platform.

## Quick Setup

1. Create a `.env.local` file in the `finmodai-next/` directory
2. Copy keys from this guide into `.env.local`
3. Run the verification script: `npx tsx scripts/check-api-keys.ts`
4. Restart your dev server: `npm run dev`

## Required API Keys (Core Features)

### 1. FRED API Key ⭐ **REQUIRED**
- **Purpose**: Macro economic data (CPI, Unemployment, Fed Funds, GDP)
- **Used in**: Macro IQ page, Growth vs Inflation charts
- **Get it**: https://fred.stlouisfed.org/docs/api/api_key.html
- **Cost**: FREE
- **File**: `.env.local`
```bash
FRED_API_KEY=your_fred_api_key_here
```

### 2. Webz.io API Key ⭐ **REQUIRED**
- **Purpose**: News headlines and market events
- **Used in**: Market Brief headlines, Macro IQ headlines
- **Get it**: https://webz.io/
- **Cost**: FREE tier available
- **File**: `.env.local`
```bash
WEBZIO_API_KEY=your_webz_api_key_here
# Alternative name (also works):
WEBZ_API_KEY=your_webz_api_key_here
```

### 3. OpenAI API Key ⭐ **REQUIRED**
- **Purpose**: AI model generation, assumption enrichment
- **Used in**: Model generation, DCF/LBO/3-statement models
- **Get it**: https://platform.openai.com/api-keys
- **Cost**: Paid (usage-based)
- **File**: `.env.local`
```bash
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini  # Optional, defaults to gpt-4o-mini
```

## Optional API Keys (Enhanced Features)

### 4. DataBento API Key
- **Purpose**: Premium market data and news (fallback/alternative)
- **Used in**: Market charts (alternative to Stooq)
- **Get it**: https://databento.com/
- **Cost**: Paid
- **File**: `.env.local`
```bash
DATABENTO_API_KEY=your_databento_key_here
DATABENTO_BASE_URL=https://hist.databento.com/v0
DATABENTO_EQUITIES_DATASET=DBEQ
DATABENTO_NEWS_DATASET=your_dataset  # Optional
```

### 5. Finnhub API Key
- **Purpose**: Real-time market data (alternative to Stooq)
- **Used in**: Market charts, stock quotes
- **Get it**: https://finnhub.io/
- **Cost**: FREE tier available (60 calls/min)
- **File**: `.env.local`
```bash
FINNHUB_API_KEY=your_finnhub_key_here
```

### 6. Polygon.io API Key
- **Purpose**: Professional market data
- **Used in**: Market charts, financial data
- **Get it**: https://polygon.io/
- **Cost**: FREE tier available
- **File**: `.env.local`
```bash
POLYGON_API_KEY=your_polygon_key_here
```

### 7. Financial Modeling Prep (FMP) API Key
- **Purpose**: Financial statement data
- **Used in**: Financial data fetching
- **Get it**: https://financialmodelingprep.com/
- **Cost**: FREE tier available (250 requests/day)
- **File**: `.env.local`
```bash
FMP_API_KEY=your_fmp_key_here
# Alternative for client-side:
NEXT_PUBLIC_FMP_API_KEY=your_fmp_key_here
```

### 8. Alpha Vantage API Key
- **Purpose**: Market data and quotes
- **Used in**: Stock quotes, market data
- **Get it**: https://www.alphavantage.co/support/#api-key
- **Cost**: FREE tier available (5 calls/min, 500/day)
- **File**: `.env.local`
```bash
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key_here
```

### 9. Marketstack API Key
- **Purpose**: Market data
- **Used in**: Stock quotes (alternative provider)
- **Get it**: https://marketstack.com/
- **Cost**: FREE tier available
- **File**: `.env.local`
```bash
MARKETSTACK_API_KEY=your_marketstack_key_here
MARKETSTACK_BASE_URL=https://api.marketstack.com/v1
```

## No API Key Required

These services work without API keys:

- **Stooq** - Public CSV API (used for SPY charts) - No key needed ✅
- **Yahoo Finance** - Public data (Python fallback) - No key needed ✅

## Complete .env.local Template

Copy this into `finmodai-next/.env.local`:

```bash
# ========================================
# REQUIRED API KEYS (Core Features)
# ========================================

FRED_API_KEY=your_fred_api_key_here
WEBZIO_API_KEY=your_webz_api_key_here
OPENAI_API_KEY=your_openai_api_key_here

# ========================================
# OPTIONAL API KEYS (Enhanced Features)
# ========================================

# DataBento (Premium Market Data)
DATABENTO_API_KEY=your_databento_key_here
DATABENTO_BASE_URL=https://hist.databento.com/v0
DATABENTO_EQUITIES_DATASET=DBEQ

# Finnhub (Real-time Market Data)
FINNHUB_API_KEY=your_finnhub_key_here

# Polygon.io (Professional Market Data)
POLYGON_API_KEY=your_polygon_key_here

# Financial Modeling Prep
FMP_API_KEY=your_fmp_key_here

# Alpha Vantage
ALPHA_VANTAGE_API_KEY=your_alpha_vantage_key_here

# Marketstack
MARKETSTACK_API_KEY=your_marketstack_key_here
MARKETSTACK_BASE_URL=https://api.marketstack.com/v1

# ========================================
# OPTIONAL CONFIGURATION
# ========================================

OPENAI_MODEL=gpt-4o-mini  # Default model
```

## Verification

Run this command to check your API key configuration:

```bash
cd finmodai-next
npx tsx scripts/check-api-keys.ts
```

## What Happens Without Keys?

- **Missing FRED_KEY**: Macro IQ charts show "—" for inflation/growth/labor/rates
- **Missing WEBZIO_KEY**: Headlines show "No headlines available"
- **Missing OPENAI_KEY**: Model generation fails
- **Missing optional keys**: Falls back to Stooq (charts still work) or shows "unavailable"

## Priority Order (What's Most Important)

1. **FRED_API_KEY** - For macro data (FREE)
2. **WEBZIO_API_KEY** - For headlines (FREE tier)
3. **OPENAI_API_KEY** - For AI features (Paid, but essential)
4. Optional keys for better data quality/reliability

## Security Notes

- ⚠️ **Never commit `.env.local` to git** - It's already in `.gitignore`
- ⚠️ **Don't share API keys** - Keep them private
- ⚠️ **Use different keys for dev/prod** if possible
- ✅ `.env.local` is automatically ignored by git

## Troubleshooting

**Keys not loading?**
1. Make sure file is named `.env.local` (not `.env`)
2. Restart dev server after adding keys
3. Check for typos in variable names
4. Run `npx tsx scripts/check-api-keys.ts` to verify

**Still not working?**
- Check browser console for errors
- Verify API keys are valid (test with curl or Postman)
- Some providers have rate limits - check their dashboards
