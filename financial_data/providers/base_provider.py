"""
Base provider interface for financial data.
All providers must implement this interface.
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from datetime import datetime
from dataclasses import dataclass


@dataclass
class ProviderData:
    """Raw data from a single provider."""
    ticker: str
    company_name: Optional[str]
    currency: Optional[str]
    as_of: str  # YYYY-MM-DD
    
    # Financial statement data (multi-year, most recent first)
    years: List[int]
    revenue: List[Optional[float]]
    operating_income: List[Optional[float]]  # EBIT
    ebitda: List[Optional[float]]
    da: List[Optional[float]]  # D&A
    net_income: List[Optional[float]]
    
    # Balance sheet
    cash: List[Optional[float]]
    total_debt: List[Optional[float]]
    shares_outstanding: List[Optional[float]]
    
    # Cash flow
    capex: List[Optional[float]]
    delta_nwc: List[Optional[float]]
    
    # Tax
    tax_expense: List[Optional[float]]
    pretax_income: List[Optional[float]]
    
    # Market data
    current_price: Optional[float]
    market_cap: Optional[float]
    beta: Optional[float]
    
    # Estimates (if available)
    analyst_growth_y1: Optional[float]
    analyst_growth_y2: Optional[float]
    analyst_margin_y1: Optional[float]
    
    def coverage_score(self) -> int:
        """
        Score provider by data completeness.
        Higher score = more complete data.
        """
        score = 0
        
        # Critical: Revenue & Operating Income
        if self.revenue and len([r for r in self.revenue if r]) >= 3:
            score += 100
        if self.operating_income and len([oi for oi in self.operating_income if oi]) >= 3:
            score += 100
        
        # Important: D&A, CapEx, NWC
        if self.da and len([d for d in self.da if d]) >= 3:
            score += 20
        if self.capex and len([c for c in self.capex if c]) >= 3:
            score += 20
        if self.delta_nwc and len([n for n in self.delta_nwc if n]) >= 3:
            score += 20
        
        # Tax data
        if self.tax_expense and self.pretax_income:
            score += 15
        
        # Market data
        if self.current_price:
            score += 10
        if self.beta:
            score += 10
        
        # Debt/equity for WACC
        if self.total_debt and len([d for d in self.total_debt if d]) >= 1:
            score += 10
        if self.market_cap:
            score += 10
        
        # Bonus for estimates
        if self.analyst_growth_y1:
            score += 5
        
        return score


class BaseProvider(ABC):
    """Base class for all financial data providers."""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self.name = self.__class__.__name__.replace("Provider", "")
    
    @abstractmethod
    def fetch_data(self, ticker: str) -> Optional[ProviderData]:
        """
        Fetch financial data for a ticker.
        Returns None if ticker not found or data insufficient.
        """
        pass
    
    def _get_timestamp(self) -> str:
        """Get current timestamp in YYYY-MM-DD format."""
        return datetime.now().strftime("%Y-%m-%d")
    
    def _safe_get(self, data: Dict[str, Any], *keys, default=None):
        """Safely navigate nested dictionaries."""
        result = data
        for key in keys:
            if isinstance(result, dict):
                result = result.get(key, default)
            else:
                return default
        return result if result is not None else default
    
    def _parse_float(self, value: Any) -> Optional[float]:
        """Safely parse float value."""
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
    
    def _clean_list(self, values: List[Optional[float]], min_length: int = 3) -> List[Optional[float]]:
        """Clean and validate list of values."""
        if not values or len(values) < min_length:
            return []
        return values

