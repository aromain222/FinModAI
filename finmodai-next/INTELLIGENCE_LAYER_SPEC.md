# CapitalBase Intelligence Layer Specification

## Philosophy

CapitalBase is **not a news app**. It is an **intelligence layer for decision-making**.

### Core Principles

**Avoid:**
- Generic headlines
- Vague AI commentary
- "Monitor for confirmation" style filler

**Deliver:**
- Causality
- Mechanisms
- Directional impact
- Trade-offs and uncertainty

---

## 1. MODEL GENERATION (CRITICAL)

### Non-Negotiable Rules

Model generation is the core product. **It must NEVER break.**

#### Missing Inputs
- Missing inputs must **never crash or invalidate the UI**
- If `sharesOutstanding` or similar inputs are missing:
  - Flag clearly in UI
  - Explain impact on valuation
  - Allow user to proceed with partial outputs
  - Show "—" for unavailable metrics
- Never silently fail
- Never redirect to a degraded screen

#### Model-Specific Behavior
DCF / LBO / Comps / Operating models must:
- Behave differently in analysis
- Produce model-type-specific commentary
- Never reuse generic analysis templates

**Example:**
- **DCF:** Focus on WACC sensitivity, terminal value contribution, implied upside/downside
- **LBO:** Focus on IRR/MOIC, leverage profile, debt paydown schedule
- **Comps:** Focus on peer dispersion, premium/discount rationale, outlier analysis
- **Operating:** Focus on margin trajectory, working capital efficiency, cash conversion

---

## 2. MARKET INTELLIGENCE LOGIC

### Core Question
"What is happening in markets **right now**?"

### Data Focus
- Rates (10Y, 2Y, Fed Funds)
- Indices (S&P 500, Nasdaq, Dow)
- Inflation (CPI, PCE)
- Labor (unemployment, jobless claims)
- Credit conditions (spreads, HY)
- Policy expectations (Fed dots, fiscal)

### AI Responsibilities
1. **Summarize market regime**
   - Risk-on / Risk-off / Rotation / Consolidation / Breakout / Breakdown
   
2. **Identify dominant drivers**
   - What is moving markets? (Fed, earnings, geopolitics, growth data)
   
3. **Explain why price action looks the way it does**
   - Causality, not correlation
   - Mechanisms, not buzzwords
   
4. **Adapt explanation based on selected timeframe**
   - 1W view ≠ 1Y view ≠ 5Y view
   - Short-term: tactical drivers (Fed speak, data prints)
   - Long-term: structural drivers (secular trends, regime shifts)

### Implementation
- **File:** `lib/intelligence/marketRegimeAnalyzer.ts`
- **Function:** `analyzeMarketRegime(snapshot: MarketSnapshot): MarketRegime`
- **Output:**
  - Regime classification
  - Dominant drivers
  - Timeframe-aware explanation
  - Confidence level
  - Sector impact (beneficiaries / losers)

---

## 3. MACRO IQ LOGIC

### Core Question
"What real-world events could move markets **next**?"

### Event Analysis Requirements

Each event must include:

1. **What happened**
   - Clear, factual summary
   - No editorializing

2. **Where**
   - Geographic scope
   - Regional vs global impact

3. **Who is affected**
   - Industries, sectors, asset classes
   - Specific companies (only if justified)

4. **How it transmits into markets**
   - Transmission channels:
     - Inflation
     - Growth
     - Risk premium
     - Commodities
     - FX
     - Credit
     - Policy
   - Direction (positive/negative/neutral)
   - Magnitude (high/medium/low)

5. **Which assets/sectors benefit or suffer**
   - Specific asset classes
   - Reasoning (not just correlation)
   - Magnitude of impact

6. **Confidence level of impact**
   - High / Medium / Low
   - Based on signal clarity and historical precedent

### Predictions

Predictions must be:
- **Probabilistic** (not deterministic)
- **Assumption-explicit** (state what must be true)
- **Never presented as certainty**

**Example:**
```
"If tariffs are implemented as announced (assumption), 
and retaliation is proportional (assumption), 
exporters face 15-25% earnings headwind (probabilistic range)."
```

### Implementation
- **File:** `lib/intelligence/macroEventAnalyzer.ts`
- **Function:** `analyzeMacroEvent(event: MacroEvent): EventAnalysis`
- **Output:**
  - What happened
  - Where
  - Who is affected
  - Transmission mechanisms
  - Affected assets
  - Confidence
  - Assumptions
  - Time horizon

---

## 4. STARTUPS INTELLIGENCE LOGIC

### Core Principle
Startup rankings must be **explainable**.

### Ranking Signals

May include:
- Funding (rounds, valuations, investors)
- Hiring velocity (LinkedIn, job postings)
- Revenue mentions (press, earnings calls)
- Regulatory signals (SEC filings, patents)
- M&A / IPO chatter (S-1 filings, rumors)
- Product adoption (downloads, users, reviews)

### "Why It's Trending" Requirements

Must be:
- **Concrete** (specific evidence)
- **Human-readable** (no jargon)
- **Specific** (not generic)

**Bad:**
```
"Strong momentum in AI space"
```

**Good:**
```
"Mention velocity +45% WoW following $150M Series C led by Sequoia. 
Hiring spike in enterprise sales (12 new AEs in 2 weeks). 
Product adoption: 3 Fortune 500 customers announced in Q4."
```

### Implementation
- Ranking must be deterministic (same inputs → same order)
- Scores must be derived from observable signals
- Label confidence (high/medium/low)
- Show data sources (GDELT, SEC, Finnhub)

---

## 5. DATA SOURCES & CONSTRAINTS

### Allowed Sources
- **SEC EDGAR** (filings, IPOs, insider trades)
- **GDELT** (news mentions, sentiment, themes)
- **Finnhub** (company profiles, metrics, news)
- **Polygon** (market data, indices, aggregates)

### Rules
1. **Never claim Bloomberg, WSJ, or proprietary sources**
   - If data is from GDELT, say "GDELT"
   - If data is from Finnhub, say "Finnhub"
   - If data is inferred, say "Derived"

2. **Attribute sources clearly**
   - Show source chips in UI
   - Include source in API responses

3. **If data is inferred or modeled, say so**
   - Label "Derived" or "Estimated"
   - Explain methodology if non-obvious

---

## 6. FINAL STANDARD

If a feature does not:
- Increase clarity
- Improve decision quality
- Or explain causality

**It does not belong.**

### Target Audience

The output should feel like it was built for:
- Portfolio Managers
- Analysts
- Founders
- Serious investors

**Not tourists.**

---

## Implementation Checklist

### Market Intelligence
- [x] `marketRegimeAnalyzer.ts` created
- [ ] Wire into `/api/market/pulse`
- [ ] Display regime + drivers in UI
- [ ] Add timeframe selector (1D/1W/1M/1Y/5Y)
- [ ] Show sector impact (beneficiaries/losers)

### Macro IQ
- [x] `macroEventAnalyzer.ts` created
- [ ] Wire into `/api/macro/news`
- [ ] Display transmission mechanisms in article cards
- [ ] Show affected assets + reasoning
- [ ] Display confidence + assumptions
- [ ] Add "Why This Matters" callout

### Startups
- [ ] Implement deterministic ranking logic
- [ ] Generate "Why It's Trending" from signals
- [ ] Show evidence bullets (mention velocity, funding, hiring)
- [ ] Label confidence + sources
- [ ] Add signal timeline (sparkline)

### Models
- [x] Null-safe DCF preview
- [x] Multi-source shares outstanding resolver
- [ ] Model-specific report generators (DCF/LBO/Comps)
- [ ] Add "What would need to be true" section
- [ ] Add sensitivity interpretation
- [ ] Link macro themes to company sector

---

## Quality Gates

Before shipping any intelligence feature:

1. **Causality Check**
   - Does it explain *why*, not just *what*?
   - Are mechanisms clear?

2. **Specificity Check**
   - Is it concrete and actionable?
   - Or is it vague and generic?

3. **Confidence Check**
   - Are assumptions stated?
   - Is uncertainty quantified?

4. **Audience Check**
   - Would a PM/analyst find this useful?
   - Or is it tourist-grade content?

If any check fails, **do not ship**.

---

## Examples of Good vs Bad Intelligence

### Market Intelligence

**Bad:**
```
"Markets are up today on positive sentiment."
```

**Good:**
```
"Over the past week, markets are in risk-on mode with tech leading (+3.2% vs Dow +1.1%). 
This suggests investors are pricing in rate relief following softer CPI. 
Watch for: Fed pivot signals, earnings revisions in mega-cap tech, or growth data surprises. 
Beneficiaries: cyclicals, small caps, high beta. 
Risk: crowding in tech, multiple expansion without earnings support."
```

### Macro IQ

**Bad:**
```
"Geopolitical tensions rise in Middle East."
```

**Good:**
```
"What happened: Military escalation in Middle East following [specific event].

Transmission to markets:
- Inflation channel: Oil supply disruption risk → +$5-10/bbl premium → CPI +0.2-0.3% if sustained
- Growth channel: Energy shock acts as tax on consumers → reduced spending
- Risk premium: Flight to safety → USD, treasuries, gold benefit

Affected assets:
- Energy (XLE): Bullish (high magnitude) - direct beneficiary of supply risk premium
- Airlines (DAL, UAL): Bearish (high magnitude) - fuel cost shock, margin compression
- Treasuries: Bullish (medium magnitude) - flight to safety

Confidence: High (clear transmission, historical precedent)

Assumptions:
- Conflict does not escalate to direct NATO involvement
- Energy supply disruption remains regional
- Central banks do not aggressively tighten in response to inflation

Time horizon: Immediate (days to weeks)"
```

### Startups

**Bad:**
```
"Company X is trending due to strong growth."
```

**Good:**
```
"Why it's trending:
• Mention velocity +45% WoW (GDELT)
• $150M Series C led by Sequoia announced 12/20
• Hiring spike: 12 new enterprise AEs in 2 weeks (LinkedIn)
• 3 Fortune 500 customers announced in Q4 (press releases)

IPO probability: 65/100 (Derived)
- S-1 filing detected 11/15 (SEC EDGAR)
- 2 amendments filed (12/1, 12/15)
- Sector timing: SaaS IPO window open (3 recent pricings above range)

Confidence: High
Sources: GDELT, SEC EDGAR, Finnhub"
```

---

## Maintenance

This spec is the **source of truth** for intelligence layer behavior.

When adding new features:
1. Read this spec
2. Ensure compliance
3. Update spec if extending capabilities

When debugging intelligence quality:
1. Check against this spec
2. Identify gap
3. Fix implementation or update spec

**The intelligence layer is what makes CapitalBase valuable. Protect it.**

