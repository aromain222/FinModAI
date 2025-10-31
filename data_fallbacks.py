#!/usr/bin/env python3
"""
Data fallback mechanisms for financial data
Provides alternative data sources and graceful degradation
"""

import os
import json
import time
import random
import logging
import requests
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime, timedelta
import importlib.util
from functools import wraps

# Import our cache system
from data_cache import cache_get, cache_set, cache_delete

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("data_fallbacks")

# Constants
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:89.0) Gecko/20100101 Firefox/89.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (iPad; CPU OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Android 11; Mobile; rv:68.0) Gecko/68.0 Firefox/89.0',
]

# Check if AI data gathering is available
AI_DATA_GATHERING_AVAILABLE = importlib.util.find_spec("ai_enhanced_data_gatherer") is not None
AI_COST_OPTIMIZER_AVAILABLE = importlib.util.find_spec("ai_cost_optimizer") is not None

# Initialize AI components if available
if AI_DATA_GATHERING_AVAILABLE and AI_COST_OPTIMIZER_AVAILABLE:
    try:
        from ai_enhanced_data_gatherer import AIEnhancedDataGatherer
        from ai_cost_optimizer import ai_cost_optimizer
        ai_data_gatherer = AIEnhancedDataGatherer()
        logger.info("AI enhanced data gathering is available")
    except Exception as e:
        logger.warning(f"Failed to initialize AI data gathering: {e}")
        AI_DATA_GATHERING_AVAILABLE = False


def get_random_user_agent():
    """Get a random user agent to avoid blocking"""
    return random.choice(USER_AGENTS)


def exponential_backoff(max_retries=3, base_delay=1):
    """
    Decorator for exponential backoff retry logic
    
    Args:
        max_retries: Maximum number of retries
        base_delay: Base delay in seconds
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            retries = 0
            while retries <= max_retries:
                try:
                    return func(*args, **kwargs)
                except Exception as e:
                    retries += 1
                    if retries > max_retries:
                        logger.error(f"Max retries reached for {func.__name__}: {e}")
                        raise
                    
                    # Calculate delay with jitter
                    delay = base_delay * (2 ** (retries - 1)) + random.uniform(0, 0.5)
                    logger.warning(f"Retry {retries}/{max_retries} for {func.__name__} after {delay:.2f}s: {e}")
                    time.sleep(delay)
        return wrapper
    return decorator


class DataFallbackSystem:
    """
    System for handling fallbacks between different data sources
    Implements graceful degradation and alternative data providers
    """
    
    def __init__(self):
        """Initialize the fallback system"""
        self.data_quality = {}
        self.fallback_stats = {
            "primary_success": 0,
            "fallback_success": 0,
            "fmp_success": 0,
            "ai_fallback_success": 0,
            "total_failures": 0,
            "total_requests": 0
        }
    
    def get_alphavantage_timeseries(self, ticker, function='TIME_SERIES_DAILY', use_cache=True):
        """
        Enhanced Alpha Vantage time series data with fallbacks
        
        Args:
            ticker: Stock ticker symbol
            function: Alpha Vantage function (TIME_SERIES_DAILY, etc.)
            use_cache: Whether to use cache
            
        Returns:
            Time series data or None if all sources fail
        """
        cache_key = f"alphavantage_{function}_{ticker}"
        
        # Try cache first if enabled
        if use_cache:
            cached_data = cache_get(cache_key)
            if cached_data:
                logger.info(f"Using cached Alpha Vantage data for {ticker}")
                return cached_data
        
        self.fallback_stats["total_requests"] += 1
        
        # Try primary source (Alpha Vantage API)
        try:
            data = self._get_alphavantage_primary(ticker, function)
            if data and self._validate_alphavantage_data(data):
                logger.info(f"Successfully fetched Alpha Vantage data for {ticker}")
                if use_cache:
                    cache_set(cache_key, data, ttl=3600)  # Cache for 1 hour
                self.fallback_stats["primary_success"] += 1
                return data
        except Exception as e:
            logger.warning(f"Primary Alpha Vantage source failed for {ticker}: {e}")
        
        # Try alternative source (Yahoo Finance)
        try:
            data = self._get_yahoo_finance_fallback(ticker)
            if data:
                logger.info(f"Using Yahoo Finance fallback for {ticker}")
                if use_cache:
                    cache_set(cache_key, data, ttl=3600)  # Cache for 1 hour
                self.fallback_stats["fallback_success"] += 1
                return data
        except Exception as e:
            logger.warning(f"Yahoo Finance fallback failed for {ticker}: {e}")
        
        # Try Financial Modeling Prep
        try:
            data = self._get_fmp_fallback(ticker)
            if data:
                logger.info(f"Using FMP fallback for {ticker}")
                if use_cache:
                    cache_set(cache_key, data, ttl=3600)  # Cache for 1 hour
                self.fallback_stats["fmp_success"] += 1
                return data
        except Exception as e:
            logger.warning(f"FMP fallback failed for {ticker}: {e}")
        
        # Try AI-enhanced data gathering as last resort
        if AI_DATA_GATHERING_AVAILABLE:
            try:
                data = self._get_ai_enhanced_data(ticker)
                if data:
                    logger.info(f"Using AI-enhanced data for {ticker}")
                    if use_cache:
                        cache_set(cache_key, data, ttl=7200)  # Cache for 2 hours
                    self.fallback_stats["ai_fallback_success"] += 1
                    return data
            except Exception as e:
                logger.warning(f"AI-enhanced data gathering failed for {ticker}: {e}")
        
        # All sources failed
        self.fallback_stats["total_failures"] += 1
        return None
    
    @exponential_backoff(max_retries=2)
    def _get_alphavantage_primary(self, ticker, function):
        """Get data from Alpha Vantage API"""
        api_key = os.getenv('ALPHAVANTAGE_API_KEY')
        if not api_key:
            raise ValueError("ALPHAVANTAGE_API_KEY environment variable not set")
            
        url = 'https://www.alphavantage.co/query'
        params = {
            'function': function,
            'symbol': ticker,
            'outputsize': 'compact',  # Last 100 data points
            'apikey': api_key
        }
        
        headers = {'User-Agent': get_random_user_agent()}
        response = requests.get(url, params=params, headers=headers, timeout=10)
        
        if response.status_code != 200:
            raise ValueError(f"Alpha Vantage API returned status code {response.status_code}")
        
        data = response.json()
        
        # Check for API limit or errors
        if 'Note' in data:
            err = ValueError(f"Alpha Vantage API limit reached: {data['Note']}")
            _record_error(err)
            raise err
        if 'Error Message' in data:
            raise ValueError(f"Alpha Vantage API error: {data['Error Message']}")
            
        return data
    
    def _validate_alphavantage_data(self, data):
        """Validate Alpha Vantage data"""
        if not data:
            return False
        
        # Check for time series data
        if 'Time Series (Daily)' not in data:
            return False
        
        # Check if we have at least one data point
        time_series = data['Time Series (Daily)']
        if not time_series or len(time_series) == 0:
            return False
            
        return True
    
    @exponential_backoff(max_retries=2)
    def _get_yahoo_finance_fallback(self, ticker):
        """Get data from Yahoo Finance as a fallback"""
        try:
            import yfinance as yf
        except ImportError:
            logger.error("yfinance package not installed, cannot use Yahoo Finance fallback")
            raise
        
        # Get data from Yahoo Finance
        stock = yf.Ticker(ticker)
        hist = stock.history(period="1mo")
        
        if hist.empty:
            raise ValueError(f"No Yahoo Finance data available for {ticker}")
        
        # Convert to Alpha Vantage format for compatibility
        time_series = {}
        for date, row in hist.iterrows():
            date_str = date.strftime('%Y-%m-%d')
            time_series[date_str] = {
                "1. open": str(row['Open']),
                "2. high": str(row['High']),
                "3. low": str(row['Low']),
                "4. close": str(row['Close']),
                "5. volume": str(row['Volume'])
            }
        
        # Create Alpha Vantage compatible structure
        data = {
            "Meta Data": {
                "1. Information": "Daily Time Series from Yahoo Finance (fallback)",
                "2. Symbol": ticker,
                "3. Last Refreshed": datetime.now().strftime('%Y-%m-%d'),
                "4. Output Size": "Compact",
                "5. Time Zone": "US/Eastern"
            },
            "Time Series (Daily)": time_series
        }
        
        return data
    
    @exponential_backoff(max_retries=2)
    def _get_fmp_fallback(self, ticker):
        """Get data from Financial Modeling Prep as a fallback"""
        try:
            from financial_data.providers.fmp_provider import get_fmp_provider
        except ImportError:
            raise ValueError("FMP provider not installed")
        
        fmp = get_fmp_provider()
        if not fmp:
            raise ValueError("FMP provider not available (check API key)")
        
        # Get historical metrics
        metrics = fmp.get_historical_metrics(ticker, years=5)
        
        if not metrics or not metrics.get('fcf'):
            raise ValueError(f"No FMP data available for {ticker}")
        
        # Convert FMP data to Alpha Vantage-compatible format
        # Use the most recent FCF as a proxy for "close" price movements
        time_series = {}
        
        for i, date_str in enumerate(metrics.get('dates', [])):
            if i < len(metrics['fcf']):
                fcf = metrics['fcf'][i]
                # Normalize FCF to a "price-like" number for compatibility
                time_series[date_str] = {
                    "1. open": str(fcf),
                    "2. high": str(fcf),
                    "3. low": str(fcf),
                    "4. close": str(fcf),
                    "5. volume": "0"
                }
        
        data = {
            "Meta Data": {
                "1. Information": "Time Series from Financial Modeling Prep (fallback)",
                "2. Symbol": ticker,
                "3. Last Refreshed": datetime.now().strftime('%Y-%m-%d'),
                "4. Output Size": "Compact",
                "5. Time Zone": "US/Eastern"
            },
            "Time Series (Daily)": time_series
        }
        
        return data
    
    def _get_ai_enhanced_data(self, ticker):
        """Get data using AI-enhanced data gathering"""
        if not AI_DATA_GATHERING_AVAILABLE:
            raise ValueError("AI enhanced data gathering not available")
        
        # Check if we should use AI (cost optimization)
        if not ai_cost_optimizer.should_use_ai():
            raise ValueError("AI usage restricted by cost optimizer")
        
        # Use asyncio to run the async AI data gathering
        import asyncio
        
        # Get company data from AI
        company_data = asyncio.run(ai_data_gatherer.gather_company_data(ticker))
        
        # Check if we have price history
        if not company_data or 'price_history' not in company_data:
            raise ValueError(f"No AI-enhanced price history available for {ticker}")
        
        # Convert to Alpha Vantage format
        price_history = company_data['price_history']
        time_series = {}
        
        for entry in price_history:
            if 'date' in entry and 'close' in entry:
                date_str = entry['date']
                time_series[date_str] = {
                    "1. open": str(entry.get('open', entry['close'])),
                    "2. high": str(entry.get('high', entry['close'])),
                    "3. low": str(entry.get('low', entry['close'])),
                    "4. close": str(entry['close']),
                    "5. volume": str(entry.get('volume', 0))
                }
        
        # Create Alpha Vantage compatible structure
        data = {
            "Meta Data": {
                "1. Information": "Daily Time Series from AI Enhanced Data (fallback)",
                "2. Symbol": ticker,
                "3. Last Refreshed": datetime.now().strftime('%Y-%m-%d'),
                "4. Output Size": "Compact",
                "5. Time Zone": "US/Eastern"
            },
            "Time Series (Daily)": time_series
        }
        
        # Track AI usage
        ai_cost_optimizer.track_query(was_cached=False)
        
        return data
    
    def get_sector_performance(self, sectors, range_param='1D'):
        """
        Get sector performance data with fallbacks
        
        Args:
            sectors: List of sector names
            range_param: Time range ('1D', '1W', '1M')
            
        Returns:
            Sector performance data or None if all sources fail
        """
        cache_key = f"sector_performance_{range_param}"
        
        # Try cache first
        cached_data = cache_get(cache_key)
        if cached_data:
            logger.info(f"Using cached sector performance data for {range_param}")
            return cached_data
        
        self.fallback_stats["total_requests"] += 1
        
        # Try primary source (Alpha Vantage)
        try:
            data = self._get_sector_performance_primary(sectors, range_param)
            if data:
                logger.info(f"Successfully fetched sector performance data for {range_param}")
                cache_set(cache_key, data, ttl=3600)  # Cache for 1 hour
                self.fallback_stats["primary_success"] += 1
                return data
        except Exception as e:
            logger.warning(f"Primary sector performance source failed: {e}")
        
        # Try alternative source (Yahoo Finance)
        try:
            data = self._get_sector_performance_yahoo(sectors, range_param)
            if data:
                logger.info(f"Using Yahoo Finance fallback for sector performance")
                cache_set(cache_key, data, ttl=3600)  # Cache for 1 hour
                self.fallback_stats["fallback_success"] += 1
                return data
        except Exception as e:
            logger.warning(f"Yahoo Finance sector performance fallback failed: {e}")
        
        # Try AI-enhanced data gathering as last resort
        if AI_DATA_GATHERING_AVAILABLE:
            try:
                data = self._get_sector_performance_ai(sectors, range_param)
                if data:
                    logger.info(f"Using AI-enhanced sector performance data")
                    cache_set(cache_key, data, ttl=7200)  # Cache for 2 hours
                    self.fallback_stats["ai_fallback_success"] += 1
                    return data
            except Exception as e:
                logger.warning(f"AI-enhanced sector performance data failed: {e}")
        
        # All sources failed, generate deterministic mock data
        logger.warning("All sector performance sources failed, using deterministic mock data")
        data = self._generate_mock_sector_data(sectors, range_param)
        cache_set(cache_key, data, ttl=1800)  # Cache for 30 minutes
        self.fallback_stats["total_failures"] += 1
        return data
    
    def _get_sector_performance_primary(self, sectors, range_param):
        """Get sector performance from primary source"""
        # Map sectors to representative stocks
        sector_stocks = {
            'Information Technology': ['AAPL', 'MSFT', 'NVDA'],
            'Health Care': ['JNJ', 'UNH', 'PFE'],
            'Financials': ['JPM', 'BAC', 'WFC'],
            'Consumer Discretionary': ['AMZN', 'HD', 'MCD'],
            'Communication Services': ['GOOGL', 'META', 'NFLX'],
            'Industrials': ['HON', 'UPS', 'CAT'],
            'Consumer Staples': ['PG', 'KO', 'PEP'],
            'Energy': ['XOM', 'CVX', 'COP'],
            'Utilities': ['NEE', 'DUK', 'SO'],
            'Real Estate': ['AMT', 'PLD', 'CCI'],
            'Materials': ['LIN', 'APD', 'ECL']
        }
        
        sector_performance = []
        
        for sector in sectors:
            sector_changes = []
            stocks = sector_stocks.get(sector, [])
            
            # Get performance for each stock in the sector
            for stock in stocks[:2]:  # Limit to 2 stocks per sector
                try:
                    timeseries_data = self._get_alphavantage_primary(stock, 'TIME_SERIES_DAILY')
                    if timeseries_data and 'Time Series (Daily)' in timeseries_data:
                        time_series = timeseries_data['Time Series (Daily)']
                        dates = sorted(time_series.keys(), reverse=True)
                        
                        if len(dates) >= 2:
                            current_close = float(time_series[dates[0]]['4. close'])
                            prev_close = float(time_series[dates[1]]['4. close'])
                            change_pct = ((current_close - prev_close) / prev_close) * 100
                            sector_changes.append(change_pct)
                except Exception as e:
                    logger.warning(f"Error getting Alpha Vantage data for {stock}: {e}")
                    continue
            
            # Calculate sector average performance
            if sector_changes:
                avg_change = sum(sector_changes) / len(sector_changes)
                sector_performance.append({
                    "sector": sector,
                    "change1dPct": round(avg_change, 2)
                })
        
        if not sector_performance:
            raise ValueError("No sector performance data available")
        
        return {
            "as_of": datetime.now().isoformat() + "Z",
            "range": range_param,
            "points": sector_performance,
            "stale": False,
            "source": "alphavantage_timeseries"
        }
    
    def _get_sector_performance_yahoo(self, sectors, range_param):
        """Get sector performance from Yahoo Finance"""
        try:
            import yfinance as yf
        except ImportError:
            raise ValueError("yfinance package not installed")
        
        # Map sectors to ETFs
        sector_etfs = {
            'Information Technology': 'XLK',
            'Health Care': 'XLV',
            'Financials': 'XLF',
            'Consumer Discretionary': 'XLY',
            'Communication Services': 'XLC',
            'Industrials': 'XLI',
            'Consumer Staples': 'XLP',
            'Energy': 'XLE',
            'Utilities': 'XLU',
            'Real Estate': 'XLRE',
            'Materials': 'XLB'
        }
        
        # Determine period based on range_param
        if range_param == '1D':
            period = "2d"
            interval = "1d"
        elif range_param == '1W':
            period = "1wk"
            interval = "1d"
        elif range_param == '1M':
            period = "1mo"
            interval = "1d"
        else:
            period = "2d"
            interval = "1d"
        
        sector_performance = []
        
        for sector in sectors:
            etf = sector_etfs.get(sector)
            if not etf:
                continue
                
            try:
                data = yf.download(etf, period=period, interval=interval, progress=False)
                if not data.empty and len(data) >= 2:
                    current_close = data['Close'].iloc[-1]
                    prev_close = data['Close'].iloc[-2]
                    change_pct = ((current_close - prev_close) / prev_close) * 100
                    
                    sector_performance.append({
                        "sector": sector,
                        "change1dPct": round(change_pct, 2)
                    })
            except Exception as e:
                logger.warning(f"Error getting Yahoo Finance data for {etf}: {e}")
                continue
        
        if not sector_performance:
            raise ValueError("No sector performance data available from Yahoo Finance")
        
        return {
            "as_of": datetime.now().isoformat() + "Z",
            "range": range_param,
            "points": sector_performance,
            "stale": False,
            "source": "yahoo_finance"
        }
    
    def _get_sector_performance_ai(self, sectors, range_param):
        """Get sector performance using AI-enhanced data gathering"""
        if not AI_DATA_GATHERING_AVAILABLE:
            raise ValueError("AI enhanced data gathering not available")
        
        # Check if we should use AI (cost optimization)
        if not ai_cost_optimizer.should_use_ai():
            raise ValueError("AI usage restricted by cost optimizer")
        
        # Use asyncio to run the async AI data gathering
        import asyncio
        
        # Prepare query for AI
        query = f"""
        Get the current performance data for the following market sectors over the {range_param} time period:
        {', '.join(sectors)}
        
        For each sector, provide:
        1. The sector name
        2. The percentage change over the specified period
        
        Format the response as a structured JSON object with an array of sector data points.
        """
        
        # Run AI query
        async def run_ai_query():
            await ai_data_gatherer._initialize()
            response = await ai_data_gatherer.agent.run(query)
            return response
        
        response = asyncio.run(run_ai_query())
        
        # Extract structured data from response
        output = getattr(response, "output", None)
        
        # Try to parse JSON from the response
        try:
            if isinstance(output, str):
                # Look for JSON in the response
                if '{' in output and '}' in output:
                    # Extract JSON portion
                    start = output.find('{')
                    end = output.rfind('}') + 1
                    json_str = output[start:end]
                    data = json.loads(json_str)
                    
                    # Extract sector performance data
                    sector_performance = []
                    for item in data.get('sectors', []):
                        if 'name' in item and 'change' in item:
                            sector_name = item['name']
                            # Find matching sector in our list
                            matching_sector = next((s for s in sectors if s.lower() in sector_name.lower()), None)
                            if matching_sector:
                                sector_performance.append({
                                    "sector": matching_sector,
                                    "change1dPct": round(float(item['change']), 2)
                                })
                    
                    if not sector_performance:
                        raise ValueError("No valid sector performance data in AI response")
                    
                    # Track AI usage
                    ai_cost_optimizer.track_query(was_cached=False)
                    
                    return {
                        "as_of": datetime.now().isoformat() + "Z",
                        "range": range_param,
                        "points": sector_performance,
                        "stale": False,
                        "source": "ai_enhanced"
                    }
        except Exception as e:
            logger.error(f"Failed to parse AI response: {e}")
            raise ValueError("Failed to parse AI response")
        
        raise ValueError("No valid sector performance data in AI response")
    
    def _generate_mock_sector_data(self, sectors, range_param):
        """Generate deterministic mock data for sectors"""
        sector_performance = []
        
        for sector in sectors:
            # Generate deterministic but seemingly random value based on sector name and range
            # This ensures the same sector+range always gives the same value
            base_change = (hash(sector + range_param) % 200 - 100) / 100.0
            change_pct = round(base_change * 2.5, 2)
            
            sector_performance.append({
                "sector": sector,
                "change1dPct": change_pct
            })
        
        return {
            "as_of": datetime.now().isoformat() + "Z",
            "range": range_param,
            "points": sector_performance,
            "stale": True,  # Mark as stale since this is mock data
            "source": "mock_data"
        }
    
    def get_stats(self):
        """Get fallback system statistics"""
        stats = self.fallback_stats.copy()
        
        # Calculate success rates
        total = stats["total_requests"]
        if total > 0:
            stats["primary_success_rate"] = round(stats["primary_success"] / total * 100, 2)
            stats["fallback_success_rate"] = round(stats["fallback_success"] / total * 100, 2)
            stats["ai_fallback_success_rate"] = round(stats["ai_fallback_success"] / total * 100, 2)
            stats["total_failure_rate"] = round(stats["total_failures"] / total * 100, 2)
        
        return stats


# Create global fallback system instance
fallback_system = DataFallbackSystem()

# Store last exception for diagnostics
last_error: Optional[str] = None

def _record_error(err: Exception):
    global last_error
    last_error = f"{datetime.utcnow().isoformat()}Z | {str(err)}"

def get_last_error() -> Optional[str]:
    """Return the last recorded fallback error, if any."""
    return last_error

# Convenience functions
def get_alphavantage_with_fallback(ticker, function='TIME_SERIES_DAILY', use_cache=True):
    """Get Alpha Vantage data with fallbacks"""
    return fallback_system.get_alphavantage_timeseries(ticker, function, use_cache)

def get_sector_performance_with_fallback(sectors, range_param='1D'):
    """Get sector performance with fallbacks"""
    return fallback_system.get_sector_performance(sectors, range_param)

def get_fallback_stats():
    """Get fallback system statistics"""
    return fallback_system.get_stats()


if __name__ == "__main__":
    # Simple test
    print("Testing fallback system...")
    
    # Test Alpha Vantage with fallback
    ticker = "AAPL"
    print(f"Getting data for {ticker}...")
    data = get_alphavantage_with_fallback(ticker)
    if data:
        print(f"Successfully got data for {ticker}")
        print(f"Source: {data.get('Meta Data', {}).get('1. Information', 'Unknown')}")
        time_series = data.get('Time Series (Daily)', {})
        dates = sorted(time_series.keys(), reverse=True)
        if dates:
            print(f"Latest date: {dates[0]}")
            print(f"Latest close: {time_series[dates[0]].get('4. close')}")
    else:
        print(f"Failed to get data for {ticker}")
    
    # Test sector performance
    sectors = ['Information Technology', 'Health Care', 'Financials']
    print("\nGetting sector performance...")
    performance = get_sector_performance_with_fallback(sectors)
    if performance:
        print(f"Successfully got sector performance")
        print(f"Source: {performance.get('source', 'Unknown')}")
        print(f"Stale: {performance.get('stale', True)}")
        for point in performance.get('points', []):
            print(f"{point.get('sector')}: {point.get('change1dPct')}%")
    else:
        print("Failed to get sector performance")
    
    # Print stats
    print("\nFallback system stats:")
    stats = get_fallback_stats()
    for key, value in stats.items():
        print(f"{key}: {value}")
