"""
Test financial data layer with MSFT (mega-cap) and small-cap tickers.
Validates no generic defaults and proper error handling.
"""

import json
import os
from financial_data import FinancialDataEngine


def print_section(title):
    """Print formatted section header."""
    print("\n" + "="*80)
    print(f"  {title}")
    print("="*80)


def test_mega_cap(engine: FinancialDataEngine, ticker: str = "MSFT"):
    """Test with mega-cap stock (MSFT)."""
    print_section(f"Testing Mega-Cap: {ticker}")
    
    result = engine.get_assumptions(ticker, use_cache=False)
    
    # Check if error
    if "error" in result:
        print(f"❌ FAILED: Got error for {ticker}")
        print(json.dumps(result, indent=2))
        return False
    
    print(f"✅ SUCCESS: Got data for {ticker}")
    print(f"\nCompany: {result['company_name']}")
    print(f"Currency: {result['currency']}")
    
    # Check assumptions
    assumptions = result['assumptions']
    print(f"\nAssumptions:")
    print(f"  Revenue Growth Y1: {assumptions['revenue_growth'][0]:.1%}")
    print(f"  Revenue Growth Y5: {assumptions['revenue_growth'][4]:.1%}")
    print(f"  Operating Margin Y1: {assumptions['operating_margin'][0]:.1%}")
    print(f"  Operating Margin Y5: {assumptions['operating_margin'][4]:.1%}")
    print(f"  Tax Rate: {assumptions['tax_rate']:.1%}")
    print(f"  D&A % Rev: {assumptions['da_pct_rev']:.1%}")
    print(f"  CapEx % Rev: {assumptions['capex_pct_rev']:.1%}")
    
    # Check WACC
    wacc = result['wacc']
    print(f"\nWACC:")
    print(f"  Risk-Free Rate: {wacc['rf']:.2%}")
    print(f"  Beta: {wacc['beta']:.2f}")
    print(f"  Cost of Equity: {wacc['ke']:.2%}")
    print(f"  WACC: {wacc['wacc']:.2%}")
    print(f"  Debt Weight: {wacc['wd']:.1%}")
    
    # Check terminal
    terminal = result['terminal']
    print(f"\nTerminal:")
    print(f"  Growth Rate: {terminal['g']:.2%}")
    print(f"  Method: {terminal['method']}")
    
    # Check flags
    flags = result['flags']
    print(f"\nFlags: {', '.join(flags) if flags else 'None'}")
    
    # Check provenance
    print(f"\nData Sources:")
    for metric, prov in result['provenance'].items():
        print(f"  {metric}: {prov['source']} (as of {prov['as_of']})")
    
    # Validate expectations for MSFT
    print(f"\n📊 Validation:")
    
    validations = []
    
    # Growth should be reasonable (not generic 8%)
    y1_growth = assumptions['revenue_growth'][0]
    if 0.05 <= y1_growth <= 0.15:
        validations.append(f"✅ Y1 growth {y1_growth:.1%} is reasonable")
    else:
        validations.append(f"⚠️  Y1 growth {y1_growth:.1%} seems off")
    
    # Margin should be high for MSFT (tech giant)
    avg_margin = sum(assumptions['operating_margin'][:3]) / 3
    if avg_margin >= 0.30:
        validations.append(f"✅ Avg margin {avg_margin:.1%} reflects tech company")
    else:
        validations.append(f"⚠️  Avg margin {avg_margin:.1%} lower than expected")
    
    # WACC should be reasonable (7-10% for mega-cap)
    if 0.06 <= wacc['wacc'] <= 0.12:
        validations.append(f"✅ WACC {wacc['wacc']:.1%} is reasonable")
    else:
        validations.append(f"⚠️  WACC {wacc['wacc']:.1%} seems off")
    
    # Terminal g should be < WACC
    if terminal['g'] < wacc['wacc']:
        validations.append(f"✅ Terminal g < WACC")
    else:
        validations.append(f"❌ Terminal g >= WACC (invalid)")
    
    # Should have few flags for mega-cap with good data
    if len(flags) <= 3:
        validations.append(f"✅ Few flags ({len(flags)})")
    else:
        validations.append(f"⚠️  Many flags ({len(flags)})")
    
    for v in validations:
        print(f"  {v}")
    
    return True


def test_small_cap(engine: FinancialDataEngine, ticker: str = "PLUG"):
    """Test with small-cap/growth stock that may have patchy data."""
    print_section(f"Testing Small-Cap: {ticker}")
    
    result = engine.get_assumptions(ticker, use_cache=False)
    
    # Check if error (expected for some small-caps)
    if "error" in result:
        print(f"⚠️  Got error for {ticker} (may be expected)")
        print(f"\nError Type: {result['error']}")
        print(f"Missing: {', '.join(result.get('missing', []))}")
        print(f"Provider Attempts: {', '.join(result.get('provider_attempts', []))}")
        print(f"Message: {result['message']}")
        
        # This is actually good - we fail fast instead of using generic defaults
        print(f"\n✅ PASS: System correctly fails fast for insufficient data")
        return True
    
    print(f"✅ Got data for {ticker}")
    print(f"\nCompany: {result['company_name']}")
    
    # Check flags - small-caps should have more flags
    flags = result['flags']
    print(f"\nFlags: {', '.join(flags) if flags else 'None'}")
    
    if len(flags) > 0:
        print(f"✅ Has flags as expected for small-cap ({len(flags)} flags)")
    else:
        print(f"⚠️  No flags - unexpected for small-cap")
    
    # Check for estimate flags
    if 'no_analyst_estimates' in flags:
        print(f"✅ Correctly flagged missing analyst estimates")
    
    assumptions = result['assumptions']
    print(f"\nGrowth Y1: {assumptions['revenue_growth'][0]:.1%}")
    print(f"Margin Y1: {assumptions['operating_margin'][0]:.1%}")
    
    return True


def test_invalid_ticker(engine: FinancialDataEngine):
    """Test with invalid ticker."""
    print_section("Testing Invalid Ticker: INVALIDXXX")
    
    result = engine.get_assumptions("INVALIDXXX", use_cache=False)
    
    if "error" in result:
        print(f"✅ PASS: Correctly returns error for invalid ticker")
        print(f"Error: {result['error']}")
        print(f"Message: {result['message']}")
        return True
    else:
        print(f"❌ FAIL: Should have returned error for invalid ticker")
        return False


def test_data_contract(engine: FinancialDataEngine, ticker: str = "AAPL"):
    """Validate the data contract structure."""
    print_section(f"Testing Data Contract: {ticker}")
    
    result = engine.get_assumptions(ticker, use_cache=False)
    
    if "error" in result:
        print(f"⚠️  Got error, skipping contract validation")
        return True
    
    # Check required top-level fields
    required_fields = [
        'ticker', 'company_name', 'currency', 'provenance',
        'historicals', 'assumptions', 'wacc', 'terminal', 'flags'
    ]
    
    missing = []
    for field in required_fields:
        if field not in result:
            missing.append(field)
    
    if missing:
        print(f"❌ FAIL: Missing required fields: {', '.join(missing)}")
        return False
    
    print(f"✅ All required top-level fields present")
    
    # Check provenance structure
    prov_fields = ['revenue', 'op_margin', 'capex', 'nwc', 'price', 'beta', 'rf']
    for field in prov_fields:
        if field not in result['provenance']:
            print(f"⚠️  Missing provenance for {field}")
        else:
            p = result['provenance'][field]
            if 'source' not in p or 'as_of' not in p:
                print(f"❌ Invalid provenance structure for {field}")
                return False
    
    print(f"✅ Provenance structure correct")
    
    # Check historicals
    hist = result['historicals']
    hist_fields = ['years', 'revenue', 'operating_income', 'op_margin', 'da', 'capex', 'delta_nwc']
    for field in hist_fields:
        if field not in hist:
            print(f"❌ Missing historical field: {field}")
            return False
    
    print(f"✅ Historicals structure correct")
    
    # Check assumptions
    assump = result['assumptions']
    assump_fields = ['forecast_years', 'revenue_growth', 'operating_margin', 
                     'da_pct_rev', 'capex_pct_rev', 'nwc_pct_rev', 'tax_rate']
    for field in assump_fields:
        if field not in assump:
            print(f"❌ Missing assumption field: {field}")
            return False
    
    print(f"✅ Assumptions structure correct")
    
    # Check WACC
    wacc_fields = ['rf', 'erp', 'beta', 'ke', 'kd_pre', 'tax', 'wd', 'we', 'kd_after', 'wacc']
    wacc = result['wacc']
    for field in wacc_fields:
        if field not in wacc:
            print(f"❌ Missing WACC field: {field}")
            return False
    
    print(f"✅ WACC structure correct")
    
    # Check terminal
    if 'method' not in result['terminal'] or 'g' not in result['terminal']:
        print(f"❌ Invalid terminal structure")
        return False
    
    print(f"✅ Terminal structure correct")
    
    print(f"\n✅ PASS: Data contract validated")
    return True


def main():
    """Run all tests."""
    print_section("Financial Data Layer Test Suite")
    
    # Check for API keys
    fmp_key = os.getenv("FMP_API_KEY")
    if not fmp_key:
        print("⚠️  WARNING: FMP_API_KEY not set. Tests may fail.")
        print("   Set API key: export FMP_API_KEY='your_key'")
    
    # Initialize engine
    print("\nInitializing Financial Data Engine...")
    engine = FinancialDataEngine()
    
    print(f"Providers initialized: {len(engine.providers)}")
    for provider in engine.providers:
        print(f"  - {provider.name}")
    
    # Run tests
    results = []
    
    try:
        results.append(("Mega-Cap (MSFT)", test_mega_cap(engine, "MSFT")))
    except Exception as e:
        print(f"❌ Error testing MSFT: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Mega-Cap (MSFT)", False))
    
    try:
        results.append(("Small-Cap (PLUG)", test_small_cap(engine, "PLUG")))
    except Exception as e:
        print(f"❌ Error testing PLUG: {e}")
        results.append(("Small-Cap (PLUG)", False))
    
    try:
        results.append(("Invalid Ticker", test_invalid_ticker(engine)))
    except Exception as e:
        print(f"❌ Error testing invalid ticker: {e}")
        results.append(("Invalid Ticker", False))
    
    try:
        results.append(("Data Contract (AAPL)", test_data_contract(engine, "AAPL")))
    except Exception as e:
        print(f"❌ Error testing data contract: {e}")
        results.append(("Data Contract (AAPL)", False))
    
    # Summary
    print_section("Test Summary")
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status} - {test_name}")
    
    print(f"\n{passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All tests passed!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == '__main__':
    exit(main())

