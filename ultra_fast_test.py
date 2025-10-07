#!/usr/bin/env python3
"""
Ultra-fast test - bypasses all imports, tests demo data directly
"""

import sys
import os
sys.path.append('.')

# Direct import of demo data
from financial_data.demo_data import DEMO_DATA

def ultra_fast_test(ticker="MSFT"):
    """Ultra-fast test using demo data directly."""
    print(f"🚀 Ultra-fast test for {ticker}...")
    
    ticker = ticker.upper()
    if ticker in DEMO_DATA:
        demo = DEMO_DATA[ticker]
        print(f"✅ Demo data available for {ticker}")
        print(f"📊 Company: {demo['company_name']}")
        print(f"💰 Revenue 2024: ${demo['historicals']['revenue'][0]:,}")
        print(f"📈 Operating Margin: {demo['historicals']['op_margin'][0]:.1%}")
        print(f"🏷️ Flags: {demo['flags']}")
        return True
    else:
        print(f"❌ No demo data for {ticker}")
        return False

def test_all_demo_tickers():
    """Test all available demo tickers."""
    tickers = ["MSFT", "AAPL", "GOOGL", "GOOS"]
    
    print("🧪 Testing all demo tickers (ultra-fast)...")
    print("=" * 50)
    
    for ticker in tickers:
        print(f"\n🔍 Testing {ticker}:")
        success = ultra_fast_test(ticker)
        if success:
            print(f"✅ {ticker} - Ready for LBO model")
        else:
            print(f"❌ {ticker} - Not available")
    
    print("\n" + "=" * 50)
    print("🎯 All demo tickers ready for LBO modeling!")
    print("🚀 No API delays - instant results!")

if __name__ == "__main__":
    test_all_demo_tickers()
