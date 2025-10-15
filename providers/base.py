"""
Base provider interface and common utilities.
"""
import asyncio
import logging
from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Union
from dataclasses import dataclass
from datetime import datetime, timedelta
import httpx
import pandas as pd
from config import config


@dataclass
class ProviderResult:
    """Standard result format for all providers."""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    as_of: Optional[datetime] = None
    provider: Optional[str] = None
    
    @property
    def is_stale(self) -> bool:
        """Check if data is stale based on current time."""
        if not self.as_of:
            return True
        return datetime.utcnow() - self.as_of > timedelta(minutes=config.staleness_max_minutes)


class BaseProvider(ABC):
    """Base class for all financial data providers."""
    
    def __init__(self, name: str):
        self.name = name
        self.logger = logging.getLogger(f"providers.{name}")
        self.config = config.get_provider_config(name)
        self._client: Optional[httpx.AsyncClient] = None
        
    async def __aenter__(self):
        """Async context manager entry."""
        await self._get_client()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self._client:
            await self._client.aclose()
            
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client."""
        if not self._client:
            timeout = httpx.Timeout(30.0, connect=10.0)
            limits = httpx.Limits(max_keepalive_connections=20, max_connections=100)
            
            self._client = httpx.AsyncClient(
                timeout=timeout,
                limits=limits,
                headers=self._get_headers(),
                follow_redirects=True
            )
        return self._client
    
    def _get_headers(self) -> Dict[str, str]:
        """Get default headers for requests."""
        headers = {
            "User-Agent": "FinModAI/1.0 (financial modeling platform)",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate"
        }
        
        # Add API key if available
        if "api_key" in self.config and self.config["api_key"]:
            headers.update(self._get_auth_headers())
            
        return headers
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Get authentication headers - override in subclasses."""
        return {}
    
    async def _make_request(
        self, 
        method: str, 
        url: str, 
        params: Optional[Dict] = None,
        json: Optional[Dict] = None,
        retries: int = None
    ) -> ProviderResult:
        """Make HTTP request with retry logic."""
        if retries is None:
            retries = config.max_retries
            
        client = await self._get_client()
        
        for attempt in range(retries + 1):
            try:
                response = await client.request(
                    method=method,
                    url=url,
                    params=params,
                    json=json
                )
                
                if response.status_code == 200:
                    data = response.json() if response.headers.get("content-type", "").startswith("application/json") else response.text
                    return ProviderResult(
                        success=True,
                        data=data,
                        as_of=datetime.utcnow(),
                        provider=self.name
                    )
                elif response.status_code == 429:  # Rate limited
                    if attempt < retries:
                        delay = (2 ** attempt) * config.retry_delay
                        self.logger.warning(f"Rate limited, retrying in {delay}s (attempt {attempt + 1})")
                        await asyncio.sleep(delay)
                        continue
                    else:
                        return ProviderResult(
                            success=False,
                            error=f"Rate limited after {retries} retries",
                            provider=self.name
                        )
                else:
                    return ProviderResult(
                        success=False,
                        error=f"HTTP {response.status_code}: {response.text[:200]}",
                        provider=self.name
                    )
                    
            except httpx.TimeoutException:
                if attempt < retries:
                    delay = config.retry_delay * (attempt + 1)
                    self.logger.warning(f"Timeout, retrying in {delay}s (attempt {attempt + 1})")
                    await asyncio.sleep(delay)
                    continue
                else:
                    return ProviderResult(
                        success=False,
                        error="Request timeout",
                        provider=self.name
                    )
            except Exception as e:
                if attempt < retries:
                    delay = config.retry_delay * (attempt + 1)
                    self.logger.warning(f"Request failed: {e}, retrying in {delay}s (attempt {attempt + 1})")
                    await asyncio.sleep(delay)
                    continue
                else:
                    return ProviderResult(
                        success=False,
                        error=f"Request failed: {str(e)}",
                        provider=self.name
                    )
        
        return ProviderResult(
            success=False,
            error="Max retries exceeded",
            provider=self.name
        )
    
    @abstractmethod
    async def get_fundamentals(self, ticker: str) -> ProviderResult:
        """Get fundamental financial data for a ticker."""
        pass
    
    @abstractmethod
    async def get_quote(self, ticker: str) -> ProviderResult:
        """Get current quote/market data for a ticker."""
        pass
    
    @abstractmethod
    async def get_chart(self, ticker: str, period: str = "1mo") -> ProviderResult:
        """Get historical price chart data for sparklines."""
        pass
    
    @abstractmethod
    async def get_metadata(self, ticker: str) -> ProviderResult:
        """Get company metadata (name, sector, industry)."""
        pass
    
    def _normalize_ticker(self, ticker: str) -> str:
        """Normalize ticker symbol (override in subclasses if needed)."""
        return ticker.upper().strip()


class BatchProvider(BaseProvider):
    """Base class for providers that support batch operations."""
    
    @abstractmethod
    async def get_quotes_batch(self, tickers: List[str]) -> Dict[str, ProviderResult]:
        """Get quotes for multiple tickers in a single request."""
        pass
    
    @abstractmethod
    async def get_metadata_batch(self, tickers: List[str]) -> Dict[str, ProviderResult]:
        """Get metadata for multiple tickers in a single request."""
        pass


def validate_market_cap_consistency(price: float, shares_out: float, market_cap: float) -> bool:
    """Validate market cap consistency within tolerance."""
    if not all([price, shares_out, market_cap]):
        return False
    
    calculated_cap = price * shares_out
    tolerance = config.market_cap_tolerance
    
    return abs(calculated_cap - market_cap) / market_cap <= tolerance


def normalize_capex(capex_value: float) -> tuple[float, bool]:
    """Normalize CapEx to positive outflow (flip if negative)."""
    if capex_value < 0:
        return abs(capex_value), True  # flipped, marked
    return capex_value, False


def safe_divide(numerator: float, denominator: float) -> Optional[float]:
    """Safe division that returns None for zero/negative denominators."""
    if denominator is None or denominator <= 0:
        return None
    return numerator / denominator
