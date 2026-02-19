# CapitalBase Financial Math Engine - Guardrails

## Non-Negotiable Rules

### 1. No Unauthorized Derivations
**Rule**: Do NOT add any derivations not explicitly allowed by the master prompt.

**Allowed Derivations** (from master prompt):
- Shares Outstanding: `shares_out_basic = market_cap / price`
- Market Cap: `market_cap = price * shares_out_basic`
- Net Debt: `net_debt = total_debt - cash`
- Enterprise Value: `enterprise_value = market_cap + net_debt`
- Pre-tax Income: `pre_tax_income = net_income + tax_expense`
- Effective Tax Rate: `tax_rate_effective = tax_expense / pre_tax_income` (only if pre_tax > 0)
- EBITDA: `ebitda = ebit + da`
- EBIT: `ebit = ebitda - da`
- D&A: `da = da_percent_revenue * revenue` (ONLY if user/historical policy provided)
- Capex: `capex = capex_percent_revenue * revenue` (ONLY if user/historical policy provided)
- Levered FCF: `fcf_levered = cfo - capex`
- Unlevered FCF: `fcf_unlevered = nopat + da - capex - delta_nwc` (with NOPAT = EBIT * (1 - tax_rate))
- NWC: `nwc = nwc_percent_revenue * revenue` (ONLY if user/historical policy provided)
- ΔNWC: `delta_nwc = nwc_t - nwc_{t-1}` (requires time series)
- Interest Expense: `interest_expense = total_debt * debt_rate` (ONLY if user provides debt_rate)
- EV/EBITDA: `ev_to_ebitda = enterprise_value / ebitda` (only if ebitda > 0)
- EV/Revenue: `ev_to_revenue = enterprise_value / revenue` (only if revenue > 0)
- P/E: `pe = market_cap / net_income` (only if net_income > 0)
- Implied Price: `implied_price = (enterprise_value - net_debt) / shares_out_basic` (only if shares > 0)

**Forbidden**:
- ❌ Estimating revenue growth from historical trends
- ❌ Estimating margins from industry averages
- ❌ Estimating beta from sector averages
- ❌ Estimating ERP from historical data
- ❌ Forecasting without user-provided assumptions
- ❌ Using consensus estimates
- ❌ Deriving CFO from net income without full cash flow schedule
- ❌ Any derivation not in the allowed list above

### 2. No Estimates or Consensus
**Rule**: Do NOT introduce estimates, consensus, or forecasting beyond user-provided assumptions.

**Allowed**:
- ✅ Using user-provided assumptions (explicitly labeled as `user_provided`)
- ✅ Using historical ratios if user provides them (labeled as `derived_from_assumption`)
- ✅ Deriving from accounting identities (labeled as `derived`)

**Forbidden**:
- ❌ Using industry averages as defaults
- ❌ Using consensus estimates from analysts
- ❌ Forecasting future values without user input
- ❌ Estimating missing values from similar companies
- ❌ Using AI to estimate financial metrics (only for parsing user-pasted text)

### 3. Explicit Suppression Rules
**Rule**: Be explicit about what is suppressed when inputs are missing.

**Suppression Rules**:

#### Multiples Suppression
- **EV/EBITDA**: Suppressed if `ebitda` missing or <= 0
  - Note: "EV/EBITDA not calculated (EBITDA missing or negative)"
- **EV/Revenue**: Suppressed if `revenue` missing or <= 0
  - Note: "EV/Revenue not calculated (Revenue missing or negative)"
- **P/E**: Suppressed if `net_income` missing or <= 0
  - Note: "P/E not calculated (Net Income missing or negative)"

#### Per-Share Outputs Suppression
- **Implied Price/Share**: Suppressed if `shares_out_basic` missing or <= 0
  - Note: "Per-share outputs not available (Shares outstanding missing)"
- **EPS**: Suppressed if `shares_out_basic` missing or <= 0
  - Note: "EPS not calculated (Shares outstanding missing)"

#### Tax Rate Suppression
- **Effective Tax Rate**: Suppressed if `pre_tax_income` <= 0
  - Note: "Tax rate not calculated (Pre-tax income negative or zero)"

#### Terminal Value Suppression
- **Terminal Value (Exit Multiple)**: Suppressed if `exit_multiple` not provided
  - Note: "Exit multiple method not used (Exit multiple not provided)"
- **Terminal Value (Growth)**: Suppressed if `terminal_growth` not provided
  - Note: "Terminal growth method not used (Terminal growth not provided)"

#### WACC Suppression
- **WACC**: Suppressed if any required component missing (rf_rate, ERP, beta, cost_of_debt, tax_rate)
  - Note: "WACC not calculated (Missing required inputs: [list])"

#### FCF Suppression
- **Unlevered FCF**: Suppressed if any required component missing (ebit, tax_rate, da, capex, delta_nwc)
  - Note: "Unlevered FCF not calculated (Missing required inputs: [list])"
  - If policy-based components used, label as "assumption-driven"

#### Summary Statistics Suppression
- **Median Multiple**: Suppressed if < 3 comps available
  - Note: "Median not calculated (Insufficient data: < 3 companies)"
- **Mean Multiple**: Suppressed if < 2 comps available
  - Note: "Mean not calculated (Insufficient data: < 2 companies)"

### 4. Policy-Based Derivation Labeling
**Rule**: Any derivation using user/historical assumptions must be labeled as `derived_from_assumption`.

**Examples**:
- D&A from `da_percent_revenue`: Status = `derived_from_assumption`, Method = "da = da_percent_revenue * revenue (policy-based)"
- Capex from `capex_percent_revenue`: Status = `derived_from_assumption`, Method = "capex = capex_percent_revenue * revenue (policy-based)"
- NWC from `nwc_percent_revenue`: Status = `derived_from_assumption`, Method = "nwc = nwc_percent_revenue * revenue (policy-based)"
- Interest Expense from `debt_rate`: Status = `derived_from_assumption`, Method = "interest_expense = total_debt * debt_rate (assumption-based)"

**Confidence**: Policy-based derivations have `confidence: 'low'` or `confidence: 'medium'` (never 'high')

### 5. Never Coerce Null to 0
**Rule**: Never coerce null values to 0. Leave them as null.

**Examples**:
- If `revenue` is null, `revenue` remains null (not 0)
- If `ebitda` is null, `ev_to_ebitda` is null (not calculated)
- If `shares_out_basic` is null, `implied_price` is null (not calculated)

### 6. Never Overwrite Reported Values
**Rule**: Derived values never overwrite reported or user-provided values.

**Examples**:
- If `shares_out_basic` is reported, do not derive it from market_cap / price
- If `enterprise_value` is reported, do not derive it from market_cap + net_debt
- If `tax_rate_effective` is user-provided, do not derive it from tax_expense / pre_tax_income

### 7. Missing Denominator Handling
**Rule**: If denominator is missing or <= 0, the ratio/multiple is null (not calculated).

**Examples**:
- P/E: If `net_income` <= 0, `pe` = null
- EV/EBITDA: If `ebitda` <= 0, `ev_to_ebitda` = null
- Tax Rate: If `pre_tax_income` <= 0, `tax_rate_effective` = null

### 8. Date Alignment Checks
**Rule**: When deriving values from multiple sources, check date alignment.

**Examples**:
- Shares from Market Cap / Price: Check that market_cap and price have same `as_of` date (or same trading day)
- Warning if dates don't align: "Market Cap and Price may not be from same date"

### 9. Outlier Warnings
**Rule**: Warn if derived values are outside plausible bounds.

**Examples**:
- Shares Outstanding: Warn if < 1M or > 100B
- Tax Rate: Warn if < 0% or > 40%
- D&A %: Warn if < 0% or > 30%
- Capex %: Warn if < 0% or > 50%
- NWC %: Warn if < -20% or > 40%
- Debt Rate: Warn if < 0% or > 25%

### 10. AI Usage Restrictions
**Rule**: AI may be used ONLY for:
- Parsing user-pasted text into numeric fields (status = `ai_parse`)
- Mapping field names from messy sources into canonical keys

**Forbidden**:
- ❌ Using AI to estimate missing financial metrics
- ❌ Using AI to forecast future values
- ❌ Using AI to derive values from similar companies
- ❌ Using AI consensus estimates

## Implementation Checklist

Before deploying any derivation rule, verify:
- [ ] Rule is in the allowed list above
- [ ] Rule does not use estimates or consensus
- [ ] Rule properly handles null values (never coerces to 0)
- [ ] Rule checks for missing denominators
- [ ] Rule includes date alignment checks if applicable
- [ ] Rule includes outlier warnings if applicable
- [ ] Policy-based rules are labeled as `derived_from_assumption`
- [ ] Suppression rules are explicit and documented
- [ ] Rule never overwrites reported values

## Testing Requirements

Every derivation rule must have:
- [ ] Test case for null inputs (should return null)
- [ ] Test case for missing denominator (should return null)
- [ ] Test case for reported value (should not overwrite)
- [ ] Test case for policy-based derivation (should label correctly)
- [ ] Test case for outlier values (should warn)
