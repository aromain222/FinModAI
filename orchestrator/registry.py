"""
Provider registry for managing available data providers.
"""
import logging
from typing import Dict, List, Optional, Type
from config import config
from providers.base import BaseProvider, BatchProvider
from providers.edgar import EdgarProvider
from providers.yahoo import YahooProvider
from providers.finnhub import FinnhubProvider


class ProviderRegistry:
    """Registry for managing financial data providers."""
    
    def __init__(self):
        self.logger = logging.getLogger("orchestrator.registry")
        self._providers: Dict[str, BaseProvider] = {}
        self._enabled_providers = config.enabled_providers
        self._initialize_providers()
    
    def _initialize_providers(self):
        """Initialize available providers based on configuration."""
        provider_classes = {
            "edgar": EdgarProvider,
            "yahoo": YahooProvider,
            "finnhub": FinnhubProvider,
            # Add more providers as they're implemented
        }
        
        for provider_name in self._enabled_providers:
            if provider_name in provider_classes:
                try:
                    provider_instance = provider_classes[provider_name]()
                    self._providers[provider_name] = provider_instance
                    self.logger.info(f"✓ Initialized {provider_name} provider")
                except Exception as e:
                    self.logger.error(f"✗ Failed to initialize {provider_name} provider: {e}")
            else:
                self.logger.warning(f"Provider {provider_name} not implemented")
    
    def get_provider(self, name: str) -> Optional[BaseProvider]:
        """Get a provider by name."""
        return self._providers.get(name)
    
    def get_all_providers(self) -> Dict[str, BaseProvider]:
        """Get all initialized providers."""
        return self._providers.copy()
    
    def get_enabled_providers(self) -> List[str]:
        """Get list of enabled provider names."""
        return self._enabled_providers.copy()
    
    def is_provider_enabled(self, name: str) -> bool:
        """Check if a provider is enabled."""
        return name in self._enabled_providers and name in self._providers
    
    def get_providers_by_type(self, data_type: str) -> List[BaseProvider]:
        """Get providers that support a specific data type."""
        # Provider priority order by data type
        priority_map = {
            "fundamentals": ["edgar", "finnhub", "fmp", "alphavantage"],
            "quotes": ["yahoo", "finnhub", "alphavantage", "fmp"],
            "charts": ["yahoo", "finnhub", "fmp"],
            "metadata": ["finnhub", "fmp", "alphavantage", "yahoo"],
            "risk_free": ["fred"]
        }
        
        if data_type not in priority_map:
            return []
        
        providers = []
        for provider_name in priority_map[data_type]:
            if self.is_provider_enabled(provider_name):
                provider = self.get_provider(provider_name)
                if provider:
                    providers.append(provider)
        
        return providers
    
    def get_batch_providers(self) -> List[BatchProvider]:
        """Get all providers that support batch operations."""
        batch_providers = []
        for provider in self._providers.values():
            if isinstance(provider, BatchProvider):
                batch_providers.append(provider)
        return batch_providers
    
    def get_provider_status(self) -> Dict[str, Dict[str, any]]:
        """Get status information for all providers."""
        status = {}
        for name, provider in self._providers.items():
            status[name] = {
                "enabled": True,
                "class": provider.__class__.__name__,
                "supports_batch": isinstance(provider, BatchProvider),
                "config": config.get_provider_config(name)
            }
        return status
    
    async def health_check(self) -> Dict[str, bool]:
        """Perform health check on all providers."""
        health_status = {}
        
        for name, provider in self._providers.items():
            try:
                # Simple health check - try to get metadata for a known ticker
                if hasattr(provider, 'get_metadata'):
                    async with provider:
                        result = await provider.get_metadata("AAPL")
                        health_status[name] = result.success
                    if not health_status[name]:
                        self.logger.warning(f"Health check failed for {name}: {result.error}")
                else:
                    health_status[name] = True  # Assume healthy if no metadata method
            except Exception as e:
                self.logger.error(f"Health check error for {name}: {e}")
                health_status[name] = False
        
        return health_status
    
    def get_data_source_info(self) -> Dict[str, List[str]]:
        """Get information about data sources by type."""
        return {
            "fundamentals": [p for p in self.get_providers_by_type("fundamentals") if self.is_provider_enabled(p.name)],
            "quotes": [p for p in self.get_providers_by_type("quotes") if self.is_provider_enabled(p.name)],
            "charts": [p for p in self.get_providers_by_type("charts") if self.is_provider_enabled(p.name)],
            "metadata": [p for p in self.get_providers_by_type("metadata") if self.is_provider_enabled(p.name)],
            "risk_free": [p for p in self.get_providers_by_type("risk_free") if self.is_provider_enabled(p.name)]
        }


# Global registry instance
registry = ProviderRegistry()
