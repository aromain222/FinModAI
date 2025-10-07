"""
Base provider interface for financial data.
"""

from abc import ABC, abstractmethod
from typing import Dict, List, Optional, Any, Tuple
import datetime
import time
from functools import wraps
import json
import os

class DataNotAvailableError(Exception):
    """Exception raised when data is not available from the provider."""
    pass

def retry_with_backoff(max_retries=3, initial_delay=1):
    """Decorator for retrying API calls with exponential backoff."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            retries = 0
            delay = initial_delay
            
            while retries <= max_retries:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    retries += 1
                    if retries > max_retries:
                        raise e
                    
                    # Exponential backoff with jitter
                    sleep_time = delay * (2 ** (retries - 1)) * (0.5 + 0.5 * (hash(str(time.time())) % 100) / 100)
                    print(f"API call failed, retrying in {sleep_time:.2f} seconds... ({retries}/{max_retries})")
                    time.sleep(sleep_time)
            
            return None  # Should never reach here
        return wrapper
    return decorator

class SimpleCache:
    """Simple in-memory cache with TTL."""
    
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
        self.cache = SimpleCache(ttl=cache_ttl)
    
    @abstractmethod
    def get_company_info(self, ticker: str) -> Dict[str, Any]:
        """
        Get basic company information.
        
        Args:
            ticker: Company ticker symbol
            
        Returns:
            Dict with company information including:
            - name: Company name
            - industry: Industry
            - sector: Sector
            - description: Company description
            - currency: Reporting currency
            - country: Country of domicile
        """
        pass
    
    @abstractmethod
    def get_income_statement(self, ticker: str, years: int = 5) -> Dict[str, List[float]]:
        """
        Get income statement data for the specified number of years.
        
        Args:
            ticker: Company ticker symbol
            years: Number of years of data to retrieve
            
        Returns:
            Dict with income statement items as keys and lists of values as values.
            Each list should have 'years' elements, with the most recent year first.
            
            Required keys:
            - dates: List of date strings (YYYY-MM-DD)
            - revenue: List of revenue values
            - operating_income: List of operating income values
            - ebit: List of EBIT values
            - net_income: List of net income values
            - eps: List of EPS values
        """
        pass
    
    @abstractmethod
    def get_balance_sheet(self, ticker: str, years: int = 5) -> Dict[str, List[float]]:
        """
        Get balance sheet data for the specified number of years.
        
        Args:
            ticker: Company ticker symbol
            years: Number of years of data to retrieve
            
        Returns:
            Dict with balance sheet items as keys and lists of values as values.
            Each list should have 'years' elements, with the most recent year first.
            
            Required keys:
            - dates: List of date strings (YYYY-MM-DD)
            - cash: List of cash and cash equivalents values
            - total_assets: List of total assets values
            - short_term_debt: List of short-term debt values
            - long_term_debt: List of long-term debt values
            - total_debt: List of total debt values
            - total_equity: List of total equity values
            - shares_outstanding: List of shares outstanding values
        """
        pass
    
    @abstractmethod
    def get_cash_flow(self, ticker: str, years: int = 5) -> Dict[str, List[float]]:
        """
        Get cash flow data for the specified number of years.
        
        Args:
            ticker: Company ticker symbol
            years: Number of years of data to retrieve
            
        Returns:
            Dict with cash flow items as keys and lists of values as values.
            Each list should have 'years' elements, with the most recent year first.
            
            Required keys:
            - dates: List of date strings (YYYY-MM-DD)
            - operating_cash_flow: List of operating cash flow values
            - capital_expenditures: List of capital expenditures values
            - free_cash_flow: List of free cash flow values
            - change_in_working_capital: List of change in working capital values
            - depreciation_amortization: List of depreciation and amortization values
        """
        pass
    
    @abstractmethod
    def get_market_data(self, ticker: str) -> Dict[str, Any]:
        """
        Get current market data for the company.
        
        Args:
            ticker: Company ticker symbol
            
        Returns:
            Dict with market data including:
            - price: Current stock price
            - market_cap: Market capitalization
            - beta: Beta
            - pe_ratio: P/E ratio
            - dividend_yield: Dividend yield
            - shares_outstanding: Shares outstanding
            - 52_week_high: 52-week high
            - 52_week_low: 52-week low
        """
        pass
    
    @abstractmethod
    def get_historical_prices(self, ticker: str, period: str = "5y") -> Dict[str, List[float]]:
        """
        Get historical price data for the specified period.
        
        Args:
            ticker: Company ticker symbol
            period: Period to retrieve (e.g., "1y", "5y")
            
        Returns:
            Dict with:
            - dates: List of date strings (YYYY-MM-DD)
            - prices: List of closing prices
            - volumes: List of trading volumes
        """
        pass
    
    @abstractmethod
    def get_analyst_estimates(self, ticker: str) -> Dict[str, Any]:
        """
        Get analyst estimates for the company.
        
        Args:
            ticker: Company ticker symbol
            
        Returns:
            Dict with analyst estimates including:
            - revenue_estimates: List of revenue estimates for future years
            - eps_estimates: List of EPS estimates for future years
            - price_target: Current price target
            - recommendation: Current recommendation (e.g., "Buy", "Hold", "Sell")
            - growth_estimates: Dict with growth estimates (e.g., "next_5y", "next_year")
        """
        pass
    
    @abstractmethod
    def get_risk_metrics(self, ticker: str) -> Dict[str, Any]:
        """
        Get risk metrics for the company.
        
        Args:
            ticker: Company ticker symbol
            
        Returns:
            Dict with risk metrics including:
            - beta: Beta
            - risk_free_rate: Current risk-free rate
            - equity_risk_premium: Equity risk premium
        """
        pass
    
    def calculate_beta(self, ticker: str, market_ticker: str = "^GSPC", years: int = 2) -> float:
        """
        Calculate beta using regression of returns against market returns.
        
        Args:
            ticker: Company ticker symbol
            market_ticker: Market index ticker (default: S&P 500)
            years: Number of years of data to use
            
        Returns:
            Beta value
        """
        try:
            # Get historical prices for the company and the market
            company_data = self.get_historical_prices(ticker, f"{years}y")
            market_data = self.get_historical_prices(market_ticker, f"{years}y")
            
            # Calculate returns
            company_prices = company_data.get("prices", [])
            market_prices = market_data.get("prices", [])
            
            if not company_prices or not market_prices:
                return None
            
            # Calculate daily returns
            company_returns = [(company_prices[i] / company_prices[i+1]) - 1 for i in range(len(company_prices)-1)]
            market_returns = [(market_prices[i] / market_prices[i+1]) - 1 for i in range(len(market_prices)-1)]
            
            # Ensure we have the same number of returns
            min_len = min(len(company_returns), len(market_returns))
            company_returns = company_returns[:min_len]
            market_returns = market_returns[:min_len]
            
            if min_len < 30:  # Need at least 30 data points for a meaningful regression
                return None
            
            # Calculate beta using covariance and variance
            mean_company = sum(company_returns) / len(company_returns)
            mean_market = sum(market_returns) / len(market_returns)
            
            covariance = sum((company_returns[i] - mean_company) * (market_returns[i] - mean_market) 
                            for i in range(min_len)) / min_len
            variance = sum((market_returns[i] - mean_market) ** 2 for i in range(min_len)) / min_len
            
            if variance == 0:
                return None
                
            beta = covariance / variance
            
            # Bound beta within reasonable limits
            from ..config import BETA_MIN, BETA_MAX
            beta = max(BETA_MIN, min(BETA_MAX, beta))
            
            return beta
        except Exception as e:
            print(f"Error calculating beta: {e}")
            return None
