"""
Test script for Trading Comparables Model
Validates data fetching, calculations, and Excel export
"""

import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sector_mapping import get_sector, find_peers, get_sector_summary
from comps_data_fetcher import CompsDataFetcher
import pandas as pd


def test_sector_mapping():
    """Test sector mapping functionality"""
    print("=" * 70)
    print("Test 1: Sector Mapping")
    print("=" * 70)
    
    # Test known tickers
    test_tickers = ['AAPL', 'JPM', 'XOM', 'UNH', 'GOOGL']
    
    for ticker in test_tickers:
        info = get_sector(ticker)
        if info:
            print(f"\n{ticker}:")
            print(f"  Sector: {info['sector']}")
            print(f"  Industry: {info['industry']}")
            
            peers = find_peers(ticker, limit=5)
            print(f"  Peers (top 5): {', '.join(peers)}")
        else:
            print(f"\n✗ {ticker}: Not found in mapping")
    
    print(f"\n✓ Sector mapping test complete")
    return True


def test_single_company_fetch():
    """Test fetching data for a single company"""
    print("\n" + "=" * 70)
    print("Test 2: Single Company Data Fetch")
    print("=" * 70)
    
    fetcher = CompsDataFetcher()
    ticker = 'AAPL'
    
    print(f"\nFetching data for {ticker}...")
    data = fetcher.fetch_company_data(ticker)
    
    if data:
        print(f"✓ Data fetched successfully")
        print(f"  Company: {data.get('company_name')}")
        print(f"  Market Cap: ${data.get('market_cap', 0)/1e9:.1f}B")
        print(f"  Revenue TTM: ${data.get('revenue_ttm', 0)/1e9:.1f}B")
        print(f"  EBITDA TTM: ${data.get('ebitda_ttm', 0)/1e9:.1f}B")
        print(f"  EV: ${data.get('enterprise_value', 0)/1e9:.1f}B")
        print(f"  Data Sources: {', '.join(data.get('data_sources', []))}")
        return True
    else:
        print(f"✗ Failed to fetch data for {ticker}")
        return False


def test_comps_table_generation():
    """Test generating a full comps table"""
    print("\n" + "=" * 70)
    print("Test 3: Comps Table Generation")
    print("=" * 70)
    
    fetcher = CompsDataFetcher()
    
    # Test with Technology companies
    test_tickers = ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA']
    
    print(f"\nFetching comps for: {', '.join(test_tickers)}")
    df = fetcher.fetch_comps_table(test_tickers)
    
    if not df.empty:
        print(f"✓ Fetched {len(df)} companies")
        
        # Calculate multiples
        df_with_multiples = fetcher.calculate_multiples(df)
        print(f"✓ Calculated multiples")
        
        # Show sample
        print("\nSample Data:")
        print("-" * 70)
        for idx, row in df_with_multiples.head(3).iterrows():
            print(f"\n{row['ticker']} - {row['company_name']}")
            print(f"  Market Cap: ${row.get('market_cap', 0)/1e9:.1f}B")
            print(f"  EV/Revenue: {row.get('ev_revenue', 0):.1f}x")
            print(f"  EV/EBITDA: {row.get('ev_ebitda', 0):.1f}x")
            print(f"  P/E: {row.get('pe_ratio', 0):.1f}x")
        
        return True
    else:
        print("✗ No data fetched")
        return False


def test_summary_statistics():
    """Test summary statistics calculation"""
    print("\n" + "=" * 70)
    print("Test 4: Summary Statistics")
    print("=" * 70)
    
    fetcher = CompsDataFetcher()
    
    # Fetch and calculate for tech companies
    test_tickers = ['AAPL', 'MSFT', 'GOOGL', 'META', 'NVDA', 'ORCL', 'ADBE']
    
    print(f"\nGenerating statistics for {len(test_tickers)} companies...")
    df = fetcher.fetch_comps_table(test_tickers)
    df_with_multiples = fetcher.calculate_multiples(df)
    stats = fetcher.calculate_summary_stats(df_with_multiples)
    
    if stats:
        print("✓ Statistics calculated\n")
        
        for multiple, stat_data in stats.items():
            if stat_data:
                print(f"{multiple.upper()}:")
                print(f"  Mean:   {stat_data['mean']:.1f}x")
                print(f"  Median: {stat_data['median']:.1f}x")
                print(f"  25th:   {stat_data['percentile_25']:.1f}x")
                print(f"  75th:   {stat_data['percentile_75']:.1f}x")
                print(f"  Range:  {stat_data['min']:.1f}x - {stat_data['max']:.1f}x")
                print(f"  Count:  {stat_data['count']}")
                print()
        
        return True
    else:
        print("✗ Failed to calculate statistics")
        return False


def test_full_comps_analysis():
    """Test the complete comps analysis pipeline"""
    print("\n" + "=" * 70)
    print("Test 5: Full Comps Analysis Pipeline")
    print("=" * 70)
    
    fetcher = CompsDataFetcher()
    ticker = 'AAPL'
    
    print(f"\nRunning full analysis for {ticker}...")
    analysis = fetcher.generate_comps_analysis(ticker, limit=7)
    
    if analysis['status'] == 'success':
        print("✓ Analysis complete\n")
        print(f"Primary Ticker: {analysis['ticker']}")
        print(f"Sector:         {analysis['sector']}")
        print(f"Industry:       {analysis['industry']}")
        print(f"Comparables:    {analysis['num_comps']}")
        print(f"Data Sources:   {', '.join(analysis['data_sources'])}")
        
        # Show peer tickers
        if analysis['comps_table']:
            tickers = [row['ticker'] for row in analysis['comps_table']]
            print(f"Peer Set:       {', '.join(tickers)}")
        
        # Show summary stats
        if analysis['summary_stats']:
            print("\nMedian Multiples:")
            for mult_key, stat_data in analysis['summary_stats'].items():
                if stat_data:
                    print(f"  {mult_key}: {stat_data['median']:.1f}x")
        
        return True
    else:
        print(f"✗ Analysis failed: {analysis.get('message')}")
        return False


def test_manual_peer_list():
    """Test with manual peer list"""
    print("\n" + "=" * 70)
    print("Test 6: Manual Peer List")
    print("=" * 70)
    
    fetcher = CompsDataFetcher()
    ticker = 'NVDA'
    peers = ['AMD', 'INTC', 'QCOM', 'AVGO']
    
    print(f"\nAnalyzing {ticker} with manual peers: {', '.join(peers)}")
    analysis = fetcher.generate_comps_analysis(ticker, peer_tickers=peers)
    
    if analysis['status'] == 'success':
        print(f"✓ Analysis complete with {analysis['num_comps']} companies")
        
        if analysis['comps_table']:
            print("\nComparison:")
            for row in analysis['comps_table']:
                print(f"  {row['ticker']:6s} - EV/Revenue: {row.get('ev_revenue', 0):.1f}x")
        
        return True
    else:
        print(f"✗ Analysis failed")
        return False


def test_sector_coverage():
    """Test coverage across different sectors"""
    print("\n" + "=" * 70)
    print("Test 7: Cross-Sector Coverage")
    print("=" * 70)
    
    fetcher = CompsDataFetcher()
    
    # Test one company from each major sector
    test_cases = {
        'Technology': 'AAPL',
        'Healthcare': 'JNJ',
        'Financial Services': 'JPM',
        'Energy': 'XOM',
        'Consumer Defensive': 'KO',
        'Communication Services': 'GOOGL'
    }
    
    print(f"\nTesting {len(test_cases)} sectors...\n")
    
    success_count = 0
    for sector, ticker in test_cases.items():
        data = fetcher.fetch_company_data(ticker)
        if data:
            print(f"✓ {sector:25s} - {ticker:6s} - ${data.get('market_cap', 0)/1e9:.0f}B market cap")
            success_count += 1
        else:
            print(f"✗ {sector:25s} - {ticker:6s} - Failed")
    
    print(f"\n✓ {success_count}/{len(test_cases)} sectors tested successfully")
    return success_count == len(test_cases)


def run_all_tests():
    """Run all tests and report results"""
    print("\n" + "=" * 70)
    print("TRADING COMPARABLES MODEL - TEST SUITE")
    print("=" * 70)
    
    tests = [
        ("Sector Mapping", test_sector_mapping),
        ("Single Company Fetch", test_single_company_fetch),
        ("Comps Table Generation", test_comps_table_generation),
        ("Summary Statistics", test_summary_statistics),
        ("Full Analysis Pipeline", test_full_comps_analysis),
        ("Manual Peer List", test_manual_peer_list),
        ("Cross-Sector Coverage", test_sector_coverage),
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            success = test_func()
            results.append((test_name, success))
        except Exception as e:
            print(f"\n✗ Test '{test_name}' failed with error: {e}")
            results.append((test_name, False))
    
    # Summary
    print("\n" + "=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    
    for test_name, success in results:
        status = "✓ PASS" if success else "✗ FAIL"
        print(f"{status:8s} - {test_name}")
    
    passed = sum(1 for _, s in results if s)
    total = len(results)
    
    print("\n" + "=" * 70)
    print(f"Results: {passed}/{total} tests passed ({passed/total*100:.0f}%)")
    print("=" * 70)
    
    return passed == total


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)

