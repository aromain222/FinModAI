"""
Financial Modeling Prep (FMP) data provider implementation.
"""

import requests
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Union, cast
from datetime import datetime, timedelta
import time
import json

from .base import (
    FinancialDataProvider,
    DataNotAvailableError,
    IncompleteDataError,
    ProviderTimeoutError,
    ProviderRateLimitError,
    retry_with_backoff,
    Fundamentals,
    MarketData,
    Estimates,
    PricePoint,
    IncomeStatement,
    BalanceSheet,
    CashFlow,
)
from ..config import FMP_API_KEY, PROVIDER_TIMEOUT, PROVIDER_MAX_RETRIES, PROVIDER_RETRY_DELAY

class FMPProvider(FinancialDataProvider):
    """Financial Modeling Prep data provider implementation."""
    
    def __init__(self, api_key=None, cache_ttl=86400):
        """Initialize the FMP provider."""
        super().__init__(cache_ttl=cache_ttl)
        self.api_key = api_key or FMP_API_KEY
        self.base_url = "https://financialmodelingprep.com/api/v3"
        self.name = "fmp"
        
        if not self.api_key:
            print("Warning: Financial Modeling Prep API key not provided. API calls will fail.")
    
    @retry_with_backoff(max_retries=PROVIDER_MAX_RETRIES, initial_delay=PROVIDER_RETRY_DELAY)
    def _make_api_call(self, endpoint: str, **params) -> Any:
        """Make an API call to FMP."""
        # Check if API key is available
        if not self.api_key:
            raise DataNotAvailableError("Financial Modeling Prep API key not provided")
        
        # Build query parameters
        query_params = {
            "apikey": self.api_key,
            **params
        }
        
        # Check cache
        cache_key = f"fmp_{endpoint}_{json.dumps(query_params)}"
        cached_result = self.cache.get(cache_key)
        if cached_result:
            return cached_result
        
        # Make API call
        try:
            url = f"{self.base_url}/{endpoint}"
            response = requests.get(url, params=query_params, timeout=PROVIDER_TIMEOUT)
            
            # Check for error
            if response.status_code != 200:
                raise DataNotAvailableError(f"FMP API returned status code {response.status_code}")
            
            # Parse response
            data = response.json()
            
            # Check for empty response
            if not data:
                raise DataNotAvailableError(f"FMP API returned empty response for {endpoint}")
            
            # Cache result
            self.cache.set(cache_key, data)
            
            return data
        except requests.exceptions.Timeout:
            raise ProviderTimeoutError("FMP API timed out")
        except requests.exceptions.RequestException as e:
            raise DataNotAvailableError(f"FMP API request failed: {e}")
    
    def get_fundamentals(self, ticker: str) -> Fundamentals:
        """Get fundamental financial data."""
        try:
            # Get income statement, balance sheet, and cash flow
            income_stmt = self._get_income_statement(ticker)
            balance_sheet = self._get_balance_sheet(ticker)
            cash_flow = self._get_cash_flow(ticker)
            
            # Validate data
            if not income_stmt:
                raise IncompleteDataError(f"No income statement data available for {ticker}")
            if not balance_sheet:
                raise IncompleteDataError(f"No balance sheet data available for {ticker}")
            if not cash_flow:
                raise IncompleteDataError(f"No cash flow data available for {ticker}")
            
            # Create Fundamentals object
            fundamentals: Fundamentals = {
                "income": income_stmt,
                "balance": balance_sheet,
                "cashflow": cash_flow
            }
            
            return fundamentals
        except Exception as e:
            if isinstance(e, (IncompleteDataError, DataNotAvailableError, ProviderTimeoutError, ProviderRateLimitError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve fundamentals for {ticker}: {e}")
    
    def _get_income_statement(self, ticker: str, limit: int = 5) -> List[IncomeStatement]:
        """Get income statement data."""
        try:
            # Call FMP API
            data = self._make_api_call(f"income-statement/{ticker}", limit=limit)
            
            # Convert to list of IncomeStatement objects
            result = []
            
            for report in data:
                # Get fiscal year
                fiscal_date = report.get("date", "")
                if not fiscal_date:
                    continue
                
                year = int(fiscal_date.split("-")[0])
                
                # Get values
                revenue = float(report.get("revenue", 0)) if report.get("revenue") is not None else None
                ebit = float(report.get("operatingIncome", 0)) if report.get("operatingIncome") is not None else None
                
                # If revenue or EBIT is missing, skip this year
                if revenue is None or ebit is None:
                    continue
                
                # Get optional values
                net_income = float(report.get("netIncome", 0)) if report.get("netIncome") is not None else None
                tax_expense = float(report.get("incomeTaxExpense", 0)) if report.get("incomeTaxExpense") is not None else None
                interest_expense = float(report.get("interestExpense", 0)) if report.get("interestExpense") is not None else None
                depreciation_amortization = float(report.get("depreciationAndAmortization", 0)) if report.get("depreciationAndAmortization") is not None else None
                
                # Create IncomeStatement object
                income_statement: IncomeStatement = {
                    "year": year,
                    "revenue": revenue,
                    "ebit": ebit,
                    "da": depreciation_amortization,
                    "net_income": net_income,
                    "tax_expense": tax_expense,
                    "interest_expense": interest_expense
                }
                
                result.append(income_statement)
            
            # Sort by year (most recent first)
            result.sort(key=lambda x: x["year"], reverse=True)
            
            return result
        except Exception as e:
            if isinstance(e, (DataNotAvailableError, ProviderTimeoutError, ProviderRateLimitError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve income statement for {ticker}: {e}")
    
    def _get_balance_sheet(self, ticker: str, limit: int = 5) -> List[BalanceSheet]:
        """Get balance sheet data."""
        try:
            # Call FMP API
            data = self._make_api_call(f"balance-sheet-statement/{ticker}", limit=limit)
            
            # Convert to list of BalanceSheet objects
            result = []
            
            for report in data:
                # Get fiscal year
                fiscal_date = report.get("date", "")
                if not fiscal_date:
                    continue
                
                year = int(fiscal_date.split("-")[0])
                
                # Get values
                cash = float(report.get("cashAndCashEquivalents", 0)) if report.get("cashAndCashEquivalents") is not None else None
                
                # Calculate total debt
                short_term_debt = float(report.get("shortTermDebt", 0)) if report.get("shortTermDebt") is not None else 0
                long_term_debt = float(report.get("longTermDebt", 0)) if report.get("longTermDebt") is not None else 0
                total_debt = short_term_debt + long_term_debt
                
                # If cash is missing, skip this year
                if cash is None:
                    continue
                
                # Get optional values
                total_assets = float(report.get("totalAssets", 0)) if report.get("totalAssets") is not None else None
                total_equity = float(report.get("totalStockholdersEquity", 0)) if report.get("totalStockholdersEquity") is not None else None
                current_assets = float(report.get("totalCurrentAssets", 0)) if report.get("totalCurrentAssets") is not None else None
                current_liabilities = float(report.get("totalCurrentLiabilities", 0)) if report.get("totalCurrentLiabilities") is not None else None
                
                # Create BalanceSheet object
                balance_sheet_obj: BalanceSheet = {
                    "year": year,
                    "cash": cash,
                    "total_debt": total_debt,
                    "shares": None,  # Will be populated from market data
                    "total_assets": total_assets,
                    "total_equity": total_equity,
                    "current_assets": current_assets,
                    "current_liabilities": current_liabilities
                }
                
                result.append(balance_sheet_obj)
            
            # Sort by year (most recent first)
            result.sort(key=lambda x: x["year"], reverse=True)
            
            return result
        except Exception as e:
            if isinstance(e, (DataNotAvailableError, ProviderTimeoutError, ProviderRateLimitError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve balance sheet for {ticker}: {e}")
    
    def _get_cash_flow(self, ticker: str, limit: int = 5) -> List[CashFlow]:
        """Get cash flow data."""
        try:
            # Call FMP API
            data = self._make_api_call(f"cash-flow-statement/{ticker}", limit=limit)
            
            # Convert to list of CashFlow objects
            result = []
            
            for report in data:
                # Get fiscal year
                fiscal_date = report.get("date", "")
                if not fiscal_date:
                    continue
                
                year = int(fiscal_date.split("-")[0])
                
                # Get values
                capex = float(report.get("capitalExpenditure", 0)) if report.get("capitalExpenditure") is not None else None
                
                # If capex is missing, skip this year
                if capex is None:
                    continue
                
                # Make capex positive for consistency
                capex = abs(capex)
                
                # Get optional values
                delta_nwc = float(report.get("changeInWorkingCapital", 0)) if report.get("changeInWorkingCapital") is not None else None
                depreciation_amortization = float(report.get("depreciationAndAmortization", 0)) if report.get("depreciationAndAmortization") is not None else None
                operating_cash_flow = float(report.get("netCashProvidedByOperatingActivities", 0)) if report.get("netCashProvidedByOperatingActivities") is not None else None
                
                # Create CashFlow object
                cash_flow_obj: CashFlow = {
                    "year": year,
                    "capex": capex,
                    "delta_nwc": delta_nwc,
                    "depreciation_amortization": depreciation_amortization,
                    "operating_cash_flow": operating_cash_flow
                }
                
                result.append(cash_flow_obj)
            
            # Sort by year (most recent first)
            result.sort(key=lambda x: x["year"], reverse=True)
            
            return result
        except Exception as e:
            if isinstance(e, (DataNotAvailableError, ProviderTimeoutError, ProviderRateLimitError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve cash flow for {ticker}: {e}")
    
    def get_market_data(self, ticker: str) -> MarketData:
        """Get current market data."""
        try:
            # Get quote
            quote_data = self._make_api_call(f"quote/{ticker}")
            if not quote_data or len(quote_data) == 0:
                raise DataNotAvailableError(f"No quote data available for {ticker}")
            
            quote = quote_data[0]
            
            # Get company profile
            profile_data = self._make_api_call(f"profile/{ticker}")
            if not profile_data or len(profile_data) == 0:
                raise DataNotAvailableError(f"No profile data available for {ticker}")
            
            profile = profile_data[0]
            
            # Get price
            price = float(quote.get("price", 0)) if quote.get("price") is not None else None
            if price is None or price == 0:
                raise DataNotAvailableError(f"No price data available for {ticker}")
            
            # Get market cap
            market_cap = float(profile.get("mktCap", 0)) if profile.get("mktCap") is not None else None
            
            # Get shares outstanding
            shares_outstanding = float(profile.get("sharesOutstanding", 0)) if profile.get("sharesOutstanding") is not None else None
            
            # Calculate market cap if not available
            if market_cap is None and shares_outstanding is not None and price is not None:
                market_cap = shares_outstanding * price
            
            # Get beta
            beta = float(profile.get("beta", 0)) if profile.get("beta") is not None else None
            
            # Create MarketData object
            market_data: MarketData = {
                "price": price,
                "market_cap": market_cap,
                "beta": beta,
                "shares_outstanding": shares_outstanding,
                "pe_ratio": float(quote.get("pe", 0)) if quote.get("pe") is not None else None,
                "industry": profile.get("industry", None),
                "sector": profile.get("sector", None),
                "company_name": profile.get("companyName", ticker)
            }
            
            return market_data
        except Exception as e:
            if isinstance(e, (DataNotAvailableError, ProviderTimeoutError, ProviderRateLimitError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve market data for {ticker}: {e}")
    
    def get_estimates(self, ticker: str) -> Optional[Estimates]:
        """Get analyst estimates."""
        try:
            # Get analyst estimates
            estimates_data = self._make_api_call(f"analyst-estimates/{ticker}")
            if not estimates_data or len(estimates_data) == 0:
                return None
            
            # Get revenue growth estimates
            revenue_estimates = [e for e in estimates_data if e.get("estimatedType") == "Revenue"]
            if not revenue_estimates:
                return None
            
            # Sort by year (ascending)
            revenue_estimates.sort(key=lambda x: x.get("date", ""))
            
            # Get Y1 and Y2 growth
            rev_growth_y1 = None
            rev_growth_y2 = None
            
            if len(revenue_estimates) >= 2:
                # Calculate Y1 growth
                current_year_rev = float(revenue_estimates[0].get("estimatedValue", 0)) if revenue_estimates[0].get("estimatedValue") is not None else None
                next_year_rev = float(revenue_estimates[1].get("estimatedValue", 0)) if revenue_estimates[1].get("estimatedValue") is not None else None
                
                if current_year_rev is not None and next_year_rev is not None and current_year_rev > 0:
                    rev_growth_y1 = (next_year_rev / current_year_rev) - 1
            
            if len(revenue_estimates) >= 3:
                # Calculate Y2 growth
                next_year_rev = float(revenue_estimates[1].get("estimatedValue", 0)) if revenue_estimates[1].get("estimatedValue") is not None else None
                year_2_rev = float(revenue_estimates[2].get("estimatedValue", 0)) if revenue_estimates[2].get("estimatedValue") is not None else None
                
                if next_year_rev is not None and year_2_rev is not None and next_year_rev > 0:
                    rev_growth_y2 = (year_2_rev / next_year_rev) - 1
            
            # Get margin estimates
            ebit_estimates = [e for e in estimates_data if e.get("estimatedType") == "EBIT"]
            margin_y1 = None
            
            if ebit_estimates and len(revenue_estimates) >= 1:
                # Sort by year (ascending)
                ebit_estimates.sort(key=lambda x: x.get("date", ""))
                
                # Calculate Y1 margin
                next_year_ebit = float(ebit_estimates[0].get("estimatedValue", 0)) if ebit_estimates[0].get("estimatedValue") is not None else None
                next_year_rev = float(revenue_estimates[0].get("estimatedValue", 0)) if revenue_estimates[0].get("estimatedValue") is not None else None
                
                if next_year_ebit is not None and next_year_rev is not None and next_year_rev > 0:
                    margin_y1 = next_year_ebit / next_year_rev
            
            # Create Estimates object
            estimates: Estimates = {
                "rev_growth_y1": rev_growth_y1,
                "rev_growth_y2": rev_growth_y2,
                "margin_y1": margin_y1
            }
            
            return estimates
        except Exception as e:
            # Don't raise an exception for estimates, just return None
            print(f"Could not retrieve estimates for {ticker}: {e}")
            return None
    
    def get_prices(self, ticker: str, period: str = "2y", freq: str = "weekly") -> Optional[List[PricePoint]]:
        """Get historical price data."""
        try:
            # Convert period to days
            days = 730 if period == "2y" else 1825  # 2 years = 730 days, 5 years = 1825 days
            
            # Call FMP API
            if freq == "weekly":
                data = self._make_api_call(f"historical-price-full/{ticker}", serietype="line", timeseries=days // 7)
            else:
                data = self._make_api_call(f"historical-price-full/{ticker}", timeseries=days)
            
            # Extract historical prices
            historical_data = data.get("historical", [])
            if not historical_data:
                return None
            
            # Convert to list of PricePoint objects
            result = []
            
            for item in historical_data:
                price_point: PricePoint = {
                    "t": item.get("date", ""),
                    "p": float(item.get("close", 0))
                }
                
                result.append(price_point)
            
            # Sort by date (most recent first)
            result.sort(key=lambda x: x["t"], reverse=True)
            
            return result
        except Exception as e:
            # Don't raise an exception for prices, just return None
            print(f"Could not retrieve prices for {ticker}: {e}")
            return None
    
    def get_risk_free_rate(self) -> Optional[float]:
        """Get the current risk-free rate from US Treasury yield."""
        try:
            # Call FMP API for Treasury yield
            data = self._make_api_call("treasury")
            
            # Find 10-year Treasury yield
            for item in data:
                if item.get("maturity") == "10 Years":
                    return float(item.get("rate", 0)) / 100  # Convert from percentage to decimal
            
            return None
        except Exception as e:
            print(f"Could not retrieve risk-free rate: {e}")
            return None
