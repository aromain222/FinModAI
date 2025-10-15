"""
Finnhub provider for comprehensive financial data.
Requires FINNHUB_API_KEY environment variable.
"""
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from .base import BaseProvider, ProviderResult, BatchProvider


class FinnhubProvider(BatchProvider):
    """Finnhub provider for financial data."""
    
    def __init__(self):
        super().__init__("finnhub")
        self.base_url = "https://finnhub.io/api/v1"
        self.api_key = self.config.get("api_key")
        
        if not self.api_key:
            self.logger.warning("Finnhub API key not provided - provider will be disabled")
    
    def _get_auth_headers(self) -> Dict[str, str]:
        """Finnhub uses query parameter authentication."""
        return {}
    
    async def get_fundamentals(self, ticker: str) -> ProviderResult:
        """Get fundamental financial data from Finnhub."""
        if not self.api_key:
            return ProviderResult(
                success=False,
                error="Finnhub API key not configured",
                provider=self.name
            )
        
        ticker = self._normalize_ticker(ticker)
        
        # Get company profile and financials
        profile_result = await self._get_company_profile(ticker)
        financials_result = await self._get_financials(ticker)
        
        if not profile_result.success and not financials_result.success:
            return ProviderResult(
                success=False,
                error="Failed to fetch both profile and financials",
                provider=self.name
            )
        
        try:
            parsed_data = self._parse_finnhub_fundamentals(
                profile_result.data, 
                financials_result.data if financials_result.success else None,
                ticker
            )
            return ProviderResult(
                success=True,
                data=parsed_data,
                as_of=datetime.utcnow(),
                provider=self.name
            )
        except Exception as e:
            self.logger.error(f"Failed to parse Finnhub fundamentals for {ticker}: {e}")
            return ProviderResult(
                success=False,
                error=f"Failed to parse Finnhub fundamentals: {str(e)}",
                provider=self.name
            )
    
    async def get_quote(self, ticker: str) -> ProviderResult:
        """Get current quote from Finnhub."""
        if not self.api_key:
            return ProviderResult(
                success=False,
                error="Finnhub API key not configured",
                provider=self.name
            )
        
        ticker = self._normalize_ticker(ticker)
        url = f"{self.base_url}/quote"
        params = {
            "symbol": ticker,
            "token": self.api_key
        }
        
        result = await self._make_request("GET", url, params=params)
        if not result.success:
            return result
        
        try:
            parsed_data = self._parse_finnhub_quote(result.data, ticker)
            return ProviderResult(
                success=True,
                data=parsed_data,
                as_of=datetime.utcnow(),
                provider=self.name
            )
        except Exception as e:
            self.logger.error(f"Failed to parse Finnhub quote for {ticker}: {e}")
            return ProviderResult(
                success=False,
                error=f"Failed to parse Finnhub quote: {str(e)}",
                provider=self.name
            )
    
    async def get_quotes_batch(self, tickers: List[str]) -> Dict[str, ProviderResult]:
        """Finnhub doesn't support true batch quotes, so make concurrent requests."""
        if not self.api_key:
            return {ticker: ProviderResult(
                success=False,
                error="Finnhub API key not configured",
                provider=self.name
            ) for ticker in tickers}
        
        results = {}
        
        # Make concurrent requests with rate limiting
        import asyncio
        semaphore = asyncio.Semaphore(5)  # Conservative rate limiting
        
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
        """Get historical price data from Finnhub."""
        if not self.api_key:
            return ProviderResult(
                success=False,
                error="Finnhub API key not configured",
                provider=self.name
            )
        
        ticker = self._normalize_ticker(ticker)
        
        # Map period to Finnhub's resolution and count
        period_map = {
            "1d": ("1", 1),
            "5d": ("1", 5),
            "1mo": ("D", 30),
            "3mo": ("D", 90),
            "6mo": ("D", 180),
            "1y": ("D", 365),
            "2y": ("W", 104),
            "5y": ("M", 60)
        }
        
        resolution, count = period_map.get(period, ("D", 30))
        
        url = f"{self.base_url}/stock/candle"
        params = {
            "symbol": ticker,
            "resolution": resolution,
            "from": int((datetime.utcnow() - timedelta(days=count)).timestamp()),
            "to": int(datetime.utcnow().timestamp()),
            "token": self.api_key
        }
        
        result = await self._make_request("GET", url, params=params)
        if not result.success:
            return result
        
        try:
            parsed_data = self._parse_finnhub_chart(result.data, ticker)
            return ProviderResult(
                success=True,
                data=parsed_data,
                as_of=datetime.utcnow(),
                provider=self.name
            )
        except Exception as e:
            self.logger.error(f"Failed to parse Finnhub chart for {ticker}: {e}")
            return ProviderResult(
                success=False,
                error=f"Failed to parse Finnhub chart: {str(e)}",
                provider=self.name
            )
    
    async def get_metadata(self, ticker: str) -> ProviderResult:
        """Get company metadata from Finnhub."""
        if not self.api_key:
            return ProviderResult(
                success=False,
                error="Finnhub API key not configured",
                provider=self.name
            )
        
        ticker = self._normalize_ticker(ticker)
        result = await self._get_company_profile(ticker)
        
        if not result.success:
            return result
        
        try:
            parsed_data = self._parse_finnhub_metadata(result.data, ticker)
            return ProviderResult(
                success=True,
                data=parsed_data,
                as_of=datetime.utcnow(),
                provider=self.name
            )
        except Exception as e:
            self.logger.error(f"Failed to parse Finnhub metadata for {ticker}: {e}")
            return ProviderResult(
                success=False,
                error=f"Failed to parse Finnhub metadata: {str(e)}",
                provider=self.name
            )
    
    async def get_metadata_batch(self, tickers: List[str]) -> Dict[str, ProviderResult]:
        """Get metadata for multiple tickers."""
        if not self.api_key:
            return {ticker: ProviderResult(
                success=False,
                error="Finnhub API key not configured",
                provider=self.name
            ) for ticker in tickers}
        
        results = {}
        
        import asyncio
        semaphore = asyncio.Semaphore(5)
        
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
    
    async def _get_company_profile(self, ticker: str) -> ProviderResult:
        """Get company profile from Finnhub."""
        url = f"{self.base_url}/stock/profile2"
        params = {
            "symbol": ticker,
            "token": self.api_key
        }
        
        return await self._make_request("GET", url, params=params)
    
    async def _get_financials(self, ticker: str) -> ProviderResult:
        """Get financial statements from Finnhub."""
        url = f"{self.base_url}/stock/financials-reported"
        params = {
            "symbol": ticker,
            "token": self.api_key
        }
        
        return await self._make_request("GET", url, params=params)
    
    def _parse_finnhub_fundamentals(self, profile_data: Optional[Dict], financials_data: Optional[Dict], ticker: str) -> Dict[str, Any]:
        """Parse Finnhub fundamentals data."""
        fundamentals = {
            "ticker": ticker,
            "source": "finnhub",
            "as_of": datetime.utcnow().isoformat()
        }
        
        # Parse profile data
        if profile_data:
            fundamentals.update({
                "name": profile_data.get("name"),
                "country": profile_data.get("country"),
                "industry": profile_data.get("finnhubIndustry"),
                "web_url": profile_data.get("weburl"),
                "market_cap": profile_data.get("marketCapitalization"),
                "shares_out": profile_data.get("shareOutstanding"),
            })
        
        # Parse financials data
        if financials_data and "data" in financials_data:
            financials = financials_data["data"]
            if financials:
                # Get most recent financial data
                latest = financials[0]
                report = latest.get("report", {})
                
                fundamentals.update({
                    "revenue_ttm": report.get("revenue"),
                    "net_income_ttm": report.get("netIncome"),
                    "total_assets": report.get("totalAssets"),
                    "total_liabilities": report.get("totalLiabilities"),
                    "total_equity": report.get("totalEquity"),
                    "cash": report.get("cashAndCashEquivalents"),
                    "total_debt": report.get("totalDebt"),
                })
        
        return fundamentals
    
    def _parse_finnhub_quote(self, data: Dict, ticker: str) -> Dict[str, Any]:
        """Parse Finnhub quote data."""
        return {
            "ticker": ticker,
            "price": data.get("c"),  # Current price
            "change": data.get("d"),  # Change
            "change_percent": data.get("dp"),  # Change percent
            "high": data.get("h"),  # High price
            "low": data.get("l"),  # Low price
            "open": data.get("o"),  # Open price
            "previous_close": data.get("pc"),  # Previous close
            "volume": data.get("v"),  # Volume
            "source": "finnhub",
            "as_of": datetime.utcnow().isoformat()
        }
    
    def _parse_finnhub_chart(self, data: Dict, ticker: str) -> Dict[str, Any]:
        """Parse Finnhub chart data for sparklines."""
        if data.get("s") != "ok":
            raise ValueError(f"Finnhub chart data error: {data.get('s')}")
        
        prices = data.get("c", [])  # Close prices
        timestamps = data.get("t", [])  # Timestamps
        
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
            "source": "finnhub",
            "as_of": datetime.utcnow().isoformat()
        }
    
    def _parse_finnhub_metadata(self, data: Dict, ticker: str) -> Dict[str, Any]:
        """Parse Finnhub metadata."""
        return {
            "ticker": ticker,
            "name": data.get("name"),
            "country": data.get("country"),
            "industry": data.get("finnhubIndustry"),
            "web_url": data.get("weburl"),
            "logo": data.get("logo"),
            "market_cap": data.get("marketCapitalization"),
            "shares_out": data.get("shareOutstanding"),
            "source": "finnhub",
            "as_of": datetime.utcnow().isoformat()
        }
