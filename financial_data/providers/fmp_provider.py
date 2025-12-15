#!/usr/bin/env python3
"""Financial Modeling Prep data provider (cash-flow + income statement).
Returns dict compatible with assumptions_builder expectations.
"""
import os, requests, logging, datetime
from typing import Dict, Any, Optional
from .base_provider import BaseProvider, ProviderData

logger = logging.getLogger("fmp_provider")

FMP_API = "https://financialmodelingprep.com/api/v3"

class FMPProvider(BaseProvider):
    def __init__(self, api_key: Optional[str] = None):
        self.name = "fmp"  # Add name for provider identification
        self.api_key = api_key or os.getenv("FINANCIALMODELINGPREP_API_KEY") or os.getenv("FMP_API_KEY")
        if not self.api_key:
            raise ValueError("FINANCIALMODELINGPREP_API_KEY not set")

    def _get(self, endpoint: str, params: Optional[Dict[str, Any]] = None):
        params = params or {}
        params["apikey"] = self.api_key
        url = f"{FMP_API}/{endpoint}"
        r = requests.get(url, params=params, timeout=10)
        r.raise_for_status()
        return r.json()

    def get_cash_flow(self, ticker: str, years: int = 5):
        data = self._get(f"cash-flow-statement/{ticker}", {"limit": years})
        if not data:
            raise ValueError("FMP cash-flow empty")
        return data

    def get_income(self, ticker: str, years: int = 5):
        data = self._get(f"income-statement/{ticker}", {"limit": years})
        return data or []

    def fetch_data(self, ticker: str) -> Optional[ProviderData]:
        """Fetch financial data from FMP API (implements BaseProvider interface)."""
        try:
            print(f"Trying FMP for {ticker}...")
            
            # Get cash flow and income statement data
            cf = self.get_cash_flow(ticker, years=5)
            inc = self.get_income(ticker, years=5)
            
            if not cf or not inc:
                return None
            
            # Create provider data
            data = ProviderData()
            data.ticker = ticker
            data.company_name = ticker  # FMP doesn't provide company name in these endpoints
            
            # Extract dates and values
            dates = [period.get("date") for period in cf]
            
            # Revenue
            data.revenue = [period.get("revenue", 0) for period in inc]
            
            # Net Income
            data.net_income = [period.get("netIncome", 0) for period in inc]
            
            # Free Cash Flow
            data.free_cash_flow = [period.get("freeCashFlow", 0) for period in cf]
            
            # Operating Income (EBIT)
            data.operating_income = [period.get("operatingIncome", 0) for period in inc]
            
            # Total Assets
            data.total_assets = [period.get("totalAssets", 0) for period in cf]
            
            # Total Debt
            data.total_debt = [
                period.get("shortTermDebt", 0) + period.get("longTermDebt", 0) 
                for period in cf
            ]
            
            # Set provenance
            data.provenance = {
                "revenue": {"source": "fmp", "fetched": datetime.datetime.utcnow().isoformat() + "Z"},
                "net_income": {"source": "fmp", "fetched": datetime.datetime.utcnow().isoformat() + "Z"},
                "free_cash_flow": {"source": "fmp", "fetched": datetime.datetime.utcnow().isoformat() + "Z"},
                "operating_income": {"source": "fmp", "fetched": datetime.datetime.utcnow().isoformat() + "Z"}
            }
            
            return data
            
        except Exception as e:
            print(f"FMP fetch error for {ticker}: {e}")
            return None
            
    def get_historical_metrics(self, ticker: str, years: int = 5) -> Dict[str, Any]:
        """Get historical metrics for use in fallback chain."""
        cf = self.get_cash_flow(ticker, years)
        inc = self.get_income(ticker, years)
        metrics: Dict[str, Any] = {
            "fcf": [period.get("freeCashFlow", 0) for period in cf],
            "revenue": [period.get("revenue", 0) for period in inc],
            "net_income": [period.get("netIncome", 0) for period in inc],
            "dates": [period.get("date") for period in cf],
            "provenance": {
                "fcf": {"source": "fmp", "fetched": datetime.datetime.utcnow().isoformat() + "Z"}
            }
        }
        return metrics

# Convenience
fmp_provider = None

def get_fmp_provider():
    global fmp_provider
    if fmp_provider is None:
        try:
            fmp_provider = FMPProvider()
        except Exception as e:
            logger.warning(f"FMP provider unavailable: {e}")
            fmp_provider = False
    return fmp_provider if fmp_provider is not False else None
