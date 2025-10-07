## Financial Data Layer - Production-Grade Implementation

### Overview

A senior finance + backend engineered data layer that fetches historical financials and market data from multiple APIs, merges them with full provenance tracking, and returns company-specific assumptions for DCF/LBO/3-Statement models.

**Key Principle**: **No generic defaults**. If data is insufficient, fail fast with explicit errors.

---

## Architecture

### 1. Provider System (Adapter Pattern)

#### Priority Order:
1. **Financial Modeling Prep (FMP)** - Primary source
   - Income Statement (multi-year): revenue, EBIT, EBITDA, D&A
   - Balance Sheet: cash, total debt, shares outstanding
   - Cash Flow: CapEx, change in NWC
   - Ratios/TTM: margins, ROIC
   - Analyst estimates

2. **Alpha Vantage** - Backup for fundamentals
   - Company overview, basic metrics

3. **Yahoo Finance** - Secondary backup
   - Price data, beta, basic financials via yfinance

4. **FRED** - Risk-free rate (10Y Treasury)

All providers implement `BaseProvider` interface with:
- `fetch_data(ticker) -> Optional[ProviderData]`
- Coverage scoring to select best data source
- Timestamp tracking for provenance

### 2. Data Contract

**Success Response** (`FinancialData`):
```json
{
  "ticker": "MSFT",
  "company_name": "Microsoft Corp.",
  "currency": "USD",
  "provenance": {
    "revenue": {"source": "FMP", "as_of": "2025-10-07"},
    "op_margin": {"source": "FMP", "as_of": "2025-10-07"},
    "capex": {"source": "FMP", "as_of": "2025-10-07"},
    "nwc": {"source": "FMP", "as_of": "2025-10-07"},
    "price": {"source": "Yahoo", "as_of": "2025-10-07"},
    "beta": {"source": "FMP", "as_of": "2025-10-07"},
    "rf": {"source": "FRED_DGS10", "as_of": "2025-10-07"}
  },
  "historicals": {
    "years": [2024, 2023, 2022, 2021, 2020],
    "revenue": [...],
    "operating_income": [...],
    "op_margin": [...],
    "da": [...],
    "capex": [...],
    "delta_nwc": [...]
  },
  "assumptions": {
    "forecast_years": 10,
    "revenue_growth": [0.12, 0.11, 0.10, ...],  // Fade from historical/estimates
    "operating_margin": [0.42, 0.43, 0.43, ...],  // 3yr avg + trend
    "da_pct_rev": 0.04,
    "capex_pct_rev": 0.06,
    "nwc_pct_rev": 0.03,
    "tax_rate": 0.21
  },
  "wacc": {
    "rf": 0.045,
    "erp": 0.055,
    "beta": 0.92,
    "ke": 0.096,
    "kd_pre": 0.065,
    "tax": 0.21,
    "wd": 0.15,
    "we": 0.85,
    "kd_after": 0.051,
    "wacc": 0.089
  },
  "terminal": {
    "method": "perpetuity",
    "g": 0.025
  },
  "flags": []
}
```

**Error Response** (`InsufficientDataError`):
```json
{
  "error": "insufficient_historicals",
  "missing": ["revenue", "operating_income"],
  "provider_attempts": ["FMP", "AlphaVantage", "Yahoo"],
  "message": "Need ≥3 years of revenue and EBIT to build assumptions."
}
```

### 3. Assumptions Calculation (Deterministic)

#### Revenue Growth
- **Y1-Y2**: Analyst estimates if available
- **Else**: 3-5 year CAGR from historicals
- **Fade**: Linear fade to 2-4% terminal growth over 5 years
- **Bounds**: 0-30% (unless history exceeded)

#### Operating Margin
- **Base**: 3-year average EBIT/Revenue
- **Trend**: Allow ±300bps if trend supports
- **Bounds**: -5% to 50%
- **Path**: Gradual improvement to target over 3 years, then flat

#### CapEx / D&A / NWC
- **Calculation**: 3-year average as % of revenue
- **Outlier handling**: Winsorize at 50% max
- **Fallback**: None - requires real data

#### Tax Rate
- **Calculation**: 3-year effective tax (cash taxes / pretax income)
- **Bounds**: 10-30%
- **Default**: 21% (US corporate rate) if insufficient data

#### WACC
- **Ke**: Rf + Beta × ERP (ERP = 5.5%)
- **Beta**: From provider or computed from 5y weekly vs SPY, clamped 0.5-2.0
- **Kd_pre**: interest expense / avg debt, or Rf + spread by credit band
- **Weights**: Market D/E, debt weight capped at 70%
- **Formula**: WACC = we×Ke + wd×Kd_after
- **Bounds**: 6-14%

#### Terminal Value
- **Method**: Perpetuity (exit multiple optional)
- **Growth**: 2-3% for developed markets
- **Constraint**: g < WACC (enforced)

### 4. Sanity Checks (Flags)

System emits flags for validation issues:

- `terminal_g_ge_wacc` - Terminal growth ≥ WACC (invalid)
- `tv_likely_dominates_ev` - Terminal value likely >85% of enterprise value
- `high_operating_margin` - Margin >40%
- `low_operating_margin` - Margin <5%
- `high_growth_forecast` - Avg Y1-Y3 growth >20%
- `low_growth_forecast` - Avg Y1-Y3 growth <2%
- `high_wacc` / `low_wacc` - WACC outside 6-14% range
- `high_beta` / `low_beta` - Beta outside 0.7-1.5 range
- `declining_revenue` - Historical revenue trending down
- `negative_operating_income` - Negative EBIT in recent years
- `no_analyst_estimates` - No forward estimates available

---

## API Usage

### Endpoint

```
GET /assumptions?ticker=MSFT&use_cache=true
```

**Query Parameters:**
- `ticker` (required): Stock ticker symbol
- `use_cache` (optional): Use cached data if available (default: true)

**Response Codes:**
- `200`: Success - returns `FinancialData`
- `400`: Bad request - missing ticker
- `422`: Unprocessable - insufficient data (returns `InsufficientDataError`)
- `500`: Internal error
- `503`: Service unavailable - no API keys configured

### Examples

**Success (Mega-Cap with Good Data):**
```bash
curl "http://localhost:10000/assumptions?ticker=MSFT"
```

Returns full `FinancialData` with:
- Growth starting near consensus, fading to ~3%
- Margin ~40%+ (high for tech)
- WACC ~7-9%
- Few/no flags

**Insufficient Data (Small-Cap):**
```bash
curl "http://localhost:10000/assumptions?ticker=SMALLCAP"
```

Returns `InsufficientDataError` if <3 years of data:
```json
{
  "error": "insufficient_historicals",
  "missing": ["revenue", "operating_income"],
  "provider_attempts": ["FMP", "Yahoo"],
  "message": "Need ≥3 years of revenue and EBIT..."
}
```

---

## Setup & Configuration

### 1. Environment Variables

**Required:**
```bash
# Primary data source (highly recommended)
export FMP_API_KEY='your_fmp_key'  # Get from financialmodelingprep.com
```

**Optional:**
```bash
# Backup sources
export ALPHAVANTAGE_API_KEY='your_av_key'  # alphavantage.co
export FRED_API_KEY='your_fred_key'        # fred.stlouisfed.org

# Google Sheets (if implementing that provider)
export GOOGLE_SHEETS_CREDS='path/to/creds.json'
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

Required packages:
- `requests` - API calls
- `yfinance` - Yahoo Finance data
- `numpy` - Numerical calculations
- `flask` - Web API

### 3. Test the System

```bash
# Run comprehensive tests
python test_financial_data_layer.py

# Test specific ticker
python -c "from financial_data import FinancialDataEngine; \
  engine = FinancialDataEngine(); \
  import json; \
  print(json.dumps(engine.get_assumptions('MSFT'), indent=2))"
```

---

## File Structure

```
financial_data/
├── __init__.py                    # Module exports
├── contracts.py                   # Data contracts & config
├── data_engine.py                 # Main orchestration engine
├── assumptions_calculator.py      # Assumptions logic
├── sanity_checker.py              # Validation & flags
└── providers/
    ├── __init__.py
    ├── base_provider.py           # Base interface
    ├── fmp_provider.py            # FMP implementation
    ├── alpha_vantage_provider.py  # Alpha Vantage
    ├── yahoo_provider.py          # Yahoo Finance
    └── fred_provider.py           # FRED risk-free rate
```

---

## Key Design Decisions

### 1. Fail-Fast Philosophy
- **No silent fallbacks** to generic 8%/25% defaults
- **Explicit errors** when data insufficient
- **Provenance tracking** for every metric
- UI can show error states and missing data badges

### 2. Coverage Scoring
- Providers scored by data completeness
- Best provider auto-selected
- Critical: Revenue + EBIT (100 pts each)
- Important: D&A, CapEx, NWC (20 pts each)
- Nice-to-have: Beta, estimates (5-10 pts)

### 3. Deterministic Calculations
- Same inputs → same outputs
- No randomness or Monte Carlo in base assumptions
- Clear logic for every parameter
- Bounds enforced at all stages

### 4. Caching Strategy
- Simple in-memory cache (TTL 12 hours)
- Cache key includes date (daily refresh)
- Production should use Redis with proper TTL

---

## Production Considerations

### 1. Rate Limiting
- Implement retry with exponential backoff
- Respect provider rate limits
- Use caching aggressively

### 2. Error Handling
- Log all provider errors
- Track success/failure rates
- Alert on repeated failures

### 3. Monitoring
- Track response times per provider
- Monitor cache hit rates
- Alert on stale data (>24 hours)

### 4. Security
- Never log API keys
- Use environment variables only
- Rotate keys regularly

### 5. Scalability
- Move cache to Redis/Memcached
- Add request queuing for batch processing
- Consider async/parallel provider calls

---

## Testing

### Acceptance Criteria

✅ **Mega-Cap (MSFT)**:
- Growth starts near consensus or recent CAGR, fades to ~3%
- Margin ≈ 40%+ (high-margin tech)
- WACC ~7-8%
- Few/no flags
- All provenance tracked

✅ **Small-Cap with Patchy Data**:
- Returns `insufficient_historicals` error
- No generic defaults used
- Flags include `no_analyst_estimates`
- Clear missing data message

✅ **Data Contract Validation**:
- All required fields present
- Provenance for every metric
- Proper bounds enforced
- Terminal g < WACC

### Run Tests

```bash
# Full test suite
python test_financial_data_layer.py

# Individual tests
python -c "from test_financial_data_layer import *; \
  engine = FinancialDataEngine(); \
  test_mega_cap(engine)"
```

---

## Future Enhancements

1. **Provider Priority Override**: Allow per-ticker provider preferences
2. **Exit Multiple Terminal**: Add EBITDA multiple terminal value option
3. **Industry Benchmarks**: Flag outliers vs. sector medians
4. **Scenario Analysis**: Bull/base/bear cases
5. **Google Sheets Provider**: Full implementation for GOOGLEFINANCE()
6. **Bloomberg/Refinitiv**: Enterprise data sources
7. **Currency Conversion**: Auto-FX for cross-currency analysis
8. **Audit Trail**: Full request/response logging for compliance

---

## API Keys & Data Sources

### Financial Modeling Prep (Recommended)
- **Website**: https://financialmodelingprep.com
- **Free Tier**: 250 requests/day
- **Paid**: From $14/month
- **Best for**: US equities, comprehensive data

### Alpha Vantage
- **Website**: https://www.alphavantage.co
- **Free Tier**: 5 requests/minute, 500/day
- **Best for**: Backup source, international data

### FRED (Federal Reserve)
- **Website**: https://fred.stlouisfed.org/docs/api/
- **Free**: Unlimited
- **Best for**: Risk-free rate (10Y Treasury)

### Yahoo Finance
- **Access**: Via yfinance library (unofficial)
- **Free**: Yes, but rate-limited
- **Best for**: Price data, beta (backup source)

---

## Support & Troubleshooting

### Common Issues

**"FMP_API_KEY not set"**
- Set environment variable before running
- Check spelling (case-sensitive)

**"429 Too Many Requests"**
- Yahoo Finance rate limit hit
- Solution: Set FMP_API_KEY (primary source)
- Or wait and retry

**"insufficient_historicals"**
- Company doesn't have ≥3 years of data
- Try a more established company
- Check if ticker is correct

**"service_unavailable"**
- No API keys configured
- All providers failed
- Check network connectivity

---

**Built**: October 7, 2025  
**Version**: 1.0.0  
**Status**: Production-Ready ✅

