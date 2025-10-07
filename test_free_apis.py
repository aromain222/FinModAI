#!/usr/bin/env python3
"""
Test script for all FREE APIs
"""

import os
import requests
import time

def test_alpha_vantage():
    """Test Alpha Vantage API."""
    print("🧪 Testing Alpha Vantage...")
    
    api_key = os.getenv("ALPHAVANTAGE_API_KEY")
    if not api_key:
        print("❌ ALPHAVANTAGE_API_KEY not set!")
        print("📝 Get free key at: https://www.alphavantage.co/support/#api-key")
        return False
    
    try:
        url = "https://www.alphavantage.co/query"
        params = {
            "function": "OVERVIEW",
            "symbol": "MSFT",
            "apikey": api_key
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        if "Symbol" in data:
            print("✅ Alpha Vantage working!")
            print(f"📊 Company: {data.get('Name', 'N/A')}")
            print(f"💰 Market Cap: {data.get('MarketCapitalization', 'N/A')}")
            return True
        else:
            print("❌ Alpha Vantage error:", data.get("Note", "Unknown error"))
            return False
            
    except Exception as e:
        print(f"❌ Alpha Vantage error: {e}")
        return False

def test_fred():
    """Test FRED API."""
    print("\n🧪 Testing FRED...")
    
    api_key = os.getenv("FRED_API_KEY")
    if not api_key:
        print("❌ FRED_API_KEY not set!")
        print("📝 Get free key at: https://fred.stlouisfed.org/docs/api/api_key.html")
        return False
    
    try:
        url = "https://api.stlouisfed.org/fred/series/observations"
        params = {
            "series_id": "DGS10",  # 10-year Treasury rate
            "api_key": api_key,
            "file_type": "json",
            "limit": 1,
            "sort_order": "desc"
        }
        
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        if data.get("observations"):
            latest = data["observations"][0]
            rate = latest.get("value")
            print("✅ FRED working!")
            print(f"📊 10-Year Treasury Rate: {rate}%")
            return True
        else:
            print("❌ FRED error: No data")
            return False
            
    except Exception as e:
        print(f"❌ FRED error: {e}")
        return False

def test_yahoo():
    """Test Yahoo Finance."""
    print("\n🧪 Testing Yahoo Finance...")
    
    try:
        import yfinance as yf
        
        stock = yf.Ticker("MSFT")
        info = stock.info
        
        if info and "symbol" in info:
            print("✅ Yahoo Finance working!")
            print(f"📊 Company: {info.get('longName', 'N/A')}")
            print(f"💰 Current Price: ${info.get('currentPrice', 'N/A')}")
            print(f"📈 Beta: {info.get('beta', 'N/A')}")
            return True
        else:
            print("❌ Yahoo Finance error: No data")
            return False
            
    except ImportError:
        print("❌ yfinance not installed!")
        print("📝 Install with: pip install yfinance")
        return False
    except Exception as e:
        print(f"❌ Yahoo Finance error: {e}")
        return False

def test_demo_data():
    """Test demo data."""
    print("\n🧪 Testing Demo Data...")
    
    try:
        from financial_data.demo_data import get_demo_data
        
        demo = get_demo_data("MSFT")
        if demo:
            print("✅ Demo Data working!")
            print(f"📊 Company: {demo['company_name']}")
            print(f"💰 Revenue 2024: ${demo['historicals']['revenue'][0]:,}")
            print(f"📈 Operating Margin: {demo['historicals']['op_margin'][0]:.1%}")
            return True
        else:
            print("❌ Demo Data error: No data")
            return False
            
    except Exception as e:
        print(f"❌ Demo Data error: {e}")
        return False

def main():
    """Test all APIs."""
    print("🚀 Testing All FREE APIs for LBO Model")
    print("=" * 50)
    
    results = []
    
    # Test each API
    results.append(("Alpha Vantage", test_alpha_vantage()))
    results.append(("FRED", test_fred()))
    results.append(("Yahoo Finance", test_yahoo()))
    results.append(("Demo Data", test_demo_data()))
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 API TEST RESULTS:")
    print("=" * 50)
    
    working_apis = 0
    for api_name, success in results:
        status = "✅ Working" if success else "❌ Failed"
        print(f"{api_name:15} {status}")
        if success:
            working_apis += 1
    
    print(f"\n🎯 Working APIs: {working_apis}/{len(results)}")
    
    if working_apis >= 2:
        print("🎉 You have enough APIs to build an advanced LBO model!")
        print("\n🚀 Next steps:")
        print("1. Set up your environment variables")
        print("2. Run the LBO model")
        print("3. Test with different tickers")
    else:
        print("⚠️ You need at least 2 working APIs for the LBO model.")
        print("\n🔧 Setup required:")
        print("1. Get Alpha Vantage API key")
        print("2. Get FRED API key")
        print("3. Install yfinance: pip install yfinance")

if __name__ == "__main__":
    main()
