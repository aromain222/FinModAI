"""
SimFin Provider - Standardized financial data
Provides: 10+ years of financial statements, ratios, fundamentals
Free tier: Generous limits for historical data
"""

import requests
import time
from typing import Optional, List, Dict, Any
from datetime import datetime
from .base_provider import BaseProvider, ProviderData


class SimFinProvider(BaseProvider):
    """SimFin API provider for standardized financial data."""
    
    BASE_URL = "https://backend.simfin.com/api/v3"
    
    def __init__(self, api_key: str):
        super().__init__(api_key)
        if not api_key:
            raise ValueError("SIMFIN_API_KEY is required")
    
    def fetch_data(self, ticker: str) -> Optional[ProviderData]:
        """Fetch data from SimFin."""
        if not self.api_key:
            return None
        
        try:
            # Find company ID from ticker
            company_id = self._find_company_id(ticker)
            if not company_id:
                print(f"SimFin: No company found for {ticker}")
                return None
            
            # Fetch financial statements
            income_stmt = self._fetch_statement(company_id, "pl")  # Profit & Loss
            balance_sheet = self._fetch_statement(company_id, "bs")  # Balance Sheet
            cash_flow = self._fetch_statement(company_id, "cf")  # Cash Flow
            
            if not income_stmt:
                print(f"SimFin: No income statement for {ticker}")
                return None
            
            # Fetch company info
            company_info = self._fetch_company_info(company_id)
            
            # Build provider data
            return self._build_provider_data(ticker, company_info, income_stmt, balance_sheet, cash_flow)
            
        except Exception as e:
            print(f"SimFin fetch error for {ticker}: {e}")
            return None
    
    def _find_company_id(self, ticker: str) -> Optional[int]:
        """Find SimFin company ID from ticker."""
        try:
            url = f"{self.BASE_URL}/companies/list"
            headers = {"Authorization": f"api-key {self.api_key}"}
            
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            # Search for ticker in the list
            if isinstance(data, list):
                for company in data:
                    if company.get("ticker") == ticker:
                        return company.get("simfinId")
            
            return None
        except Exception as e:
            print(f"SimFin company ID error: {e}")
            return None
    
    def _fetch_statement(self, company_id: int, statement_type: str) -> Optional[List[dict]]:
        """Fetch financial statement (pl, bs, or cf)."""
        try:
            url = f"{self.BASE_URL}/companies/id/{company_id}/statements/standardised"
            params = {
                "api-key": self.api_key,
                "statement": statement_type,
                "period": "fy"  # Fiscal year (annual)
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            return data if isinstance(data, list) and len(data) > 0 else None
        except Exception as e:
            print(f"SimFin statement error ({statement_type}): {e}")
            return None
    
    def _fetch_company_info(self, company_id: int) -> Optional[dict]:
        """Fetch company information."""
        try:
            url = f"{self.BASE_URL}/companies/id/{company_id}"
            params = {"api-key": self.api_key}
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            return data if data else None
        except Exception as e:
            print(f"SimFin company info error: {e}")
            return None
    
    def _build_provider_data(self, ticker: str, company_info: Optional[dict], 
                            income_stmt: List[dict], balance_sheet: Optional[List[dict]], 
                            cash_flow: Optional[List[dict]]) -> Optional[ProviderData]:
        """Build ProviderData from SimFin data."""
        try:
            # Extract company info
            company_name = company_info.get("name", "Unknown") if company_info else "Unknown"
            currency = company_info.get("currency", "USD") if company_info else "USD"
            
            # Parse financial statements
            years = []
            revenue = []
            operating_income = []
            ebitda = []
            net_income = []
            da = []
            capex = []
            delta_nwc = []
            total_debt = []
            cash_list = []
            shares = []
            tax_expense = []
            pretax_income = []
            interest_expense = []
            
            # Sort statements by fiscal year (descending)
            income_stmt = sorted(income_stmt, key=lambda x: x.get("fiscalYear", 0), reverse=True)
            
            # Extract from income statement (up to 10 years)
            for stmt in income_stmt[:10]:
                fiscal_year = stmt.get("fiscalYear")
                if not fiscal_year:
                    continue
                
                years.append(fiscal_year)
                revenue.append(self._get_value(stmt, "Revenue"))
                operating_income.append(self._get_value(stmt, "Operating Income (Loss)"))
                net_income.append(self._get_value(stmt, "Net Income"))
                pretax_income.append(self._get_value(stmt, "Pretax Income (Loss)"))
                tax_expense.append(self._get_value(stmt, "Income Tax (Expense) Benefit, Net"))
                interest_expense.append(self._get_value(stmt, "Interest Expense, Net"))
                
                # Calculate EBITDA (Operating Income + D&A)
                oi = self._get_value(stmt, "Operating Income (Loss)")
                da_val = self._get_value(stmt, "Depreciation & Amortization")
                ebitda.append(oi + da_val if oi and da_val else oi * 1.15)  # Rough estimate if D&A missing
                da.append(da_val)
                
                # Shares outstanding
                shares.append(self._get_value(stmt, "Shares (Basic)"))
            
            # Extract from balance sheet
            if balance_sheet:
                balance_sheet = sorted(balance_sheet, key=lambda x: x.get("fiscalYear", 0), reverse=True)
                for i, stmt in enumerate(balance_sheet[:len(years)]):
                    total_debt.append(self._get_value(stmt, "Total Debt"))
                    cash_list.append(self._get_value(stmt, "Cash, Cash Equivalents & Short Term Investments"))
            
            # Extract from cash flow
            if cash_flow:
                cash_flow = sorted(cash_flow, key=lambda x: x.get("fiscalYear", 0), reverse=True)
                for i, stmt in enumerate(cash_flow[:len(years)]):
                    capex.append(abs(self._get_value(stmt, "Net Change in Property, Plant & Equipment")))
                    
                    # Calculate delta NWC
                    nwc_change = self._get_value(stmt, "Net Change in Working Capital")
                    delta_nwc.append(nwc_change)
            
            # Ensure we have at least 3 years of data
            if len(years) < 3 or len(revenue) < 3:
                print(f"SimFin: Insufficient data for {ticker} (only {len(years)} years)")
                return None
            
            # Fill missing data with zeros to match years length
            while len(total_debt) < len(years):
                total_debt.append(0.0)
            while len(cash_list) < len(years):
                cash_list.append(0.0)
            while len(capex) < len(years):
                capex.append(0.0)
            while len(delta_nwc) < len(years):
                delta_nwc.append(0.0)
            while len(shares) < len(years):
                shares.append(0.0)
            while len(da) < len(years):
                da.append(0.0)
            
            # Current price and market cap (not available from SimFin free tier)
            current_price = 0.0
            market_cap = 0.0
            
            # Beta (not available from SimFin)
            beta = 1.0
            
            return ProviderData(
                ticker=ticker,
                company_name=company_name,
                currency=currency,
                as_of=datetime.now().strftime("%Y-%m-%d"),
                years=years[:10],
                revenue=revenue[:10],
                operating_income=operating_income[:10],
                ebitda=ebitda[:10],
                da=da[:10],
                net_income=net_income[:10],
                cash=cash_list[:10],
                total_debt=total_debt[:10],
                shares_outstanding=shares[:10],
                capex=capex[:10],
                delta_nwc=delta_nwc[:10],
                tax_expense=tax_expense[:10],
                pretax_income=pretax_income[:10],
                interest_expense=interest_expense[:10],
                current_price=current_price,
                market_cap=market_cap,
                beta=beta,
                analyst_growth_y1=None,
                analyst_growth_y2=None,
                analyst_margin_y1=None
            )
            
        except Exception as e:
            print(f"SimFin build error for {ticker}: {e}")
            return None
    
    def _get_value(self, stmt: dict, field_name: str) -> float:
        """Safely extract value from statement."""
        try:
            value = stmt.get(field_name, 0)
            return float(value) if value else 0.0
        except:
            return 0.0

