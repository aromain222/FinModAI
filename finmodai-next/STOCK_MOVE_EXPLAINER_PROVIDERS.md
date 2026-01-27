# Stock Move Explainer - Robust Data Providers

## Summary

Implemented a robust provider registry system with automatic fallback chaining, health tracking, rate limit handling, and data normalization for the Stock Move Explainer feature.

## Provider Registry System

### Core Components

1. **Provider Registry** (`lib/analytics/moveExplainer/providers/registry.ts`)
   - Health tracking per provider
   - Automatic fallback on errors
   - Rate limit detection and retry with exponential backoff
   - Data normalization utilities

2. **Price Providers** (`lib/analytics/moveExplainer/providers/priceProviders.ts`)
   - Polygon (if `POLYGON_API_KEY`)
   - Alpha Vantage (if `ALPHA_VANTAGE_API_KEY`)
   - Unified Market Provider (existing fallback chain)
   - Stooq (no key needed)
   - Yahoo Finance (no key needed, last resort)

3. **News Providers** (`lib/analytics/moveExplainer/providers/newsProviders.ts`)
   - Polygon News (if `POLYGON_API_KEY`)
   - NewsAPI (if `NEWSAPI_API_KEY` or `NEWS_API_KEY`)
   - Finnhub (if `FINNHUB_API_KEY`)
   - Webz.io (if `WEBZ_API_KEY`)
   - Unified Pipeline (existing fallback chain)

4. **Events Providers** (`lib/analytics/moveExplainer/providers/eventsProviders.ts`)
   - Polygon Earnings Calendar (if `POLYGON_API_KEY`)
   - News Inference (extracts events from news headlines)

## Features

### Rate Limit Handling
- **Automatic Retry**: 1x retry with exponential backoff
- **Detection**: Identifies 429 status codes
- **Logging**: All rate limit errors logged with traceId

### Health Tracking
- **Consecutive Failures**: Tracks failures per provider
- **Auto-Disable**: Marks providers unavailable after 3 failures
- **Performance Logging**: Records duration and success/failure for each attempt

### Data Normalization
- **Dates**: All dates normalized to `YYYY-MM-DD` (market date)
- **Sorting**: Price series sorted ascending by date
- **Validation**: Filters invalid bars (missing close, non-finite values, non-positive closes)

### Graceful Degradation
- **Price**: Throws error if all providers fail (price chart must always work)
- **News**: Returns empty array on failure (allows price chart to render)
- **Events**: Returns empty array on failure (uses news inference as fallback)

## Provider Priority Chains

### Price Data
1. Polygon (fastest, most reliable)
2. Alpha Vantage
3. Unified Market Provider (Polygon → FMP → Marketstack → Stooq → yfinance)
4. Stooq
5. Yahoo Finance (last resort)

### News Data
1. Polygon News
2. NewsAPI
3. Finnhub
4. Webz.io
5. Unified Pipeline (FMP → Finnhub → Webz)

### Events Data
1. Polygon Earnings Calendar
2. News Inference (extracts from news headlines)

## API Endpoints

### GET /api/stocks/series
Returns price series for a ticker.

**Query Params:**
- `ticker` (required): Stock ticker symbol
- `start` (required): ISO date string
- `end` (required): ISO date string
- `interval`: `daily` | `weekly` (default: `daily`)

**Cache TTL:**
- Historical (>30 days): 24 hours
- Recent (≤30 days): 1 hour

### GET /api/stocks/moves
Returns detected price moves.

**Query Params:**
- `ticker` (required)
- `start` (required)
- `end` (required)
- `interval`: `daily` | `weekly` (default: `daily`)
- `topN`: Number of moves to return (default: 10, max: 20)

### GET /api/stocks/catalysts
Returns moves with catalysts and optional AI explanations.

**Query Params:**
- `ticker` (required)
- `start` (required)
- `end` (required)
- `interval`: `daily` | `weekly` (default: `daily`)
- `topN`: Number of moves (default: 10)
- `includeBenchmark`: `true` | `false` (default: `false`)
- `benchmarkTicker`: `SPY` | `QQQ` (default: `SPY`)
- `includeAI`: `true` | `false` (default: `false`)

## Error Handling

### Price Providers
- **Success**: Returns array of `PriceBar[]`
- **Failure**: Throws error (upstream must handle gracefully)
- **All Providers Fail**: Returns 500 with error message

### News Providers
- **Success**: Returns array of `NewsItem[]`
- **Failure**: Returns empty array `[]` (graceful degradation)
- **Warning**: Logs warnings but continues execution

### Events Providers
- **Success**: Returns array of `EventItem[]`
- **Failure**: Returns empty array `[]` (graceful degradation)
- **Fallback**: Infers events from news if available

## Files Created

### Core Provider Files
- `lib/analytics/moveExplainer/providers/registry.ts` - Provider registry with health tracking
- `lib/analytics/moveExplainer/providers/priceProviders.ts` - Price data providers
- `lib/analytics/moveExplainer/providers/newsProviders.ts` - News data providers
- `lib/analytics/moveExplainer/providers/eventsProviders.ts` - Events data providers
- `lib/analytics/moveExplainer/providers/defaultProvider.ts` - Unified provider using registry
- `lib/analytics/moveExplainer/providers/README.md` - Provider documentation

### API Routes
- `app/api/stocks/series/route.ts` - Price series endpoint
- `app/api/stocks/moves/route.ts` - Move detection endpoint
- `app/api/stocks/catalysts/route.ts` - Catalysts with AI explanation endpoint

## Environment Variables

```bash
# Required for specific providers
POLYGON_API_KEY=your_polygon_key          # Price, News, Events
ALPHA_VANTAGE_API_KEY=your_av_key         # Price (optional)
FINNHUB_API_KEY=your_finnhub_key          # News (optional)
WEBZ_API_KEY=your_webz_key                # News (optional)
NEWSAPI_API_KEY=your_newsapi_key          # News (optional)
OPENAI_API_KEY=your_openai_key            # AI explanations (optional)

# No keys needed for fallback providers:
# - Yahoo Finance (price)
# - Stooq (price)
# - Unified pipeline (uses existing infrastructure)
```

## Usage Example

```typescript
import { defaultProvider } from '@/lib/analytics/moveExplainer/providers/defaultProvider';

// Price series (must work)
const bars = await defaultProvider.getPriceSeries({
  ticker: 'NVDA',
  start: '2024-06-01T00:00:00Z',
  end: '2024-12-31T23:59:59Z',
  interval: 'daily',
  traceId: 'my-trace-id',
});

// News (gracefully degrades)
const news = await defaultProvider.searchNews({
  ticker: 'NVDA',
  start: '2024-06-01T00:00:00Z',
  end: '2024-12-31T23:59:59Z',
  limit: 50,
  traceId: 'my-trace-id',
});
// Returns [] if all providers fail

// Events (uses news as fallback)
const events = await defaultProvider.getCompanyEvents({
  ticker: 'NVDA',
  start: '2024-06-01T00:00:00Z',
  end: '2024-12-31T23:59:59Z',
  traceId: 'my-trace-id',
});
```

## Provider Health Monitoring

```typescript
import { providerRegistry } from '@/lib/analytics/moveExplainer/providers/registry';

// Check health
const health = providerRegistry.getHealth('polygon');
console.log({
  available: health?.available,
  consecutiveFailures: health?.consecutiveFailures,
  lastError: health?.lastError,
  lastSuccess: health?.lastSuccess,
});
```

## Testing

### Manual Testing
1. Test with no API keys (should use Yahoo/Stooq fallbacks)
2. Test with Polygon key (should prioritize Polygon)
3. Test rate limit handling (simulate 429 errors)
4. Test provider failures (disable network temporarily)

### Expected Behavior
- Price chart always works (at least one provider succeeds)
- News gracefully degrades (empty array on failure)
- Events use news inference when dedicated providers fail
- Health tracking prevents repeatedly trying failed providers

## Next Steps

1. Add UI page (`app/(app)/stocks/[ticker]/page.tsx`)
2. Add tests for move detection and catalyst matching
3. Add benchmark comparison visualization
4. Add provider health dashboard (optional)

