#!/usr/bin/env python3
"""
Test Model Type Fix - Verify LBO Selection Shows LBO Data
"""

import requests
import json

def test_model_type_fix():
    """Test that selecting LBO model returns LBO data, not DCF"""
    
    base_url = "http://localhost:8000"
    test_ticker = "MSFT"
    
    print("🧪 Testing Model Type Fix - LBO Selection Should Show LBO Data")
    print("=" * 70)
    
    # Test LBO model specifically
    print(f"\n🔍 Testing LBO Model for {test_ticker}")
    
    try:
        # Test assumptions endpoint
        print(f"  📊 Fetching LBO assumptions...")
        assumptions_response = requests.get(f"{base_url}/assumptions", 
                                          params={"ticker": test_ticker, "model": "lbo"}, 
                                          timeout=10)
        
        if assumptions_response.status_code == 200:
            assumptions_data = assumptions_response.json()
            print(f"  ✅ LBO Assumptions fetched successfully")
            print(f"     Company: {assumptions_data.get('company_name', 'Unknown')}")
            print(f"     Model Type: {assumptions_data.get('model_type', 'Unknown')}")
        else:
            print(f"  ❌ LBO Assumptions failed: {assumptions_response.status_code}")
            return
        
        # Test model generation
        print(f"  🏗️  Generating LBO model...")
        model_response = requests.post(f"{base_url}/models/generate", 
                                     json={
                                         "ticker": test_ticker,
                                         "model": "lbo",
                                         "overrides": {}
                                     }, 
                                     timeout=30)
        
        if model_response.status_code == 200:
            model_result = model_response.json()
            preview = model_result.get('preview', {})
            
            print(f"  ✅ Model generation successful")
            print(f"     Preview keys: {list(preview.keys())}")
            
            # Check if LBO data is present
            if preview.get('lbo'):
                lbo_data = preview['lbo']
                print(f"  🏦 LBO Data Present:")
                print(f"     IRR: {lbo_data.get('irr', 0)*100:.1f}%")
                print(f"     MOIC: {lbo_data.get('moic', 0):.1f}x")
                
                debt_stack = lbo_data.get('debt_stack', [])
                print(f"     Debt Tranches: {len(debt_stack)}")
                for i, tranche in enumerate(debt_stack[:3]):
                    print(f"       {i+1}. {tranche.get('name', 'Unknown')}: ${tranche.get('amount', 0)/1000000:.0f}M @ {tranche.get('rate', 0)*100:.1f}%")
                
                # Check if DCF data is NOT present
                if preview.get('dcf'):
                    print(f"  ⚠️  WARNING: DCF data is present when it shouldn't be!")
                    print(f"     DCF keys: {list(preview['dcf'].keys())}")
                else:
                    print(f"  ✅ DCF data correctly absent")
                
            else:
                print(f"  ❌ No LBO data in preview!")
                print(f"     Available preview keys: {list(preview.keys())}")
        
        else:
            print(f"  ❌ Model generation failed: {model_response.status_code}")
            print(f"     Error: {model_response.text}")
    
    except requests.exceptions.RequestException as e:
        print(f"  ❌ Request failed: {e}")
    except Exception as e:
        print(f"  ❌ Unexpected error: {e}")
    
    print(f"\n🎯 Model Type Fix Test Complete!")
    print(f"🌐 Open http://localhost:8000 and test:")
    print(f"   1. Select LBO model (🏦 green card)")
    print(f"   2. Enter MSFT")
    print(f"   3. Click 'Create Model'")
    print(f"   4. Check browser console for debug logs")
    print(f"   5. Verify you see LBO data, not DCF data")

if __name__ == "__main__":
    test_model_type_fix()
