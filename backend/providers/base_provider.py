"""
Base interfaces and data structures for financial data providers.
"""
from typing import Dict, List, Optional, TypedDict, Any
from dataclasses import dataclass, field
from datetime import datetime

# --- Data Structures ---

@dataclass
class Quote:
    """Standardized quote data structure."""
    price: float
    market_cap: Optional[float] = None
    enterprise_value: Optional[float] = None
    currency: str = "USD"
    as_of: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    provenance: Dict[str, Any] = field(default_factory=dict)

@dataclass
class Fundamentals:
    """Standardized fundamentals data structure for a list of periods."""
    period_ends: List[str] = field(default_factory=list)
    revenue: List[Optional[float]] = field(default_factory=list)
    ebit: List[Optional[float]] = field(default_factory=list)
    ebitda: List[Optional[float]] = field(default_factory=list)
    net_income: List[Optional[float]] = field(default_factory=list)
    shares_outstanding: List[Optional[float]] = field(default_factory=list)
    cash: List[Optional[float]] = field(default_factory=list)
    debt: List[Optional[float]] = field(default_factory=list)
    capex: List[Optional[float]] = field(default_factory=list)
    depreciation_amortization: List[Optional[float]] = field(default_factory=list)
    working_capital: List[Optional[float]] = field(default_factory=list)
    as_of: str = field(default_factory=lambda: datetime.utcnow().isoformat() + "Z")
    provenance: Dict[str, Any] = field(default_factory=dict)

class Filing(TypedDict):
    """Represents a single SEC filing."""
    type: str
    date: str
    url: str

# --- Base Provider Interface ---

class BaseProvider:
    """
    Abstract base class for all data providers.
    Ensures a consistent interface for fetching financial data.
    """
    def __init__(self, name: str):
        self.name = name

    def get_quote(self, ticker: str) -> Optional[Quote]:
        """Fetches real-time or delayed quote data."""
        raise NotImplementedError(f"{self.name} does not implement get_quote")

    def get_fundamentals(self, ticker: str, period: str = "annual", years: int = 5) -> Optional[Fundamentals]:
        """Fetches historical financial statements."""
        raise NotImplementedError(f"{self.name} does not implement get_fundamentals")
    
    def get_filings(self, ticker: str) -> Optional[List[Filing]]:
        """Fetches metadata for recent SEC filings (e.g., 10-K, 10-Q)."""
        raise NotImplementedError(f"{self.name} does not implement get_filings")

    def health_check(self) -> Dict[str, Any]:
        """
        Runs a simple, unauthenticated check to verify provider connectivity and status.
        Returns a dictionary with status, HTTP status, and any rate-limit info.
        """
        raise NotImplementedError(f"{self.name} does not implement health_check")

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}(name='{self.name}')>"
