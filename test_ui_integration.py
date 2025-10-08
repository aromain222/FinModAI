#!/usr/bin/env python3
"""
Test UI Integration - Verify Company-Specific Data Display
"""

import requests
import json

def test_ui_integration():
    """Test that the UI can properly display company-specific data"""
    
    base_url = "http://localhost:8000"
    
    print("🧪 Testing UI Integration - Company-Specific Data Display")
    print("=" * 60)
    
    # Test companies with different characteristics
    test_cases = [
        {"ticker": "GOOS", "model": "lbo", "description": "Consumer Mid Cap - 3 tranches"},
        {"ticker": "MSFT", "model": "lbo", "description": "Tech Mega Cap - 5 tranches"},
        {"ticker": "AAPL", "model": "dcf", "description": "Tech Mega Cap - DCF Analysis"},
    ]
    
    for test_case in test_cases:
        print(f"\n🔍 Testing {test_case['ticker']} ({test_case['description']})")
        
        try:
            # Test assumptions endpoint
            assumptions_url = f"{base_url}/assumptions"
            params = {"ticker": test_case["ticker"], "model": test_case["model"]}
            
            print(f"  📊 Fetching assumptions...")
            assumptions_response = requests.get(assumptions_url, params=params, timeout=10)
            
            if assumptions_response.status_code == 200:
                assumptions_data = assumptions_response.json()
                print(f"  ✅ Assumptions: {assumptions_data.get('company_name', 'Unknown')}")
                print(f"     Revenue: ${assumptions_data.get('assumptions', {}).get('revenue_growth', [0])[0]:.1f}M")
                print(f"     WACC: {assumptions_data.get('wacc', {}).get('wacc', 0):.1%}")
            else:
                print(f"  ❌ Assumptions failed: {assumptions_response.status_code}")
                continue
            
            # Test model generation
            print(f"  🏗️  Generating {test_case['model']} model...")
            model_url = f"{base_url}/models/generate"
            model_data = {
                "ticker": test_case["ticker"],
                "model": test_case["model"],
                "overrides": {}
            }
            
            model_response = requests.post(model_url, json=model_data, timeout=30)
            
            if model_response.status_code == 200:
                model_result = model_response.json()
                preview = model_result.get('preview', {})
                
                if test_case['model'] == 'lbo' and preview.get('lbo'):
                    lbo_data = preview['lbo']
                    print(f"  ✅ LBO Model Generated")
                    print(f"     IRR: {lbo_data.get('irr', 0):.1%}")
                    print(f"     MOIC: {lbo_data.get('moic', 0):.1f}x")
                    
                    debt_stack = lbo_data.get('debt_stack', [])
                    print(f"     Debt Tranches: {len(debt_stack)}")
                    for i, tranche in enumerate(debt_stack[:3]):  # Show first 3
                        print(f"       {i+1}. {tranche.get('name', 'Unknown')}: ${tranche.get('amount', 0)/1000000:.0f}M @ {tranche.get('rate', 0):.1%}")
                
                elif test_case['model'] == 'dcf' and preview.get('dcf'):
                    dcf_data = preview['dcf']
                    print(f"  ✅ DCF Model Generated")
                    print(f"     EV: ${dcf_data.get('ev', 0)/1000000000:.1f}B")
                    print(f"     Equity: ${dcf_data.get('equity', 0)/1000000000:.1f}B")
                    print(f"     Implied Price: ${dcf_data.get('implied_price', 0):.2f}")
                
                # Check if Excel file was generated
                file_info = model_result.get('file', {})
                if file_info.get('filename'):
                    print(f"  📄 Excel file: {file_info['filename']}")
                
            else:
                print(f"  ❌ Model generation failed: {model_response.status_code}")
                print(f"     Error: {model_response.text}")
        
        except requests.exceptions.RequestException as e:
            print(f"  ❌ Request failed: {e}")
        except Exception as e:
            print(f"  ❌ Unexpected error: {e}")
    
    print(f"\n🎯 UI Integration Test Complete!")
    print(f"🌐 Open http://localhost:8000 to see the enhanced UI")

if __name__ == "__main__":
    test_ui_integration()
