#!/usr/bin/env python3
"""
Test Universal LBO Model Coverage - Test with 50+ different tickers
"""

import os
import time
from lbo_model import LBOEngine

def test_universal_lbo_coverage():
    """Test LBO model with a wide variety of tickers."""
    
    print("🚀 Testing Universal LBO Model Coverage")
    print("=" * 60)
    
    # Set up environment
    os.environ['ALPHAVANTAGE_API_KEY'] = 'PFP7ETK9CEHSFEH'
    
    # Initialize LBO engine
    lbo_engine = LBOEngine()
    
    # Test tickers from various sectors and market caps
    test_tickers = [
        # Tech Giants
        "MSFT", "AAPL", "GOOGL", "AMZN", "META", "NFLX", "NVDA", "TSLA",
        
        # Financial Services
        "JPM", "BAC", "WFC", "GS", "MS", "C", "AXP", "V", "MA",
        
        # Healthcare
        "JNJ", "PFE", "UNH", "ABBV", "MRK", "TMO", "ABT", "DHR", "BMY",
        
        # Consumer
        "WMT", "PG", "KO", "PEP", "MCD", "NKE", "SBUX", "TGT", "HD",
        
        # Energy
        "XOM", "CVX", "COP", "EOG", "SLB", "KMI", "WMB", "PSX",
        
        # Industrial
        "BA", "CAT", "GE", "HON", "MMM", "UPS", "FDX", "LMT",
        
        # International
        "ASML", "TSM", "SAP", "UL", "NVO", "RHHBY", "TM", "SONY",
        
        # Small/Mid Cap
        "ZM", "DOCU", "SNOW", "PLTR", "CRWD", "OKTA", "TWLO", "SQ",
        
        # REITs
        "AMT", "PLD", "CCI", "EQIX", "PSA", "O", "WELL", "SPG",
        
        # Utilities
        "NEE", "DUK", "SO", "AEP", "EXC", "XEL", "SRE", "PEG"
    ]
    
    print(f"🧪 Testing {len(test_tickers)} different tickers...")
    print("=" * 60)
    
    success_count = 0
    failed_tickers = []
    
    for i, ticker in enumerate(test_tickers, 1):
        print(f"\n[{i:2d}/{len(test_tickers)}] 🔍 Testing {ticker}:")
        
        test_assumptions = {
            'ticker': ticker,
            'entry_multiple': 8.0,
            'exit_multiple': 10.0,
            'leverage': 5.5,
            'holding_period': 5
        }
        
        try:
            start_time = time.time()
            result = lbo_engine.build_lbo_model(test_assumptions)
            end_time = time.time()
            
            if result and 'assumptions' in result:
                print(f"   ✅ SUCCESS! ({end_time - start_time:.1f}s)")
                success_count += 1
                
                # Show key assumptions
                assumptions = result.get('assumptions', {})
                if 'revenue_growth' in assumptions:
                    print(f"   📈 Revenue Growth: {assumptions['revenue_growth'][0]:.1%}")
                if 'operating_margin' in assumptions:
                    print(f"   📊 Operating Margin: {assumptions['operating_margin'][0]:.1%}")
                if 'wacc' in assumptions:
                    print(f"   📊 WACC: {assumptions['wacc']:.1%}")
            else:
                print(f"   ❌ FAILED - No assumptions generated")
                failed_tickers.append(ticker)
                
        except Exception as e:
            print(f"   ❌ ERROR: {str(e)[:100]}...")
            failed_tickers.append(ticker)
        
        # Add small delay to avoid rate limits
        time.sleep(0.5)
    
    # Summary
    print("\n" + "=" * 60)
    print("📊 UNIVERSAL LBO MODEL COVERAGE RESULTS")
    print("=" * 60)
    print(f"✅ Success Rate: {success_count}/{len(test_tickers)} ({success_count/len(test_tickers)*100:.1f}%)")
    print(f"❌ Failed: {len(failed_tickers)} tickers")
    
    if failed_tickers:
        print(f"\n❌ Failed Tickers: {', '.join(failed_tickers[:10])}")
        if len(failed_tickers) > 10:
            print(f"   ... and {len(failed_tickers) - 10} more")
    
    print(f"\n🎯 Coverage Analysis:")
    print(f"   📈 Tech Giants: {sum(1 for t in ['MSFT', 'AAPL', 'GOOGL', 'AMZN', 'META', 'NFLX', 'NVDA', 'TSLA'] if t not in failed_tickers)}/8")
    print(f"   🏦 Financial: {sum(1 for t in ['JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'AXP', 'V', 'MA'] if t not in failed_tickers)}/9")
    print(f"   🏥 Healthcare: {sum(1 for t in ['JNJ', 'PFE', 'UNH', 'ABBV', 'MRK', 'TMO', 'ABT', 'DHR', 'BMY'] if t not in failed_tickers)}/9")
    print(f"   🛒 Consumer: {sum(1 for t in ['WMT', 'PG', 'KO', 'PEP', 'MCD', 'NKE', 'SBUX', 'TGT', 'HD'] if t not in failed_tickers)}/9")
    print(f"   ⚡ Energy: {sum(1 for t in ['XOM', 'CVX', 'COP', 'EOG', 'SLB', 'KMI', 'WMB', 'PSX'] if t not in failed_tickers)}/8")
    
    if success_count >= len(test_tickers) * 0.8:  # 80% success rate
        print(f"\n🏆 EXCELLENT! Universal LBO model works for most companies!")
    elif success_count >= len(test_tickers) * 0.6:  # 60% success rate
        print(f"\n✅ GOOD! Universal LBO model works for majority of companies!")
    else:
        print(f"\n⚠️ NEEDS IMPROVEMENT! Universal LBO model needs more work.")
    
    return success_count, len(test_tickers)

if __name__ == "__main__":
    success, total = test_universal_lbo_coverage()
    print(f"\n🎯 Final Result: {success}/{total} companies supported")
