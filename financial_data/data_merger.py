"""
Data merger for financial data from multiple providers.
"""

from typing import Dict, List, Any, Optional, Union, TypedDict
from datetime import datetime
import copy

from .providers import (
    FinancialDataProvider,
    DataNotAvailableError,
    IncompleteDataError,
    Fundamentals,
    MarketData,
    Estimates,
    PricePoint,
    Provenance,
    IncomeStatement,
    BalanceSheet,
    CashFlow,
)
from .config import PROVIDER_PRIORITY

class MergedData(TypedDict):
    """Type for merged data."""
    fundamentals: Optional[Fundamentals]
    market_data: Optional[MarketData]
    estimates: Optional[Estimates]
    prices: Optional[List[PricePoint]]
    risk_free_rate: Optional[float]
    provenance: Dict[str, Provenance]
    provider_attempts: List[str]
    errors: Dict[str, str]

class DataMerger:
    """Merger for financial data from multiple providers."""
    
    def __init__(self, providers: List[FinancialDataProvider], provider_priority: List[str] = None):
        """
        Initialize the data merger.
        
        Args:
            providers: List of financial data providers
            provider_priority: List of provider names in priority order
        """
        self.providers = providers
        self.provider_priority = provider_priority or PROVIDER_PRIORITY
        
        # Create provider map for easy lookup
        self.provider_map = {provider.name: provider for provider in providers}
    
    def merge_data(self, ticker: str) -> MergedData:
        """
        Merge data from multiple providers.
        
        Args:
            ticker: Company ticker symbol
            
        Returns:
            MergedData object with merged data
        """
        # Initialize result
        result: MergedData = {
            "fundamentals": None,
            "market_data": None,
            "estimates": None,
            "prices": None,
            "risk_free_rate": None,
            "provenance": {},
            "provider_attempts": [],
            "errors": {}
        }
        
        # Get fundamentals
        self._merge_fundamentals(ticker, result)
        
        # Get market data
        self._merge_market_data(ticker, result)
        
        # Get estimates
        self._merge_estimates(ticker, result)
        
        # Get prices
        self._merge_prices(ticker, result)
        
        # Get risk-free rate
        self._merge_risk_free_rate(result)
        
        return result
    
    def _merge_fundamentals(self, ticker: str, result: MergedData) -> None:
        """
        Merge fundamentals data from multiple providers.
        
        Args:
            ticker: Company ticker symbol
            result: MergedData object to update
        """
        fundamentals_data = None
        provider_name = None
        
        # Try providers in priority order
        for provider_name in self.provider_priority:
            if provider_name in self.provider_map:
                provider = self.provider_map[provider_name]
                result["provider_attempts"].append(provider_name)
                
                try:
                    fundamentals_data = provider.get_fundamentals(ticker)
                    break
                except (DataNotAvailableError, IncompleteDataError) as e:
                    result["errors"][f"{provider_name}_fundamentals"] = str(e)
                except Exception as e:
                    result["errors"][f"{provider_name}_fundamentals"] = f"Unexpected error: {str(e)}"
        
        # Validate fundamentals data
        if fundamentals_data:
            # Check if we have at least 3 years of revenue and EBIT
            income_statements = fundamentals_data.get("income", [])
            if len(income_statements) >= 3:
                # Record provenance
                for field in ["revenue", "ebit", "operating_income"]:
                    result["provenance"][field] = {
                        "source": provider_name,
                        "as_of": datetime.now().isoformat()
                    }
                
                result["fundamentals"] = fundamentals_data
            else:
                result["errors"]["fundamentals"] = "Insufficient historical data (need ≥3 years of revenue and EBIT)"
    
    def _merge_market_data(self, ticker: str, result: MergedData) -> None:
        """
        Merge market data from multiple providers.
        
        Args:
            ticker: Company ticker symbol
            result: MergedData object to update
        """
        market_data = None
        provider_name = None
        
        # Try providers in priority order
        for provider_name in self.provider_priority:
            if provider_name in self.provider_map:
                provider = self.provider_map[provider_name]
                
                try:
                    market_data = provider.get_market_data(ticker)
                    break
                except DataNotAvailableError as e:
                    result["errors"][f"{provider_name}_market_data"] = str(e)
                except Exception as e:
                    result["errors"][f"{provider_name}_market_data"] = f"Unexpected error: {str(e)}"
        
        # Validate market data
        if market_data:
            # Record provenance
            for field in ["price", "market_cap", "beta"]:
                if market_data.get(field) is not None:
                    result["provenance"][field] = {
                        "source": provider_name,
                        "as_of": datetime.now().isoformat()
                    }
            
            result["market_data"] = market_data
        
        # If beta is missing, try to calculate it
        if result["market_data"] and result["market_data"].get("beta") is None:
            for provider_name in self.provider_priority:
                if provider_name in self.provider_map:
                    provider = self.provider_map[provider_name]
                    
                    try:
                        beta = provider.calculate_beta(ticker)
                        if beta is not None:
                            result["market_data"]["beta"] = beta
                            result["provenance"]["beta"] = {
                                "source": f"computed_by_{provider_name}",
                                "as_of": datetime.now().isoformat()
                            }
                            break
                    except Exception:
                        pass
    
    def _merge_estimates(self, ticker: str, result: MergedData) -> None:
        """
        Merge estimates from multiple providers.
        
        Args:
            ticker: Company ticker symbol
            result: MergedData object to update
        """
        estimates = None
        provider_name = None
        
        # Try providers in priority order
        for provider_name in self.provider_priority:
            if provider_name in self.provider_map:
                provider = self.provider_map[provider_name]
                
                try:
                    estimates = provider.get_estimates(ticker)
                    if estimates:
                        break
                except Exception:
                    pass
        
        # Validate estimates
        if estimates:
            # Record provenance
            for field in ["rev_growth_y1", "rev_growth_y2", "margin_y1"]:
                if estimates.get(field) is not None:
                    result["provenance"][field] = {
                        "source": provider_name,
                        "as_of": datetime.now().isoformat()
                    }
            
            result["estimates"] = estimates
    
    def _merge_prices(self, ticker: str, result: MergedData) -> None:
        """
        Merge prices from multiple providers.
        
        Args:
            ticker: Company ticker symbol
            result: MergedData object to update
        """
        prices = None
        provider_name = None
        
        # Try providers in priority order
        for provider_name in self.provider_priority:
            if provider_name in self.provider_map:
                provider = self.provider_map[provider_name]
                
                try:
                    prices = provider.get_prices(ticker)
                    if prices:
                        break
                except Exception:
                    pass
        
        # Validate prices
        if prices:
            # Record provenance
            result["provenance"]["historical_prices"] = {
                "source": provider_name,
                "as_of": datetime.now().isoformat()
            }
            
            result["prices"] = prices
    
    def _merge_risk_free_rate(self, result: MergedData) -> None:
        """
        Merge risk-free rate from multiple providers.
        
        Args:
            result: MergedData object to update
        """
        risk_free_rate = None
        provider_name = None
        
        # Try providers in priority order
        for provider_name in self.provider_priority:
            if provider_name in self.provider_map:
                provider = self.provider_map[provider_name]
                
                try:
                    risk_free_rate = provider.get_risk_free_rate()
                    if risk_free_rate is not None:
                        break
                except Exception:
                    pass
        
        # Validate risk-free rate
        if risk_free_rate is not None:
            # Record provenance
            result["provenance"]["risk_free_rate"] = {
                "source": provider_name,
                "as_of": datetime.now().isoformat()
            }
            
            result["risk_free_rate"] = risk_free_rate
