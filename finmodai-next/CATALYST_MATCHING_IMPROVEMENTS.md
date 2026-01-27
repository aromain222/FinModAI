# Catalyst Matching Improvements

## Summary

Enhanced catalyst matching with after-hours attribution, headline clustering, and improved scoring logic.

## Features

### 1. After-Hours / Pre-Market Attribution (`tradingHours.ts`)

**Rules:**
- **After 4pm ET**: Attribute to next trading day
- **Before 9:30am ET**: Attribute to same trading day
- **During market hours (9:30am-4pm ET)**: Attribute to same trading day
- **Weekends**: Move to next Monday

**Implementation:**
- `getTradingDateForNews(publishedAt)` - Returns trading date for news item
- `marketSessionEt(date)` - Determines market session (in_hours, before_open, after_close, closed)
- Handles timezone conversion to ET automatically

**Example:**
- News published Monday 5pm ET → Attributed to Tuesday
- News published Monday 8am ET → Attributed to Monday
- News published Friday 5pm ET → Attributed to Monday (skip weekend)

### 2. Headline Clustering (`headlineClustering.ts`)

**Features:**
- Groups similar headlines within 48-hour window
- Uses token-based similarity (Jaccard similarity on words)
- Picks representative headline per cluster

**Representative Selection Priority:**
1. Major sources (Reuters, Bloomberg, WSJ, FT, CNBC, etc.)
2. Most recent
3. Longest title (more descriptive)

**Implementation:**
- `clusterHeadlines(headlines, timeWindowHours, similarityThreshold)` - Groups similar headlines
- `pickRepresentativeHeadline(cluster)` - Selects best headline from cluster
- `deduplicateHeadlines(headlines)` - Main entry point for deduplication

### 3. Improved Scoring (`catalystMatcher.ts`)

**Authoritative Event Priority:**
- Earnings: 100 points
- Guidance: 90 points
- Filings: 70 points
- Analyst actions: 50 points
- Macro events: 40 points
- Other: 20 points

**Source Credibility:**
- **Major sources** (+15): Reuters, Bloomberg, WSJ, FT, CNBC, MarketWatch, Yahoo Finance, Barron's, Forbes, Business Insider, Polygon, SEC, Finnhub
- **Low-credibility sources** (-10): Reddit, Twitter/X, blogs, Medium, Seeking Alpha, Motley Fool, Benzinga, news-detected

**Confidence Thresholds:**
- **High**: (1 authoritative event) OR (2+ supporting headlines with score >= 40)
- **Medium**: (1 headline with score >= 40) OR (multiple headlines with score >= 30)
- **Low**: Otherwise

## Benefits

1. **Stable Attribution**: Earnings weeks have consistent attribution (after-hours earnings calls → next day)
2. **Reduced Duplicates**: Clustering eliminates redundant headlines in timeline
3. **Better Confidence**: Requires multiple sources or authoritative events for high confidence
4. **Source Quality**: Penalizes low-credibility sources, rewards major outlets

## Files Created/Modified

### New Files
- `lib/analytics/moveExplainer/tradingHours.ts` - After-hours attribution logic
- `lib/analytics/moveExplainer/headlineClustering.ts` - Headline clustering
- `lib/analytics/moveExplainer/catalystMatcher.test.ts` - Unit tests

### Modified Files
- `lib/analytics/moveExplainer/catalystMatcher.ts` - Enhanced scoring and clustering integration

## Tests

### After-Hours Attribution Tests
- After-hours news (5pm ET) → next trading day
- Pre-market news (8am ET) → same trading day
- Weekend news → next Monday
- Friday after-hours → Monday (skip weekend)

### Headline Clustering Tests
- Clusters similar headlines within 48h
- Does not cluster headlines outside time window
- Prefers major sources when picking representative

Run tests:
```bash
cd finmodai-next && npm run test -- lib/analytics/moveExplainer/catalystMatcher.test.ts
```

## Example

### Before (Old Behavior)
- 5 headlines: "NVDA beats earnings", "NVIDIA earnings beat", "NVDA Q3 results", "NVDA earnings surprise", "NVIDIA quarterly earnings"
- All shown in timeline
- After-hours earnings call (5pm ET) attributed to same day

### After (New Behavior)
- Clustered to 1 representative: "NVDA beats earnings" (from Reuters)
- After-hours earnings call (5pm ET) → attributed to next trading day
- High confidence only if: (1 earnings event) OR (2+ high-score headlines)

## Next Steps

1. **UI Updates**: Timeline should show clustered headlines with "X similar headlines" indicator
2. **Embeddings**: Optional upgrade to use OpenAI embeddings for better similarity (currently token-based)
3. **Sector Context**: Add sector-specific clustering (tech earnings vs healthcare earnings)

