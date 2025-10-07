#!/usr/bin/env python3
"""
Complete setup guide for FREE APIs for Advanced LBO Model
"""

# STEP 1: Get Alpha Vantage API Key (FREE)
print("🔑 Step 1: Get Alpha Vantage API Key")
print("1. Go to: https://www.alphavantage.co/support/#api-key")
print("2. Enter your email")
print("3. Copy the API key")
print("4. Set environment variable:")
print("   export ALPHAVANTAGE_API_KEY=REDACTED

# STEP 2: Get FRED API Key (FREE)
print("\n🔑 Step 2: Get FRED API Key")
print("1. Go to: https://fred.stlouisfed.org/docs/api/api_key.html")
print("2. Create account")
print("3. Copy the API key")
print("4. Set environment variable:")
print("   export FRED_API_KEY='your_key_here'")

# STEP 3: Install Dependencies
print("\n📦 Step 3: Install Dependencies")
print("pip install yfinance requests")

# STEP 4: Test All APIs
print("\n🧪 Step 4: Test All APIs")
print("python test_free_apis.py")

# STEP 5: Run LBO Model
print("\n🚀 Step 5: Run LBO Model")
print("python -c \"from financial_data import FinancialDataEngine; engine = FinancialDataEngine(); result = engine.get_assumptions('MSFT')\"")
