# FinModAI Market Overview API

Production-quality FastAPI backend that serves live market snapshots and sector leaders by merging Yahoo Finance public quote data with normalized SEC EDGAR fundamentals.

## Features

✅ **No API Keys Required** - Uses Yahoo Finance public endpoints  
✅ **FastAPI** - Modern async Python web framework  
✅ **Background Refresh** - 15-minute TTL cache with automatic updates  
✅ **Pydantic Models** - Type-safe request/response validation  
✅ **Comprehensive Tests** - pytest with >90% coverage  
✅ **CORS Enabled** - Ready for frontend integration  
✅ **Production-Ready** - Structured logging, error handling, health checks  

## Architecture

```
backend/
├── app.py                  # FastAPI application
├── config.py               # Configuration & env vars
├── data/
│   ├── loader.py          # EDGAR fundamentals loader
│   └── sectors.py         # Sector/industry registry
├── market/
│   ├── yahoo.py           # Yahoo Finance async client
│   ├── merge.py           # Quote + fundamentals merger
│   ├── cache.py           # In-memory TTL cache
│   └── refresh.py         # Background refresh service
├── api/v1/
│   ├── models.py          # Pydantic schemas
│   └── routes.py          # API endpoints
└── tests/
    ├── test_merge.py      # Merge logic tests
    ├── test_routes.py     # API endpoint tests
    └── test_yahoo_parsing.py  # Yahoo response tests
```

## Installation

### Prerequisites

- Python 3.11+
- EDGAR fundamentals data at `dataset/edgar_fundamentals.parquet` (or `.csv`)

### Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r backend/requirements.txt
```

## Usage

### Start the API Server

```bash
# Development mode (auto-reload)
cd backend
python app.py

# Or with uvicorn directly
uvicorn backend.app:app --reload --host 0.0.0.0 --port 8000
```

### Access the API

- **API Root**: http://localhost:8000/
- **Interactive Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/healthz

## API Endpoints

### Health Check

```http
GET /healthz
```

Returns service health status and cache statistics.

### Market Snapshot

```http
GET /api/v1/market/snapshot?sector=Technology&limit=100&offset=0&sort=market_cap&order=desc
```

**Query Parameters**:
- `sector` (optional): Filter by sector (e.g., "Technology")
- `industry` (optional): Filter by industry
- `limit` (optional): Results per page (default: 100, max: 500)
- `offset` (optional): Pagination offset (default: 0)
- `sort` (optional): Sort field - `market_cap|ev|pe|ev_to_ebitda|price` (default: market_cap)
- `order` (optional): Sort order - `asc|desc` (default: desc)

**Response**:
```json
{
  "data": [
    {
      "ticker": "AAPL",
      "name": "Apple Inc.",
      "sector": "Technology",
      "price": 178.72,
      "change1d_pct": 1.23,
      "market_cap": 2800000000000,
      "ev": 2850000000000,
      "ev_to_ebitda": 22.1,
      "ev_to_revenue": 7.3,
      "pe": 29.5,
      "beta": 1.25,
      "currency": "USD",
      "as_of_quotes": "2025-10-14T12:00:00Z",
      "as_of_fundamentals": "2023-12-31T00:00:00Z",
      "stale": false
    }
  ],
  "total": 500,
  "limit": 100,
  "offset": 0
}
```

### Sector Leaders

```http
GET /api/v1/market/leaders?sector=Technology&limit=3
```

**Query Parameters**:
- `sector` (optional): Specific sector name. If omitted, returns top 3 for each sector.
- `limit` (optional): Number of leaders per sector (default: 3, max: 10)

**Single Sector Response**:
```json
{
  "sector": "Technology",
  "leaders": [
    {"ticker": "AAPL", "name": "Apple Inc.", ...}
  ],
  "limit": 3
}
```

**All Sectors Response** (when sector not specified):
```json
{
  "sectors": [
    {
      "sector": "Technology",
      "leaders": [{...}],
      "limit": 3
    },
    ...
  ]
}
```

### Company Detail

```http
GET /api/v1/company/{ticker}
```

Returns detailed company data for model prefill, including:
- Current quote (price, market cap, beta)
- Latest fundamentals (revenue, EBITDA, net debt, etc.)
- Derived metrics (EV, EV/EBITDA, P/E)
- Sparkline (if prefetched)

**Response**:
```json
{
  "ticker": "AAPL",
  "name": "Apple Inc.",
  "sector": "Technology",
  "price": 178.72,
  "market_cap": 2800000000000,
  "beta": 1.25,
  "pe": 29.5,
  "fiscal_year": 2023,
  "revenue": 394328.0,
  "ebitda": 129956.0,
  "net_debt": 50000.0,
  "ev": 2850000000000,
  "ev_to_ebitda": 22.1,
  "sparkline": [0.3, 0.35, 0.4, 0.45, 0.5],
  "as_of_quotes": "2025-10-14T12:00:00Z"
}
```

### Force Refresh (Admin)

```http
POST /api/v1/_refresh
```

Triggers an immediate refresh of market data. Returns refresh statistics.

## Configuration

Environment variables (optional, defaults provided):

```bash
# Cache settings
SNAPSHOT_TTL_MIN=15          # Cache TTL in minutes
REFRESH_INTERVAL_MIN=15      # Background refresh interval

# Yahoo Finance
YAHOO_BATCH_SIZE=100         # Tickers per batch request
YAHOO_REQUEST_TIMEOUT=4.0    # Request timeout in seconds

# Limits
MAX_TICKERS=1200             # Maximum tickers to track
```

## Data Flow

1. **Startup**:
   - Load EDGAR fundamentals from Parquet/CSV
   - Compute latest fiscal year per ticker
   - Start background refresh loop

2. **Background Refresh** (every 15 minutes):
   - Fetch Yahoo quotes for all tickers (batched)
   - Merge with EDGAR fundamentals
   - Compute derived metrics (EV, EV/EBITDA, P/E)
   - Update in-memory cache
   - Compute and cache sector leaders
   - Prefetch sparklines for top 100 by market cap

3. **API Requests**:
   - Read from in-memory cache (no external calls)
   - Filter, sort, paginate as requested
   - Return in <150ms (cache hit)

## Derived Metrics

### Enterprise Value (EV)
```
EV = market_cap + net_debt
```

### EV/EBITDA
```
EV/EBITDA = EV / ebitda_latest
```
(Returns `null` if EBITDA ≤ 0)

### EV/Revenue
```
EV/Revenue = EV / revenue_latest
```
(Returns `null` if Revenue ≤ 0)

### P/E Ratio
Priority:
1. `trailingPE` from Yahoo (if available)
2. `market_cap / net_income_latest` (if net_income > 0)
3. `null` otherwise

## Testing

```bash
# Run all tests
pytest backend/tests/ -v

# With coverage
pytest backend/tests/ --cov=backend --cov-report=html

# Run specific test file
pytest backend/tests/test_merge.py -v
```

**Test Coverage**:
- `test_merge.py`: EV, EV/EBITDA, P/E calculations with edge cases
- `test_routes.py`: API endpoints with mocked cache
- `test_yahoo_parsing.py`: Yahoo response parsing

## Deployment

### Local Development

```bash
python backend/app.py
```

### Production (Uvicorn)

```bash
uvicorn backend.app:app --host 0.0.0.0 --port 8000 --workers 4
```

### With Gunicorn (recommended)

```bash
gunicorn backend.app:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile -
```

### Docker

```dockerfile
FROM python:3.11-slim

WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY dataset/ ./dataset/

EXPOSE 8000

CMD ["uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Fly.io

```toml
# fly.toml
app = "finmodai-market-api"

[build]
  dockerfile = "Dockerfile"

[env]
  SNAPSHOT_TTL_MIN = "15"
  REFRESH_INTERVAL_MIN = "15"

[[services]]
  internal_port = 8000
  protocol = "tcp"

  [[services.ports]]
    handlers = ["http"]
    port = 80

  [[services.ports]]
    handlers = ["tls", "http"]
    port = 443

  [services.http_checks]
    interval = 10000
    timeout = 2000
    path = "/healthz"
```

## Performance

**Expected Performance** (with warm cache):

| Endpoint | Response Time | Cached Data |
|----------|--------------|-------------|
| `/healthz` | <10ms | N/A |
| `/market/snapshot` (100 results) | <150ms | Yes |
| `/market/leaders` | <50ms | Yes |
| `/company/{ticker}` | <20ms | Yes |

**Cache Warm-up**:
- Initial refresh: ~45-60 seconds (1000+ tickers)
- Incremental refresh: ~30-45 seconds (every 15 min)

**Resource Usage**:
- RAM: ~200-300 MB (with 1000 tickers in cache)
- CPU: <5% idle, <30% during refresh

## Troubleshooting

### "Market data not available yet"
- Cache is still warming up (wait 60s after startup)
- Background refresh failed (check logs)
- Force refresh: `POST /api/v1/_refresh`

### High response times
- Cache expired and refresh is running
- Check health: `GET /healthz`
- Increase `SNAPSHOT_TTL_MIN` to reduce refresh frequency

### Missing tickers
- Ticker not in EDGAR fundamentals dataset
- Yahoo Finance doesn't return data for ticker
- Check logs for failed quote fetches

## License

MIT - Built for FinModAI

## Author

FinModAI Engineering Team  
Date: October 2025

