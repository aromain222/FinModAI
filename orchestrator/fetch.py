"""
Data fetching orchestrator with provider fallbacks and caching.
"""
import asyncio
import logging
from typing import Dict, List, Optional, Any, Union
from datetime import datetime, timedelta
from dataclasses import dataclass

from .registry import registry
from .cache import cache_manager
from providers.base import ProviderResult, BatchProvider


@dataclass
class FetchRequest:
    """Request for fetching data with fallback providers."""
    ticker: str
    data_type: str  # 'fundamentals', 'quotes', 'charts', 'metadata'
    period: Optional[str] = None  # For charts
    force_refresh: bool = False


@dataclass
class FetchResult:
    """Result of data fetching with provenance."""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    provider: Optional[str] = None
    as_of: Optional[datetime] = None
    cached: bool = False
    stale: bool = False


class DataFetcher:
    """Orchestrates data fetching across multiple providers with fallbacks."""
    
    def __init__(self):
        self.logger = logging.getLogger("orchestrator.fetch")
        self.registry = registry
        self.cache = cache_manager
    
    async def fetch_single(self, request: FetchRequest) -> FetchResult:
        """Fetch data for a single ticker with provider fallbacks."""
        # Check cache first (unless force refresh)
        if not request.force_refresh:
            cached_result = await self.cache.get(request.ticker, request.data_type)
            if cached_result:
                return FetchResult(
                    success=True,
                    data=cached_result.data,
                    provider=cached_result.provider,
                    as_of=cached_result.as_of,
                    cached=True,
                    stale=cached_result.is_stale
                )
        
        # Get providers for this data type
        providers = self.registry.get_providers_by_type(request.data_type)
        if not providers:
            return FetchResult(
                success=False,
                error=f"No providers available for {request.data_type}"
            )
        
        # Try providers in priority order
        last_error = None
        for provider in providers:
            try:
                result = await self._fetch_from_provider(provider, request)
                if result.success:
                    # Cache the successful result
                    await self.cache.set(request.ticker, request.data_type, result)
                    
                    return FetchResult(
                        success=True,
                        data=result.data,
                        provider=result.provider,
                        as_of=result.as_of,
                        cached=False,
                        stale=result.is_stale
                    )
                else:
                    last_error = result.error
                    self.logger.warning(f"Provider {provider.name} failed for {request.ticker}: {result.error}")
                    
            except Exception as e:
                last_error = str(e)
                self.logger.error(f"Provider {provider.name} error for {request.ticker}: {e}")
                continue
        
        return FetchResult(
            success=False,
            error=f"All providers failed. Last error: {last_error}"
        )
    
    async def fetch_batch(self, requests: List[FetchRequest]) -> Dict[str, FetchResult]:
        """Fetch data for multiple tickers efficiently."""
        results = {}
        
        # Group requests by data type for batch optimization
        by_type = {}
        for req in requests:
            if req.data_type not in by_type:
                by_type[req.data_type] = []
            by_type[req.data_type].append(req)
        
        # Process each data type
        for data_type, type_requests in by_type.items():
            # Check if we have batch providers for this type
            batch_providers = [p for p in self.registry.get_batch_providers() 
                             if data_type in ['quotes', 'metadata']]
            
            if batch_providers and len(type_requests) > 5:  # Use batch if > 5 requests
                await self._fetch_batch_type(type_requests, batch_providers[0], results)
            else:
                # Fall back to individual requests
                for req in type_requests:
                    result = await self.fetch_single(req)
                    results[f"{req.ticker}_{req.data_type}"] = result
        
        return results
    
    async def _fetch_batch_type(self, requests: List[FetchRequest], provider: BatchProvider, results: Dict[str, FetchResult]):
        """Fetch data for a batch of requests of the same type."""
        tickers = [req.ticker for req in requests]
        
        try:
            if requests[0].data_type == 'quotes':
                batch_results = await provider.get_quotes_batch(tickers)
            elif requests[0].data_type == 'metadata':
                batch_results = await provider.get_metadata_batch(tickers)
            else:
                # Not supported for batch, fall back to individual
                for req in requests:
                    result = await self.fetch_single(req)
                    results[f"{req.ticker}_{req.data_type}"] = result
                return
            
            # Process batch results
            for req in requests:
                provider_result = batch_results.get(req.ticker)
                if provider_result and provider_result.success:
                    # Cache the result
                    await self.cache.set(req.ticker, req.data_type, provider_result)
                    
                    results[f"{req.ticker}_{req.data_type}"] = FetchResult(
                        success=True,
                        data=provider_result.data,
                        provider=provider_result.provider,
                        as_of=provider_result.as_of,
                        cached=False,
                        stale=provider_result.is_stale
                    )
                else:
                    # Fall back to individual fetch
                    result = await self.fetch_single(req)
                    results[f"{req.ticker}_{req.data_type}"] = result
                    
        except Exception as e:
            self.logger.error(f"Batch fetch error: {e}")
            # Fall back to individual requests
            for req in requests:
                result = await self.fetch_single(req)
                results[f"{req.ticker}_{req.data_type}"] = result
    
    async def _fetch_from_provider(self, provider: Any, request: FetchRequest) -> ProviderResult:
        """Fetch data from a specific provider."""
        async with provider:
            if request.data_type == 'fundamentals':
                return await provider.get_fundamentals(request.ticker)
            elif request.data_type == 'quotes':
                return await provider.get_quote(request.ticker)
            elif request.data_type == 'charts':
                return await provider.get_chart(request.ticker, request.period or '1mo')
            elif request.data_type == 'metadata':
                return await provider.get_metadata(request.ticker)
            else:
                return ProviderResult(
                    success=False,
                    error=f"Unsupported data type: {request.data_type}",
                    provider=provider.name
                )
    
    async def refresh_ticker(self, ticker: str, data_types: List[str] = None) -> Dict[str, FetchResult]:
        """Force refresh data for a ticker."""
        if data_types is None:
            data_types = ['fundamentals', 'quotes', 'metadata']
        
        requests = [
            FetchRequest(ticker=ticker, data_type=dt, force_refresh=True)
            for dt in data_types
        ]
        
        return await self.fetch_batch(requests)
    
    async def get_cache_status(self, ticker: str) -> Dict[str, Any]:
        """Get cache status for a ticker."""
        status = {}
        data_types = ['fundamentals', 'quotes', 'charts', 'metadata']
        
        for dt in data_types:
            cached_result = await self.cache.get(ticker, dt)
            if cached_result:
                status[dt] = {
                    "cached": True,
                    "as_of": cached_result.as_of.isoformat() if cached_result.as_of else None,
                    "provider": cached_result.provider,
                    "stale": cached_result.is_stale
                }
            else:
                status[dt] = {
                    "cached": False,
                    "as_of": None,
                    "provider": None,
                    "stale": True
                }
        
        return status


# Global fetcher instance
data_fetcher = DataFetcher()
