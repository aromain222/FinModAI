#!/usr/bin/env python3
"""
Test Professional IB Modeling App
"""

import requests
import json

def test_api():
    """Test the professional app API endpoints."""
    base_url = "http://localhost:8000"
    
    print("🧪 Testing Professional IB Modeling App API")
    print("=" * 50)
    
    # Test health check
    try:
        response = requests.get(f"{base_url}/healthz")
        print(f"✅ Health Check: {response.status_code}")
        print(f"   Response: {response.json()}")
    except Exception as e:
        print(f"❌ Health Check failed: {e}")
        return
    
    # Test main page
    try:
        response = requests.get(f"{base_url}/")
        print(f"✅ Main Page: {response.status_code}")
        if "FinModAI" in response.text:
            print("   ✅ HTML content loaded")
        else:
            print("   ⚠️  API response instead of HTML")
    except Exception as e:
        print(f"❌ Main Page failed: {e}")
    
    # Test assumptions endpoint
    try:
        response = requests.get(f"{base_url}/assumptions?ticker=MSFT&model=dcf")
        print(f"✅ Assumptions: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Company: {data.get('company_name', 'Unknown')}")
            print(f"   WACC: {data.get('wacc', {}).get('wacc', 0):.1%}")
        else:
            print(f"   Error: {response.text}")
    except Exception as e:
        print(f"❌ Assumptions failed: {e}")
    
    # Test model generation
    try:
        payload = {
            "ticker": "MSFT",
            "model": "dcf",
            "overrides": {}
        }
        response = requests.post(f"{base_url}/models/generate", json=payload)
        print(f"✅ Model Generation: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"   Job ID: {data.get('job_id', 'None')}")
            print(f"   File: {data.get('file', {}).get('filename', 'None')}")
        else:
            print(f"   Error: {response.text}")
    except Exception as e:
        print(f"❌ Model Generation failed: {e}")
    
    print("\n🎯 API Testing Complete!")

if __name__ == "__main__":
    test_api()
