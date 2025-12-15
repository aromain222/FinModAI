# DCF VALUATION ENGINE v7.0 - QUICK REFERENCE

## 🚀 Quick Start

```bash
cd /Users/averyromain/Scraper/finmodai-next
npm run dev
```

## 📝 Request Format

```json
{
  "ticker": "MSFT",
  "modelType": "dcf",
  "scenario": "BULLISH",     // Optional: "BULLISH" | "BEARISH" | "BASE" (default)
  "wacc": 0.09,              // Optional: User-defined WACC (overrides calculation)
  "terminalGrowth": 0.03     // Optional: User-defined terminal growth
}
```

## 🎯 Scenarios

| Scenario | Growth | Margins | WACC | Use When |
|----------|--------|---------|------|----------|
| **BULLISH** | +2% | +1% | Lower | Optimistic outlook |
| **BASE** | Consensus | Consensus | Calculated | Neutral outlook |
| **BEARISH** | -2% | -1% | Higher | Conservative outlook |

## 📊 Example Requests

### BASE Case
```bash
curl -X POST http://localhost:3000/api/generateModel \
  -H "Content-Type: application/json" \
  -d '{"ticker": "MSFT", "modelType": "dcf"}'
```

### BULLISH
```bash
curl -X POST http://localhost:3000/api/generateModel \
  -H "Content-Type: application/json" \
  -d '{"ticker": "MSFT", "modelType": "dcf", "scenario": "BULLISH"}'
```

### BEARISH
```bash
curl -X POST http://localhost:3000/api/generateModel \
  -H "Content-Type: application/json" \
  -d '{"ticker": "MSFT", "modelType": "dcf", "scenario": "BEARISH"}'
```

### Custom WACC
```bash
curl -X POST http://localhost:3000/api/generateModel \
  -H "Content-Type: application/json" \
  -d '{"ticker": "MSFT", "modelType": "dcf", "wacc": 0.08}'
```

## 📈 Response Format

```json
{
  "modelId": "...",
  "ticker": "MSFT",
  "modelType": "dcf",
  "downloadUrl": "/api/models/.../download",
  "dcfSummary": {
    "scenario": "BULLISH",
    "valuationResults": {
      "enterpriseValue": 2450000,
      "equityValue": 2400000,
      "pricePerShare": 323.15
    },
    "keyAssumptions": {
      "wacc": 0.08,
      "waccSource": "user-defined",
      "terminalGrowth": 0.03,
      "year1RevenueGrowth": 0.145
    }
  }
}
```

## 🔍 What Gets Adjusted

### BULLISH Scenario
- ✅ Revenue Growth: +2.0% per year
- ✅ EBITDA Margin: +1.0%
- ✅ WACC: -0.5% (lower risk)

### BEARISH Scenario
- ✅ Revenue Growth: -2.0% per year
- ✅ EBITDA Margin: -1.0%
- ✅ WACC: +0.5% (higher risk)

## 🎓 Analyst AI Integration

Every DCF output includes marketing for Analyst AI Chatbot:
- Analyze this model
- Upload your own models
- Get technical advisory
- Study for interviews

## 📁 Key Files

- `lib/scenarioEngine.ts` - Scenario logic
- `lib/outputFormatter.ts` - Output formatting
- `types/models.ts` - Request/response types
- `app/api/generateModel/route.ts` - Main API handler

## ✅ Features

- [x] 3 scenarios (BULLISH/BEARISH/BASE)
- [x] User WACC override
- [x] Consensus estimates integration
- [x] Scenario adjustments to growth/margins
- [x] WACC risk adjustments
- [x] Enhanced output with marketing
- [x] Complete validation and error handling

## 🚨 Error Handling

If validation fails, you'll get:
```
❌ DCF ANALYSIS FAILED

Missing Critical Data:
  ❌ revenue
  ❌ wacc

API Attempts:
  ✅ polygon: success
  ❌ finnhub: failed
  ...
```

## 📞 Support

See `DCF_VALUATION_ENGINE_V7_COMPLETE.md` for full documentation.

