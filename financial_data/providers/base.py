"""
Base provider interface for financial data.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Union, TypedDict
from datetime import datetime, timedelta
import time
import json
import os
import functools
import random

class IncompleteDataError(Exception):
    """Exception raised when data is incomplete."""
    pass

class DataNotAvailableError(Exception):
    """Exception raised when data is not available."""
    pass

class ProviderTimeoutError(Exception):
    """Exception raised when a provider times out."""
    pass

class ProviderRateLimitError(Exception):
    """Exception raised when a provider rate limit is hit."""
    pass

class Year(TypedDict):
    """Type for a year value."""
    year: int

class IncomeStatement(Year):
    """Type for income statement data."""
    revenue: float
    ebit: float
    da: Optional[float]
    net_income: Optional[float]
    tax_expense: Optional[float]
    interest_expense: Optional[float]

class BalanceSheet(Year):
    """Type for balance sheet data."""
    cash: float
    total_debt: float
    shares: Optional[float]
    total_assets: Optional[float]
    total_equity: Optional[float]
    current_assets: Optional[float]
    current_liabilities: Optional[float]

class CashFlow(Year):
    """Type for cash flow data."""
    capex: float
    delta_nwc: Optional[float]
    depreciation_amortization: Optional[float]
    operating_cash_flow: Optional[float]

class Fundamentals(TypedDict):
    """Type for fundamental data."""
    income: List[IncomeStatement]
    balance: List[BalanceSheet]
    cashflow: List[CashFlow]

class MarketData(TypedDict):
    """Type for market data."""
    price: float
    market_cap: Optional[float]
    beta: Optional[float]
    shares_outstanding: Optional[float]
    pe_ratio: Optional[float]
    industry: Optional[str]
    sector: Optional[str]
    company_name: Optional[str]

class Estimates(TypedDict):
    """Type for analyst estimates."""
    rev_growth_y1: Optional[float]
    rev_growth_y2: Optional[float]
    margin_y1: Optional[float]

class PricePoint(TypedDict):
    """Type for a price point."""
    t: str  # ISO date string
    p: float  # Price

class Provenance(TypedDict):
    """Type for data provenance."""
    source: str
    as_of: str  # ISO date string

def retry_with_backoff(max_retries=3, initial_delay=1, max_delay=60, backoff_factor=2, jitter=True):
    """Decorator for retrying API calls with exponential backoff."""
    def decorator(func):
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            retries = 0
            delay = initial_delay
            
            while retries <= max_retries:
                try:
                    return func(*args, **kwargs)
                except (ProviderTimeoutError, ProviderRateLimitError) as e:
                    retries += 1
                    if retries > max_retries:
                        raise e
                    
                    # Calculate delay with exponential backoff
                    delay = min(max_delay, delay * backoff_factor)
                    
                    # Add jitter if enabled
                    if jitter:
                        delay = delay * (0.5 + random.random())
                    
                    print(f"API call failed, retrying in {delay:.2f} seconds... ({retries}/{max_retries})")
                    time.sleep(delay)
                except Exception as e:
                    # Don't retry other exceptions
                    raise e
            
            return None  # Should never reach here
        return wrapper
    return decorator

class Cache:
    """Simple cache with TTL."""
    
    def __init__(self, ttl=86400):
        """Initialize cache with TTL in seconds."""
        self.cache = {}
        self.ttl = ttl
        self.cache_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "cache")
        
        # Create cache directory if it doesn't exist
        if not os.path.exists(self.cache_dir):
            os.makedirs(self.cache_dir)
    
    def _get_cache_key(self, key):
        """Convert key to a valid filename."""
        return f"{hash(key)}.json"
    
    def _get_cache_path(self, key):
        """Get the full path to the cache file."""
        return os.path.join(self.cache_dir, self._get_cache_key(key))
    
    def get(self, key):
        """Get value from cache if it exists and is not expired."""
        # First check memory cache
        if key in self.cache:
            timestamp, value = self.cache[key]
            if time.time() - timestamp <= self.ttl:
                return value
            else:
                del self.cache[key]
        
        # Then check file cache
        cache_path = self._get_cache_path(key)
        if os.path.exists(cache_path):
            try:
                with open(cache_path, 'r') as f:
                    data = json.load(f)
                    timestamp = data.get('timestamp', 0)
                    if time.time() - timestamp <= self.ttl:
                        value = data.get('value')
                        # Update memory cache
                        self.cache[key] = (timestamp, value)
                        return value
                    else:
                        # Remove expired cache file
                        os.remove(cache_path)
            except (json.JSONDecodeError, IOError):
                # Remove corrupted cache file
                if os.path.exists(cache_path):
                    os.remove(cache_path)
        
        return None
    
    def set(self, key, value):
        """Set value in cache with current timestamp."""
        timestamp = time.time()
        
        # Update memory cache
        self.cache[key] = (timestamp, value)
        
        # Update file cache
        cache_path = self._get_cache_path(key)
        try:
            with open(cache_path, 'w') as f:
                json.dump({
                    'timestamp': timestamp,
                    'value': value
                }, f)
        except IOError:
            pass  # Silently fail if we can't write to the cache file

class FinancialDataProvider(ABC):
    """Base class for financial data providers."""
    
    def __init__(self, cache_ttl=86400):
        """Initialize the provider with cache TTL in seconds."""
        self.cache = Cache(ttl=cache_ttl)
        self.name = self.__class__.__name__
    
    @abstractmethod
    def get_fundamentals(self, ticker: str) -> Fundamentals:
        """
        Get fundamental financial data for a company.
        
        Args:
            ticker: Company ticker symbol
            
        Returns:
            Fundamentals object with income statement, balance sheet, and cash flow data
        """
        pass
    
    @abstractmethod
    def get_market_data(self, ticker: str) -> MarketData:
        """
        Get current market data for a company.
        
        Args:
            ticker: Company ticker symbol
            
        Returns:
            MarketData object with price, market cap, beta, etc.
        """
        pass
    
    def get_estimates(self, ticker: str) -> Optional[Estimates]:
        """
        Get analyst estimates for a company.
        
        Args:
            ticker: Company ticker symbol
            
        Returns:
            Estimates object with revenue growth and margin estimates
        """
        return None  # Optional method, default implementation returns None
    
    def get_prices(self, ticker: str, period: str = "2y", freq: str = "weekly") -> Optional[List[PricePoint]]:
        """
        Get historical price data for a company.
        
        Args:
            ticker: Company ticker symbol
            period: Period to retrieve (e.g., "2y", "5y")
            freq: Frequency of data points (e.g., "weekly", "daily")
            
        Returns:
            List of PricePoint objects with date and price
        """
        return None  # Optional method, default implementation returns None
    
    def get_risk_free_rate(self) -> Optional[float]:
        """
        Get the current risk-free rate.
        
        Returns:
            Current risk-free rate as a decimal (e.g., 0.042 for 4.2%)
        """
        return None  # Optional method, default implementation returns None
    
    def calculate_beta(self, ticker: str, market_ticker: str = "^GSPC", years: int = 2) -> Optional[float]:
        """
        Calculate beta using regression of returns against market returns.
        
        Args:
            ticker: Company ticker symbol
            market_ticker: Market index ticker (default: S&P 500)
            years: Number of years of data to use
            
        Returns:
            Beta value
        """
        # Get historical prices
        prices = self.get_prices(ticker, f"{years}y", "weekly")
        market_prices = self.get_prices(market_ticker, f"{years}y", "weekly")
        
        if not prices or not market_prices:
            return None
        
        # Extract prices
        ticker_prices = [p["p"] for p in prices]
        market_prices = [p["p"] for p in market_prices]
        
        # Ensure we have the same number of data points
        min_len = min(len(ticker_prices), len(market_prices))
        if min_len < 30:  # Need at least 30 data points
            return None
            
        ticker_prices = ticker_prices[:min_len]
        market_prices = market_prices[:min_len]
        
        # Calculate returns
        ticker_returns = [(ticker_prices[i] / ticker_prices[i+1]) - 1 for i in range(min_len-1)]
        market_returns = [(market_prices[i] / market_prices[i+1]) - 1 for i in range(min_len-1)]
        
        # Calculate beta using covariance and variance
        mean_ticker = sum(ticker_returns) / len(ticker_returns)
        mean_market = sum(market_returns) / len(market_returns)
        
        covariance = sum((ticker_returns[i] - mean_ticker) * (market_returns[i] - mean_market) 
                        for i in range(len(ticker_returns))) / len(ticker_returns)
        variance = sum((market_returns[i] - mean_market) ** 2 for i in range(len(market_returns))) / len(market_returns)
        
        if variance == 0:
            return None
            
        beta = covariance / variance
        
        # Bound beta within reasonable limits
        from ..config import BETA_MIN, BETA_MAX
        beta = max(BETA_MIN, min(BETA_MAX, beta))
        
        return beta
