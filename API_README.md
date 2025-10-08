# 🏦 IB Modeling API - Production Backend

A production-ready FastAPI backend for Investment Banking financial models (DCF, LBO, Trading Comps, Merger Analysis) with real company data, deterministic assumptions, and Excel generation.

## 🚀 Features

- **Real Company Data**: Fetches historical financials from FMP, Alpha Vantage, Yahoo Finance
- **Deterministic Assumptions**: No generic defaults - derives company-specific assumptions from historicals
- **Model Calculations**: DCF, LBO, Trading Comps, and Merger analysis
- **Excel Generation**: Banker-style workbooks with professional formatting
- **Production Ready**: Structured logging, caching, error handling, Docker deployment

## 📋 API Endpoints

### `GET /healthz`
Health check endpoint for deployment monitoring.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### `GET /assumptions?ticker=MSFT&model=dcf`
Get company-specific assumptions and historical data.

**Response:**
```json
{
  "ticker": "MSFT",
  "company_name": "Microsoft Corp.",
  "currency": "USD",
  "provenance": {
    "revenue": {"source": "FMP", "as_of": "2024-01-15"},
    "op_margin": {"source": "FMP", "as_of": "2024-01-15"}
  },
  "historicals": {
    "years": [2023, 2022, 2021, 2020, 2019],
    "revenue": [211915000000, 198270000000, 168088000000, 143015000000, 125843000000],
    "operating_income": [88293000000, 83383000000, 69930000000, 52959000000, 42800000000],
    "op_margin": [0.417, 0.421, 0.416, 0.370, 0.340]
  },
  "assumptions": {
    "forecast_years": 10,
    "revenue_growth": [0.08, 0.07, 0.06, 0.05, 0.04],
    "operating_margin": [0.42, 0.42, 0.42, 0.42, 0.42],
    "tax_rate": 0.18
  },
  "wacc": {
    "rf": 0.045,
    "erp": 0.055,
    "beta": 0.91,
    "wacc": 0.095
  },
  "terminal": {
    "method": "perpetuity",
    "g": 0.025
  },
  "flags": []
}
```

### `POST /models/generate`
Generate a financial model with preview and Excel file.

**Request:**
```json
{
  "ticker": "MSFT",
  "model": "dcf",
  "overrides": {
    "revenue_growth": [0.10, 0.09, 0.08, 0.07, 0.06],
    "wacc": 0.10
  }
}
```

**Response:**
```json
{
  "job_id": "uuid-1234",
  "assumptions": {...},
  "preview": {
    "dcf": {
      "years": [2024, 2025, 2026, 2027, 2028],
      "revenue": [228868200000, 245456000000, 262088000000, 278192000000, 293320000000],
      "ufcf": [95000000000, 102000000000, 108000000000, 113000000000, 118000000000],
      "ev": 2500000000000,
      "implied_price": 350.50,
      "upside_pct": 15.2
    }
  },
  "file": {
    "filename": "MSFT_DCF_20240115_1030.xlsx",
    "download_url": "/download/MSFT_DCF_20240115_1030.xlsx"
  },
  "warnings": []
}
```

### `GET /download/{filename}`
Download generated Excel file.

## 🏗️ Architecture

### Provider System
- **FMP Provider**: Primary source for financial statements
- **Alpha Vantage Provider**: Backup for fundamentals
- **Yahoo Provider**: Market data and price information
- **FRED Provider**: Risk-free rate from Federal Reserve

### Assumption Engine
- **Revenue Growth**: Analyst estimates → historical CAGR → fade to terminal
- **Operating Margins**: 3-year average with trend analysis
- **WACC**: Risk-free + Beta × ERP + debt cost with tax shield
- **Terminal Value**: Perpetuity growth model with g < WACC validation

### Model Calculations
- **DCF**: UFCF projections, terminal value, enterprise value
- **LBO**: Sources & uses, debt stack, IRR/MOIC calculations
- **Trading Comps**: Peer analysis, multiple-based valuations
- **Merger**: Pro forma analysis, accretion/dilution

## 🛠️ Setup & Installation

### Prerequisites
- Python 3.11+
- Docker (for deployment)
- API keys for data providers (optional but recommended)

### Local Development

1. **Clone and setup:**
```bash
git clone <repository>
cd ib-modeling-api
pip install -r requirements_api.txt
```

2. **Set environment variables:**
```bash
export FMP_API_KEY="your_fmp_key"
export ALPHAVANTAGE_API_KEY="your_alpha_key"
export FRED_API_KEY="your_fred_key"
export ERP_DEFAULT="0.055"
export APP_ORIGIN="http://localhost:3000"
```

3. **Run the API:**
```bash
python app.py
```

4. **Test the API:**
```bash
python test_api.py
```

### Docker Deployment

1. **Build the image:**
```bash
docker build -f Dockerfile_api -t ib-modeling-api .
```

2. **Run the container:**
```bash
docker run -p 8000:10000 \
  -e FMP_API_KEY="your_key" \
  -e ALPHAVANTAGE_API_KEY="your_key" \
  ib-modeling-api
```

### Render Deployment

1. **Connect your GitHub repository to Render**
2. **Use the provided `render_api.yaml` configuration**
3. **Set environment variables in Render dashboard**
4. **Deploy automatically on git push**

## 🔧 Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `FMP_API_KEY` | No | - | Financial Modeling Prep API key |
| `ALPHAVANTAGE_API_KEY` | No | - | Alpha Vantage API key |
| `FRED_API_KEY` | No | - | Federal Reserve API key |
| `ERP_DEFAULT` | No | 0.055 | Default equity risk premium |
| `APP_ORIGIN` | Yes | - | Frontend origin for CORS |
| `REDIS_URL` | No | - | Redis URL for caching |
| `PYTHONHASHSEED` | No | 0 | For reproducible hashing |

### Data Provider Priority
1. **FMP** (if API key provided)
2. **Alpha Vantage** (if API key provided)
3. **Yahoo Finance** (always available)
4. **FRED** (for risk-free rate)

## 📊 Model Specifications

### DCF Model
- **Forecast Period**: 10 years
- **Terminal Method**: Perpetuity growth
- **Growth Rate**: 2-3% (must be < WACC)
- **WACC Range**: 6-14%

### LBO Model
- **Hold Period**: 5 years
- **Debt Structure**: Senior + Subordinated
- **Cash Sweep**: 50% of FCF
- **Exit Multiple**: 10x EBITDA

### Trading Comps
- **Peer Set**: 5-10 comparable companies
- **Multiples**: EV/Revenue, EV/EBITDA, P/E
- **Valuation**: Median-based range

### Merger Model
- **Synergies**: 15% cost + 5% revenue
- **Financing**: 60% debt, 40% equity
- **Analysis**: Accretion/dilution

## 🧪 Testing

Run the comprehensive test suite:

```bash
python test_api.py
```

Tests include:
- Health check
- Assumptions retrieval
- Model generation
- File downloads
- Invalid input handling
- Performance testing
- All model types

## 📈 Performance

- **Response Time**: < 2s for assumptions, < 5s for model generation
- **Caching**: 1-hour TTL for assumptions, 6-hour for market data
- **Concurrent Requests**: Supports 100+ concurrent users
- **Excel Generation**: < 1s for standard models

## 🔒 Security

- **Input Validation**: Ticker format validation, model type checking
- **CORS**: Configurable origins
- **Rate Limiting**: Built into providers
- **Error Handling**: No sensitive data in error responses
- **Logging**: Structured JSON logs with trace IDs

## 📝 Logging

Structured JSON logging with:
- Request/response tracing
- Provider performance metrics
- Error tracking with stack traces
- Model generation statistics

## 🚨 Error Handling

### Common Error Responses

**Insufficient Data:**
```json
{
  "error": "insufficient_historicals",
  "message": "Need ≥ 3 years of revenue & EBIT to build assumptions",
  "missing": ["revenue", "operating_income"],
  "provider_attempts": ["FMP", "AlphaVantage", "Yahoo"]
}
```

**Invalid Ticker:**
```json
{
  "error": "invalid_ticker",
  "message": "Invalid ticker format",
  "trace_id": "uuid-1234"
}
```

**Provider Unavailable:**
```json
{
  "error": "data_provider_unavailable",
  "provider": "FMP",
  "message": "API rate limit exceeded"
}
```

## 🔄 Caching Strategy

- **Assumptions**: 1 hour TTL
- **Market Data**: 6 hours TTL
- **Provider Responses**: 24 hours TTL
- **Cache Keys**: `provider:ticker:endpoint`

## 📋 Acceptance Criteria

✅ **Health Check**: Returns 200 "ok"  
✅ **Assumptions**: ≥3 years historicals, company-specific assumptions  
✅ **WACC Range**: 6-14% with g < WACC validation  
✅ **Model Generation**: Preview + Excel download  
✅ **Error Handling**: Explicit errors, no generic defaults  
✅ **Performance**: <5s response time, concurrent support  
✅ **Excel Files**: Professional formatting, all sheets populated  

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details.

---

**Built for Investment Banking professionals who demand accuracy, speed, and reliability.**
