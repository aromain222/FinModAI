# Benchmark and Sector Context Implementation

## Summary

Implemented benchmark and sector context to distinguish idiosyncratic vs market-driven moves in the Stock Move Explainer.

## Features

### 1. Automatic Benchmark Selection
- **Default**: SPY (broad market)
- **Tech-Heavy Tickers**: Auto-selects QQQ (tech sector)
- **Tech Detection**: Comprehensive list of 80+ tech tickers (AAPL, NVDA, MSFT, GOOGL, META, etc.)

### 2. Move Classification
- **Idiosyncratic**: |excess return| > 1.5% (daily) or > 3% (weekly)
- **Market-Driven**: |excess return| <= thresholds
- **Excess Return**: Stock return - Benchmark return

### 3. Enhanced MoveEvent Type
Each move now includes:
- `benchmarkReturnPct`: Benchmark return for same window
- `excessReturnPct`: Stock return - benchmark return  
- `moveClass`: 'idiosyncratic' | 'market-driven' | 'sector-driven'
- `benchmarkTicker`: 'SPY' | 'QQQ' (which benchmark was used)

## Implementation

### Core Files

1. **`lib/analytics/moveExplainer/benchmark.ts`**
   - `getDefaultBenchmarkTicker(ticker)` - Auto-selects SPY or QQQ
   - `isTechHeavyTicker(ticker)` - Checks if ticker is tech-heavy (80+ tickers)
   - `classifyMove(excessReturnPct, interval)` - Classifies move type
   - `computeBenchmarkReturn(benchmarkBars, moveDate, previousDate)` - Computes benchmark return

2. **`lib/analytics/moveExplainer/index.ts`**
   - `enrichMovesWithBenchmark()` - Enriches moves with benchmark context
   - Updated `explainStockMoves()` - Benchmark enabled by default (`includeBenchmark = true`)

3. **API Routes Updated**
   - `/api/stocks/moves` - Supports `includeBenchmark` (default: true) and `benchmarkTicker` (auto-detect)
   - `/api/stocks/catalysts` - Same benchmark support

### Classification Thresholds

```typescript
// Daily moves
if (|excess| > 1.5%) => 'idiosyncratic'
else => 'market-driven'

// Weekly moves  
if (|excess| > 3.0%) => 'idiosyncratic'
else => 'market-driven'
```

### Tech Ticker Detection

Tech-heavy tickers automatically use QQQ:
- Major tech: AAPL, MSFT, GOOGL, NVDA, META, AMZN, TSLA, etc.
- Software: CRM, ADBE, NOW, TEAM, ZM, SNOW, etc.
- Semiconductors: AMD, QCOM, AVGO, TXN, etc.
- Cloud/SaaS: NET, CRWD, DDOG, ESTC, etc.
- Fintech: SQ, PYPL, COIN, SOFI, etc.

## API Usage

### GET /api/stocks/moves

**Query Params:**
- `includeBenchmark` (default: true) - Enable benchmark comparison
- `benchmarkTicker` (optional) - 'SPY' | 'QQQ' (auto-detected if not provided)

**Response:**
```json
{
  "data": [
    {
      "date": "2024-11-21",
      "returnPct": 8.4,
      "direction": "up",
      "rank": 1,
      "close": 150.50,
      "benchmarkReturnPct": 0.4,
      "excessReturnPct": 8.0,
      "moveClass": "idiosyncratic",
      "benchmarkTicker": "QQQ"
    }
  ]
}
```

### GET /api/stocks/catalysts

Same benchmark support as `/api/stocks/moves`, plus catalysts and optional AI explanations.

## UI Requirements

### MoveTimeline Component
- Show small label: "idiosyncratic" vs "market-driven"
- Badge or indicator for move classification

### MoveDetail Component  
Display line:
```
Stock +X% vs benchmark +Y% => excess +Z% (idiosyncratic)
```

Example:
```
Stock +8.4% vs QQQ +0.4% => excess +8.0% (idiosyncratic)
```

## Tests

### `lib/analytics/moveExplainer/benchmark.test.ts`

Tests cover:
- `classifyMove()` - Correct thresholds for daily/weekly
- `getDefaultBenchmarkTicker()` - QQQ for tech, SPY for others
- `isTechHeavyTicker()` - Tech detection
- `computeBenchmarkReturn()` - Return calculation and edge cases

Run tests:
```bash
cd finmodai-next && npm run test -- lib/analytics/moveExplainer/benchmark.test.ts
```

## Files Created/Modified

### New Files
- `lib/analytics/moveExplainer/benchmark.ts` - Benchmark logic
- `lib/analytics/moveExplainer/benchmark.test.ts` - Tests

### Modified Files
- `lib/analytics/moveExplainer/types.ts` - Enhanced MoveEvent type
- `lib/analytics/moveExplainer/index.ts` - Benchmark enrichment
- `app/api/stocks/moves/route.ts` - Benchmark support
- `app/api/stocks/catalysts/route.ts` - Benchmark support

## Example Output

```json
{
  "move": {
    "date": "2024-11-21",
    "returnPct": 8.4,
    "direction": "up",
    "rank": 1,
    "close": 150.50,
    "previousClose": 138.80,
    "benchmarkReturnPct": 0.4,
    "excessReturnPct": 8.0,
    "moveClass": "idiosyncratic",
    "benchmarkTicker": "QQQ"
  },
  "catalysts": [...],
  "benchmarkComparison": {
    "ticker": "QQQ",
    "returnPct": 0.4,
    "excessReturnPct": 8.0,
    "context": "idiosyncratic"
  }
}
```

## Next Steps

1. **UI Implementation**: Add MoveTimeline and MoveDetail components
2. **Sector ETF Support**: Add XLK, XLF, etc. for more granular sector comparisons  
3. **Performance**: Cache benchmark series data to reduce API calls
