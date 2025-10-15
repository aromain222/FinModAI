"""
Example usage of the FinModAI Data Layer.
"""
import asyncio
import logging
from datetime import datetime

from models_data.bundles import bundle_builder
from orchestrator.fetch import data_fetcher, FetchRequest
from orchestrator.cache import cache_manager


async def example_dcf_analysis():
    """Example: Build a DCF model input bundle."""
    print("=== DCF Analysis Example ===")
    
    try:
        # Build DCF bundle for Apple
        bundle = await bundle_builder.build_dcf_bundle("AAPL")
        
        print(f"Ticker: {bundle.ticker}")
        print(f"Historical Years: {len(bundle.historicals)}")
        print(f"Latest Revenue (TTM): ${bundle.current.revenue_ttm:,.0f}" if bundle.current.revenue_ttm else "Revenue: N/A")
        print(f"Latest EBITDA (TTM): ${bundle.current.ebitda_ttm:,.0f}" if bundle.current.ebitda_ttm else "EBITDA: N/A")
        print(f"Market Cap: ${bundle.market.market_cap:,.0f}" if bundle.market.market_cap else "Market Cap: N/A")
        print(f"Price: ${bundle.market.price:.2f}" if bundle.market.price else "Price: N/A")
        print(f"Shares Outstanding: {bundle.capital.shares_out:,.0f}" if bundle.capital.shares_out else "Shares: N/A")
        
        # Show historical growth
        if len(bundle.historicals) >= 2:
            latest_revenue = bundle.historicals[0].revenue
            previous_revenue = bundle.historicals[1].revenue
            if latest_revenue and previous_revenue:
                growth_rate = (latest_revenue - previous_revenue) / previous_revenue
                print(f"Revenue Growth: {growth_rate:.1%}")
        
        print(f"Data Sources: {list(bundle.provenance.values())}")
        
    except Exception as e:
        print(f"DCF analysis failed: {e}")


async def example_comps_analysis():
    """Example: Build a Comps model input bundle."""
    print("\n=== Comps Analysis Example ===")
    
    try:
        # Build Comps bundle with specific peers
        peers = ["MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "ORCL", "CRM"]
        bundle = await bundle_builder.build_comps_bundle("AAPL", peers)
        
        print(f"Target: {bundle.peer_rows[0].ticker}")
        print(f"Peer Count: {len(bundle.peer_rows) - 1}")  # Exclude target
        
        # Show peer metrics
        for peer in bundle.peer_rows[1:6]:  # Show first 5 peers
            if peer.ev_to_ebitda:
                print(f"{peer.ticker}: EV/EBITDA = {peer.ev_to_ebitda:.1f}x")
        
    except Exception as e:
        print(f"Comps analysis failed: {e}")


async def example_lbo_analysis():
    """Example: Build an LBO model input bundle."""
    print("\n=== LBO Analysis Example ===")
    
    try:
        # Build LBO bundle
        bundle = await bundle_builder.build_lbo_bundle("AAPL")
        
        print(f"Ticker: {bundle.ticker}")
        print(f"Starting Revenue (LTM): ${bundle.starting.revenue_LTM:,.0f}" if bundle.starting.revenue_LTM else "Revenue: N/A")
        print(f"Starting EBITDA (LTM): ${bundle.starting.ebitda_LTM:,.0f}" if bundle.starting.ebitda_LTM else "EBITDA: N/A")
        print(f"Starting Net Debt: ${bundle.starting.net_debt:,.0f}" if bundle.starting.net_debt else "Net Debt: N/A")
        print(f"Market Cap: ${bundle.market.market_cap:,.0f}" if bundle.market.market_cap else "Market Cap: N/A")
        
        # Calculate leverage
        if bundle.starting.ebitda_LTM and bundle.starting.net_debt and bundle.market.market_cap:
            equity_value = bundle.market.market_cap
            debt_to_ebitda = bundle.starting.net_debt / bundle.starting.ebitda_LTM
            print(f"Debt/EBITDA: {debt_to_ebitda:.1f}x")
        
    except Exception as e:
        print(f"LBO analysis failed: {e}")


async def example_merger_analysis():
    """Example: Build a Merger model input bundle."""
    print("\n=== Merger Analysis Example ===")
    
    try:
        # Build Merger bundle
        bundle = await bundle_builder.build_merger_bundle("MSFT", "ADBE")
        
        print(f"Acquirer: {bundle.acquirer.ticker}")
        print(f"Target: {bundle.target.ticker}")
        
        # Show size comparison
        if bundle.acquirer.market.market_cap and bundle.target.market.market_cap:
            size_ratio = bundle.acquirer.market.market_cap / bundle.target.market.market_cap
            print(f"Size Ratio: {size_ratio:.1f}x")
        
        # Show shared characteristics
        if bundle.shared.sector:
            print(f"Shared Sector: {bundle.shared.sector}")
        
        if bundle.shared.overlap_clues:
            print(f"Overlap Analysis: {bundle.shared.overlap_clues}")
        
    except Exception as e:
        print(f"Merger analysis failed: {e}")


async def example_direct_data_fetching():
    """Example: Direct data fetching without bundles."""
    print("\n=== Direct Data Fetching Example ===")
    
    try:
        # Fetch quotes for multiple tickers
        requests = [
            FetchRequest(ticker="AAPL", data_type="quotes"),
            FetchRequest(ticker="MSFT", data_type="quotes"),
            FetchRequest(ticker="GOOGL", data_type="quotes"),
        ]
        
        results = await data_fetcher.fetch_batch(requests)
        
        print("Direct Quote Data:")
        for key, result in results.items():
            if result.success and result.data:
                ticker = key.split("_")[0]
                price = result.data.get("price")
                change = result.data.get("change_percent")
                provider = result.provider
                print(f"{ticker}: ${price:.2f} ({change:+.2f}%) via {provider}")
        
    except Exception as e:
        print(f"Direct fetching failed: {e}")


async def example_cache_inspection():
    """Example: Inspect cache status."""
    print("\n=== Cache Inspection Example ===")
    
    try:
        # Get cache statistics
        stats = await cache_manager.get_stats()
        print(f"Total Cache Entries: {stats['total_entries']}")
        print(f"Stale Entries: {stats['stale_entries']}")
        print(f"Cache Size: {stats['cache_size_mb']:.2f} MB")
        
        # Check specific ticker cache
        aapl_cache = await cache_manager.get_ticker_cache_status("AAPL")
        print(f"AAPL Cache Status:")
        for data_type, status in aapl_cache.items():
            print(f"  {data_type}: {'cached' if status['cached'] else 'not cached'}")
            if status['cached']:
                print(f"    Provider: {status['provider']}")
                print(f"    Stale: {status['stale']}")
        
    except Exception as e:
        print(f"Cache inspection failed: {e}")


async def main():
    """Run all examples."""
    print("FinModAI Data Layer - Usage Examples")
    print("=" * 50)
    
    # Configure logging to reduce noise
    logging.basicConfig(level=logging.WARNING)
    
    try:
        await example_dcf_analysis()
        await example_comps_analysis()
        await example_lbo_analysis()
        await example_merger_analysis()
        await example_direct_data_fetching()
        await example_cache_inspection()
        
        print("\n=== Examples Complete ===")
        print("✓ All examples executed successfully")
        
    except Exception as e:
        print(f"\n❌ Examples failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())
