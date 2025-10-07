#!/usr/bin/env python3
"""
Quick test to verify FMP API key is working.
"""

import os
from financial_data import FinancialDataEngine
import json

print("="*60)
print("FMP API Key Setup Test")
print("="*60)

# Check if key is set
fmp_key = os.getenv("FMP_API_KEY")
if not fmp_key:
    print("\n❌ FMP_API_KEY is NOT set")
    print("\nTo fix:")
    print("  1. Get free key: https://financialmodelingprep.com/developer/docs/")
    print("  2. Run: export FMP_API_KEY='your_key_here'")
    print("  3. Run this test again")
    exit(1)

print(f"\n✓ FMP_API_KEY is set (length: {len(fmp_key)})")

# Initialize engine
print("\nInitializing Financial Data Engine...")
engine = FinancialDataEngine()

print(f"\nProviders available: {len(engine.providers)}")
for provider in engine.providers:
    print(f"  - {provider.name}")

# Test with MSFT
print("\n" + "="*60)
print("Testing MSFT data fetch...")
print("="*60)

result = engine.get_assumptions('MSFT', use_cache=False)

if "error" in result:
    print(f"\n❌ Error: {result['error']}")
    print(f"Message: {result['message']}")
    print(f"Missing: {result.get('missing', [])}")
    print(f"Providers tried: {result.get('provider_attempts', [])}")
else:
    print(f"\n✅ SUCCESS! Got data for {result['company_name']}")
    print(f"\nCompany: {result['company_name']} ({result['ticker']})")
    print(f"Currency: {result['currency']}")
    
    print(f"\nAssumptions:")
    print(f"  Revenue Growth Y1: {result['assumptions']['revenue_growth'][0]:.1%}")
    print(f"  Operating Margin Y1: {result['assumptions']['operating_margin'][0]:.1%}")
    print(f"  WACC: {result['wacc']['wacc']:.2%}")
    print(f"  Terminal Growth: {result['terminal']['g']:.2%}")
    
    print(f"\nData Sources:")
    for metric, prov in result['provenance'].items():
        print(f"  {metric}: {prov['source']} ({prov['as_of']})")
    
    if result['flags']:
        print(f"\nFlags: {', '.join(result['flags'])}")
    else:
        print(f"\nFlags: None")
    
    print("\n" + "="*60)
    print("✨ FMP is working perfectly!")
    print("="*60)

