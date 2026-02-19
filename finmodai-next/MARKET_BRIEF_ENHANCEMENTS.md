# Market Brief & Macro IQ Enhancements

This document summarizes the implementation of two major features for CapitalBase's Market Brief:

## ✅ Feature 1: Rising & Falling Sectors (Time-Scoped)

### Implementation

**New Files:**
- `lib/sectorPerformance.ts` - Core logic for fetching sector ETF data and calculating returns
- `app/api/market-brief/sectors/route.ts` - API endpoint for sector performance

**Key Features:**
- Fetches data for 10 major sector ETFs (XLK, XLF, XLE, XLY, XLI, XLV, XLP, XLU, XLB, XLRE)
- Calculates percent returns for selected time periods (1M, 3M, 6M, 1Y)
- Ranks sectors and identifies top 3 rising and top 3 falling
- Generates AI-powered driver summaries focusing on macro forces (rates, inflation, geopolitics, policy, commodities, growth expectations)
- Multi-provider fallback: FMP → Alpha Vantage → Polygon.io

**Data Sources:**
- Primary: Financial Modeling Prep (FMP) API
- Fallback: Alpha Vantage
- Fallback: Polygon.io

**AI Driver Summaries:**
- Generated using OpenAI GPT-4o-mini
- Focuses exclusively on macro forces, not company-specific news
- Concise (max 20 words)
- Examples:
  - "Energy outperformed as oil prices stabilized and geopolitical risk premiums increased."
  - "Technology declined on rising rate expectations and growth concerns."

### UI Integration

- Displays in a two-column grid (Rising | Falling)
- Shows sector name, ticker, return percentage, and AI driver summary
- Updates automatically when time range changes
- Cached for 1 hour to reduce API calls

---

## ✅ Feature 2: AI Intelligence for Macro & Geopolitical Articles

### Implementation

**New Files:**
- `lib/articleIntelligence.ts` - Core logic for article classification and intelligence generation
- Updated `app/api/market-brief/news/route.ts` - Enhanced to use new intelligence system

**Key Features:**

#### 1. Article Classification
Automatically classifies articles into categories:
- `geopolitics` - International relations, diplomatic events, regional tensions
- `policy` - Government policy, legislation, regulatory changes
- `defense` - Military operations, defense spending, security
- `elections` - Electoral processes, voting, political transitions
- `sanctions` - Economic sanctions, trade restrictions
- `trade` - Trade agreements, tariffs, commerce
- `energy` - Oil, gas, energy policy, OPEC
- `china` - China-specific events, US-China relations
- `middle_east` - Middle East regional events
- `russia_ukraine` - Russia-Ukraine conflict, related events
- `other` - Everything else

#### 2. AI Intelligence Structure
For each article, generates:
- **whatHappened**: Factual 1-sentence description
- **whyItMatters**: Macro/geopolitical relevance (not stock market)
- **secondOrderImpacts**: Optional, max 2 bullets
- **affectedChannels**: Array of affected channels:
  - `risk` - Risk perception
  - `rates` - Interest rates
  - `energy` - Energy supply
  - `trade` - Trade corridors
  - `defense` - Defense spending
  - `capital_flows` - Capital flow implications
  - `global_stability` - Global stability
- **confidence**: `low` | `medium` | `high`

#### 3. Rules & Philosophy
- **DO NOT** force stock or index commentary
- Focus on macro forces, not equities
- If market impact is indirect, state it explicitly
- Avoid generic statements
- Be specific about geopolitical implications

### UI Integration

**Enhanced News Display:**
- Category badges with color coding (geopolitics=blue, policy=purple, defense=orange, etc.)
- Affected channels displayed as tags
- Confidence indicator (HIGH/MEDIUM/LOW)
- Expandable intelligence section (click to expand/collapse)
- Shows:
  - What happened
  - Why it matters
  - Second-order impacts (if available)
  - Affected channels

**Visual Design:**
- Color-coded category badges
- Clean, institutional layout
- Expandable sections to reduce clutter
- Clear hierarchy: headline → category → intelligence

---

## 📊 API Endpoints

### `/api/market-brief/sectors?period=1M`
Returns rising and falling sectors for the selected period.

**Response:**
```json
{
  "period": "1M",
  "rising": [
    {
      "sector": "Energy",
      "ticker": "XLE",
      "returnPct": 5.2,
      "direction": "rising",
      "driverSummary": "Energy outperformed as oil prices stabilized...",
      "currentPrice": 85.50,
      "periodStartPrice": 81.25
    }
  ],
  "falling": [...],
  "generatedAt": "2024-01-15T10:30:00Z"
}
```

### `/api/market-brief/news` (Enhanced)
Returns news articles with full AI intelligence.

**Response:**
```json
[
  {
    "title": "Pakistan says 92 militants killed...",
    "source": "Reuters",
    "url": "...",
    "publishedAt": "2024-01-15T08:00:00Z",
    "summary": "...",
    "category": "geopolitics",
    "intelligence": {
      "category": "geopolitics",
      "whatHappened": "Pakistan reported killing 92 militants...",
      "whyItMatters": "Highlights rising internal security risks...",
      "secondOrderImpacts": [
        "May increase regional instability concerns",
        "Could affect foreign investment sentiment"
      ],
      "affectedChannels": ["risk", "global_stability", "trade"],
      "confidence": "medium"
    },
    "secondOrderImpacts": [...],
    "affectedChannels": [...]
  }
]
```

---

## 🔧 Configuration

**Required Environment Variables:**
- `OPENAI_API_KEY` - For AI driver summaries and article intelligence
- `FMP_API_KEY` - For sector ETF price data (recommended)
- `ALPHA_VANTAGE_API_KEY` - Fallback for sector data
- `POLYGON_API_KEY` - Fallback for sector data

**Optional:**
- `OPENAI_MODEL` - Defaults to `gpt-4o-mini`

---

## 🎯 Success Criteria Met

✅ Users understand what moved markets (sector performance with macro drivers)  
✅ Users understand what may move markets later (second-order impacts, affected channels)  
✅ Macro IQ feels institutional, not noisy (clean layout, categorized articles)  
✅ Headlines feel curated, not scraped (AI intelligence explains relevance)  
✅ No forced market angles (explicitly states indirect impact when applicable)  
✅ Focus on macro forces, not company news (sector drivers are macro-focused)

---

## 📝 Notes

- Sector data is cached for 1 hour to reduce API calls
- Article intelligence is cached for 24 hours
- Batch processing limits concurrency to 5 articles at a time to avoid rate limits
- All AI prompts are designed to avoid forcing market commentary
- Category classification uses low temperature (0.3) for consistency
- Intelligence generation uses medium temperature (0.6) for nuanced analysis
