# Market Data Providers

Generic, pluggable market data provider system with automatic fallback chaining.

## Features

- **Pluggable Interface**: Clean `MarketProvider` interface
- **Fallback Chaining**: Automatic fallback to next provider on failure
- **Health Tracking**: Provider health monitoring and auto-disable after failures
- **Date Normalization**: All dates normalized to YYYY-MM-DD (market date)
- **Sorted Series**: Price series sorted ascending by date
- **Graceful Degradation**: Price always works, news/events return empty arrays on failure

## Interface

```typescript
interface MarketProvider {
  getPriceSeries(params: PriceSeriesParams): Promise<PriceBar[]>;
  searchNews(params: NewsSearchParams): Promise<NewsItem[]>;
  getCompanyEvents(params: CompanyEventsParams): Promise<EventItem[]>;
}
```

## Usage

```typescript
import { defaultMarketProvider } from '@/lib/market_data/providers';

// Fetch price series (always works, throws if all providers fail)
const bars = await defaultMarketProvider.getPriceSeries({
  ticker: 'AAPL',
  start: '2024-01-01',
  end: '2024-12-31',
  interval: 'daily',
});

// Fetch news (returns empty array if all providers fail)
const news = await defaultMarketProvider.searchNews({
  ticker: 'AAPL',
  start: '2024-01-01',
  end: '2024-12-31',
  limit: 50,
});

// Fetch events (returns empty array, optional feature)
const events = await defaultMarketProvider.getCompanyEvents({
  ticker: 'AAPL',
  start: '2024-01-01',
  end: '2024-12-31',
});
```

## Providers

### Price Providers
- **Yahoo Finance** (no key required) - Primary fallback

### News Providers
- **NewsAPI** (requires `NEWSAPI_API_KEY`) - Optional, returns empty array if unavailable

### Event Providers
- **Empty** - Returns empty array (events are optional)

## Provider Registry

```typescript
import { providerRegistry } from '@/lib/market_data/providers';

// Check provider health
const health = providerRegistry.getHealth();
console.log(health); // { yahoo: { available: true, ... }, newsapi: { ... } }

// Check specific provider
const yahooHealth = providerRegistry.getProviderHealth('yahoo');
```

## Date Normalization

All dates are normalized to `YYYY-MM-DD` format (market date):
- Price series: `date` field
- Event items: `date` field
- News items: `publishedAt` remains ISO timestamp, but can be normalized if needed

## Sorting

- **Price Series**: Sorted ascending by date
- **News Items**: Sorted descending by publishedAt (newest first)
- **Event Items**: Sorted descending by date (newest first)

## Error Handling

### Price Series
- **Throws error** if all providers fail (price is critical)
- Use try/catch to handle failures

### News/Events
- **Returns empty array** if all providers fail (graceful degradation)
- Price chart can still render without news
- Logs warnings for debugging

## Adding New Providers

1. Create provider file in appropriate directory:
   - `/lib/market_data/providers/price/[name].ts`
   - `/lib/market_data/providers/news/[name].ts`
   - `/lib/market_data/providers/events/[name].ts`

2. Implement the function matching the interface:
   ```typescript
   export async function fetchPrice[Name](params: PriceSeriesParams): Promise<PriceBar[]> {
     // Implementation
   }
   ```

3. Add to fallback chain in `/lib/market_data/providers/index.ts`:
   ```typescript
   const providers = [
     { name: 'provider1', fn: () => fetchPriceProvider1(params) },
     { name: 'provider2', fn: () => fetchPriceProvider2(params) },
     // ...
   ];
   ```

## Environment Variables

- `NEWSAPI_API_KEY` - For NewsAPI news provider (optional)
- `PYTHON_BIN` - Python executable path (default: `python3`) for yfinance

## API Routes

The provider system is used by:
- `/api/stocks/series` - Price series (always works)
- `/api/stocks/moves` - Move detection (uses price series)
- `/api/stocks/catalysts` - Catalysts and explanations (price required, news optional)

All routes ensure price data is always returned even if news fails.

