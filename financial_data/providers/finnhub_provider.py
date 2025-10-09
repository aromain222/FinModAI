"""
Finnhub Provider - Real-time and historical financial data
Provides: Stock prices, financials, company info, market data
Free tier: 60 API calls/minute
"""

import requests
import time
from typing import Optional, List, Dict, Any
from datetime import datetime
from .base_provider import BaseProvider, ProviderData


class FinnhubProvider(BaseProvider):
    """Finnhub API provider for financial data."""
    
    BASE_URL = "https://finnhub.io/api/v1"
    
    def __init__(self, api_key: str):
        super().__init__(api_key)
        if not api_key:
            raise ValueError("FINNHUB_API_KEY is required")
    
    def fetch_data(self, ticker: str) -> Optional[ProviderData]:
        """Fetch data from Finnhub."""
        if not self.api_key:
            return None
        
        try:
            # Fetch company profile
            profile = self._fetch_profile(ticker)
            if not profile:
                print(f"Finnhub: No profile data for {ticker}")
                return None
            
            # Fetch financials
            financials = self._fetch_financials(ticker)
            if not financials:
                print(f"Finnhub: No financial data for {ticker}")
                return None
            
            # Fetch quote for current price
            quote = self._fetch_quote(ticker)
            
            # Build provider data
            return self._build_provider_data(ticker, profile, financials, quote)
            
        except Exception as e:
            print(f"Finnhub fetch error for {ticker}: {e}")
            return None
    
    def _fetch_profile(self, ticker: str) -> Optional[dict]:
        """Fetch company profile."""
        try:
            url = f"{self.BASE_URL}/stock/profile2"
            params = {"symbol": ticker, "token": self.api_key}
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            return data if data and "name" in data else None
        except Exception as e:
            print(f"Finnhub profile error: {e}")
            return None
    
    def _fetch_financials(self, ticker: str) -> Optional[dict]:
        """Fetch financial statements."""
        try:
            url = f"{self.BASE_URL}/stock/financials-reported"
            params = {"symbol": ticker, "token": self.api_key}
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            return data if data and "data" in data else None
        except Exception as e:
            print(f"Finnhub financials error: {e}")
            return None
    
    def _fetch_quote(self, ticker: str) -> Optional[dict]:
        """Fetch current quote."""
        try:
            url = f"{self.BASE_URL}/quote"
            params = {"symbol": ticker, "token": self.api_key}
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            return data if data and "c" in data else None
        except Exception as e:
            print(f"Finnhub quote error: {e}")
            return None
    
    def _build_provider_data(self, ticker: str, profile: dict, financials: dict, quote: Optional[dict]) -> Optional[ProviderData]:
        """Build ProviderData from Finnhub data."""
        try:
            # Extract company info
            company_name = profile.get("name", "Unknown")
            currency = profile.get("currency", "USD")
            market_cap = profile.get("marketCapitalization", 0) * 1_000_000  # Convert to actual value
            
            # Extract current price
            current_price = quote.get("c", 0) if quote else 0
            
            # Extract financial statements
            years = []
            revenue = []
            operating_income = []
            ebitda = []
            net_income = []
            total_debt = []
            cash = []
            
            # Parse financial data (simplified - Finnhub uses complex nested structure)
            if "data" in financials and isinstance(financials["data"], list):
                for report in financials["data"][:5]:  # Last 5 reports
                    if not isinstance(report, dict) or "report" not in report:
                        continue
                    
                    report_data = report.get("report", {})
                    year = report.get("year", 0)
                    
                    if year and year not in years:
                        years.append(year)
                        
                        # Extract metrics from balance sheet and income statement
                        bs = report_data.get("bs", {}) if isinstance(report_data, dict) else {}
                        ic = report_data.get("ic", {}) if isinstance(report_data, dict) else {}
                        
                        revenue.append(self._safe_float(ic.get("Revenue", 0)))
                        operating_income.append(self._safe_float(ic.get("OperatingIncome", 0)))
                        net_income.append(self._safe_float(ic.get("NetIncome", 0)))
                        total_debt.append(self._safe_float(bs.get("TotalDebt", 0)))
                        cash.append(self._safe_float(bs.get("Cash", 0)))
            
            # Calculate EBITDA (simplified)
            for i, oi in enumerate(operating_income):
                ebitda_val = oi * 1.15 if oi > 0 else 0  # Rough estimate
                ebitda.append(ebitda_val)
            
            # Ensure we have at least 3 years of data
            if len(years) < 3 or len(revenue) < 3:
                print(f"Finnhub: Insufficient data for {ticker} (only {len(years)} years)")
                return None
            
            # Sort by year (descending)
            sorted_data = sorted(zip(years, revenue, operating_income, ebitda, net_income, total_debt, cash), 
                               key=lambda x: x[0], reverse=True)
            years, revenue, operating_income, ebitda, net_income, total_debt, cash = zip(*sorted_data)
            
            # Calculate beta (placeholder - Finnhub doesn't provide easily)
            beta = 1.0
            
            return ProviderData(
                ticker=ticker,
                company_name=company_name,
                currency=currency,
                as_of=datetime.now().strftime("%Y-%m-%d"),
                years=list(years),
                revenue=list(revenue),
                operating_income=list(operating_income),
                ebitda=list(ebitda),
                da=[],  # Not easily available from Finnhub
                net_income=list(net_income),
                cash=list(cash),
                total_debt=list(total_debt),
                shares_outstanding=[],  # Not easily available
                capex=[],  # Not easily available
                delta_nwc=[],  # Not easily available
                tax_expense=[],
                pretax_income=[],
                interest_expense=[],
                current_price=current_price,
                market_cap=market_cap,
                beta=beta,
                analyst_growth_y1=None,
                analyst_growth_y2=None,
                analyst_margin_y1=None
            )
            
        except Exception as e:
            print(f"Finnhub build error for {ticker}: {e}")
            return None
    
    def _safe_float(self, value: Any) -> float:
        """Safely convert value to float."""
        try:
            if isinstance(value, (int, float)):
                return float(value)
            if isinstance(value, dict) and "value" in value:
                return float(value["value"])
            return 0.0
        except:
            return 0.0

