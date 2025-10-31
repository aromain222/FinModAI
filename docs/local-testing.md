# Local Testing Guide

## Setup

1. Initialize environment:
```bash
make init
```

2. Configure API keys (optional, for real data):
   - Edit `env/.env.development`
   - Add your API keys:
     - `POLYGON_API_KEY`
     - `ALPHAVANTAGE_API_KEY`
     - `FINNHUB_API_KEY`

## Running Locally

1. Start backend:
```bash
make dev:api
```
- Verify: Open http://localhost:8080/healthz → should see `{"ok": true}`

2. Test endpoints:
```bash
# Test NVIDIA analysis
curl http://localhost:8080/api/v1/analyze/NVDA

# Test Apple analysis
curl http://localhost:8080/api/v1/analyze/AAPL

# Test Tesla analysis
curl http://localhost:8080/api/v1/analyze/TSLA
```

## Testing Features

### Company Analysis
1. Test different industries:
   - NVDA (Semiconductors)
   - AAPL (Consumer Technology)
   - TSLA (Automotive Manufacturing)
   - GS (Investment Banking)

2. Verify for each:
   - Industry-specific metrics shown
   - SWOT analysis matches sector
   - Valuation metrics accurate
   - Growth rates realistic

### Data Quality
1. Check real data:
   - No placeholder/sample data
   - All metrics from actual sources
   - Timestamps current
   - Sources cited

2. Verify error handling:
   - Invalid ticker → proper error
   - Missing data → clear message
   - API failures → graceful fallback

## Share Locally (Optional)

Create a public tunnel:
```bash
make dev:tunnel
```
- Copy the ngrok URL provided
- Share with others for testing

## Cleanup

Remove cache files:
```bash
make clean
```

## Troubleshooting

### Common Issues

1. Backend won't start:
   - Check PORT not in use
   - Verify environment loaded
   - Check Python dependencies

2. Data issues:
   - Verify API keys set
   - Check DATA_MODE setting
   - Verify network connectivity

3. Analysis errors:
   - Check logs for details
   - Verify input data complete
   - Check calculation logic

### Quick Fixes

1. Reset environment:
```bash
make clean
make init
```

2. Restart services:
```bash
# Stop running services (Ctrl+C)
make dev:api  # Restart backend
```

3. Check logs:
```bash
# Backend logs show in terminal
# Use curl with -v for detailed API responses
```
