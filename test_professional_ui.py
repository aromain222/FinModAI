#!/usr/bin/env python3
"""
Test Professional IB Modeling UI - Banker-Grade Frontend
"""

import requests
import json

def test_professional_ui():
    """Test the new professional UI implementation"""
    
    base_url = "http://localhost:8000"
    
    print("🎨 Testing Professional IB Modeling UI - Banker-Grade Frontend")
    print("=" * 70)
    
    # Test 1: Main page loads
    print(f"\n🔍 Test 1: Main Page Load")
    try:
        response = requests.get(f"{base_url}/", timeout=10)
        if response.status_code == 200:
            content = response.text
            if "FinModAI Professional" in content and "Model Hub" in content:
                print(f"  ✅ Main page loads correctly")
                print(f"  📄 Contains: FinModAI Professional, Model Hub")
            else:
                print(f"  ❌ Main page missing expected content")
        else:
            print(f"  ❌ Main page failed: {response.status_code}")
    except Exception as e:
        print(f"  ❌ Main page error: {e}")
    
    # Test 2: Model Hub Features
    print(f"\n🔍 Test 2: Model Hub Features")
    try:
        response = requests.get(f"{base_url}/", timeout=10)
        content = response.text
        
        models = ['DCF', 'LBO', 'Comps', 'Merger']
        for model in models:
            if model in content:
                print(f"  ✅ {model} model card present")
            else:
                print(f"  ❌ {model} model card missing")
        
        # Check for professional styling
        if "navy" in content and "gray-panel" in content:
            print(f"  ✅ Professional styling present")
        else:
            print(f"  ❌ Professional styling missing")
            
    except Exception as e:
        print(f"  ❌ Model Hub test error: {e}")
    
    # Test 3: API Integration - Assumptions
    print(f"\n🔍 Test 3: API Integration - Assumptions")
    test_cases = [
        {"ticker": "MSFT", "model": "dcf"},
        {"ticker": "GOOS", "model": "lbo"},
        {"ticker": "AAPL", "model": "comps"},
        {"ticker": "TSLA", "model": "merger"}
    ]
    
    for test_case in test_cases:
        try:
            response = requests.get(f"{base_url}/assumptions", 
                                  params={"ticker": test_case["ticker"], "model": test_case["model"]}, 
                                  timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                print(f"  ✅ {test_case['model'].upper()} assumptions for {test_case['ticker']}")
                
                # Check required fields
                required_fields = ['ticker', 'company_name', 'assumptions', 'wacc']
                missing_fields = [field for field in required_fields if field not in data]
                
                if not missing_fields:
                    print(f"     📊 All required fields present")
                else:
                    print(f"     ⚠️  Missing fields: {missing_fields}")
                    
            else:
                print(f"  ❌ {test_case['model'].upper()} assumptions failed: {response.status_code}")
                
        except Exception as e:
            print(f"  ❌ {test_case['model'].upper()} assumptions error: {e}")
    
    # Test 4: API Integration - Model Generation
    print(f"\n🔍 Test 4: API Integration - Model Generation")
    for test_case in test_cases:
        try:
            response = requests.post(f"{base_url}/models/generate", 
                                   json={
                                       "ticker": test_case["ticker"],
                                       "model": test_case["model"],
                                       "overrides": {}
                                   }, 
                                   timeout=30)
            
            if response.status_code == 200:
                data = response.json()
                print(f"  ✅ {test_case['model'].upper()} model generation for {test_case['ticker']}")
                
                # Check preview structure
                preview = data.get('preview', {})
                model_preview = preview.get(test_case['model'])
                
                if model_preview:
                    print(f"     📊 Preview data present")
                    
                    # Check model-specific fields
                    if test_case['model'] == 'dcf':
                        dcf_fields = ['ev', 'equity', 'ufcf']
                        present_fields = [field for field in dcf_fields if field in model_preview]
                        print(f"     📈 DCF fields: {present_fields}")
                        
                    elif test_case['model'] == 'lbo':
                        lbo_fields = ['debt_stack', 'irr', 'moic']
                        present_fields = [field for field in lbo_fields if field in model_preview]
                        print(f"     🏦 LBO fields: {present_fields}")
                        
                    elif test_case['model'] == 'comps':
                        comps_fields = ['peers', 'multiples']
                        present_fields = [field for field in comps_fields if field in model_preview]
                        print(f"     📈 Comps fields: {present_fields}")
                        
                    elif test_case['model'] == 'merger':
                        merger_fields = ['synergies', 'eps_accretion']
                        present_fields = [field for field in merger_fields if field in model_preview]
                        print(f"     🤝 Merger fields: {present_fields}")
                
                # Check download file
                file_info = data.get('file', {})
                if file_info.get('filename') and file_info.get('download_url'):
                    print(f"     📄 Download file: {file_info['filename']}")
                else:
                    print(f"     ⚠️  Download file missing")
                    
            else:
                print(f"  ❌ {test_case['model'].upper()} model generation failed: {response.status_code}")
                
        except Exception as e:
            print(f"  ❌ {test_case['model'].upper()} model generation error: {e}")
    
    # Test 5: Error Handling
    print(f"\n🔍 Test 5: Error Handling")
    try:
        # Test invalid ticker
        response = requests.get(f"{base_url}/assumptions", 
                              params={"ticker": "INVALID123", "model": "dcf"}, 
                              timeout=10)
        
        if response.status_code != 200:
            print(f"  ✅ Invalid ticker properly rejected")
        else:
            print(f"  ⚠️  Invalid ticker accepted (might be using demo data)")
            
        # Test invalid model
        response = requests.get(f"{base_url}/assumptions", 
                              params={"ticker": "MSFT", "model": "invalid"}, 
                              timeout=10)
        
        if response.status_code != 200:
            print(f"  ✅ Invalid model properly rejected")
        else:
            print(f"  ⚠️  Invalid model accepted")
            
    except Exception as e:
        print(f"  ❌ Error handling test error: {e}")
    
    print(f"\n🎯 Professional UI Test Complete!")
    print(f"🌐 Open http://localhost:8000 to see the new professional UI")
    print(f"📋 Features to test manually:")
    print(f"   1. Model Hub: Click on DCF, LBO, Comps, Merger cards")
    print(f"   2. Model Builder: Enter ticker (MSFT, GOOS, AAPL)")
    print(f"   3. Assumptions Panel: Check provenance badges")
    print(f"   4. Overrides: Modify assumptions and regenerate")
    print(f"   5. Preview: Verify model-specific data")
    print(f"   6. Download: Test Excel file download")
    print(f"   7. Responsive: Test on mobile/tablet")

if __name__ == "__main__":
    test_professional_ui()
