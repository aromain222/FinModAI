"""
Alpha Vantage Provider - Priority 2 (Backup)
"""

import requests
from typing import Optional
from .base_provider import BaseProvider, ProviderData


class AlphaVantageProvider(BaseProvider):
    """Alpha Vantage API provider."""
    
    BASE_URL = "https://www.alphavantage.co/query"
    
    def fetch_data(self, ticker: str) -> Optional[ProviderData]:
        """Fetch data from Alpha Vantage - simplified for backup role."""
        if not self.api_key:
            return None
        
        try:
            # For now, just fetch overview and income statement
            overview = self._fetch_overview(ticker)
            if not overview:
                return None
            
            # Alpha Vantage has limited free tier, so we'll keep it simple
            return self._build_provider_data(ticker, overview)
            
        except Exception as e:
            print(f"AlphaVantage fetch error for {ticker}: {e}")
            return None
    
    def _fetch_overview(self, ticker: str) -> Optional[dict]:
        """Fetch company overview."""
        params = {
            "function": "OVERVIEW",
            "symbol": ticker,
            "apikey": self.api_key
        }
        
        try:
            response = requests.get(self.BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            return data if "Symbol" in data else None
        except Exception:
            return None
    
    def _build_provider_data(self, ticker: str, overview: dict) -> Optional[ProviderData]:
        """Build minimal provider data from overview."""
        # Alpha Vantage overview has limited historical data
        # Mainly useful for current metrics and beta
        
        beta = self._parse_float(overview.get("Beta"))
        current_price = self._parse_float(overview.get("50DayMovingAverage"))
        market_cap = self._parse_float(overview.get("MarketCapitalization"))
        
        # Not enough historical data for full analysis
        return ProviderData(
            ticker=ticker,
            company_name=overview.get("Name"),
            currency="USD",
            as_of=self._get_timestamp(),
            years=[],
            revenue=[],
            operating_income=[],
            ebitda=[],
            da=[],
            net_income=[],
            cash=[],
            total_debt=[],
            shares_outstanding=[],
            capex=[],
            delta_nwc=[],
            tax_expense=[],
            pretax_income=[],
            interest_expense=[],
            current_price=current_price,
            market_cap=market_cap,
            beta=beta,
            analyst_growth_y1=None,s
            analyst_growth_y2=None,
            analyst_margin_y1=None
        )
