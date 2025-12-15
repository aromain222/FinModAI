# API Keys Configuration Guide

## Where to Put Your API Keys

Your API keys go in a `.env` file in the **root directory** of this project (`/Users/averyromain/Scraper/.env`).

## Required API Keys

Based on your backend configuration, here are the API keys the application expects:

### 1. **Alpha Vantage** (Primary Data Source)
```bash
ALPHAVANTAGE_API_KEY=REDACTED
```
- **Get your key:** https://www.alphavantage.co/support/#api-key
- **Free tier:** 5 calls/minute, 500 calls/day
- **Status:** ✅ You already have this key

### 2. **Financial Modeling Prep (FMP)**
```bash
FMP_API_KEY=REDACTED
```
- **Get your key:** https://financialmodelingprep.com/developer/docs
- **Free tier:** 250 requests/day
- **Status:** ✅ You already have this key

### 3. **Finnhub** (Optional - Real-time Data)
```bash
FINNHUB_API_KEY=your_finnhub_key_here
```
- **Get your key:** https://finnhub.io/docs/api
- **Free tier:** 60 calls/minute
- **Status:** ⚠️ Not configured (optional but recommended)

### 4. **Polygon.io** (Optional - Professional Data)
```bash
POLYGON_API_KEY=REDACTED
```
- **Get your key:** https://polygon.io/
- **Free tier:** Available
- **Status:** ⚠️ Not configured (optional)

### 5. **FRED (Federal Reserve)** (Optional - Debt Market Data)
```bash
FRED_API_KEY=your_fred_key_here
```
- **Get your key:** https://fred.stlouisfed.org/docs/api/api_key.html
- **Free tier:** Yes
- **Status:** ⚠️ Not configured (optional, for LBO debt market conditions)

### 6. **SEC EDGAR** (Required - No API Key Needed!)
```bash
SEC_UA_EMAIL=your_email@example.com
```
- **No API key needed** - SEC EDGAR is free public data
- **What it is:** Your email address for the User-Agent header (SEC requirement)
- **Status:** ⚠️ Must be set (use your real email)

## Complete .env File Template

Copy this into your `.env` file (located at `/Users/averyromain/Scraper/.env`):

```bash
# ========================================
# REQUIRED API KEYS
# ========================================

# Alpha Vantage (Primary Data Source)
ALPHAVANTAGE_API_KEY=REDACTED

# Financial Modeling Prep
FMP_API_KEY=REDACTED

# SEC EDGAR (No API key, just your email for User-Agent)
SEC_UA_EMAIL=your_email@example.com

# ========================================
# OPTIONAL API KEYS (Recommended)
# ========================================

# Finnhub (Real-time Data)
FINNHUB_API_KEY=your_finnhub_key_here

# Polygon.io (Professional Data)
POLYGON_API_KEY=REDACTED

# FRED (Federal Reserve Economic Data - for LBO debt market conditions)
FRED_API_KEY=your_fred_key_here
```

## How to Edit Your .env File

1. **Open Terminal** and navigate to your project:
   ```bash
   cd /Users/averyromain/Scraper
   ```

2. **Edit the .env file**:
   ```bash
   nano .env
   ```
   Or use your favorite text editor (VS Code, TextEdit, etc.)

3. **Add your API keys** (replace the placeholder values with your actual keys)

4. **Save the file** and restart your server

## Verify Your Keys Are Loaded

After setting up your `.env` file, restart your server and check the startup logs. You should see:

```
INFO:provider_health:PROVIDER_OK Finnhub as_of=...
INFO:provider_health:PROVIDER_OK AlphaVantage as_of=...
INFO:provider_health:PROVIDER_OK FMP as_of=...
```

If you see `⊘ FMP: No API key configured`, that means the key isn't being loaded correctly.

## Quick Setup Commands

```bash
# Navigate to project
cd /Users/averyromain/Scraper

# Open .env file in nano (or use your preferred editor)
nano .env

# After editing, verify it's readable
cat .env | grep -v "^#" | grep "="
```

## Current Status Based on Logs

From your recent server logs, I can see:
- ✅ **Alpha Vantage:** Working (PROVIDER_OK)
- ✅ **Finnhub:** Working (PROVIDER_OK)
- ⚠️ **FMP:** Not configured (missing FMP_API_KEY)
- ⚠️ **FRED:** Not configured (missing FRED_API_KEY)

## Notes

- **Never commit your .env file to git** - it contains sensitive API keys
- The `.env` file is in `.gitignore` for security
- Environment variables are case-sensitive
- Use `ALPHAVANTAGE_API_KEY` (no underscore, all caps)
- Use `FMP_API_KEY` (not `FINANCIALMODELINGPREP_API_KEY` - both work, but FMP_API_KEY is preferred)

