#!/usr/bin/env python3
"""
Application Testing Script
Tests the main application endpoints and functionality.
"""
import requests
import json
import sys
from typing import Dict, Any

BASE_URL = "http://localhost:10000"

def test_endpoint(name: str, method: str, url: str, data: Dict[str, Any] = None) -> bool:
    """Test a single endpoint."""
    print(f"\n{'='*60}")
    print(f"Testing: {name}")
    print(f"{'='*60}")
    print(f"URL: {url}")
    if data:
        print(f"Data: {json.dumps(data, indent=2)}")
    
    try:
        if method == "GET":
            response = requests.get(url, timeout=30)
        elif method == "POST":
            response = requests.post(url, json=data, timeout=30, headers={"Content-Type": "application/json"})
        else:
            print(f"❌ Unknown method: {method}")
            return False
        
        print(f"Status Code: {response.status_code}")
        
        if response.status_code == 200:
            result = response.json()
            print(f"✅ Success!")
            print(f"Response keys: {list(result.keys())[:10]}")
            
            # Show sample data
            if isinstance(result, dict):
                for key in list(result.keys())[:5]:
                    value = result[key]
                    if isinstance(value, (str, int, float, bool)):
                        print(f"  {key}: {value}")
                    elif isinstance(value, list) and len(value) > 0:
                        print(f"  {key}: [{len(value)} items]")
                    elif isinstance(value, dict):
                        print(f"  {key}: {{dict with {len(value)} keys}}")
            return True
        else:
            print(f"❌ Failed with status {response.status_code}")
            try:
                error = response.json()
                print(f"Error: {json.dumps(error, indent=2)[:200]}")
            except:
                print(f"Error: {response.text[:200]}")
            return False
            
    except requests.exceptions.ConnectionError:
        print(f"❌ Connection Error - Is the server running?")
        print(f"   Start server with: make dev")
        return False
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

def main():
    print("=" * 60)
    print("🧪 Application Testing Suite")
    print("=" * 60)
    print("\nMake sure your server is running: make dev")
    print("Server should be at: http://localhost:10000")
    
    input("\nPress Enter to continue...")
    
    results = []
    
    # Test 1: Root endpoint
    results.append(("Root", test_endpoint(
        "Root Endpoint",
        "GET",
        f"{BASE_URL}/"
    )))
    
    # Test 2: Company Analysis (if endpoint exists)
    results.append(("Company Analysis", test_endpoint(
        "Company Analysis - AAPL",
        "GET",
        f"{BASE_URL}/api/v1/analyze/AAPL"
    )))
    
    # Test 3: Historical Financials
    results.append(("Historical Financials", test_endpoint(
        "Historical Financials - AAPL",
        "GET",
        f"{BASE_URL}/api/v1/historical-financials?ticker=AAPL"
    )))
    
    # Test 4: DCF Model
    results.append(("DCF Model", test_endpoint(
        "DCF Model - AAPL",
        "POST",
        f"{BASE_URL}/api/v1/generate-full-analysis",
        {"model_type": "dcf", "ticker": "AAPL", "assumptions": {}}
    )))
    
    # Test 5: LBO Model
    results.append(("LBO Model", test_endpoint(
        "LBO Model - AAPL",
        "POST",
        f"{BASE_URL}/api/v1/generate-lbo-model",
        {"ticker": "AAPL", "assumptions": {}}
    )))
    
    # Test 6: Comps Model
    results.append(("Comps Model", test_endpoint(
        "Comps Model - AAPL",
        "POST",
        f"{BASE_URL}/api/v1/generate-comps-model",
        {"ticker": "AAPL"}
    )))
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 Test Summary")
    print("=" * 60)
    passed = sum(1 for _, result in results if result)
    total = len(results)
    print(f"Passed: {passed}/{total}")
    print()
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{name:25} {status}")

if __name__ == "__main__":
    main()

