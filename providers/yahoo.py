"""
Yahoo Finance provider for quotes, charts, and some metadata.
No API key required - uses public Yahoo Finance data.
"""
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
import asyncio
from .base import BaseProvider, ProviderResult, BatchProvider


class YahooProvider(BatchProvider):
    """Yahoo Finance provider for market data."""
    
    def __init__(self):
        super().__init__("yahoo")
        self.base_url = "https://query1.finance.yahoo.com/v8/finance/chart"
        self.quote_url = "https://query1.finance.yahoo.com/v10/finance/quoteSummary"
        
    async def get_fundamentals(self, ticker: str) -> ProviderResult:
        """Yahoo provides limited fundamental data."""
        ticker = self._normalize_ticker(ticker)
        
        # Yahoo's quote summary provides some fundamental metrics
        url = f"{self.quote_url}/{ticker}"
        params = {
            "modules": "defaultKeyStatistics,financialData,summaryDetail"
        }
        
        result = await self._make_request("GET", url, params=params)
        if not result.success:
            return result
        
        try:
            parsed_data = self._parse_yahoo_fundamentals(result.data, ticker)
            return ProviderResult(
                success=True,
                data=parsed_data,
                as_of=datetime.utcnow(),
                provider=self.name
            )
        except Exception as e:
            self.logger.error(f"Failed to parse Yahoo fundamentals for {ticker}: {e}")
            return ProviderResult(
                success=False,
                error=f"Failed to parse Yahoo fundamentals: {str(e)}",
                provider=self.name
            )
    
    async def get_quote(self, ticker: str) -> ProviderResult:
        """Get current quote data from Yahoo."""
        ticker = self._normalize_ticker(ticker)
        
        url = f"{self.base_url}/{ticker}"
        params = {
            "interval": "1d",
            "range": "1d",
            "includePrePost": "true",
            "events": "div,split"
        }
        
        result = await self._make_request("GET", url, params=params)
        if not result.success:
            return result
        
        try:
            parsed_data = self._parse_yahoo_quote(result.data, ticker)
            return ProviderResult(
                success=True,
                data=parsed_data,
                as_of=datetime.utcnow(),
                provider=self.name
            )
        except Exception as e:
            self.logger.error(f"Failed to parse Yahoo quote for {ticker}: {e}")
            return ProviderResult(
                success=False,
                error=f"Failed to parse Yahoo quote: {str(e)}",
                provider=self.name
            )
    
    async def get_quotes_batch(self, tickers: List[str]) -> Dict[str, ProviderResult]:
        """Get quotes for multiple tickers."""
        results = {}
        
        # Yahoo doesn't have a true batch endpoint, so we'll make concurrent requests
        # with rate limiting to avoid being blocked
        semaphore = asyncio.Semaphore(10)  # Limit concurrent requests
        
        async def fetch_quote(ticker):
            async with semaphore:
                return await self.get_quote(ticker)
        
        tasks = [fetch_quote(ticker) for ticker in tickers]
        quote_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for ticker, result in zip(tickers, quote_results):
            if isinstance(result, Exception):
                results[ticker] = ProviderResult(
                    success=False,
                    error=str(result),
                    provider=self.name
                )
            else:
                results[ticker] = result
        
        return results
    
    async def get_chart(self, ticker: str, period: str = "1mo") -> ProviderResult:
        """Get historical price chart data for sparklines."""
        ticker = self._normalize_ticker(ticker)
        
        # Map period to Yahoo's range format
        period_map = {
            "1d": "1d",
            "5d": "5d", 
            "1mo": "1mo",
            "3mo": "3mo",
            "6mo": "6mo",
            "1y": "1y",
            "2y": "2y",
            "5y": "5y",
            "10y": "10y",
            "ytd": "ytd",
            "max": "max"
        }
        
        range_param = period_map.get(period, "1mo")
        
        url = f"{self.base_url}/{ticker}"
        params = {
            "interval": "1d",
            "range": range_param,
            "includePrePost": "false",
            "events": "div,split"
        }
        
        result = await self._make_request("GET", url, params=params)
        if not result.success:
            return result
        
        try:
            parsed_data = self._parse_yahoo_chart(result.data, ticker)
            return ProviderResult(
                success=True,
                data=parsed_data,
                as_of=datetime.utcnow(),
                provider=self.name
            )
        except Exception as e:
            self.logger.error(f"Failed to parse Yahoo chart for {ticker}: {e}")
            return ProviderResult(
                success=False,
                error=f"Failed to parse Yahoo chart: {str(e)}",
                provider=self.name
            )
    
    async def get_metadata(self, ticker: str) -> ProviderResult:
        """Get company metadata from Yahoo."""
        ticker = self._normalize_ticker(ticker)
        
        url = f"{self.quote_url}/{ticker}"
        params = {
            "modules": "assetProfile,summaryProfile"
        }
        
        result = await self._make_request("GET", url, params=params)
        if not result.success:
            return result
        
        try:
            parsed_data = self._parse_yahoo_metadata(result.data, ticker)
            return ProviderResult(
                success=True,
                data=parsed_data,
                as_of=datetime.utcnow(),
                provider=self.name
            )
        except Exception as e:
            self.logger.error(f"Failed to parse Yahoo metadata for {ticker}: {e}")
            return ProviderResult(
                success=False,
                error=f"Failed to parse Yahoo metadata: {str(e)}",
                provider=self.name
            )
    
    async def get_metadata_batch(self, tickers: List[str]) -> Dict[str, ProviderResult]:
        """Get metadata for multiple tickers."""
        results = {}
        
        # Similar to quotes_batch, make concurrent requests with rate limiting
        semaphore = asyncio.Semaphore(10)
        
        async def fetch_metadata(ticker):
            async with semaphore:
                return await self.get_metadata(ticker)
        
        tasks = [fetch_metadata(ticker) for ticker in tickers]
        metadata_results = await asyncio.gather(*tasks, return_exceptions=True)
        
        for ticker, result in zip(tickers, metadata_results):
            if isinstance(result, Exception):
                results[ticker] = ProviderResult(
                    success=False,
                    error=str(result),
                    provider=self.name
                )
            else:
                results[ticker] = result
        
        return results
    
    def _parse_yahoo_fundamentals(self, data: Dict, ticker: str) -> Dict[str, Any]:
        """Parse Yahoo fundamentals data."""
        if not data or "quoteSummary" not in data:
            raise ValueError("Invalid Yahoo fundamentals data structure")
        
        quote_summary = data["quoteSummary"]
        if not quote_summary or "result" not in quote_summary or not quote_summary["result"]:
            raise ValueError("No results in Yahoo fundamentals data")
        
        result = quote_summary["result"][0]
        
        # Extract key financial metrics
        financial_data = result.get("financialData", {})
        summary_detail = result.get("summaryDetail", {})
        default_key_stats = result.get("defaultKeyStatistics", {})
        
        fundamentals = {
            "ticker": ticker,
            "revenue_ttm": financial_data.get("totalRevenue", {}).get("raw"),
            "ebitda_ttm": financial_data.get("ebitda", {}).get("raw"),
            "net_income_ttm": financial_data.get("netIncomeToCommon", {}).get("raw"),
            "cash": financial_data.get("totalCash", {}).get("raw"),
            "total_debt": financial_data.get("totalDebt", {}).get("raw"),
            "shares_out": default_key_stats.get("sharesOutstanding", {}).get("raw"),
            "market_cap": default_key_stats.get("marketCap", {}).get("raw"),
            "pe_ratio": default_key_stats.get("trailingPE", {}).get("raw"),
            "ev_to_ebitda": default_key_stats.get("enterpriseToEbitda", {}).get("raw"),
            "ev_to_revenue": default_key_stats.get("enterpriseToRevenue", {}).get("raw"),
            "beta": default_key_stats.get("beta", {}).get("raw"),
            "dividend_yield": summary_detail.get("dividendYield", {}).get("raw"),
            "source": "yahoo",
            "as_of": datetime.utcnow().isoformat()
        }
        
        return fundamentals
    
    def _parse_yahoo_quote(self, data: Dict, ticker: str) -> Dict[str, Any]:
        """Parse Yahoo quote data."""
        if not data or "chart" not in data:
            raise ValueError("Invalid Yahoo quote data structure")
        
        chart = data["chart"]
        if not chart or "result" not in chart or not chart["result"]:
            raise ValueError("No results in Yahoo quote data")
        
        result = chart["result"][0]
        meta = result.get("meta", {})
        
        quote = {
            "ticker": ticker,
            "price": meta.get("regularMarketPrice"),
            "previous_close": meta.get("previousClose"),
            "change": meta.get("regularMarketChange"),
            "change_percent": meta.get("regularMarketChangePercent"),
            "volume": meta.get("regularMarketVolume"),
            "market_cap": meta.get("marketCap"),
            "currency": meta.get("currency", "USD"),
            "timezone": meta.get("exchangeTimezoneName"),
            "exchange": meta.get("exchangeName"),
            "source": "yahoo",
            "as_of": datetime.utcnow().isoformat()
        }
        
        return quote
    
    def _parse_yahoo_chart(self, data: Dict, ticker: str) -> Dict[str, Any]:
        """Parse Yahoo chart data for sparklines."""
        if not data or "chart" not in data:
            raise ValueError("Invalid Yahoo chart data structure")
        
        chart = data["chart"]
        if not chart or "result" not in chart or not chart["result"]:
            raise ValueError("No results in Yahoo chart data")
        
        result = chart["result"][0]
        
        # Extract timestamps and prices
        timestamps = result.get("timestamp", [])
        prices = result.get("indicators", {}).get("quote", [{}])[0].get("close", [])
        
        # Create sparkline data (normalized to 0-1 range)
        sparkline_data = []
        if prices and timestamps:
            valid_prices = [p for p in prices if p is not None]
            if valid_prices:
                min_price = min(valid_prices)
                max_price = max(valid_prices)
                price_range = max_price - min_price
                
                if price_range > 0:
                    sparkline_data = [(p - min_price) / price_range for p in valid_prices if p is not None]
        
        return {
            "ticker": ticker,
            "sparkline": sparkline_data,
            "period": len(sparkline_data),
            "source": "yahoo",
            "as_of": datetime.utcnow().isoformat()
        }
    
    def _parse_yahoo_metadata(self, data: Dict, ticker: str) -> Dict[str, Any]:
        """Parse Yahoo metadata."""
        if not data or "quoteSummary" not in data:
            raise ValueError("Invalid Yahoo metadata structure")
        
        quote_summary = data["quoteSummary"]
        if not quote_summary or "result" not in quote_summary or not quote_summary["result"]:
            raise ValueError("No results in Yahoo metadata")
        
        result = quote_summary["result"][0]
        asset_profile = result.get("assetProfile", {})
        summary_profile = result.get("summaryProfile", {})
        
        metadata = {
            "ticker": ticker,
            "name": summary_profile.get("longName") or asset_profile.get("longName"),
            "sector": summary_profile.get("sector"),
            "industry": summary_profile.get("industry"),
            "description": summary_profile.get("longBusinessSummary"),
            "country": summary_profile.get("country"),
            "website": asset_profile.get("website"),
            "employees": asset_profile.get("fullTimeEmployees"),
            "source": "yahoo",
            "as_of": datetime.utcnow().isoformat()
        }
        
        return metadata
