"""
Financial Modeling Prep (FMP) Provider - Priority 1
Provides: Income Statement, Balance Sheet, Cash Flow, Ratios, Estimates
"""

import requests
from typing import Optional, List, Dict, Any
from .base_provider import BaseProvider, ProviderData


class FMPProvider(BaseProvider):
    """Financial Modeling Prep API provider."""
    
    BASE_URL = "https://financialmodelingprep.com/api/v3"
    
    def __init__(self, api_key: str):
        super().__init__(api_key)
        if not api_key:
            raise ValueError("FMP_API_KEY is required")
    
    def fetch_data(self, ticker: str) -> Optional[ProviderData]:
        """Fetch comprehensive financial data from FMP."""
        try:
            # Fetch all required data in parallel would be better,
            # but for now sequential is fine
            
            profile = self._fetch_profile(ticker)
            if not profile:
                return None
            
            income_stmt = self._fetch_income_statement(ticker)
            balance_sheet = self._fetch_balance_sheet(ticker)
            cash_flow = self._fetch_cash_flow(ticker)
            ratios = self._fetch_ratios(ticker)
            estimates = self._fetch_estimates(ticker)
            quote = self._fetch_quote(ticker)
            
            # Parse and structure data
            return self._build_provider_data(
                ticker=ticker,
                profile=profile,
                income_stmt=income_stmt,
                balance_sheet=balance_sheet,
                cash_flow=cash_flow,
                ratios=ratios,
                estimates=estimates,
                quote=quote
            )
            
        except Exception as e:
            print(f"FMP fetch error for {ticker}: {e}")
            return None
    
    def _fetch_profile(self, ticker: str) -> Optional[Dict]:
        """Get company profile."""
        url = f"{self.BASE_URL}/profile/{ticker}"
        params = {"apikey": self.api_key}
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            return data[0] if data else None
        except Exception as e:
            print(f"FMP profile error: {e}")
            return None
    
    def _fetch_income_statement(self, ticker: str, limit: int = 10) -> List[Dict]:
        """Get annual income statements."""
        url = f"{self.BASE_URL}/income-statement/{ticker}"
        params = {"apikey": self.api_key, "limit": limit}
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception:
            return []
    
    def _fetch_balance_sheet(self, ticker: str, limit: int = 10) -> List[Dict]:
        """Get annual balance sheets."""
        url = f"{self.BASE_URL}/balance-sheet-statement/{ticker}"
        params = {"apikey": self.api_key, "limit": limit}
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception:
            return []
    
    def _fetch_cash_flow(self, ticker: str, limit: int = 10) -> List[Dict]:
        """Get annual cash flow statements."""
        url = f"{self.BASE_URL}/cash-flow-statement/{ticker}"
        params = {"apikey": self.api_key, "limit": limit}
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception:
            return []
    
    def _fetch_ratios(self, ticker: str) -> List[Dict]:
        """Get financial ratios."""
        url = f"{self.BASE_URL}/ratios/{ticker}"
        params = {"apikey": self.api_key, "limit": 5}
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            return response.json()
        except Exception:
            return []
    
    def _fetch_estimates(self, ticker: str) -> Dict:
        """Get analyst estimates."""
        url = f"{self.BASE_URL}/analyst-estimates/{ticker}"
        params = {"apikey": self.api_key, "limit": 3}
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            return data[0] if data else {}
        except Exception:
            return {}
    
    def _fetch_quote(self, ticker: str) -> Optional[Dict]:
        """Get current quote/price."""
        url = f"{self.BASE_URL}/quote/{ticker}"
        params = {"apikey": self.api_key}
        
        try:
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            return data[0] if data else None
        except Exception:
                return None
            
    def _build_provider_data(
        self,
        ticker: str,
        profile: Dict,
        income_stmt: List[Dict],
        balance_sheet: List[Dict],
        cash_flow: List[Dict],
        ratios: List[Dict],
        estimates: Dict,
        quote: Optional[Dict]
    ) -> Optional[ProviderData]:
        """Build ProviderData from FMP responses."""
        
        if not income_stmt or len(income_stmt) < 3:
            print(f"FMP: Insufficient income statement data for {ticker}")
                return None
            
        # Extract years (sorted descending - most recent first)
        years = []
        for stmt in income_stmt:
            year = stmt.get("calendarYear")
            if year:
                years.append(int(year))
        
        if len(years) < 3:
            return None
    
        # Align all data to these years
        n = len(years)
        
        # Income statement items
        revenue = []
        operating_income = []
        ebitda = []
        da = []
        net_income = []
        pretax_income = []
        tax_expense = []
        
        for stmt in income_stmt[:n]:
            revenue.append(self._parse_float(stmt.get("revenue")))
            operating_income.append(self._parse_float(stmt.get("operatingIncome")))
            ebitda.append(self._parse_float(stmt.get("ebitda")))
            
            # D&A = EBITDA - EBIT
            ebit = self._parse_float(stmt.get("operatingIncome"))
            ebitda_val = self._parse_float(stmt.get("ebitda"))
            if ebit and ebitda_val:
                da.append(ebitda_val - ebit)
            else:
                da.append(self._parse_float(stmt.get("depreciationAndAmortization")))
            
            net_income.append(self._parse_float(stmt.get("netIncome")))
            pretax_income.append(self._parse_float(stmt.get("incomeBeforeTax")))
            tax_expense.append(self._parse_float(stmt.get("incomeTaxExpense")))
        
        # Balance sheet items
        cash = []
        total_debt = []
        shares_outstanding = []
        
        for bs in balance_sheet[:n]:
            cash.append(self._parse_float(bs.get("cashAndCashEquivalents")))
            
            # Total debt = short-term + long-term
            st_debt = self._parse_float(bs.get("shortTermDebt")) or 0
            lt_debt = self._parse_float(bs.get("longTermDebt")) or 0
            total_debt.append(st_debt + lt_debt if (st_debt or lt_debt) else None)
            
            shares_outstanding.append(self._parse_float(bs.get("commonStock")) or 
                                     self._parse_float(bs.get("weightedAverageShsOut")))
        
        # Cash flow items
        capex = []
        delta_nwc = []
        
        for cf in cash_flow[:n]:
            capex.append(abs(self._parse_float(cf.get("capitalExpenditure")) or 0))
            delta_nwc.append(self._parse_float(cf.get("changeInWorkingCapital")))
        
        # Market data
        current_price = None
        market_cap = None
        beta = None
        
        if quote:
            current_price = self._parse_float(quote.get("price"))
            market_cap = self._parse_float(quote.get("marketCap"))
            beta = self._parse_float(quote.get("beta"))
        
        # Estimates
        analyst_growth_y1 = None
        analyst_growth_y2 = None
        analyst_margin_y1 = None
        
        if estimates:
            est_rev = self._parse_float(estimates.get("estimatedRevenueAvg"))
            if est_rev and revenue and revenue[0]:
                analyst_growth_y1 = (est_rev / revenue[0]) - 1
            
            est_ebitda = self._parse_float(estimates.get("estimatedEbitdaAvg"))
            if est_ebitda and est_rev and est_rev > 0:
                analyst_margin_y1 = est_ebitda / est_rev
        
        return ProviderData(
            ticker=ticker,
            company_name=profile.get("companyName") if profile else ticker,
            currency=profile.get("currency") if profile else "USD",
            as_of=self._get_timestamp(),
            years=years,
            revenue=revenue,
            operating_income=operating_income,
            ebitda=ebitda,
            da=da,
            net_income=net_income,
            cash=cash,
            total_debt=total_debt,
            shares_outstanding=shares_outstanding,
            capex=capex,
            delta_nwc=delta_nwc,
            tax_expense=tax_expense,
            pretax_income=pretax_income,
            current_price=current_price,
            market_cap=market_cap,
            beta=beta,
            analyst_growth_y1=analyst_growth_y1,
            analyst_growth_y2=analyst_growth_y2,
            analyst_margin_y1=analyst_margin_y1
        )
