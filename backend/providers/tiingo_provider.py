"""
Tiingo Provider - Financial data API for stocks, fundamentals, and historical data.
"""
import os
import requests
from typing import Optional, Dict, Any, List
from backend.providers.base_provider import BaseProvider, Quote, Fundamentals, Filing
from datetime import datetime

TIINGO_BASE_URL = "https://api.tiingo.com"
MAX_RETRIES = 2
TIMEOUT = 12

class TiingoProvider(BaseProvider):
    """Tiingo API provider for financial data."""
    
    def __init__(self, api_key: Optional[str] = None):
        super().__init__("tiingo")
        self.api_key = api_key or os.getenv("TIINGO_API_KEY")
        if not self.api_key:
            raise ValueError("TIINGO_API_KEY not set")
        self.headers = {
            "Content-Type": "application/json",
            "Authorization": f"Token {self.api_key}"
        }
    
    def get_quote(self, ticker: str) -> Optional[Quote]:
        """Fetches real-time quote data from Tiingo."""
        ticker = ticker.upper()
        url = f"{TIINGO_BASE_URL}/tiingo/daily/{ticker}"
        
        for attempt in range(MAX_RETRIES + 1):
            try:
                response = requests.get(url, headers=self.headers, timeout=TIMEOUT)
                response.raise_for_status()
                data = response.json()
                
                # Tiingo daily endpoint returns company info + latest price
                price = data.get("close") or data.get("adjClose")
                if price is None:
                    # Try to get latest price from the prices endpoint
                    price_data = self._get_latest_price(ticker)
                    if price_data:
                        price = price_data.get("close")
                
                if price is None:
                    raise ValueError("No price data available")
                
                market_cap = data.get("marketCap")
                # Enterprise value not directly available, would need calculation
                enterprise_value = None
                
                provenance = {
                    "provider": "Tiingo",
                    "endpoint": url,
                    "as_of": datetime.utcnow().isoformat() + "Z",
                    "source_url": f"https://api.tiingo.com/documentation/tiingo/daily/{ticker}"
                }
                
                return Quote(
                    price=float(price),
                    market_cap=float(market_cap) if market_cap else None,
                    enterprise_value=enterprise_value,
                    currency=data.get("currency", "USD"),
                    as_of=datetime.utcnow().isoformat() + "Z",
                    provenance=provenance
                )
                
            except Exception as e:
                if attempt < MAX_RETRIES:
                    continue
                raise RuntimeError(f"Tiingo quote fetch failed for {ticker}: {e}")
        
        return None
    
    def _get_latest_price(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Get latest price from Tiingo prices endpoint."""
        try:
            url = f"{TIINGO_BASE_URL}/tiingo/daily/{ticker}/prices"
            params = {"startDate": datetime.now().strftime("%Y-%m-%d"), "resampleFreq": "daily"}
            response = requests.get(url, headers=self.headers, params=params, timeout=TIMEOUT)
            response.raise_for_status()
            data = response.json()
            return data[0] if data else None
        except Exception:
            return None
    
    def get_fundamentals(self, ticker: str, period: str = "annual", years: int = 5) -> Optional[Fundamentals]:
        """Fetches historical financial statements from Tiingo."""
        ticker = ticker.upper()
        
        try:
            # Tiingo fundamentals endpoint
            url = f"{TIINGO_BASE_URL}/tiingo/fundamentals/{ticker}/daily"
            response = requests.get(url, headers=self.headers, timeout=TIMEOUT)
            response.raise_for_status()
            data = response.json()
            
            if not data:
                return None
            
            # Parse fundamentals data
            fundamentals = Fundamentals()
            
            # Sort by date (most recent first)
            sorted_data = sorted(data, key=lambda x: x.get("reportDate", ""), reverse=True)
            
            # Limit to requested years
            if period == "annual":
                # Filter to annual reports only
                annual_data = [d for d in sorted_data if d.get("filingType") == "10-K"]
                sorted_data = annual_data[:years]
            
            for item in sorted_data:
                report_date = item.get("reportDate", "")
                if report_date:
                    fundamentals.period_ends.append(report_date)
                    fundamentals.revenue.append(item.get("revenue"))
                    fundamentals.ebit.append(item.get("ebit"))
                    fundamentals.ebitda.append(item.get("ebitda"))
                    fundamentals.net_income.append(item.get("netIncome"))
                    fundamentals.shares_outstanding.append(item.get("sharesOutstanding"))
                    fundamentals.cash.append(item.get("cashAndCashEquivalents"))
                    fundamentals.debt.append(item.get("totalDebt"))
                    fundamentals.capex.append(item.get("capitalExpenditure"))
                    fundamentals.depreciation_amortization.append(item.get("depreciationAndAmortization"))
                    # Working capital = Current Assets - Current Liabilities
                    working_cap = None
                    if item.get("currentAssets") is not None and item.get("currentLiabilities") is not None:
                        working_cap = item.get("currentAssets") - item.get("currentLiabilities")
                    fundamentals.working_capital.append(working_cap)
            
            fundamentals.provenance = {
                "provider": "Tiingo",
                "endpoint": url,
                "as_of": datetime.utcnow().isoformat() + "Z",
                "source_url": f"https://api.tiingo.com/documentation/fundamentals/{ticker}"
            }
            
            return fundamentals
            
        except Exception as e:
            print(f"Tiingo fundamentals fetch failed for {ticker}: {e}")
            return None
    
    def get_filings(self, ticker: str) -> Optional[List[Filing]]:
        """Tiingo does not provide SEC filings metadata."""
        return None
    
    def health_check(self) -> Dict[str, Any]:
        """Health check for Tiingo API."""
        try:
            # Test with a well-known ticker
            quote = self.get_quote("AAPL")
            if quote:
                return {
                    "status": "OK",
                    "quote": quote.price,
                    "currency": quote.currency,
                    "http_status": 200
                }
            return {"status": "FAIL", "error": "No quote returned"}
        except Exception as e:
            return {"status": "FAIL", "error": str(e)}

def get_provider():
    """Factory function to get Tiingo provider instance."""
    try:
        api_key = os.getenv("TIINGO_API_KEY")
        if not api_key or api_key.startswith("your_") or "example" in api_key.lower():
            return None
        return TiingoProvider(api_key)
    except Exception as e:
        print(f"⚠️ Tiingo provider not available: {e}")
        return None

