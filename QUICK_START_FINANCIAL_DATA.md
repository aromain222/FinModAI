# Quick Start - Financial Data Layer

## 🚀 What You Just Got

A **production-grade financial data layer** that:
- ✅ Fetches real company data from multiple APIs (FMP, Yahoo, FRED)
- ✅ **NO generic defaults** - fails fast if data insufficient
- ✅ Full **provenance tracking** (source + timestamp for every metric)
- ✅ Company-specific assumptions for DCF/LBO/3-Statement models
- ✅ Automatic sanity checks with flags
- ✅ RESTful API endpoint ready to use

---

## ⚡ Quick Test (No Setup Required)

Test with Yahoo Finance (no API key needed, but rate-limited):

```bash
# Start the app
python minimal_app.py

# In another terminal:
curl "http://localhost:10000/assumptions?ticker=AAPL" | jq
```

Expected: Either full data or `insufficient_historicals` error (no silent defaults!)

---

## 🔑 Production Setup (Recommended)

### 1. Get FMP API Key (FREE)
```bash
# Visit: https://financialmodelingprep.com/developer/docs/
# Sign up (free tier: 250 requests/day)
# Copy your API key

# Set environment variable:
export FMP_API_KEY=REDACTED
```

### 2. Test with Real Data
```bash
# Test script
python test_financial_data_layer.py

# Or direct API call:
python -c "
from financial_data import FinancialDataEngine
import json

engine = FinancialDataEngine()
result = engine.get_assumptions('MSFT')
print(json.dumps(result, indent=2))
"
```

### 3. Deploy to Render

Add to your Render environment variables:
```
FMP_API_KEY=REDACTED
```

Render will auto-deploy on your next git push!

---

## 📡 API Endpoint

### GET /assumptions

**Request:**
```bash
GET /assumptions?ticker=MSFT&use_cache=true
```

**Success Response (200):**
```json
{
  "ticker": "MSFT",
  "company_name": "Microsoft Corp.",
  "currency": "USD",
  "provenance": {
    "revenue": {"source": "FMP", "as_of": "2025-10-07"},
    ...
  },
  "historicals": {
    "years": [2024, 2023, 2022],
    "revenue": [211915000000, 198270000000, 168088000000],
    ...
  },
  "assumptions": {
    "forecast_years": 10,
    "revenue_growth": [0.12, 0.11, 0.10, ...],
    "operating_margin": [0.42, 0.43, ...],
    "tax_rate": 0.21,
    ...
  },
  "wacc": {
    "rf": 0.045,
    "beta": 0.92,
    "wacc": 0.089,
    ...
  },
  "terminal": {
    "method": "perpetuity",
    "g": 0.025
  },
  "flags": []
}
```

**Error Response (422 - Insufficient Data):**
```json
{
  "error": "insufficient_historicals",
  "missing": ["revenue", "operating_income"],
  "provider_attempts": ["FMP", "Yahoo"],
  "message": "Need ≥3 years of revenue and EBIT to build assumptions."
}
```

---

## 🎯 What Makes This Different

### Traditional Approach ❌
```python
# Generic defaults - BAD
assumptions = {
    "revenue_growth": 0.08,  # Always 8%
    "operating_margin": 0.25,  # Always 25%
    "wacc": 0.10  # Always 10%
}
```

### Your New Approach ✅
```python
# Company-specific, fail-fast - GOOD
assumptions = engine.get_assumptions('MSFT')

if "error" in assumptions:
    # Explicitly handle insufficient data
    show_error_to_user(assumptions['message'])
else:
    # Real company data with provenance
    # MSFT: 40% margin, 7-9% WACC
    # vs generic 25% margin, 10% WACC
    use_real_assumptions(assumptions)
```

---

## 📊 Example Outputs

### Mega-Cap (MSFT)
```json
{
  "assumptions": {
    "revenue_growth": [0.12, 0.11, 0.10, 0.08, 0.06, ...],
    "operating_margin": [0.42, 0.43, 0.43, 0.43, ...],
    "wacc": 0.089
  },
  "flags": []
}
```
✅ High margin (40%+), reasonable WACC (8-9%), few flags

### Small-Cap with Patchy Data
```json
{
  "error": "insufficient_historicals",
  "missing": ["revenue"],
  "message": "Need ≥3 years of revenue..."
}
```
✅ Fails fast instead of using 8%/25% defaults

---

## 🧪 Testing

```bash
# Full test suite
python test_financial_data_layer.py

# Expected:
# ✅ PASS - Mega-Cap (MSFT) [if FMP_API_KEY set]
# ✅ PASS - Small-Cap (PLUG) [correctly fails fast]
# ✅ PASS - Invalid Ticker [correctly returns error]
# ✅ PASS - Data Contract [structure validated]
```

---

## 🔧 Integration Examples

### In Your DCF Model
```python
from financial_data import FinancialDataEngine

engine = FinancialDataEngine()

def build_dcf(ticker):
    # Get assumptions
    data = engine.get_assumptions(ticker)
    
    # Check for errors
    if "error" in data:
        return {
            "error": True,
            "message": data['message'],
            "missing_data": data['missing']
        }
    
    # Use real company assumptions
    fcf_projections = []
    revenue = data['historicals']['revenue'][0]  # Most recent
    
    for year in range(data['assumptions']['forecast_years']):
        growth = data['assumptions']['revenue_growth'][year]
        margin = data['assumptions']['operating_margin'][year]
        
        revenue *= (1 + growth)
        ebit = revenue * margin
        nopat = ebit * (1 - data['assumptions']['tax_rate'])
        
        # Calculate FCF...
        fcf = nopat - capex + da - delta_nwc
        fcf_projections.append(fcf)
    
    # Discount at company-specific WACC
    pv = [fcf / (1 + data['wacc']['wacc'])**(i+1) 
          for i, fcf in enumerate(fcf_projections)]
    
    # Terminal value with company-specific g
    terminal_fcf = fcf_projections[-1] * (1 + data['terminal']['g'])
    terminal_value = terminal_fcf / (data['wacc']['wacc'] - data['terminal']['g'])
    
    enterprise_value = sum(pv) + terminal_value / (1 + data['wacc']['wacc'])**10
    
    return {
        "ev": enterprise_value,
        "assumptions_used": data['assumptions'],
        "data_sources": data['provenance'],
        "flags": data['flags']
    }
```

### In Your UI
```javascript
// Fetch assumptions
const response = await fetch(`/assumptions?ticker=${ticker}`);
const data = await response.json();

// Handle error state
if (data.error) {
    showError(`Insufficient data for ${ticker}`, {
        missing: data.missing,
        providers_tried: data.provider_attempts,
        message: data.message
    });
    return;
}

// Show data with provenance badges
renderAssumptions(data.assumptions);
renderProvenance(data.provenance);  // "Data from FMP (2025-10-07)"
renderFlags(data.flags);  // Show warnings if any
```

---

## 📁 Files Created

```
financial_data/
├── __init__.py                    # Module exports
├── contracts.py                   # Data contracts (1,066 lines)
├── data_engine.py                 # Main engine (311 lines)
├── assumptions_calculator.py      # Calculations (298 lines)
├── sanity_checker.py              # Validation (93 lines)
└── providers/
    ├── base_provider.py           # Base class (83 lines)
    ├── fmp_provider.py            # FMP provider (281 lines)
    ├── alpha_vantage_provider.py  # Alpha Vantage (71 lines)
    ├── yahoo_provider.py          # Yahoo Finance (164 lines)
    └── fred_provider.py           # FRED risk-free (61 lines)

test_financial_data_layer.py      # Comprehensive tests (356 lines)
FINANCIAL_DATA_LAYER.md           # Full documentation
minimal_app.py                     # Updated with /assumptions endpoint
```

**Total**: ~2,800 lines of production code

---

## 🎓 Key Concepts

### 1. Fail-Fast Design
- No silent fallbacks to defaults
- Explicit errors when data missing
- UI can handle error states properly

### 2. Provenance Tracking
- Every metric tagged with source + date
- Compliance/audit trail
- User knows exactly where data came from

### 3. Coverage Scoring
- Providers ranked by data completeness
- Best source auto-selected
- FMP preferred, Yahoo as fallback

### 4. Deterministic Calculations
- Same inputs → same outputs
- No randomness in base case
- Transparent calculation logic

---

## 🚨 Common Issues

**"FMP_API_KEY not set"**
→ Set: `export FMP_API_KEY=REDACTED

**"429 Too Many Requests"**
→ Yahoo rate limit. Use FMP (primary source).

**"insufficient_historicals"**
→ Company has <3 years of data. This is correct behavior!

**"service_unavailable"**
→ No API keys configured. Set FMP_API_KEY.

---

## 📈 Next Steps

1. **Set FMP_API_KEY** for production use
2. **Test with your tickers** - run test suite
3. **Integrate into models** - use /assumptions endpoint
4. **Deploy to Render** - add FMP_API_KEY to env vars
5. **Monitor** - check flags and data quality

---

**Status**: ✅ Production-Ready  
**Deployed**: Auto-deploys on git push  
**Documentation**: See `FINANCIAL_DATA_LAYER.md`  

---

## 💡 Pro Tips

1. **Always check for errors** - Never assume success
2. **Show provenance to users** - Build trust with data sources
3. **Respect rate limits** - Use caching, FMP has limits
4. **Monitor flags** - High flags = questionable assumptions
5. **Cache aggressively** - Financial data doesn't change hourly

**You now have a professional-grade financial data layer! 🎉**

