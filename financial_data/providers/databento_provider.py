"""
Databento Provider - Professional financial data API.
Used by hedge funds and institutional investors.
"""

import requests
import time
from typing import Optional, Dict, Any, List
from .base_provider import BaseProvider, ProviderData


class DatabentoProvider(BaseProvider):
    """Databento provider for financial data."""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or "your_databento_key_here"
        self.base_url = "https://hist.databento.com/v0"
        self.timeout = 30
        
    def fetch_data(self, ticker: str) -> Optional[ProviderData]:
        """Fetch financial data from Databento."""
        try:
            print(f"Trying Databento for {ticker}...")
            
            # Get company info
            company_info = self._get_company_info(ticker)
            if not company_info:
                return None
                
            # Get financials
            financials = self._get_financials(ticker)
            if not financials:
                return None
                
            # Get price data
            price_data = self._get_price_data(ticker)
            
            return self._build_provider_data(
                ticker, company_info, financials, price_data
            )
            
        except Exception as e:
            print(f"Databento fetch error for {ticker}: {e}")
            return None
    
    def _get_company_info(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Get company profile information."""
        try:
            url = f"{self.base_url}/metadata.list_symbology"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            params = {
                "dataset": "GLBX.MDP3",
                "symbols": ticker
            }
            
            response = requests.get(url, headers=headers, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            data = response.json()
            if data.get("symbols"):
                return {"symbol": ticker, "name": ticker}  # Basic info
            return None
            
        except Exception as e:
            print(f"Databento company info error for {ticker}: {e}")
            return None
    
    def _get_financials(self, ticker: str) -> Optional[List[Dict[str, Any]]]:
        """Get financial statement data."""
        try:
            # Note: Databento primarily provides market data, not fundamental data
            # For fundamental data, we'd need to use their alternative endpoints
            # or combine with other sources
            
            # For now, return None to indicate no fundamental data available
            # This will cause fallback to other providers
            print(f"Databento: No fundamental data available for {ticker}")
            return None
            
        except Exception as e:
            print(f"Databento financials error for {ticker}: {e}")
            return None
    
    def _get_price_data(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Get current price and market data."""
        try:
            url = f"{self.base_url}/timeseries.get_range"
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
            
            # Get recent price data
            params = {
                "dataset": "GLBX.MDP3",
                "symbols": ticker,
                "schema": "ohlcv-1d",
                "start": "2024-01-01",
                "end": "2024-12-31"
            }
            
            response = requests.get(url, headers=headers, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            data = response.json()
            if data.get("data"):
                # Get the most recent price
                latest_data = data["data"][-1] if data["data"] else None
                if latest_data:
                    return {
                        "close": latest_data.get("close"),
                        "volume": latest_data.get("volume"),
                        "date": latest_data.get("ts_event")
                    }
            return None
            
        except Exception as e:
            print(f"Databento price data error for {ticker}: {e}")
            return None
    
    def _build_provider_data(
        self,
        ticker: str,
        company_info: Dict[str, Any],
        financials: List[Dict[str, Any]],
        price_data: Dict[str, Any]
    ) -> Optional[ProviderData]:
        """Build ProviderData from Databento response."""
        try:
            # Databento primarily provides market data, not fundamental data
            # So we return None to trigger fallback to other providers
            print(f"Databento: Market data provider, no fundamental data for {ticker}")
            return None
            
        except Exception as e:
            print(f"Databento data parsing error for {ticker}: {e}")
            return None
    
    def _parse_float(self, value: Any) -> Optional[float]:
        """Parse float value, handling None and string inputs."""
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
