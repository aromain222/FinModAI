# Testing Guide

## Quick API Tests

### 1. Test All API Keys
```bash
python3 test_apis.py
```
This tests all your configured API keys and shows which ones are working.

### 2. Test Individual APIs

#### Test Alpha Vantage
```bash
python3 -c "
from dotenv import load_dotenv
import os
import requests
load_dotenv()
key = os.getenv('ALPHAVANTAGE_API_KEY')
r = requests.get('https://www.alphavantage.co/query', params={'function':'GLOBAL_QUOTE','symbol':'AAPL','apikey':key})
print(r.json())
"
```

#### Test Tiingo
```bash
python3 -c "
from dotenv import load_dotenv
import os
import requests
load_dotenv()
key = os.getenv('TIINGO_API_KEY')
r = requests.get('https://api.tiingo.com/tiingo/daily/AAPL', headers={'Authorization': f'Token {key}'})
print(r.json())
"
```

## Test the Application

### 1. Start the Server
```bash
make dev
# or
bash run_local.sh
```

### 2. Test Endpoints via Browser

Open your browser and visit:
- **Main App**: http://localhost:10000
- **Health Check**: http://localhost:10000/api/v1/health (if available)
- **Test Ticker**: http://localhost:10000/api/v1/analyze/AAPL

### 3. Test Endpoints via curl

#### Test Company Data
```bash
# Get company data for AAPL
curl http://localhost:10000/api/v1/analyze/AAPL

# Get company data for MSFT
curl http://localhost:10000/api/v1/analyze/MSFT
```

#### Test DCF Model
```bash
curl -X POST http://localhost:10000/api/v1/generate-full-analysis \
  -H "Content-Type: application/json" \
  -d '{"model_type": "dcf", "ticker": "AAPL", "assumptions": {}}'
```

#### Test LBO Model
```bash
curl -X POST http://localhost:10000/api/v1/generate-lbo-model \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL", "assumptions": {}}'
```

#### Test Comps Model
```bash
curl -X POST http://localhost:10000/api/v1/generate-comps-model \
  -H "Content-Type: application/json" \
  -d '{"ticker": "AAPL"}'
```

#### Test Historical Financials
```bash
curl "http://localhost:10000/api/v1/historical-financials?ticker=AAPL"
```

### 4. Test with Python Script

```python
import requests
import json

BASE_URL = "http://localhost:10000"

# Test 1: Company Analysis
print("Testing Company Analysis...")
response = requests.get(f"{BASE_URL}/api/v1/analyze/AAPL")
print(f"Status: {response.status_code}")
print(f"Response: {json.dumps(response.json(), indent=2)[:500]}")

# Test 2: DCF Model
print("\nTesting DCF Model...")
response = requests.post(
    f"{BASE_URL}/api/v1/generate-full-analysis",
    json={"model_type": "dcf", "ticker": "AAPL", "assumptions": {}}
)
print(f"Status: {response.status_code}")
print(f"Response keys: {list(response.json().keys())}")

# Test 3: Historical Financials
print("\nTesting Historical Financials...")
response = requests.get(f"{BASE_URL}/api/v1/historical-financials?ticker=AAPL")
print(f"Status: {response.status_code}")
if response.status_code == 200:
    data = response.json()
    print(f"Years: {data.get('years', [])}")
    print(f"Revenue: {data.get('revenue', [])[:3]}")  # First 3 years
```

## Test Data Providers

### Test Tiingo Provider
```python
from backend.providers.tiingo_provider import get_provider

tiingo = get_provider()
if tiingo:
    quote = tiingo.get_quote("AAPL")
    print(f"AAPL Price: ${quote.price}")
    
    fundamentals = tiingo.get_fundamentals("AAPL", years=3)
    print(f"Revenue (last 3 years): {fundamentals.revenue[:3]}")
```

### Test Data Router
```python
from backend.market.data_router import get_router

router = get_router()
bundle, status = router.get_bundle("AAPL")
print(f"Status: {status}")
print(f"Fields: {list(bundle.get('fields', {}).keys())}")
print(f"Price: {bundle.get('fields', {}).get('price')}")
```

## Test Different Tickers

Test with various companies:
- **AAPL** - Apple (large cap tech)
- **MSFT** - Microsoft (large cap tech)
- **GOOGL** - Google (large cap tech)
- **TSLA** - Tesla (volatile stock)
- **JPM** - JPMorgan (financials)
- **XOM** - Exxon Mobil (energy)

## Common Issues

### API Key Not Working
```bash
# Check if key is loaded
python3 -c "from dotenv import load_dotenv; import os; load_dotenv(); print(os.getenv('TIINGO_API_KEY'))"
```

### Server Not Starting
```bash
# Check for errors
make dev 2>&1 | grep -i error

# Check if port is in use
lsof -i :10000
```

### Data Not Loading
- Check server logs for errors
- Verify API keys are set in `.env`
- Check network connectivity
- Test individual APIs with `test_apis.py`

