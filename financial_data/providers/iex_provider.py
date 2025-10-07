"""
IEX Cloud Provider - Professional financial data API.
Used by major fintech companies with 99.9% uptime.
"""

import requests
import time
from typing import Optional, Dict, Any, List
from .base_provider import BaseProvider, ProviderData


class IEXProvider(BaseProvider):
    """IEX Cloud provider for financial data."""
    
    def __init__(self, api_key: str = None):
        self.api_key = api_key or "pk_test_1234567890abcdef"  # Replace with real key
        self.base_url = "https://cloud.iexapis.com/stable"
        self.timeout = 30
        
    def fetch_data(self, ticker: str) -> Optional[ProviderData]:
        """Fetch financial data from IEX Cloud."""
        try:
            print(f"Trying IEX Cloud for {ticker}...")
            
            # Get company info
            company_info = self._get_company_info(ticker)
            if not company_info:
                return None
                
            # Get financials
            financials = self._get_financials(ticker)
            if not financials:
                return None
                
            # Get balance sheet
            balance_sheet = self._get_balance_sheet(ticker)
            
            # Get cash flow
            cash_flow = self._get_cash_flow(ticker)
            
            # Get price data
            price_data = self._get_price_data(ticker)
            
            return self._build_provider_data(
                ticker, company_info, financials, balance_sheet, cash_flow, price_data
            )
            
        except Exception as e:
            print(f"IEX Cloud fetch error for {ticker}: {e}")
            return None
    
    def _get_company_info(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Get company profile information."""
        try:
            url = f"{self.base_url}/stock/{ticker}/company"
            params = {"token": self.api_key}
            
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            print(f"IEX company info error for {ticker}: {e}")
            return None
    
    def _get_financials(self, ticker: str) -> Optional[List[Dict[str, Any]]]:
        """Get income statement data."""
        try:
            url = f"{self.base_url}/stock/{ticker}/income"
            params = {"token": self.api_key, "period": "annual", "last": 5}
            
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            return response.json().get("income", [])
            
        except Exception as e:
            print(f"IEX financials error for {ticker}: {e}")
            return None
    
    def _get_balance_sheet(self, ticker: str) -> Optional[List[Dict[str, Any]]]:
        """Get balance sheet data."""
        try:
            url = f"{self.base_url}/stock/{ticker}/balance-sheet"
            params = {"token": self.api_key, "period": "annual", "last": 5}
            
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            return response.json().get("balancesheet", [])
            
        except Exception as e:
            print(f"IEX balance sheet error for {ticker}: {e}")
            return None
    
    def _get_cash_flow(self, ticker: str) -> Optional[List[Dict[str, Any]]]:
        """Get cash flow statement data."""
        try:
            url = f"{self.base_url}/stock/{ticker}/cash-flow"
            params = {"token": self.api_key, "period": "annual", "last": 5}
            
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            return response.json().get("cashflow", [])
            
        except Exception as e:
            print(f"IEX cash flow error for {ticker}: {e}")
            return None
    
    def _get_price_data(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Get current price and market data."""
        try:
            url = f"{self.base_url}/stock/{ticker}/quote"
            params = {"token": self.api_key}
            
            response = requests.get(url, params=params, timeout=self.timeout)
            response.raise_for_status()
            
            return response.json()
            
        except Exception as e:
            print(f"IEX price data error for {ticker}: {e}")
            return None
    
    def _build_provider_data(
        self,
        ticker: str,
        company_info: Dict[str, Any],
        financials: List[Dict[str, Any]],
        balance_sheet: List[Dict[str, Any]],
        cash_flow: List[Dict[str, Any]],
        price_data: Dict[str, Any]
    ) -> Optional[ProviderData]:
        """Build ProviderData from IEX Cloud response."""
        try:
            if not financials or len(financials) < 3:
                return None
            
            # Sort by date (most recent first)
            financials.sort(key=lambda x: x.get("fiscalDate", ""), reverse=True)
            
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
                fiscal_date = fin.get("fiscalDate", "")
                if fiscal_date:
                    year = int(fiscal_date.split("-")[0])
                    years.append(year)
                    
                    # Income statement
                    revenue.append(self._parse_float(fin.get("totalRevenue")))
                    operating_income.append(self._parse_float(fin.get("operatingIncome")))
                    tax_expense.append(self._parse_float(fin.get("incomeTax")))
                    pretax_income.append(self._parse_float(fin.get("incomeBeforeTax")))
                    interest_expense.append(self._parse_float(fin.get("interestIncome")))
                    
                    # Cash flow statement
                    da.append(self._parse_float(fin.get("depreciation")))
                    capex.append(self._parse_float(fin.get("capitalExpenditures")))
                    
                    # Balance sheet (if available)
                    if balance_sheet and i < len(balance_sheet):
                        bs = balance_sheet[i]
                        total_debt.append(self._parse_float(bs.get("totalDebt")))
                        shares_outstanding.append(self._parse_float(bs.get("commonStock")))
                    else:
                        total_debt.append(None)
                        shares_outstanding.append(None)
                    
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
            current_price = self._parse_float(price_data.get("latestPrice"))
            
            # Get beta (if available)
            beta = self._parse_float(price_data.get("beta"))
            
            return ProviderData(
                ticker=ticker,
                company_name=company_info.get("companyName", ticker),
                currency=company_info.get("currency", "USD"),
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
                data_source="IEX_Cloud",
                last_updated=time.strftime("%Y-%m-%d %H:%M:%S")
            )
            
        except Exception as e:
            print(f"IEX data parsing error for {ticker}: {e}")
            return None
    
    def _parse_float(self, value: Any) -> Optional[float]:
        """Parse float value, handling None and string inputs."""
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (ValueError, TypeError):
            return None
