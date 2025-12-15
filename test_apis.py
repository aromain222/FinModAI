#!/usr/bin/env python3
"""
Quick API Test Script
Tests all your configured API keys to see which ones are working.
"""
import os
import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def test_api(name, api_key, test_function):
    """Test a single API and return status"""
    if not api_key or api_key.startswith('your_') or 'example' in api_key.lower():
        return "⚠️  Not configured (placeholder or missing)"
    
    try:
        result = test_function(api_key)
        if result:
            return f"✅ Working - {result}"
        else:
            return "❌ Failed - No data returned"
    except Exception as e:
        return f"❌ Error - {str(e)[:60]}"

def test_alphavantage(api_key):
    """Test Alpha Vantage API"""
    url = "https://www.alphavantage.co/query"
    params = {
        "function": "GLOBAL_QUOTE",
        "symbol": "AAPL",
        "apikey": api_key
    }
    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()
    if "Global Quote" in data:
        price = data["Global Quote"].get("05. price", "N/A")
        return f"Price: ${price}"
    elif "Note" in data:
        return "Rate limited"
    return None

def test_fmp(api_key):
    """Test Financial Modeling Prep API"""
    url = "https://financialmodelingprep.com/api/v3/profile/AAPL"
    params = {"apikey": api_key}
    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()
    if data and len(data) > 0:
        company_name = data[0].get("companyName", "N/A")
        return f"Company: {company_name}"
    return None

def test_finnhub(api_key):
    """Test Finnhub API"""
    url = "https://finnhub.io/api/v1/quote"
    params = {"symbol": "AAPL", "token": api_key}
    response = requests.get(url, params=params, timeout=10)
    response.raise_for_status()
    data = response.json()
    if data and "c" in data:
        price = data.get("c", "N/A")
        return f"Price: ${price}"
    return None

def test_polygon(api_key):
    """Test Polygon.io API"""
    url = "https://api.polygon.io/v2/aggs/ticker/AAPL/prev"
    headers = {"Authorization": f"Bearer {api_key}"}
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    data = response.json()
    if data.get("status") == "OK" and "results" in data:
        close = data["results"][0].get("c", "N/A") if data["results"] else "N/A"
        return f"Close: ${close}"
    return None

def test_tiingo(api_key):
    """Test Tiingo API"""
    url = "https://api.tiingo.com/tiingo/daily/AAPL"
    headers = {"Content-Type": "application/json", "Authorization": f"Token {api_key}"}
    response = requests.get(url, headers=headers, timeout=10)
    response.raise_for_status()
    data = response.json()
    if data and "name" in data:
        return f"Company: {data['name']}"
    return None

def main():
    print("=" * 60)
    print("🔍 Testing Your API Keys")
    print("=" * 60)
    print()
    
    # Test each API
    apis = [
        ("Alpha Vantage", os.getenv("ALPHAVANTAGE_API_KEY"), test_alphavantage),
        ("Financial Modeling Prep", os.getenv("FMP_API_KEY"), test_fmp),
        ("Finnhub", os.getenv("FINNHUB_API_KEY"), test_finnhub),
        ("Polygon.io", os.getenv("POLYGON_API_KEY"), test_polygon),
        ("Tiingo", os.getenv("TIINGO_API_KEY"), test_tiingo),
    ]
    
    results = []
    for name, key, test_func in apis:
        print(f"Testing {name}...")
        status = test_api(name, key, test_func)
        results.append((name, status))
        print(f"  {status}")
        print()
    
    # Summary
    print("=" * 60)
    print("📊 Summary")
    print("=" * 60)
    working = sum(1 for _, status in results if "✅" in status)
    total = len(results)
    print(f"Working: {working}/{total}")
    print()
    for name, status in results:
        print(f"{name:25} {status}")

if __name__ == "__main__":
    main()

