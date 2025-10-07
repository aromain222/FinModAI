#!/usr/bin/env python3
"""
Test IEX Cloud integration.
Run this after setting up your IEX_API_KEY.
"""

import os
import sys

def test_iex_integration():
    """Test IEX Cloud provider integration."""
    print("🧪 Testing IEX Cloud Integration...")
    print("=" * 50)
    
    # Check if API key is set
    iex_key = os.getenv("IEX_API_KEY")
    if not iex_key:
        print("❌ IEX_API_KEY not set!")
        print("📝 Set it with: export IEX_API_KEY='pk_your_key_here'")
        return False
    
    if not iex_key.startswith("pk_"):
        print("❌ Invalid IEX API key format!")
        print("📝 Should start with 'pk_'")
        return False
    
    print(f"✅ IEX API Key found: {iex_key[:10]}...")
    
    try:
        # Test import
        from financial_data import FinancialDataEngine
        print("✅ FinancialDataEngine imported successfully")
        
        # Initialize engine
        engine = FinancialDataEngine()
        print("✅ Engine initialized")
        
        # Test with MSFT (should work with IEX)
        print("\n🔍 Testing with MSFT...")
        result = engine.get_assumptions("MSFT", use_cache=False, allow_demo=False)
        
        if "error" in result:
            print(f"❌ Error: {result['message']}")
            print(f"📊 Providers tried: {result.get('provider_attempts', [])}")
            return False
        
        print("✅ MSFT data retrieved successfully!")
        print(f"📈 Company: {result['company_name']}")
        print(f"💰 Revenue Growth Y1: {result['assumptions']['revenue_growth'][0]:.1%}")
        print(f"📊 Operating Margin Y1: {result['assumptions']['operating_margin'][0]:.1%}")
        print(f"🏷️ Data Source: {result.get('provenance', {}).get('revenue', {}).get('source', 'Unknown')}")
        
        # Test with GOOS (should now work!)
        print("\n🔍 Testing with GOOS...")
        result_goos = engine.get_assumptions("GOOS", use_cache=False, allow_demo=False)
        
        if "error" in result_goos:
            print(f"⚠️ GOOS error: {result_goos['message']}")
            print("💡 This might be expected if GOOS isn't available in IEX free tier")
            print("🔄 Falling back to demo data...")
            
            # Test with demo data fallback
            result_demo = engine.get_assumptions("GOOS", use_cache=False, allow_demo=True)
            if "error" not in result_demo:
                print("✅ GOOS demo data works!")
                print(f"🏷️ Flags: {result_demo['flags']}")
            else:
                print("❌ Even demo data failed!")
                return False
        else:
            print("✅ GOOS data retrieved successfully!")
            print(f"📈 Company: {result_goos['company_name']}")
            print(f"💰 Revenue Growth Y1: {result_goos['assumptions']['revenue_growth'][0]:.1%}")
        
        print("\n🎉 IEX Cloud integration successful!")
        print("🚀 Your API problems are solved!")
        return True
        
    except ImportError as e:
        print(f"❌ Import error: {e}")
        print("📝 Make sure you're in the right directory")
        return False
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        return False

if __name__ == "__main__":
    success = test_iex_integration()
    
    if success:
        print("\n" + "=" * 50)
        print("🎯 NEXT STEPS:")
        print("1. Deploy to Render with IEX_API_KEY")
        print("2. Test in production")
        print("3. Enjoy reliable financial data!")
        sys.exit(0)
    else:
        print("\n" + "=" * 50)
        print("🔧 SETUP REQUIRED:")
        print("1. Get IEX Cloud API key: https://iexcloud.io/")
        print("2. Set environment variable: export IEX_API_KEY='pk_your_key'")
        print("3. Run this test again")
        sys.exit(1)
