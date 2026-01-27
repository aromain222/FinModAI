# Corporate Events Enrichment

## Summary

Enhanced the Stock Move Explainer with dedicated earnings and SEC filings enrichment modules, with clear separation between authoritative data and news-inferred events.

## Components

### 1. Earnings Events Module (`lib/analytics/moveExplainer/events/earnings.ts`)

**Functions:**
- `getEarningsEvents(ticker, start, end, newsFallback?)` - Main entry point
- `fetchEarningsPolygon(ticker, start, end)` - Fetches from Polygon API (authoritative)
- `inferEarningsFromNews(news, ticker)` - Infers from high-confidence news matches

**Features:**
- **Provider Priority**: Polygon API → News inference
- **High-Confidence Detection**: Only matches news with score ≥ 30
- **Keyword Matching**: "earnings", "EPS", "revenue", "guidance", "beat", "miss", "surprise", etc.
- **Confidence Scoring**:
  - Earnings with result (beat/miss): +30 points
  - EPS/Revenue with result: +25 points each
  - Quarterly indicators: +20 points
  - Guidance updates: +20 points
  - Earnings call mentions: +15 points
  - Basic earnings mentions: +10 points
- **Metadata Extraction**: Fiscal quarter, year, EPS actual/estimate, revenue actual/estimate
- **Source Labeling**: `"polygon"` (authoritative) vs `"news-detected"` (inferred)

### 2. SEC Filings Module (`lib/analytics/moveExplainer/events/sec.ts`)

**Functions:**
- `getSecFilings(ticker, start, end, newsFallback?)` - Main entry point
- `fetchSecFilingsEdgar(cik, start, end)` - Fetches from SEC EDGAR API (authoritative)
- `getCikFromTicker(ticker)` - Resolves CIK from ticker symbol
- `inferSecFilingsFromNews(news)` - Infers from news mentions (fallback)

**Features:**
- **SEC EDGAR Integration**: Uses official SEC API endpoints
- **CIK Resolution**: Automatically resolves ticker → CIK via SEC mapping
- **Filing Types**: 10-K, 10-Q, 8-K (and amendments)
- **Direct Links**: Generates SEC EDGAR viewer URLs
- **Source Labeling**: `"SEC"` (authoritative) vs `"news-detected"` (inferred)
- **Rate Limit Handling**: Respects SEC rate limits (10 requests/second)

### 3. Unified Events Provider (`lib/analytics/moveExplainer/providers/eventsProviders.ts`)

**Updated Function:**
- `fetchEventsWithFallback(config, newsFallback?)` - Merges earnings + SEC filings + other events

**Merging Strategy:**
1. **Earnings Events**: From `getEarningsEvents()` (Polygon → news inference)
2. **SEC Filings**: From `getSecFilings()` (EDGAR → news inference)
3. **Other Events**: Analyst actions, macro events, guidance (from news inference only)
4. **Deduplication**: By date + type to avoid duplicates

### 4. Enhanced Catalyst Matching (`lib/analytics/moveExplainer/catalystMatcher.ts`)

**Updated Types:**
- `Catalyst` now includes:
  - `eventEvidence?: CatalystEvidence[]` - Event evidence separately
  - `newsEvidence?: CatalystEvidence[]` - News evidence separately
  - Enhanced `rationale` with source information

**Features:**
- **Separate Scoring**: Events and news scored separately
- **Source Attribution**: Rationale includes authoritative sources vs inferred count
- **Clear Labeling**: Distinguishes "polygon", "SEC", "news-detected" sources

## Source Labeling

### Authoritative Sources
- `"polygon"` - Earnings from Polygon API
- `"SEC"` - Filings from SEC EDGAR API

### Inferred Sources
- `"news-detected"` - Events inferred from news headlines
- Rationale includes count of inferred events

## Usage

```typescript
import { getEarningsEvents } from '@/lib/analytics/moveExplainer/events/earnings';
import { getSecFilings } from '@/lib/analytics/moveExplainer/events/sec';

// Get earnings events
const earnings = await getEarningsEvents('NVDA', '2024-01-01', '2024-12-31', newsItems);
// Returns: EarningsEvent[] with source: 'polygon' | 'news-detected'

// Get SEC filings
const filings = await getSecFilings('NVDA', '2024-01-01', '2024-12-31', newsItems);
// Returns: SecFilingEvent[] with source: 'SEC' | 'news-detected'

// Via provider (unified)
const events = await defaultProvider.getCompanyEvents({
  ticker: 'NVDA',
  start: '2024-01-01T00:00:00Z',
  end: '2024-12-31T23:59:59Z',
  interval: 'daily',
  traceId: 'my-trace-id',
});
// Returns: EventItem[] (earnings + filings + other events, all merged)
```

## Catalyst Evidence Structure

```typescript
type Catalyst = {
  label: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: CatalystEvidence[]; // Top evidence (combined)
  eventEvidence?: CatalystEvidence[]; // Event evidence separately
  newsEvidence?: CatalystEvidence[]; // News evidence separately
  rationale: string; // Includes source information
};

type CatalystEvidence = {
  kind: 'news' | 'event';
  title: string;
  url?: string;
  source?: string; // 'polygon', 'SEC', 'news-detected', etc.
  publishedAt?: string; // For news
  date?: string; // For events
};
```

## Benefits

1. **Clear Attribution**: Distinguishes authoritative data (Polygon, SEC) from inferred (news)
2. **Better Matching**: Events scored separately from news, improving catalyst matching
3. **Graceful Fallback**: Always provides some data even if providers fail
4. **UI Ready**: Event evidence and news evidence separated for UI display

## Files Created/Modified

### New Files
- `lib/analytics/moveExplainer/events/earnings.ts`
- `lib/analytics/moveExplainer/events/sec.ts`

### Modified Files
- `lib/analytics/moveExplainer/providers/eventsProviders.ts`
- `lib/analytics/moveExplainer/catalystMatcher.ts`
- `lib/analytics/moveExplainer/types.ts`

## Next Steps

1. **UI Implementation**: Update MoveDetail component to show event evidence separately
2. **Badge System**: Add badges for "Authoritative" vs "Inferred" sources
3. **Filtering**: Allow users to filter by source type in UI

