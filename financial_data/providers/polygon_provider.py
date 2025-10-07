"""
Polygon.io Provider - Professional financial data API.
Used by hedge funds and institutional investors.
"""

import requests
import time
from typing import Optional, Dict, Any, List
from .base_provider import BaseProvider, ProviderData


class PolygonProvider(BaseProvider):
    """Polygon.io provider for financial data."""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or "your_polygon_key_here"
        self.base_url = "https://api.polygon.io"
        self.timeout = 30
        
    def fetch_data(self, ticker: str) -> Optional[ProviderData]:
        """Fetch financial data from Polygon.io."""
        try:
            print(f"Trying Polygon.io for {ticker}...")
            
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
            print(f"Polygon.io fetch error for {ticker}: {e}")
            return None
    
    def _get_company_info(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Get company profile information."""
        try:
            url = f"{self.base_url}/v3/reference/tickers/{ticker}"
            params = {"apikey": self.api_key}
            
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            data = response.json()
            if data.get("status") == "OK":
                return data.get("results", {})
            return None
            
        except Exception as e:
            print(f"Polygon company info error for {ticker}: {e}")
            return None
    
    def _get_financials(self, ticker: str) -> Optional[List[Dict[str, Any]]]:
        """Get financial statement data."""
        try:
            url = f"{self.base_url}/v2/reference/financials"
            params = {
                "apikey": self.api_key,
                "ticker": ticker,
                "limit": 5
            }
            
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            data = response.json()
            if data.get("status") == "OK":
                return data.get("results", [])
            return None
            
        except Exception as e:
            print(f"Polygon financials error for {ticker}: {e}")
            return None
    
    def _get_price_data(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Get current price and market data."""
        try:
            url = f"{self.base_url}/v2/snapshot/locale/us/markets/stocks/tickers/{ticker}"
            params = {"apikey": self.api_key}
            
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            data = response.json()
            if data.get("status") == "OK":
                return data.get("results", {})
            return None
            
        except Exception as e:
            print(f"Polygon price data error for {ticker}: {e}")
            return None
    
    def _build_provider_data(
        self,
        ticker: str,
        company_info: Dict[str, Any],
        financials: List[Dict[str, Any]],
        price_data: Dict[str, Any]
    ) -> Optional[ProviderData]:
        """Build ProviderData from Polygon.io response."""
        try:
            if not financials or len(financials) < 3:
                return None
            
            # Sort by date (most recent first)
            financials.sort(key=lambda x: x.get("calendarDate", ""), reverse=True)
            
            # Extract years
            years = []
            revenue = []
            operating_income = []
            da = []
            capex = []
            delta_nwc = []
            tax_expense = []
            pretax_income = []
            interest_expense = []
            total_debt = []
            shares_outstanding = []
            
            for i, fin in enumerate(financials[:5]):  # Last 5 years
                calendar_date = fin.get("calendarDate", "")
                if calendar_date:
                    year = int(calendar_date.split("-")[0])
                    years.append(year)
                    
                    # Extract financial data
                    revenue.append(self._parse_float(fin.get("revenue")))
                    operating_income.append(self._parse_float(fin.get("operatingIncome")))
                    tax_expense.append(self._parse_float(fin.get("incomeTaxExpense")))
                    pretax_income.append(self._parse_float(fin.get("incomeBeforeTax")))
                    interest_expense.append(self._parse_float(fin.get("interestExpense")))
                    
                    # Cash flow data
                    da.append(self._parse_float(fin.get("depreciation")))
                    capex.append(self._parse_float(fin.get("capitalExpenditures")))
                    
                    # Balance sheet data
                    total_debt.append(self._parse_float(fin.get("totalDebt")))
                    shares_outstanding.append(self._parse_float(fin.get("weightedAverageShares")))
                    
                    # NWC calculation (simplified)
                    delta_nwc.append(None)  # Would need balance sheet data
            
            # Calculate operating margins
            op_margins = []
            for i in range(len(revenue)):
                if revenue[i] and operating_income[i] and revenue[i] != 0:
                    op_margins.append(operating_income[i] / revenue[i])
                else:
                    op_margins.append(None)
            
            # Get current price
            current_price = None
            if price_data and "day" in price_data:
                current_price = self._parse_float(price_data["day"].get("c"))  # Close price
            
            # Get beta (if available)
            beta = self._parse_float(company_info.get("beta"))
            
            return ProviderData(
                ticker=ticker,
                company_name=company_info.get("name", ticker),
                currency="USD",  # Polygon primarily USD
                years=years,
                revenue=revenue,
                operating_income=operating_income,
                op_margin=op_margins,
                da=da,
                capex=capex,
                delta_nwc=delta_nwc,
                current_price=current_price,
                beta=beta,
                # Additional fields
                tax_expense=tax_expense,
                pretax_income=pretax_income,
                interest_expense=interest_expense,
                total_debt=total_debt,
                shares_outstanding=shares_outstanding,
                # Metadata
                data_source="Polygon.io",
                last_updated=time.strftime("%Y-%m-%d %H:%M:%S")
            )
            
        except Exception as e:
            print(f"Polygon data parsing error for {ticker}: {e}")
            return None
    
    def _parse_float(self, value: Any) -> Optional[float]:
        """Parse float value, handling None and string inputs."""
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
