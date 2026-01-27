# Caching and Logging Implementation for Stock Move Explainer

## Summary

Implemented comprehensive caching and logging for production stability, preventing repeated expensive API calls and providing detailed debugging information.

## Caching Layer

### Cache Strategy

**Two-Level Caching:**
1. **Raw Data Cache**: Stores price series, news, and events
   - Key: `stocks:raw:{ticker}:{start}:{end}:{interval}`
   - Contains: priceSeries, news, events, provider names, fetchedAt timestamp
   - TTL: Based on date range (≤30d = 1h, else 24h)

2. **Result Cache**: Stores derived moves and catalysts (in API route)
   - Key: `stocks:catalysts:{ticker}:{start}:{end}:{interval}:{topN}:{benchmark}:{ai}`
   - TTL: Same as raw data

### TTL Calculation

```typescript
function getCacheTTL(start: string, end: string): number {
  const daysDiff = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  // <=30d => 1h, else 24h
  return daysDiff <= 30 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
}
```

### Cache Flow

1. **Raw Data Fetch**:
   - Check cache for raw data (price/news/events)
   - If cache hit → use cached data, log cache hit
   - If cache miss → fetch from providers, cache result, log provider info

2. **Result Processing**:
   - Process raw data → moves + catalysts
   - Cache final result (includes AI explanations if requested)

## Logging

### Logged Metrics

**Provider Logging:**
- Provider name used (price, news, events)
- Response sizes (bytes) for price, news, events
- Fetch time per provider (price, news, events)
- Total fetch time
- Success/failure status
- Cache hit/miss

**Processing Logging:**
- Match time (catalyst matching)
- Total processing time
- Number of moves/catalysts
- Warnings
- Result size (bytes)

### Log Format

All logs include `traceId` for request tracking:

```typescript
logger.info({
  traceId,
  ticker,
  cache: 'hit' | 'miss' | 'stale',
  cacheKey,
  priceProvider,
  newsProvider,
  eventsProvider,
  priceCount,
  newsCount,
  eventsCount,
  priceFetchMs,
  newsFetchMs,
  eventsFetchMs,
  totalFetchMs,
  priceSizeBytes,
  newsSizeBytes,
  eventsSizeBytes,
  matchTimeMs,
  movesCount,
  resultSizeBytes,
}, 'moveExplainer:eventName');
```

### Log Events

- `moveExplainer:rawCacheHit` - Raw data cache hit
- `moveExplainer:rawCacheMiss` - Raw data cache miss
- `moveExplainer:rawDataFetched` - Raw data fetched from providers
- `moveExplainer:insufficientPriceData` - Warning: insufficient price data
- `moveExplainer:priceFetchFailed` - Error: price fetch failed
- `moveExplainer:newsFetchFailed` - Warning: news fetch failed (graceful)
- `moveExplainer:eventsFetchFailed` - Warning: events fetch failed (graceful)
- `moveExplainer:catalystsMatched` - Catalysts matched to moves
- `stocks:catalysts:cacheHit` - Result cache hit (API route)
- `stocks:catalysts:cacheMiss` - Result cache miss (API route)
- `stocks:catalysts:success` - Request completed successfully

## Debug Endpoint

### GET /api/stocks/debug?ticker=...

**Dev-Only**: Only available when `NODE_ENV !== 'production'`

**Returns:**
```json
{
  "ticker": "AAPL",
  "timestamp": "2024-01-15T10:00:00Z",
  "providers": [
    {
      "name": "polygon",
      "available": true,
      "successRate": null,
      "lastSuccess": "2024-01-15T09:45:00Z",
      "lastFailure": null,
      "consecutiveFailures": 0
    },
    ...
  ],
  "providerRegistry": {
    "health": {
      "polygon": {
        "available": true,
        "successRate": null,
        "consecutiveFailures": 0,
        "lastSuccess": "2024-01-15T09:45:00Z",
        "lastFailure": null,
        "lastError": null
      },
      ...
    }
  },
  "cache": {
    "note": "Cache enumeration limited - checking common patterns",
    "patterns": [
      "stocks:raw:AAPL:",
      "stocks:result:AAPL:",
      "stocks:catalysts:AAPL:",
      "stocks:moves:AAPL:"
    ]
  }
}
```

## Files Created/Modified

### New Files
- `lib/analytics/moveExplainer/cache.ts` - Caching utilities
- `app/api/stocks/debug/route.ts` - Debug endpoint
- `CACHING_LOGGING_IMPLEMENTATION.md` - This documentation

### Modified Files
- `lib/api/logger.ts` - Enhanced logger with structured logging
- `lib/analytics/moveExplainer/index.ts` - Integrated caching and logging
- `app/api/stocks/catalysts/route.ts` - Added cache hit/miss logging
- `lib/analytics/moveExplainer/providers/registry.ts` - Added `getHealth()` method and `lastFailure` field

## Benefits

1. **Performance**: Cache prevents repeated expensive API calls
2. **Cost Reduction**: Fewer API calls = lower costs
3. **Debugging**: Detailed logs help diagnose issues
4. **Monitoring**: Provider health tracking for reliability
5. **Production Ready**: No repeated calls on page refresh
6. **Response Size Tracking**: Monitor data transfer for optimization

## Cache Key Format

### Raw Data
```
stocks:raw:{ticker}:{start}:{end}:{interval}
```

### Results
```
stocks:catalysts:{ticker}:{start}:{end}:{interval}:{topN}:{benchmark}:{ai}:{strict}
```

### Examples
- `stocks:raw:AAPL:2024-01-01:2024-01-31:daily`
- `stocks:catalysts:NVDA:2024-11-01:2024-11-30:daily:10:benchmark:QQQ:ai:strict`

## Logging in Production

All logs use structured JSON format:
- `traceId` for request tracking
- Provider names and status
- Response sizes (bytes) for monitoring
- Timing information (fetch time, match time, total time)
- Cache status (hit/miss/stale)
- Warnings and errors

## Testing

To test caching:
1. Make a request to `/api/stocks/catalysts?ticker=AAPL&start=2024-01-01&end=2024-01-31&interval=daily`
2. Check logs for `cache:miss` and `moveExplainer:rawDataFetched`
3. Make the same request again
4. Check logs for `cache:hit` and `moveExplainer:rawCacheHit`

To test debug endpoint:
```
GET /api/stocks/debug?ticker=AAPL
```

## Example Log Output

### Cache Hit
```json
{
  "traceId": "abc123",
  "ticker": "AAPL",
  "cache": "hit",
  "cacheKey": "stocks:raw:AAPL:2024-01-01:2024-01-31:daily",
  "priceCount": 21,
  "newsCount": 15,
  "eventsCount": 3
}
```

### Cache Miss (Fetch)
```json
{
  "traceId": "abc123",
  "ticker": "AAPL",
  "priceProvider": "polygon",
  "newsProvider": "polygon",
  "eventsProvider": "polygon+news-inferred",
  "priceCount": 21,
  "newsCount": 15,
  "eventsCount": 3,
  "priceFetchMs": 234,
  "newsFetchMs": 456,
  "eventsFetchMs": 123,
  "totalFetchMs": 813,
  "priceSizeBytes": 12345,
  "newsSizeBytes": 67890,
  "eventsSizeBytes": 1234
}
```

### Catalyst Matching
```json
{
  "traceId": "abc123",
  "ticker": "AAPL",
  "movesCount": 5,
  "catalystsMatched": 5,
  "matchTimeMs": 45,
  "totalTimeMs": 858
}
```
