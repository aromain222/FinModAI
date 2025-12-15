# 🚀 Quick Start - Data Pipeline Diagnostics

## Setup (5 minutes)

### 1. Add API Keys to `.env.local`

```bash
# At minimum, add ONE of these:
POLYGON_API_KEY=REDACTED
FINNHUB_API_KEY=your_key_here
FMP_API_KEY=REDACTED

# OpenAI (already configured)
OPENAI_API_KEY=REDACTED
```

**Get Free API Keys:**
- Polygon: https://polygon.io/ (Free tier: 5 calls/min)
- Finnhub: https://finnhub.io/ (Free tier: 60 calls/min)
- FMP: https://financialmodelingprep.com/ (Free tier: 250 calls/day)

### 2. Start Dev Server

```bash
npm run dev
```

---

## Test the Pipeline (2 minutes)

### Test All Providers

```bash
curl "http://localhost:3000/api/diagnostics/engines?ticker=AAPL"
```

**Look for:**
```json
{
  "summary": {
    "status": "HEALTHY",  // ✅ At least one provider working
    "providersWorking": 2,
    "providersTotal": 3
  }
}
```

### Test Individual Providers

```bash
# Test Polygon
curl "http://localhost:3000/api/diagnostics/polygon?ticker=MSFT"

# Test Finnhub
curl "http://localhost:3000/api/diagnostics/finnhub?ticker=GOOGL"

# Test FMP
curl "http://localhost:3000/api/diagnostics/fmp?ticker=TSLA"
```

**Expected:**
- ✅ `"ok": true` with financial data
- ❌ `"ok": false, "reason": "missing-key"` if no API key
- ❌ `"ok": false, "reason": "auth"` if invalid key

---

## Generate a Model (1 minute)

```bash
curl -X POST "http://localhost:3000/api/generateModel" \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "modelType": "dcf"}'
```

**Check Console Logs:**

```
[getLTMFinancials] Fetching data for AAPL
[Polygon] ✅ Data fetched for AAPL
[getLTMFinancials] ✅ Polygon data complete for AAPL
[enrichUnifiedAssumptions] Calling OpenAI for: AAPL
[enrichUnifiedAssumptions] OpenAI response received
[sanitizeAssumptions] ✅ All assumptions within realistic bounds
[DCF DEBUG] AAPL { "startingRevenueMillions": 394328, ... }
```

**Expected Model:**
- ✅ Revenue: $300B+ (not $0.0B)
- ✅ EBITDA Margin: 20-40% (not -9400%)
- ✅ Tax Rate: 15-25% (not 2100%)
- ✅ Capex: 2-5% of revenue (not 600%)

---

## Troubleshooting

### All Providers Fail

**Symptom:**
```json
{
  "summary": {
    "status": "DEGRADED",
    "providersWorking": 0
  }
}
```

**Solution:**
1. Check API keys in `.env.local`
2. Verify keys are valid (test on provider websites)
3. Check rate limits (wait 1 minute and retry)

**Fallback Behavior:**
- System will use fallback engine
- Models will still generate with realistic values
- Revenue will be $1B-$15B based on sector

### Model Shows $0 Revenue

**This should NOT happen anymore!**

If it does:
1. Check console logs for errors
2. Run diagnostics: `curl "http://localhost:3000/api/diagnostics/engines?ticker=SPOT"`
3. Check if fallback engine is working
4. File a bug report

### Insane Margins/Tax Rates

**This should NOT happen anymore!**

Sanitization clamps all values:
- Revenue Growth: -50% to +50%
- EBIT Margin: -20% to +60%
- Tax Rate: 0% to 50%
- Capex: 0% to 25%

If you see values outside these ranges, file a bug report.

---

## Common Issues

### Issue: "Missing POLYGON_API_KEY env var"

**Fix:** Add to `.env.local`:
```bash
POLYGON_API_KEY=REDACTED
```

Restart dev server.

### Issue: "Auth error (401)"

**Fix:** API key is invalid. Get a new one from the provider website.

### Issue: "Rate limited (429)"

**Fix:** Wait 1 minute and retry. Consider upgrading to paid plan or using multiple providers.

### Issue: "No data for ticker XYZ"

**Fix:** Ticker might not exist or might be delisted. Try a different ticker (AAPL, MSFT, GOOGL).

---

## Quick Reference

### Diagnostic Endpoints

| Endpoint | Purpose |
|----------|---------|
| `/api/diagnostics/engines?ticker=AAPL` | Test entire pipeline |
| `/api/diagnostics/polygon?ticker=AAPL` | Test Polygon API |
| `/api/diagnostics/finnhub?ticker=AAPL` | Test Finnhub API |
| `/api/diagnostics/fmp?ticker=AAPL` | Test FMP API |

### Console Log Prefixes

| Prefix | Meaning |
|--------|---------|
| `[Polygon]` | Polygon API calls |
| `[Finnhub]` | Finnhub API calls |
| `[FMP]` | FMP API calls |
| `[getLTMFinancials]` | Data fetching flow |
| `[buildFallbackFinancials]` | Fallback engine |
| `[enrichUnifiedAssumptions]` | OpenAI enrichment |
| `[sanitizeAssumptions]` | Value sanitization |
| `[DCF DEBUG]` | DCF model inputs |

### Status Indicators

| Icon | Meaning |
|------|---------|
| ✅ | Success |
| ⚠️ | Warning (non-critical) |
| ❌ | Error (trying fallback) |
| 🔄 | Using fallback engine |

---

## Next Steps

1. ✅ Test with your own tickers
2. ✅ Verify models generate correctly
3. ✅ Check console logs for any issues
4. ✅ Add all three API keys for best results
5. ✅ Monitor rate limits

**Questions?** Check `DATA_PIPELINE_STABILIZATION_COMPLETE.md` for full documentation.

