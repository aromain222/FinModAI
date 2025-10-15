"""
Enhanced provider registry with priority and fallback system.
"""
import logging
from typing import Dict, List, Optional, Any, Set
from dataclasses import dataclass
from datetime import datetime, timezone

from config import config
from providers.base import BaseProvider
from providers.edgar import EdgarProvider
from providers.yahoo import YahooProvider
from providers.finnhub import FinnhubProvider
from providers.alphavantage import AlphaVantageProvider
from providers.fmp import FMPProvider
from providers.fred import FREDProvider

logger = logging.getLogger(__name__)


@dataclass
class ProviderPriority:
    """Provider priority configuration."""
    fundamentals: List[str]
    quotes: List[str]
    charts: List[str]
    meta: List[str]
    risk_free: List[str]


@dataclass
class FetchResult:
    """Result of a data fetch operation."""
    data: Dict[str, Any]
    provider: str
    as_of: datetime
    success: bool
    error: Optional[str] = None


class EnhancedProviderRegistry:
    """Enhanced provider registry with priority and fallback system."""
    
    def __init__(self):
        self.providers: Dict[str, BaseProvider] = {}
        self.enabled_providers: Set[str] = set()
        self.provider_priority = ProviderPriority(
            fundamentals=["edgar", "fmp", "alphavantage", "finnhub"],
            quotes=["yahoo", "finnhub", "alphavantage", "fmp"],
            charts=["yahoo", "finnhub", "fmp"],
            meta=["finnhub", "fmp", "alphavantage", "yahoo"],
            risk_free=["fred"]
        )
        self.provider_stats: Dict[str, Dict[str, int]] = {}
        
    async def initialize_providers(self) -> None:
        """Initialize all available providers."""
        logger.info("Initializing enhanced provider registry...")
        
        # Always enable EDGAR and Yahoo (no keys required)
        await self._register_provider("edgar", EdgarProvider())
        await self._register_provider("yahoo", YahooProvider())
        
        # Register optional providers based on API keys
        if config.finnhub_api_key:
            await self._register_provider("finnhub", FinnhubProvider(config.finnhub_api_key))
        
        if config.alphavantage_api_key:
            await self._register_provider("alphavantage", AlphaVantageProvider(config.alphavantage_api_key))
        
        if config.fmp_api_key:
            await self._register_provider("fmp", FMPProvider(config.fmp_api_key))
        
        if config.fred_api_key:
            await self._register_provider("fred", FREDProvider(config.fred_api_key))
        
        # Initialize provider stats
        for provider_name in self.enabled_providers:
            self.provider_stats[provider_name] = {
                "requests": 0,
                "successes": 0,
                "failures": 0,
                "last_success": None,
                "last_failure": None
            }
        
        # Log provider status
        self._log_provider_status()
    
    async def _register_provider(self, name: str, provider: BaseProvider) -> None:
        """Register a provider."""
        try:
            await provider.initialize()
            self.providers[name] = provider
            self.enabled_providers.add(name)
            logger.info(f"✅ Registered provider: {name}")
        except Exception as e:
            logger.error(f"❌ Failed to register provider {name}: {e}")
    
    def _log_provider_status(self) -> None:
        """Log provider status for auditing."""
        logger.info("📊 Provider Status:")
        status = config.log_provider_status()
        for provider, status_str in status.items():
            if provider in self.enabled_providers:
                logger.info(f"  ✅ {provider}: {status_str}")
            else:
                logger.info(f"  ❌ {provider}: {status_str}")
        
        logger.info(f"📈 Enabled providers: {', '.join(sorted(self.enabled_providers))}")
    
    def get_providers_for_data_type(self, data_type: str) -> List[str]:
        """Get providers for a specific data type in priority order."""
        if data_type == "fundamentals":
            return [p for p in self.provider_priority.fundamentals if p in self.enabled_providers]
        elif data_type == "quotes":
            return [p for p in self.provider_priority.quotes if p in self.enabled_providers]
        elif data_type == "charts":
            return [p for p in self.provider_priority.charts if p in self.enabled_providers]
        elif data_type == "meta":
            return [p for p in self.provider_priority.meta if p in self.enabled_providers]
        elif data_type == "risk_free":
            return [p for p in self.provider_priority.risk_free if p in self.enabled_providers]
        else:
            return []
    
    async def fetch_with_fallback(self, ticker: str, data_type: str, **kwargs) -> FetchResult:
        """
        Fetch data with provider fallback system.
        
        Args:
            ticker: Company ticker symbol
            data_type: Type of data to fetch (fundamentals, quotes, charts, meta, risk_free)
            **kwargs: Additional parameters for the fetch operation
            
        Returns:
            FetchResult with data from the highest priority successful provider
        """
        providers = self.get_providers_for_data_type(data_type)
        
        if not providers:
            return FetchResult(
                data={},
                provider="none",
                as_of=datetime.now(timezone.utc),
                success=False,
                error=f"No providers available for {data_type}"
            )
        
        last_error = None
        
        for provider_name in providers:
            try:
                provider = self.providers[provider_name]
                
                # Update stats
                self.provider_stats[provider_name]["requests"] += 1
                
                # Attempt to fetch data
                data = await provider.fetch_data(ticker, data_type, **kwargs)
                
                # Update success stats
                self.provider_stats[provider_name]["successes"] += 1
                self.provider_stats[provider_name]["last_success"] = datetime.now(timezone.utc)
                
                logger.info(f"✅ {provider_name} fetched {data_type} for {ticker}")
                
                return FetchResult(
                    data=data,
                    provider=provider_name,
                    as_of=datetime.now(timezone.utc),
                    success=True
                )
                
            except Exception as e:
                # Update failure stats
                self.provider_stats[provider_name]["failures"] += 1
                self.provider_stats[provider_name]["last_failure"] = datetime.now(timezone.utc)
                
                logger.warning(f"⚠️ {provider_name} failed to fetch {data_type} for {ticker}: {e}")
                last_error = str(e)
                continue
        
        # All providers failed
        logger.error(f"❌ All providers failed to fetch {data_type} for {ticker}")
        return FetchResult(
            data={},
            provider="none",
            as_of=datetime.now(timezone.utc),
            success=False,
            error=f"All providers failed. Last error: {last_error}"
        )
    
    async def fetch_multiple_tickers(self, tickers: List[str], data_type: str, **kwargs) -> Dict[str, FetchResult]:
        """
        Fetch data for multiple tickers with fallback.
        
        Args:
            tickers: List of ticker symbols
            data_type: Type of data to fetch
            **kwargs: Additional parameters
            
        Returns:
            Dictionary mapping ticker to FetchResult
        """
        results = {}
        
        # For single ticker, use regular fetch
        if len(tickers) == 1:
            result = await self.fetch_with_fallback(tickers[0], data_type, **kwargs)
            results[tickers[0]] = result
            return results
        
        # For multiple tickers, try to batch if supported
        providers = self.get_providers_for_data_type(data_type)
        
        for provider_name in providers:
            try:
                provider = self.providers[provider_name]
                
                # Check if provider supports batch operations
                if hasattr(provider, 'fetch_batch_data'):
                    batch_data = await provider.fetch_batch_data(tickers, data_type, **kwargs)
                    
                    # Process batch results
                    for ticker, data in batch_data.items():
                        if ticker not in results:
                            results[ticker] = FetchResult(
                                data=data,
                                provider=provider_name,
                                as_of=datetime.now(timezone.utc),
                                success=True
                            )
                    
                    # Update stats
                    self.provider_stats[provider_name]["requests"] += 1
                    self.provider_stats[provider_name]["successes"] += 1
                    self.provider_stats[provider_name]["last_success"] = datetime.now(timezone.utc)
                    
                    logger.info(f"✅ {provider_name} fetched batch {data_type} for {len(tickers)} tickers")
                    
                    # Check if we got all tickers
                    if len(results) == len(tickers):
                        return results
                
            except Exception as e:
                logger.warning(f"⚠️ {provider_name} batch fetch failed: {e}")
                continue
        
        # Fallback to individual fetches for missing tickers
        for ticker in tickers:
            if ticker not in results:
                result = await self.fetch_with_fallback(ticker, data_type, **kwargs)
                results[ticker] = result
        
        return results
    
    def get_provider_stats(self) -> Dict[str, Dict[str, Any]]:
        """Get provider statistics."""
        stats = {}
        for provider_name, provider_stats in self.provider_stats.items():
            stats[provider_name] = {
                "requests": provider_stats["requests"],
                "successes": provider_stats["successes"],
                "failures": provider_stats["failures"],
                "success_rate": (
                    provider_stats["successes"] / provider_stats["requests"] 
                    if provider_stats["requests"] > 0 else 0
                ),
                "last_success": provider_stats["last_success"].isoformat() if provider_stats["last_success"] else None,
                "last_failure": provider_stats["last_failure"].isoformat() if provider_stats["last_failure"] else None
            }
        return stats
    
    def get_health_status(self) -> Dict[str, Any]:
        """Get overall health status of providers."""
        total_requests = sum(stats["requests"] for stats in self.provider_stats.values())
        total_successes = sum(stats["successes"] for stats in self.provider_stats.values())
        
        overall_success_rate = total_successes / total_requests if total_requests > 0 else 0
        
        # Check for providers with recent failures
        unhealthy_providers = []
        for provider_name, stats in self.provider_stats.items():
            if stats["requests"] > 0 and stats["successes"] == 0:
                unhealthy_providers.append(provider_name)
        
        return {
            "overall_success_rate": overall_success_rate,
            "total_requests": total_requests,
            "total_successes": total_successes,
            "enabled_providers": list(self.enabled_providers),
            "unhealthy_providers": unhealthy_providers,
            "provider_stats": self.get_provider_stats()
        }


# Global enhanced registry instance
enhanced_registry = EnhancedProviderRegistry()
