# SEC Pipeline Data Flow — Rewritten Spec

## Objective

Implement a production-ready data pipeline so that for any supported ticker we generate:

1. **Historical actuals** from SEC filings (IS / BS / CF)
2. **Fully linked 5-year forecast** (IS / BS / CF) with Balance Sheet balancing every year
3. **Clean preview + Excel-ready dataset** with no "—" placeholders or stubbed years

## Pipeline Overview

```
Source → Normalize → Store → Forecast Drivers → Three-Statement Engine → Validate → Render
```

## Sequence (Bullet + Diagram)

- **STEP 0 — Inputs**  
  `ticker`, `asOfDate`, `horizonYears`, `scenarioId`, `units`

- **STEP 1 — Resolve Company Identity (CompanyResolver)**  
  - Convert ticker → CIK via SEC-API mapping  
  - Cache mapping (Supabase or memory)  
  - **Output:** `{ ticker, cik, companyName, sector?, exchange? }`

- **STEP 2 — Fetch Filing Index (SecFilingIndex)**  
  - Find most recent 10-K at or before `asOfDate`  
  - Optionally most recent 10-Q for latest period  
  - **Output:** `{ annualFiling: { form, accessionNo, filedAt, periodEnd }, latestQuarter? }`

- **STEP 3 — Convert Filing to Structured Data (XbrlIngest)**  
  - Call XBRL-to-JSON for each selected filing  
  - Extract statement blocks and raw tag/value pairs  
  - **Output:** `RawXbrlPayload { periodEnd, statements: { is, bs, cf }, source }`

- **STEP 4 — Normalize to Canonical Schema (FinancialNormalizer)**  
  - Map raw XBRL tags → CapitalBase canonical line items  
  - Ordered fallbacks for tag variants  
  - Derived fields: `gross_profit`, `ebitda`, retained earnings roll-forward  
  - **Output:** `NormalizedFinancials { periodEnd, currency, units, is, bs, cf, source_map, confidence, sourceMeta }`

- **STEP 5 — Persist Historicals (FinancialStore)**  
  - Upsert normalized actuals keyed by ticker + periodEnd  
  - Store source meta for audit

- **STEP 6 — Build Forecast Drivers (DriverEngine)**  
  - Pull last 3–5 historical periods  
  - Build non-flat arrays: revenue growth, margins, capex %, tax, NWC %  
  - **Output:** `ForecastDrivers` (arrays length == horizonYears)

- **STEP 7 — Generate Linked Three-Statement Forecast (ThreeStatementEngine)**  
  - Base year = most recent annual actual  
  - For each forecast year: project IS → CF → BS roll-forwards  
  - BS must balance every year (within rounding tolerance)

- **STEP 8 — Validate + Return (ModelValidator)**  
  - All years present for IS/BS/CF  
  - No NaNs or blanks  
  - BS balances; cash reconciles with CF  
  - On failure: structured error + debug traces

## Module / API Design

| Module | File | Responsibility |
|--------|------|----------------|
| CompanyResolver | `lib/secApi.ts` | ticker → CIK, company name |
| SecFilingIndex | `lib/secApi.ts` | 10-K/10-Q index for company |
| XbrlIngest | `lib/secApi.ts` | XBRL-to-JSON, raw statement blocks |
| FinancialNormalizer | `lib/xbrlNormalize.ts` | Raw XBRL → canonical IS/BS/CF |
| DriverEngine | `lib/driverEngine.ts` | Actuals → forecast driver arrays |
| ThreeStatementEngine | `lib/threeStatementEngine.ts` | Drivers + base actuals → linked IS/BS/CF |
| ModelValidator | `lib/modelValidator.ts` | Validate no stubs, BS balance, cash reconcile |

## API Endpoints

- **GET** `/api/financials/build?ticker=MSFT`  
  Runs full pipeline; returns `BuildFinancialsResponse` or `BuildFinancialsError`.

- **POST** `/api/models/three-statement`  
  Creates model run using stored actuals + drivers (can call build internally or use cached actuals).

## Validation Checklist (Enforce So Stubbed Models Never Ship)

1. **All years present:** IS, BS, CF each have entries for every forecast year.
2. **No blanks:** No "—", null, or NaN in numeric cells; use derived value + `missing_low_confidence` if needed.
3. **Balance Sheet balances:** `Assets = Liabilities + Equity` every year (tolerance ≤ 0.01).
4. **Cash reconciles:** Ending cash from CF equals BS cash every year.
5. **No shape changes:** Response shape is typed and stable between runs.
6. **Insufficient data:** Return structured error payload (code, message, missing[]) instead of half-empty model.

## Implementation Notes

- All SEC calls behind server routes only; never expose `SEC_API_IO_API_KEY` to client.
- Use `fetch` with timeouts/retries; handle rate limits.
- Missing tags: return `missing_low_confidence` + warning; attempt derived computation where possible.
- Do not add new dependencies unless necessary; prefer built-in fetch + existing libs.

---

## Example Response Payload (MSFT — Shape Only)

```json
{
  "meta": {
    "ticker": "MSFT",
    "cik": "0000789019",
    "asOfDate": "2025-02-09",
    "currency": "USD",
    "units": "millions",
    "horizonYears": 5
  },
  "actuals": [
    {
      "periodEnd": "2024-06-30",
      "currency": "USD",
      "units": "millions",
      "is": {
        "revenue": 211915,
        "cogs": 65963,
        "grossProfit": 145952,
        "opEx": 52343,
        "ebitda": 93609,
        "da": 12701,
        "ebit": 80908,
        "interestExpense": 2687,
        "ebt": 78221,
        "tax": 16389,
        "netIncome": 61832
      },
      "bs": {
        "cash": 80028,
        "ar": 48688,
        "inventory": 2144,
        "currentAssets": 135619,
        "ppe": 143713,
        "totalAssets": 478732,
        "ap": 19682,
        "currentLiabilities": 95082,
        "debt": 47699,
        "totalLiabilities": 226148,
        "equity": 252632,
        "retainedEarnings": 81182,
        "totalLiabAndEquity": 478732
      },
      "cf": {
        "netIncome": 61832,
        "da": 12701,
        "capex": -11567,
        "cfo": 87582,
        "cfi": -14500,
        "cff": -35000,
        "netCashChange": 38082,
        "endingCash": 80028
      },
      "source_map": {},
      "confidence": {},
      "sourceMeta": {
        "form": "10-K",
        "accessionNo": "0000950170-24-001234",
        "filedAt": "2024-07-30",
        "periodEnd": "2024-06-30"
      }
    }
  ],
  "drivers": {
    "horizonYears": 5,
    "revenueGrowth": [0.12, 0.11, 0.10, 0.09, 0.08],
    "grossMarginPct": [0.69, 0.69, 0.69, 0.69, 0.69],
    "opexPctRevenue": [0.25, 0.25, 0.25, 0.25, 0.25],
    "capexPctRevenue": [0.05, 0.05, 0.05, 0.05, 0.05],
    "taxRate": 0.21,
    "nwcPctRevenue": [0.08, 0.08, 0.08, 0.08, 0.08],
    "daPctRevenue": [0.06, 0.06, 0.06, 0.06, 0.06]
  },
  "forecast": {
    "years": [2025, 2026, 2027, 2028, 2029],
    "is": { "2025": {...}, "2026": {...}, "2027": {...}, "2028": {...}, "2029": {...} },
    "bs": { "2025": {...}, "2026": {...}, "2027": {...}, "2028": {...}, "2029": {...} },
    "cf": { "2025": {...}, "2026": {...}, "2027": {...}, "2028": {...}, "2029": {...} }
  },
  "validations": {
    "bsBalances": [{ "year": 2025, "ok": true }, ...],
    "cashReconciles": [{ "year": 2025, "ok": true }, ...],
    "allYearsPresent": true,
    "noBlanks": true,
    "warnings": [],
    "errors": []
  },
  "sources": {
    "filingsUsed": [{ "form": "10-K", "accessionNo": "...", "filedAt": "...", "periodEnd": "..." }]
  }
}
```

---

## Validation Checklist (Enforce So Stubbed Models Never Ship)

| Check | How to Enforce |
|-------|-----------------|
| All years present | `validations.allYearsPresent === true`; IS/BS/CF each have entry for every `forecast.years` |
| No blanks | `validations.noBlanks === true`; no "—", null, or NaN in numeric cells |
| Balance Sheet balances | `validations.bsBalances.every(b => b.ok)`; Assets = Liabilities + Equity every year (tolerance ≤ 0.01) |
| Cash reconciles | `validations.cashReconciles.every(c => c.ok)`; ending cash from CF = BS cash every year |
| Stable shape | Response typed as `BuildFinancialsResponse`; no optional top-level keys removed between runs |
| Insufficient data | Return `BuildFinancialsError` with `code`, `message`, `missing[]`; do not return half-empty model |

**Implementation:** In `modelValidator.ts`, `shouldShipModel(validations)` must be true before returning success. The build route returns 422 with structured error when validations fail.
