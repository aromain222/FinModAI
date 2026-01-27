# Stock Move Explainer - Provider Registry

## Overview

Robust provider system with automatic fallback chaining, health tracking, rate limit handling, and data normalization.

## Architecture

### Provider Registry (`registry.ts`)
- **Health Tracking**: Monitors provider availability and consecutive failures
- **Automatic Fallback**: Tries providers in priority order
- **Rate Limit Handling**: Exponential backoff retry (1x retry)
- **Data Normalization**: Unifies dates to YYYY-MM-DD, ensures ascending sort

### Price Providers (`priceProviders.ts`)
Priority chain:
1. **Polygon** (if `POLYGON_API_KEY`)
2. **Alpha Vantage** (if `ALPHA_VANTAGE_API_KEY`)
3. **Unified Market Provider** (existing fallback chain)
4. **Stooq** (no key needed)
5. **Yahoo Finance** (no key needed, last resort)

### News Providers (`newsProviders.ts`)
Priority chain:
1. **Polygon News** (if `POLYGON_API_KEY`)
2. **NewsAPI** (if `NEWSAPI_API_KEY` or `NEWS_API_KEY`)
3. **Finnhub** (if `FINNHUB_API_KEY`)
4. **Webz.io** (if `WEBZ_API_KEY`)
5. **Unified Pipeline** (existing fallback chain)

### Events Providers (`eventsProviders.ts`)
Priority chain:
1. **Polygon Earnings Calendar** (if `POLYGON_API_KEY`)
2. **News Inference** (extracts events from news headlines)

## Features

### Rate Limit Handling
- Automatic retry with exponential backoff (1x retry)
- Detects 429 status codes
- Logs rate limit errors for monitoring

### Health Tracking
- Tracks consecutive failures per provider
- Marks providers unavailable after 3 failures
- Logs all attempts with duration and errors

### Data Normalization
- **Dates**: All dates normalized to YYYY-MM-DD (market date)
- **Sorting**: Price series sorted ascending by date
- **Validation**: Filters invalid bars (missing close, non-finite values)

### Graceful Degradation
- **Price**: Must always work (throws if all providers fail)
- **News**: Returns empty array on failure (price chart still works)
- **Events**: Returns empty array on failure (inferences from news as fallback)

## Usage

```typescript
import { defaultProvider } from '@/lib/analytics/moveExplainer/providers/defaultProvider';

// Fetch price series (always works)
const bars = await defaultProvider.getPriceSeries({
  ticker: 'NVDA',
  start: '2024-01-01T00:00:00Z',
  end: '2024-12-31T23:59:59Z',
  interval: 'daily',
  traceId: 'my-trace-id',
});

// Fetch news (gracefully degrades)
const news = await defaultProvider.searchNews({
  ticker: 'NVDA',
  start: '2024-01-01T00:00:00Z',
  end: '2024-12-31T23:59:59Z',
  limit: 50,
  traceId: 'my-trace-id',
});

// Fetch events (uses news as fallback)
const events = await defaultProvider.getCompanyEvents({
  ticker: 'NVDA',
  start: '2024-01-01T00:00:00Z',
  end: '2024-12-31T23:59:59Z',
  traceId: 'my-trace-id',
});
```

## Provider Health

```typescript
import { providerRegistry } from '@/lib/analytics/moveExplainer/providers/registry';

// Check provider health
const health = providerRegistry.getHealth('polygon');
console.log(health); // { name: 'polygon', available: true, consecutiveFailures: 0, ... }
```

## Environment Variables

Required for specific providers:
- `POLYGON_API_KEY` - Polygon price & news & earnings
- `ALPHA_VANTAGE_API_KEY` - Alpha Vantage price
- `FINNHUB_API_KEY` - Finnhub news
- `WEBZ_API_KEY` - Webz.io news
- `NEWSAPI_API_KEY` or `NEWS_API_KEY` - NewsAPI news

No keys needed for:
- Yahoo Finance (price fallback)
- Stooq (price fallback)
- Unified pipeline (uses existing infrastructure)

## Error Handling

All providers:
- Throw `ProviderError` with structured error info
- Log failures with traceId for debugging
- Support graceful degradation (empty arrays for news/events)

Price providers:
- Throw error if all providers fail (price chart must work)
- Return empty array only if no data in range (valid case)

News/Events providers:
- Return empty array on failure (allows price chart to still render)
- Log warnings but don't block execution

