# Quick Start - Testing the Fixed DCF Engine

## Start the Server

```bash
cd /Users/averyromain/Scraper/finmodai-next
npm run dev
```

Server will start at `http://localhost:3000`

## Test with MSFT

### Option 1: Using curl

```bash
curl -X POST http://localhost:3000/api/generateModel \
  -H "Content-Type: application/json" \
  -d '{
    "ticker": "MSFT",
    "modelType": "dcf"
  }'
```

### Option 2: Using the UI

1. Open `http://localhost:3000` in your browser
2. Enter ticker: `MSFT`
3. Select model type: `DCF`
4. Click "Generate Model"

## What to Look For

### In Console Logs

You should see:

```
[generateModel] ========== DCF INPUTS DEBUG ==========
[generateModel] Ticker: MSFT
[generateModel] Revenue: $211.0B, $225.0B, $240.0B, $255.0B, $270.0B, $285.0B
[generateModel] EBIT Margin: 42.0%
[generateModel] Net Debt: $50.0B
[generateModel] Shares Outstanding: 7430.0M
[generateModel] ==========================================

[generateModel] ========== DCF RESULTS DEBUG ==========
[generateModel] EBIT Year 1: $88.6B
[generateModel] UFCF Year 1: $59.5B
[generateModel] Enterprise Value: $917.9B
[generateModel] Equity Value: $867.9B
[generateModel] Price Per Share: $116.83
[generateModel] ==========================================
```

### In Excel File

Download the generated Excel file and check the "DCF Model" tab:

**Header**:
- ✅ "MSFT - Discounted Cash Flow Model"
- ✅ "Units: $ Millions"

**Revenue Row** (should show values like):
- 211,000 | 225,000 | 240,000 | 255,000 | 270,000 | 285,000

**EBIT Row** (should show values like):
- 88,620 | 94,500 | 100,800 | 107,100 | 113,400 | 119,700

**UFCF Row** (should show values like):
- 59,460 | 63,405 | 67,632 | 71,859 | 76,086 | 80,313

**Valuation Section**:
- PV of Explicit FCF: ~298,846
- Terminal Value: ~1,097,613
- PV of Terminal Value: ~619,054
- Enterprise Value: ~917,900
- Net Debt: 50,000
- Equity Value: ~867,900
- Price Per Share: ~$116.83

## Test Other Tickers

### Apple (AAPL)
```bash
curl -X POST http://localhost:3000/api/generateModel \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "modelType": "dcf"}'
```

Expected: Similar results to MSFT (large tech company)

### Spotify (SPOT)
```bash
curl -X POST http://localhost:3000/api/generateModel \
  -H "Content-Type: application/json" \
  -d '{"ticker": "SPOT", "modelType": "dcf"}'
```

Expected: Smaller revenue, different margins

## Verify the Fix

### ✅ All these should be TRUE:

1. **Revenue is NOT 1, 1, 1, 1, 2, 2**
   - Should be realistic values like 211,000, 225,000, etc.

2. **EBIT is NOT all zeros**
   - Should be ~40% of revenue for MSFT

3. **UFCF is NOT all zeros**
   - Should be positive values

4. **Price per share is NOT negative**
   - Should be positive, in range $100-$500 for MSFT

5. **Net Debt is in millions**
   - Should be ~50,000 for MSFT (meaning $50B)

6. **Console shows formatted values**
   - Should show "$211.0B" not "211000"

## Debug Sheet

Check the "RAW_INPUTS" tab in Excel for full diagnostics:
- All input parameters
- All computed results
- Useful for debugging if something looks wrong

## Common Issues

### Issue: "No financial data available"
**Solution**: The ticker might not be available in the data providers. The system will use AI fallback with sector-based estimates.

### Issue: Price per share seems too low/high
**Solution**: This is normal - the DCF value depends on assumptions (growth rate, WACC, etc.). The math is correct, but assumptions may differ from market expectations.

### Issue: Console doesn't show DCF DEBUG sections
**Solution**: Make sure you selected "dcf" as the modelType, not "three-statement" or "lbo".

## Success Criteria

✅ **The fix is working if**:
1. Revenue shows realistic values (not 1, 1, 1, 1, 2, 2)
2. EBIT is non-zero and matches the margin
3. UFCF is non-zero
4. Price per share is positive and reasonable
5. Console logs show formatted values with units
6. Excel sheet has "Units: $ Millions" label

## Next Steps

Once verified, you can:
1. Test with more tickers
2. Adjust assumptions (WACC, terminal growth) in the request body
3. Generate other model types (three-statement, lbo, comps)
4. Integrate with your frontend UI

## Need Help?

See full documentation:
- `DCF_FIX_COMPLETE.md` - Complete fix summary
- `MANUAL_DCF_VERIFICATION.md` - Math verification
- `DCF_FIX_SUMMARY.md` - Technical details

