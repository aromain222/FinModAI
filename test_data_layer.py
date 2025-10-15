"""
Test script for the financial data layer.
"""
import asyncio
import logging
from datetime import datetime

from orchestrator.registry import registry
from orchestrator.fetch import data_fetcher, FetchRequest
from orchestrator.cache import cache_manager
from models_data.bundles import bundle_builder
from config import config


async def test_provider_registry():
    """Test provider registry functionality."""
    print("=== Testing Provider Registry ===")
    
    print(f"Enabled providers: {registry.get_enabled_providers()}")
    print(f"Provider status: {registry.get_provider_status()}")
    
    # Test health check
    health_status = await registry.health_check()
    print(f"Health status: {health_status}")
    
    # Test data source info
    source_info = registry.get_data_source_info()
    print(f"Data source info: {source_info}")


async def test_data_fetching():
    """Test data fetching functionality."""
    print("\n=== Testing Data Fetching ===")
    
    # Test single fetch
    request = FetchRequest(ticker="AAPL", data_type="quotes")
    result = await data_fetcher.fetch_single(request)
    print(f"AAPL quotes: {result.success}, provider: {result.provider}")
    
    # Test batch fetch
    requests = [
        FetchRequest(ticker="AAPL", data_type="quotes"),
        FetchRequest(ticker="MSFT", data_type="quotes"),
        FetchRequest(ticker="GOOGL", data_type="quotes"),
    ]
    
    results = await data_fetcher.fetch_batch(requests)
    print(f"Batch fetch results: {len(results)} requests")
    for key, result in results.items():
        print(f"  {key}: {result.success}")


async def test_cache():
    """Test cache functionality."""
    print("\n=== Testing Cache ===")
    
    # Get cache stats
    stats = await cache_manager.get_stats()
    print(f"Cache stats: {stats}")
    
    # Test cache for a ticker
    cache_status = await cache_manager.get_ticker_cache_status("AAPL")
    print(f"AAPL cache status: {cache_status}")


async def test_bundle_building():
    """Test bundle building functionality."""
    print("\n=== Testing Bundle Building ===")
    
    try:
        # Test DCF bundle
        dcf_bundle = await bundle_builder.build_dcf_bundle("AAPL")
        print(f"DCF bundle: {dcf_bundle.ticker}, historicals: {len(dcf_bundle.historicals)}")
        print(f"  Current revenue: {dcf_bundle.current.revenue_ttm}")
        print(f"  Market cap: {dcf_bundle.market.market_cap}")
        
        # Test LBO bundle
        lbo_bundle = await bundle_builder.build_lbo_bundle("AAPL")
        print(f"LBO bundle: {lbo_bundle.ticker}")
        print(f"  Starting EBITDA: {lbo_bundle.starting.ebitda_LTM}")
        
    except Exception as e:
        print(f"Bundle building error: {e}")


async def test_configuration():
    """Test configuration."""
    print("\n=== Testing Configuration ===")
    
    print(f"Data mode: {config.data_mode}")
    print(f"Is production: {config.is_production}")
    print(f"Enabled providers: {config.enabled_providers}")
    print(f"Staleness max minutes: {config.staleness_max_minutes}")
    
    # Test provider configs
    for provider in config.enabled_providers:
        provider_config = config.get_provider_config(provider)
        print(f"{provider} config: {list(provider_config.keys())}")


async def main():
    """Run all tests."""
    print("FinModAI Data Layer Test Suite")
    print("=" * 50)
    
    try:
        await test_configuration()
        await test_provider_registry()
        await test_data_fetching()
        await test_cache()
        await test_bundle_building()
        
        print("\n=== Test Summary ===")
        print("✓ All tests completed successfully")
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    # Configure logging
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    
    # Run tests
    asyncio.run(main())
