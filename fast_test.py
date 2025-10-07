#!/usr/bin/env python3
"""
Fast test script - skips slow providers, uses demo data immediately
"""

import os
from financial_data.demo_data import get_demo_data

def fast_test(ticker="MSFT"):
    """Fast test using demo data only."""
    print(f"🚀 Fast test for {ticker}...")
    
    # Set API key for Alpha Vantage
    os.environ['ALPHAVANTAGE_API_KEY'] = 'PFP7ETK9CEHSFEH'
    
    # Get demo data directly (fastest)
    demo_data = get_demo_data(ticker)
    if demo_data:
        print(f"✅ Demo data available for {ticker}")
        print(f"📊 Company: {demo_data['company_name']}")
        print(f"💰 Revenue 2024: ${demo_data['historicals']['revenue'][0]:,}")
        print(f"📈 Operating Margin: {demo_data['historicals']['op_margin'][0]:.1%}")
        print(f"🏷️ Flags: {demo_data['flags']}")
        return True
    else:
        print(f"❌ No demo data for {ticker}")
        return False

def test_all_demo_tickers():
    """Test all available demo tickers."""
    tickers = ["MSFT", "AAPL", "GOOGL", "GOOS"]
    
    print("🧪 Testing all demo tickers...")
    print("=" * 40)
    
    for ticker in tickers:
        print(f"\n🔍 Testing {ticker}:")
        success = fast_test(ticker)
        if success:
            print(f"✅ {ticker} - Ready for LBO model")
        else:
            print(f"❌ {ticker} - Not available")
    
    print("\n" + "=" * 40)
    print("🎯 Demo tickers ready for LBO modeling!")

if __name__ == "__main__":
    test_all_demo_tickers()
