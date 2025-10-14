"""
Enhanced Data Fetcher with fail-fast, fallback, exponential backoff, and caching
"""

import os
import time
import uuid
import requests
import json
from typing import Dict, Optional, List, Any, Tuple
from datetime import datetime, timedelta
from dataclasses import dataclass
import logging
from enum import Enum

from provider_health import get_health_checker, ErrorType, ProviderStatus

logger = logging.getLogger(__name__)


class CachePolicy(Enum):
    """Cache TTL policies"""
    SHORT = 6 * 3600      # 6 hours for volatile data
    MEDIUM = 12 * 3600    # 12 hours for financials
    LONG = 24 * 3600      # 24 hours for company info


@dataclass
class CacheEntry:
    """Cached data entry"""
    data: Any
    cached_at: datetime
    provider: str
    endpoint: str
    ttl_seconds: int
    
    def is_valid(self) -> bool:
        """Check if cache entry is still valid"""
        age = (datetime.now() - self.cached_at).total_seconds()
        return age < self.ttl_seconds


@dataclass
class FetchResult:
    """Result of a data fetch attempt"""
    success: bool
    data: Optional[Any]
    provider: str
    endpoint: str
    error_type: Optional[ErrorType]
    error_message: Optional[str]
    response_time_ms: int
    from_cache: bool = False
    trace_id: Optional[str] = None


class DataFetchError(Exception):
    """Custom exception for data fetch failures"""
    def __init__(self, error_type: ErrorType, message: str, provider_attempts: List[str]):
        self.error_type = error_type
        self.message = message
        self.provider_attempts = provider_attempts
        super().__init__(message)


class DataFetcher:
    """
    Enhanced data fetcher with:
    - Fail-fast for invalid API keys
    - Exponential backoff for rate limits
    - Provider fallback chain
    - Response caching with TTL
    - Structured logging with trace IDs
    """
    
    # Config constants
    REQUEST_TIMEOUT = 6.0  # 6s per request
    CHAIN_TIMEOUT = 20.0   # 20s total budget
    
    # Exponential backoff delays (ms)
    BACKOFF_DELAYS = [100, 300, 900]  # 100ms, 300ms, 900ms
    
    # Provider priority order
    PROVIDER_CHAIN = ["Finnhub", "FMP", "AlphaVantage"]
    
    # Provider endpoint configs
    ENDPOINTS = {
        "Finnhub": {
            "profile": "https://finnhub.io/api/v1/stock/profile2",
            "financials": "https://finnhub.io/api/v1/stock/metric",
            "param_name": "token"
        },
        "FMP": {
            "profile": "https://financialmodelingprep.com/api/v3/profile/{symbol}",
            "financials": "https://financialmodelingprep.com/api/v3/income-statement/{symbol}",
            "param_name": "apikey"
        },
        "AlphaVantage": {
            "overview": "https://www.alphavantage.co/query",
            "param_name": "apikey"
        }
    }
    
    def __init__(self):
        self.health_checker = get_health_checker()
        self.cache: Dict[str, CacheEntry] = {}
        self.api_keys = {
            "Finnhub": os.getenv("FINNHUB_API_KEY"),
            "FMP": os.getenv("FMP_API_KEY"),
            "AlphaVantage": os.getenv("ALPHAVANTAGE_API_KEY"),
            "FRED": os.getenv("FRED_API_KEY")
        }
    
    def fetch_with_fallback(
        self,
        ticker: str,
        endpoint_name: str,
        cache_policy: CachePolicy = CachePolicy.MEDIUM
    ) -> FetchResult:
        """
        Fetch data with automatic provider fallback.
        Returns first successful result or raises DataFetchError.
        """
        trace_id = str(uuid.uuid4())[:8]
        ticker = ticker.upper()
        
        logger.info(f"[{trace_id}] Fetching {endpoint_name} for {ticker}")
        
        # Check cache first
        cache_key = f"{ticker}:{endpoint_name}"
        cached = self._get_cached(cache_key)
        if cached:
            logger.info(f"[{trace_id}] Cache hit: {cached.provider} (age={(datetime.now()-cached.cached_at).seconds}s)")
            return FetchResult(
                success=True,
                data=cached.data,
                provider=cached.provider,
                endpoint=endpoint_name,
                error_type=None,
                error_message=None,
                response_time_ms=0,
                from_cache=True,
                trace_id=trace_id
            )
        
        # Try providers in chain
        provider_attempts = []
        chain_start = time.time()
        
        for provider_name in self.PROVIDER_CHAIN:
            # Check chain timeout
            if (time.time() - chain_start) > self.CHAIN_TIMEOUT:
                logger.warning(f"[{trace_id}] Chain timeout exceeded ({self.CHAIN_TIMEOUT}s)")
                break
            
            # Skip if provider unavailable (fail-fast)
            if self.health_checker.should_skip_provider(provider_name):
                logger.info(f"[{trace_id}] Skipping {provider_name} (invalid key)")
                provider_attempts.append(provider_name)
                continue
            
            # Skip if no API key
            if not self.api_keys.get(provider_name):
                logger.info(f"[{trace_id}] Skipping {provider_name} (no key configured)")
                continue
            
            provider_attempts.append(provider_name)
            
            # Try fetch with backoff
            result = self._fetch_with_backoff(
                provider_name,
                ticker,
                endpoint_name,
                trace_id
            )
            
            if result.success:
                # Cache successful result
                self._cache_result(cache_key, result, cache_policy)
                return result
            
            # Log failure
            logger.warning(
                f"[{trace_id}] {provider_name} failed: "
                f"error={result.error_type.value if result.error_type else 'unknown'} "
                f"message={result.error_message} "
                f"time={result.response_time_ms}ms"
            )
            
            # Update health status for persistent failures
            if result.error_type == ErrorType.INVALID_API_KEY:
                self.health_checker.invalid_keys.add(provider_name)
        
        # All providers failed
        error_msg = self._build_error_message(provider_attempts, ticker)
        raise DataFetchError(
            error_type=ErrorType.PROVIDER_UNAVAILABLE,
            message=error_msg,
            provider_attempts=provider_attempts
        )
    
    def _fetch_with_backoff(
        self,
        provider_name: str,
        ticker: str,
        endpoint_name: str,
        trace_id: str
    ) -> FetchResult:
        """
        Fetch data with exponential backoff for rate limits.
        """
        config = self.ENDPOINTS.get(provider_name, {})
        endpoint_url = config.get(endpoint_name)
        
        if not endpoint_url:
            return FetchResult(
                success=False,
                data=None,
                provider=provider_name,
                endpoint=endpoint_name,
                error_type=ErrorType.UNKNOWN,
                error_message=f"Endpoint {endpoint_name} not configured",
                response_time_ms=0,
                trace_id=trace_id
            )
        
        # Format URL with ticker if needed
        if "{symbol}" in endpoint_url:
            endpoint_url = endpoint_url.format(symbol=ticker)
        
        # Prepare request params
        params = {"symbol": ticker} if "{symbol}" not in endpoint_url else {}
        param_name = config.get("param_name", "apikey")
        params[param_name] = self.api_keys[provider_name]
        
        # Special handling for Alpha Vantage
        if provider_name == "AlphaVantage":
            params["function"] = "OVERVIEW"
        
        # Try with backoff
        for attempt, delay_ms in enumerate([0] + self.BACKOFF_DELAYS):
            if delay_ms > 0:
                logger.info(f"[{trace_id}] Backoff attempt {attempt}: waiting {delay_ms}ms")
                time.sleep(delay_ms / 1000.0)
            
            start_time = time.time()
            
            try:
                response = requests.get(
                    endpoint_url,
                    params=params,
                    timeout=self.REQUEST_TIMEOUT
                )
                
                response_time_ms = int((time.time() - start_time) * 1000)
                
                # Success case
                if response.status_code == 200:
                    data = response.json()
                    
                    # Check for Alpha Vantage rate limit note
                    if provider_name == "AlphaVantage" and "Note" in data:
                        if attempt < len(self.BACKOFF_DELAYS):
                            continue  # Retry with backoff
                        return FetchResult(
                            success=False,
                            data=None,
                            provider=provider_name,
                            endpoint=endpoint_name,
                            error_type=ErrorType.RATE_LIMITED,
                            error_message="Rate limited after retries",
                            response_time_ms=response_time_ms,
                            trace_id=trace_id
                        )
                    
                    # Successful fetch
                    logger.info(
                        f"[{trace_id}] {provider_name} success: "
                        f"endpoint={endpoint_name} ticker={ticker} "
                        f"status=200 ms={response_time_ms}"
                    )
                    
                    return FetchResult(
                        success=True,
                        data=data,
                        provider=provider_name,
                        endpoint=endpoint_name,
                        error_type=None,
                        error_message=None,
                        response_time_ms=response_time_ms,
                        trace_id=trace_id
                    )
                
                # Rate limit - retry
                elif response.status_code == 429:
                    if attempt < len(self.BACKOFF_DELAYS):
                        continue  # Retry with backoff
                    
                    return FetchResult(
                        success=False,
                        data=None,
                        provider=provider_name,
                        endpoint=endpoint_name,
                        error_type=ErrorType.RATE_LIMITED,
                        error_message="429 Rate limited after retries",
                        response_time_ms=response_time_ms,
                        trace_id=trace_id
                    )
                
                # Map other errors
                error_type, error_msg = self._map_http_error(
                    response.status_code,
                    response.text
                )
                
                return FetchResult(
                    success=False,
                    data=None,
                    provider=provider_name,
                    endpoint=endpoint_name,
                    error_type=error_type,
                    error_message=error_msg,
                    response_time_ms=response_time_ms,
                    trace_id=trace_id
                )
            
            except requests.Timeout:
                return FetchResult(
                    success=False,
                    data=None,
                    provider=provider_name,
                    endpoint=endpoint_name,
                    error_type=ErrorType.TIMEOUT,
                    error_message=f"Timeout after {self.REQUEST_TIMEOUT}s",
                    response_time_ms=int((time.time() - start_time) * 1000),
                    trace_id=trace_id
                )
            
            except Exception as e:
                return FetchResult(
                    success=False,
                    data=None,
                    provider=provider_name,
                    endpoint=endpoint_name,
                    error_type=ErrorType.UNKNOWN,
                    error_message=str(e),
                    response_time_ms=int((time.time() - start_time) * 1000),
                    trace_id=trace_id
                )
        
        # Should not reach here
        return FetchResult(
            success=False,
            data=None,
            provider=provider_name,
            endpoint=endpoint_name,
            error_type=ErrorType.UNKNOWN,
            error_message="Max retries exceeded",
            response_time_ms=0,
            trace_id=trace_id
        )
    
    def _map_http_error(self, status_code: int, response_text: str) -> Tuple[ErrorType, str]:
        """Map HTTP status to error type"""
        if status_code in (401, 403):
            return ErrorType.INVALID_API_KEY, f"{status_code} Invalid API key"
        elif status_code == 429:
            return ErrorType.RATE_LIMITED, "429 Rate limit"
        elif status_code >= 500:
            return ErrorType.PROVIDER_UNAVAILABLE, f"{status_code} Server error"
        else:
            return ErrorType.UNKNOWN, f"{status_code} {response_text[:100]}"
    
    def _get_cached(self, key: str) -> Optional[CacheEntry]:
        """Get from cache if valid"""
        entry = self.cache.get(key)
        if entry and entry.is_valid():
            return entry
        return None
    
    def _cache_result(self, key: str, result: FetchResult, policy: CachePolicy):
        """Cache successful result"""
        self.cache[key] = CacheEntry(
            data=result.data,
            cached_at=datetime.now(),
            provider=result.provider,
            endpoint=result.endpoint,
            ttl_seconds=policy.value
        )
    
    def _build_error_message(self, provider_attempts: List[str], ticker: str) -> str:
        """Build user-friendly error message"""
        if not provider_attempts:
            return "No data providers configured. Check API keys on server."
        
        return (
            f"All providers failed for {ticker}. "
            f"Attempted: {', '.join(provider_attempts)}. "
            f"Likely invalid key or rate limit. Check keys on server."
        )
    
    def clear_cache(self):
        """Clear all cached data"""
        self.cache.clear()
    
    def get_cache_stats(self) -> Dict:
        """Get cache statistics"""
        valid = sum(1 for e in self.cache.values() if e.is_valid())
        return {
            "total_entries": len(self.cache),
            "valid_entries": valid,
            "expired_entries": len(self.cache) - valid
        }


# Global instance
_data_fetcher = None


def get_data_fetcher() -> DataFetcher:
    """Get or create global data fetcher instance"""
    global _data_fetcher
    if _data_fetcher is None:
        _data_fetcher = DataFetcher()
    return _data_fetcher

