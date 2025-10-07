"""
Factory for creating financial data providers.
"""

from typing import Dict, Optional, Type

from .base import FinancialDataProvider
from .yahoo_provider import YahooFinanceProvider

class ProviderFactory:
    """Factory for creating financial data providers."""
    
    _providers: Dict[str, Type[FinancialDataProvider]] = {
        "yahoo": YahooFinanceProvider,
    }
    
    @classmethod
    def register_provider(cls, name: str, provider_class: Type[FinancialDataProvider]) -> None:
        """Register a new provider."""
        cls._providers[name] = provider_class
    
    @classmethod
    def create_provider(cls, name: str, **kwargs) -> FinancialDataProvider:
        """Create a provider instance."""
        if name not in cls._providers:
            raise ValueError(f"Provider '{name}' not registered")
        
        return cls._providers[name](**kwargs)
    
    @classmethod
    def get_default_provider(cls, **kwargs) -> FinancialDataProvider:
        """Get the default provider."""
        return cls.create_provider("yahoo", **kwargs)
