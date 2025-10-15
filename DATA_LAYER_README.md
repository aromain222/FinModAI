# FinModAI Data Layer

A provider-agnostic financial data layer designed to provide clean, reconciled inputs for financial modeling (DCF, LBO, Comps, Merger). The system prioritizes model endpoints while supporting dashboard consumption through the same cached data.

## 🏗️ Architecture

### Core Components

- **Providers**: Individual data source connectors (EDGAR, Yahoo, Finnhub, etc.)
- **Orchestrator**: Registry, fetching, reconciliation, and caching
- **Model Bundles**: Structured data bundles for each model type
- **API Layer**: FastAPI endpoints with model-first design
- **Background Refresh**: Automated cache population and maintenance

### Provider Priority & Fallbacks

**Fundamentals (audited FY)** → EDGAR → FMP → Alpha Vantage → Finnhub  
**Quotes/Market (live)** → Yahoo → Finnhub → Alpha Vantage → FMP  
**Charts (sparklines)** → Yahoo → Finnhub → FMP  
**Metadata** → Finnhub → FMP → Alpha Vantage → Yahoo  
**Risk-free rates** → FRED (with fallback to cached values)

## 🚀 Quick Start

### Installation

```bash
# Install dependencies
pip install -r requirements_data_layer.txt

# Set environment variables (optional - providers work without keys)
export FINNHUB_API_KEY="your_key_here"
export ALPHAVANTAGE_API_KEY=REDACTED
export FMP_API_KEY=REDACTED
export FRED_API_KEY="your_key_here"

# Set data mode
export DATA_MODE="production"  # or "development"
export DATA_STALENESS_MAX_MIN="30"
```

### Running the Service

```bash
# Development mode
python main.py

# Or with uvicorn directly
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### Testing the System

```bash
# Run test suite
python test_data_layer.py
```

## 📊 Model Input Bundles

### DCF Bundle
```json
{
  "ticker": "AAPL",
  "historicals": [{"fiscal_year": 2023, "revenue": 383285000000, ...}],
  "current": {"revenue_ttm": 383285000000, "ebitda_ttm": 123456000000},
  "capital": {"cash": 29500000000, "net_debt": -29500000000},
  "market": {"price": 175.43, "market_cap": 2750000000000},
  "wacc_inputs": {"rf_10y": 0.045, "erp_config": {...}}
}
```

### LBO Bundle
```json
{
  "ticker": "AAPL",
  "starting": {
    "revenue_LTM": 383285000000,
    "ebitda_LTM": 123456000000,
    "net_debt": -29500000000
  },
  "market": {"price": 175.43, "market_cap": 2750000000000},
  "cap_structure_hints": {"typical_leverage_turns": 4.0}
}
```

### Comps Bundle
```json
{
  "peer_rows": [
    {
      "ticker": "AAPL",
      "revenue_latest": 383285000000,
      "ev_to_ebitda": 18.5,
      "ev_to_revenue": 7.2
    }
  ]
}
```

## 🔌 API Endpoints

### Model Inputs (Primary)

```bash
# DCF model inputs
GET /api/v1/model-inputs/dcf?ticker=AAPL

# LBO model inputs  
GET /api/v1/model-inputs/lbo?ticker=AAPL

# Comps model inputs
GET /api/v1/model-inputs/comps?ticker=AAPL&peers=MSFT,GOOGL,AMZN

# Merger model inputs
GET /api/v1/model-inputs/merger?acquirer=MSFT&target=ADBE
```

### Market Data (Secondary)

```bash
# Market snapshot
GET /api/v1/market/snapshot

# Market leaders by sector
GET /api/v1/market/leaders/full?per_sector=3

# Sector performance
GET /api/v1/market/sector-performance?range=1D

# Sector weights
GET /api/v1/market/sector-weights
```

### System Information

```bash
# System status
GET /health

# Data provenance
GET /api/v1/model-inputs/provenance
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATA_MODE` | Operation mode (production/development) | development |
| `DATA_STALENESS_MAX_MIN` | Max age for quotes in minutes | 30 |
| `FINNHUB_API_KEY` | Finnhub API key (optional) | - |
| `ALPHAVANTAGE_API_KEY` | Alpha Vantage API key (optional) | - |
| `FMP_API_KEY` | Financial Modeling Prep API key (optional) | - |
| `FRED_API_KEY` | FRED API key (optional) | - |

### Cache TTL Settings

- **Fundamentals**: 24 hours
- **Quotes**: 15 minutes  
- **Charts**: 15 minutes
- **Metadata**: 7 days
- **Risk-free rates**: 24 hours

## 🔒 Production Mode

When `DATA_MODE=production`:

- ❌ **No mock/placeholder data** in model endpoints
- ❌ **No synthetic rows** in Comps bundles
- ✅ **Strict staleness enforcement** (503 if quotes > 30min old)
- ✅ **Field-level provenance** tracking
- ✅ **Comprehensive error reporting**

### Error Responses

```json
// Missing required fields
{
  "error": "Missing required fields for DCF model",
  "missing_fields": ["historicals (need ≥3 years)", "revenue_ttm"]
}

// Stale data
{
  "error": "data_stale", 
  "message": "Quotes for AAPL are stale (older than 30 minutes)",
  "minutes_old": 45
}

// Data unavailable
{
  "error": "Data unavailable",
  "attempted_providers": ["yahoo", "finnhub"],
  "reasons": {"yahoo": "Rate limited", "finnhub": "API key invalid"}
}
```

## 🏃‍♂️ Background Refresh

The system runs a background refresh loop every 15 minutes to:

1. **Refresh quotes** for all tracked tickers
2. **Clean expired cache** entries
3. **Save cache snapshots** to disk
4. **Update sector metadata** incrementally

## 🧪 Testing

### Unit Tests

```bash
# Run test suite
python test_data_layer.py
```

### Integration Testing

```bash
# Test specific endpoints
curl http://localhost:8000/api/v1/model-inputs/dcf?ticker=AAPL
curl http://localhost:8000/health
```

## 📁 Project Structure

```
├── config.py                 # Configuration management
├── main.py                   # FastAPI application
├── providers/                # Data provider modules
│   ├── base.py              # Base provider interface
│   ├── edgar.py             # SEC EDGAR provider
│   ├── yahoo.py             # Yahoo Finance provider
│   └── finnhub.py           # Finnhub provider
├── orchestrator/             # Data orchestration
│   ├── registry.py          # Provider registry
│   ├── fetch.py             # Data fetching with fallbacks
│   ├── reconcile.py         # Data reconciliation
│   └── cache.py             # TTL cache management
├── models_data/              # Model input bundles
│   └── bundles.py           # Bundle builders
├── api/v1/                   # API endpoints
│   ├── model_inputs.py      # Model input endpoints
│   └── market.py            # Market data endpoints
└── test_data_layer.py       # Test suite
```

## 🔧 Development

### Adding New Providers

1. Create provider class inheriting from `BaseProvider`
2. Implement required methods: `get_fundamentals`, `get_quote`, `get_chart`, `get_metadata`
3. Add to provider registry in `orchestrator/registry.py`
4. Update priority mapping in `orchestrator/reconcile.py`

### Adding New Model Types

1. Create Pydantic model in `models_data/bundles.py`
2. Add bundle builder method in `BundleBuilder` class
3. Create API endpoint in `api/v1/model_inputs.py`
4. Add validation and error handling

## 📈 Performance

- **In-memory TTL cache** with optional disk snapshots
- **Batch processing** for multiple tickers
- **Provider fallbacks** ensure high availability
- **Background refresh** prevents hot-path API calls
- **Rate limiting** and retry logic for provider APIs

## 🚨 Monitoring

### Health Checks

```bash
# System health
GET /health

# Provider status
GET /api/v1/model-inputs/provenance
```

### Cache Statistics

The system provides detailed cache statistics including:
- Total entries by data type and provider
- Expired and stale entry counts
- Cache size estimates
- Provider health status

## 📝 License

This data layer is part of the FinModAI financial modeling platform.
