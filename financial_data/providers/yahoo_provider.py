"""
Yahoo Finance Provider - Priority 3 (Backup)
Uses yfinance library for data fetching.
"""

from typing import Optional, List
from .base_provider import BaseProvider, ProviderData

try:
    import yfinance as yf
    YFINANCE_AVAILABLE = True
except ImportError:
    YFINANCE_AVAILABLE = False


class YahooProvider(BaseProvider):
    """Yahoo Finance provider using yfinance."""
    
    def fetch_data(self, ticker: str) -> Optional[ProviderData]:
        """Fetch data from Yahoo Finance."""
        if not YFINANCE_AVAILABLE:
            print("yfinance not available")
            return None
        
        try:
            stock = yf.Ticker(ticker)
            info = stock.info
            
            if not info or "symbol" not in info:
                return None
            
            # Get financials
            financials = stock.financials
            balance_sheet = stock.balance_sheet
            cash_flow = stock.cashflow
            
            return self._build_provider_data(
                ticker=ticker,
                info=info,
                financials=financials,
                balance_sheet=balance_sheet,
                cash_flow=cash_flow
            )
            
        except Exception as e:
            print(f"Yahoo fetch error for {ticker}: {e}")
            return None
    
    def _build_provider_data(
        self,
        ticker: str,
        info: dict,
        financials,
        balance_sheet,
        cash_flow
    ) -> Optional[ProviderData]:
        """Build ProviderData from Yahoo Finance data."""
        
        try:
            # Extract years from financials
            if financials.empty:
                return None
            
            years = [col.year for col in financials.columns]
            n = len(years)
            
            if n < 3:
                return None
            
            # Revenue
            revenue = []
            if "Total Revenue" in financials.index:
                revenue = [self._parse_float(v) for v in financials.loc["Total Revenue"].values]
            
            # Operating Income
            operating_income = []
            if "Operating Income" in financials.index:
                operating_income = [self._parse_float(v) for v in financials.loc["Operating Income"].values]
            elif "EBIT" in financials.index:
                operating_income = [self._parse_float(v) for v in financials.loc["EBIT"].values]
            
            # EBITDA
            ebitda = []
            if "EBITDA" in financials.index:
                ebitda = [self._parse_float(v) for v in financials.loc["EBITDA"].values]
            
            # Net Income
            net_income = []
            if "Net Income" in financials.index:
                net_income = [self._parse_float(v) for v in financials.loc["Net Income"].values]
            
            # Tax
            tax_expense = []
            pretax_income = []
            if "Tax Provision" in financials.index:
                tax_expense = [self._parse_float(v) for v in financials.loc["Tax Provision"].values]
            if "Income Before Tax" in financials.index:
                pretax_income = [self._parse_float(v) for v in financials.loc["Income Before Tax"].values]
            
            # D&A
            da = []
            if not cash_flow.empty and "Depreciation And Amortization" in cash_flow.index:
                da = [abs(self._parse_float(v)) for v in cash_flow.loc["Depreciation And Amortization"].values[:n]]
            
            # CapEx
            capex = []
            if not cash_flow.empty and "Capital Expenditure" in cash_flow.index:
                capex = [abs(self._parse_float(v)) for v in cash_flow.loc["Capital Expenditure"].values[:n]]
            
            # Change in NWC
            delta_nwc = []
            if not cash_flow.empty and "Change In Working Capital" in cash_flow.index:
                delta_nwc = [self._parse_float(v) for v in cash_flow.loc["Change In Working Capital"].values[:n]]
            
            # Balance sheet
            cash = []
            total_debt = []
            shares_outstanding = []
            
            if not balance_sheet.empty:
                if "Cash And Cash Equivalents" in balance_sheet.index:
                    cash = [self._parse_float(v) for v in balance_sheet.loc["Cash And Cash Equivalents"].values[:n]]
                
                if "Total Debt" in balance_sheet.index:
                    total_debt = [self._parse_float(v) for v in balance_sheet.loc["Total Debt"].values[:n]]
                elif "Long Term Debt" in balance_sheet.index:
                    total_debt = [self._parse_float(v) for v in balance_sheet.loc["Long Term Debt"].values[:n]]
                
                if "Ordinary Shares Number" in balance_sheet.index:
                    shares_outstanding = [self._parse_float(v) for v in balance_sheet.loc["Ordinary Shares Number"].values[:n]]
            
            # Market data
            current_price = info.get("currentPrice") or info.get("regularMarketPrice")
            market_cap = info.get("marketCap")
            beta = info.get("beta")
            
            return ProviderData(
                ticker=ticker,
                company_name=info.get("longName") or info.get("shortName"),
                currency=info.get("currency") or info.get("financialCurrency") or "USD",
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
                analyst_growth_y1=None,
                analyst_growth_y2=None,
                analyst_margin_y1=None
            )
            
        except Exception as e:
            print(f"Yahoo build error: {e}")
            return None
