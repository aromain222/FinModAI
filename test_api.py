#!/usr/bin/env python3
"""
API Test Suite - Comprehensive testing for IB Modeling API
"""

import asyncio
import httpx
import json
import time
from typing import Dict, Any

class APITester:
    """Comprehensive API testing suite"""
    
    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=30.0)
    
    async def test_health_check(self) -> bool:
        """Test health check endpoint"""
        print("🔍 Testing health check...")
        try:
            response = await self.client.get(f"{self.base_url}/healthz")
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Health check passed: {data}")
                return True
            else:
                print(f"❌ Health check failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Health check error: {e}")
            return False
    
    async def test_assumptions_endpoint(self, ticker: str = "MSFT", model: str = "dcf") -> bool:
        """Test assumptions endpoint"""
        print(f"🔍 Testing assumptions endpoint for {ticker} ({model})...")
        try:
            response = await self.client.get(
                f"{self.base_url}/assumptions",
                params={"ticker": ticker, "model": model}
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Assumptions retrieved successfully")
                print(f"   Company: {data.get('company_name', 'N/A')}")
                print(f"   Historical years: {len(data.get('historicals', {}).get('years', []))}")
                print(f"   Revenue growth Y1: {data.get('assumptions', {}).get('revenue_growth', [0])[0]:.1%}")
                print(f"   WACC: {data.get('wacc', {}).get('wacc', 0):.1%}")
                print(f"   Flags: {data.get('flags', [])}")
                return True
            else:
                print(f"❌ Assumptions failed: {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Assumptions error: {e}")
            return False
    
    async def test_model_generation(self, ticker: str = "MSFT", model: str = "dcf") -> bool:
        """Test model generation endpoint"""
        print(f"🔍 Testing model generation for {ticker} ({model})...")
        try:
            payload = {
                "ticker": ticker,
                "model": model,
                "overrides": {}
            }
            
            response = await self.client.post(
                f"{self.base_url}/models/generate",
                json=payload
            )
            
            if response.status_code == 200:
                data = response.json()
                print(f"✅ Model generated successfully")
                print(f"   Job ID: {data.get('job_id', 'N/A')}")
                print(f"   File: {data.get('file', {}).get('filename', 'N/A')}")
                print(f"   Download URL: {data.get('file', {}).get('download_url', 'N/A')}")
                
                # Test download
                download_url = data.get('file', {}).get('download_url')
                if download_url:
                    return await self.test_download(download_url)
                
                return True
            else:
                print(f"❌ Model generation failed: {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Response: {response.text}")
                return False
        except Exception as e:
            print(f"❌ Model generation error: {e}")
            return False
    
    async def test_download(self, download_url: str) -> bool:
        """Test file download"""
        print(f"🔍 Testing file download: {download_url}")
        try:
            response = await self.client.get(f"{self.base_url}{download_url}")
            
            if response.status_code == 200:
                content_type = response.headers.get('content-type', '')
                content_length = len(response.content)
                print(f"✅ Download successful")
                print(f"   Content-Type: {content_type}")
                print(f"   File size: {content_length:,} bytes")
                
                # Check if it's an Excel file
                if 'spreadsheetml' in content_type or download_url.endswith('.xlsx'):
                    print(f"✅ Excel file confirmed")
                    return True
                else:
                    print(f"⚠️  Unexpected content type")
                    return False
            else:
                print(f"❌ Download failed: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Download error: {e}")
            return False
    
    async def test_invalid_ticker(self) -> bool:
        """Test invalid ticker handling"""
        print("🔍 Testing invalid ticker handling...")
        try:
            response = await self.client.get(
                f"{self.base_url}/assumptions",
                params={"ticker": "INVALID123", "model": "dcf"}
            )
            
            if response.status_code == 400:
                print("✅ Invalid ticker properly rejected")
                return True
            else:
                print(f"❌ Invalid ticker not rejected: {response.status_code}")
                return False
        except Exception as e:
            print(f"❌ Invalid ticker test error: {e}")
            return False
    
    async def test_model_types(self) -> bool:
        """Test all model types"""
        print("🔍 Testing all model types...")
        model_types = ["dcf", "lbo", "comps", "merger"]
        results = []
        
        for model_type in model_types:
            print(f"   Testing {model_type.upper()}...")
            success = await self.test_model_generation("AAPL", model_type)
            results.append(success)
        
        success_count = sum(results)
        print(f"✅ Model types test: {success_count}/{len(model_types)} passed")
        return success_count == len(model_types)
    
    async def test_performance(self) -> bool:
        """Test API performance"""
        print("🔍 Testing API performance...")
        
        # Test multiple concurrent requests
        tasks = []
        for i in range(5):
            task = self.test_assumptions_endpoint("MSFT", "dcf")
            tasks.append(task)
        
        start_time = time.time()
        results = await asyncio.gather(*tasks, return_exceptions=True)
        end_time = time.time()
        
        success_count = sum(1 for r in results if r is True)
        total_time = end_time - start_time
        
        print(f"✅ Performance test: {success_count}/5 requests successful")
        print(f"   Total time: {total_time:.2f}s")
        print(f"   Average time: {total_time/5:.2f}s per request")
        
        return success_count >= 4  # At least 80% success rate
    
    async def run_all_tests(self) -> Dict[str, bool]:
        """Run all tests"""
        print("🚀 Starting IB Modeling API Test Suite")
        print("=" * 50)
        
        tests = {
            "health_check": self.test_health_check(),
            "assumptions_msft": self.test_assumptions_endpoint("MSFT", "dcf"),
            "assumptions_aapl": self.test_assumptions_endpoint("AAPL", "lbo"),
            "model_generation_dcf": self.test_model_generation("MSFT", "dcf"),
            "model_generation_lbo": self.test_model_generation("AAPL", "lbo"),
            "invalid_ticker": self.test_invalid_ticker(),
            "model_types": self.test_model_types(),
            "performance": self.test_performance(),
        }
        
        results = {}
        for test_name, test_coro in tests.items():
            try:
                result = await test_coro
                results[test_name] = result
            except Exception as e:
                print(f"❌ Test {test_name} failed with exception: {e}")
                results[test_name] = False
        
        # Summary
        print("\n" + "=" * 50)
        print("📊 TEST RESULTS SUMMARY")
        print("=" * 50)
        
        passed = sum(results.values())
        total = len(results)
        
        for test_name, result in results.items():
            status = "✅ PASS" if result else "❌ FAIL"
            print(f"{status} {test_name}")
        
        print(f"\n🎯 Overall: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
        
        if passed == total:
            print("🎉 All tests passed! API is ready for production.")
        else:
            print("⚠️  Some tests failed. Please review and fix issues.")
        
        return results
    
    async def close(self):
        """Close the HTTP client"""
        await self.client.aclose()

async def main():
    """Main test runner"""
    import sys
    
    base_url = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
    
    tester = APITester(base_url)
    try:
        results = await tester.run_all_tests()
        
        # Exit with error code if any tests failed
        if not all(results.values()):
            sys.exit(1)
    finally:
        await tester.close()

if __name__ == "__main__":
    asyncio.run(main())
