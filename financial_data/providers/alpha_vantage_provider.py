"""
Alpha Vantage data provider implementation.
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
from ..config import ALPHAVANTAGE_API_KEY, PROVIDER_TIMEOUT, PROVIDER_MAX_RETRIES, PROVIDER_RETRY_DELAY

class AlphaVantageProvider(FinancialDataProvider):
    """Alpha Vantage data provider implementation."""
    
    def __init__(self, api_key=None, cache_ttl=86400):
        """Initialize the Alpha Vantage provider."""
        super().__init__(cache_ttl=cache_ttl)
        self.api_key = api_key or ALPHAVANTAGE_API_KEY
        self.base_url = "https://www.alphavantage.co/query"
        self.name = "alphavantage"
        
        if not self.api_key:
            print("Warning: Alpha Vantage API key not provided. API calls will fail.")
    
    @retry_with_backoff(max_retries=PROVIDER_MAX_RETRIES, initial_delay=PROVIDER_RETRY_DELAY)
    def _make_api_call(self, function: str, symbol: str = None, **params) -> Dict[str, Any]:
        """Make an API call to Alpha Vantage."""
        # Check if API key is available
        if not self.api_key:
            raise DataNotAvailableError("Alpha Vantage API key not provided")
        
        # Build query parameters
        query_params = {
            "function": function,
            "apikey": self.api_key,
            **params
        }
        
        if symbol:
            query_params["symbol"] = symbol
        
        # Check cache
        cache_key = f"av_{function}_{json.dumps(query_params)}"
        cached_result = self.cache.get(cache_key)
        if cached_result:
            return cached_result
        
        # Make API call
        try:
            response = requests.get(self.base_url, params=query_params, timeout=PROVIDER_TIMEOUT)
            
            # Check for rate limiting
            if "Note" in response.text and "API call frequency" in response.text:
                raise ProviderRateLimitError("Alpha Vantage API rate limit reached")
            
            # Check for error
            if response.status_code != 200:
                raise DataNotAvailableError(f"Alpha Vantage API returned status code {response.status_code}")
            
            # Parse response
            data = response.json()
            
            # Check for error message
            if "Error Message" in data:
                raise DataNotAvailableError(f"Alpha Vantage API error: {data['Error Message']}")
            
            # Cache result
            self.cache.set(cache_key, data)
            
            return data
        except requests.exceptions.Timeout:
            raise ProviderTimeoutError("Alpha Vantage API timed out")
        except requests.exceptions.RequestException as e:
            raise DataNotAvailableError(f"Alpha Vantage API request failed: {e}")
    
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
    
    def _get_income_statement(self, ticker: str) -> List[IncomeStatement]:
        """Get income statement data."""
        try:
            # Call Alpha Vantage API
            data = self._make_api_call("INCOME_STATEMENT", ticker)
            
            # Extract annual reports
            annual_reports = data.get("annualReports", [])
            if not annual_reports:
                raise DataNotAvailableError(f"No income statement data available for {ticker}")
            
            # Convert to list of IncomeStatement objects
            result = []
            
            for report in annual_reports:
                # Get fiscal year
                fiscal_date = report.get("fiscalDateEnding", "")
                if not fiscal_date:
                    continue
                
                year = int(fiscal_date.split("-")[0])
                
                # Get values
                revenue = float(report.get("totalRevenue", 0)) if report.get("totalRevenue") else None
                ebit = float(report.get("operatingIncome", 0)) if report.get("operatingIncome") else None
                
                # If revenue or EBIT is missing, skip this year
                if revenue is None or ebit is None:
                    continue
                
                # Get optional values
                net_income = float(report.get("netIncome", 0)) if report.get("netIncome") else None
                tax_expense = float(report.get("incomeTaxExpense", 0)) if report.get("incomeTaxExpense") else None
                interest_expense = float(report.get("interestExpense", 0)) if report.get("interestExpense") else None
                depreciation_amortization = float(report.get("depreciation", 0)) if report.get("depreciation") else None
                
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
    
    def _get_balance_sheet(self, ticker: str) -> List[BalanceSheet]:
        """Get balance sheet data."""
        try:
            # Call Alpha Vantage API
            data = self._make_api_call("BALANCE_SHEET", ticker)
            
            # Extract annual reports
            annual_reports = data.get("annualReports", [])
            if not annual_reports:
                raise DataNotAvailableError(f"No balance sheet data available for {ticker}")
            
            # Convert to list of BalanceSheet objects
            result = []
            
            for report in annual_reports:
                # Get fiscal year
                fiscal_date = report.get("fiscalDateEnding", "")
                if not fiscal_date:
                    continue
                
                year = int(fiscal_date.split("-")[0])
                
                # Get values
                cash = float(report.get("cashAndCashEquivalentsAtCarryingValue", 0)) if report.get("cashAndCashEquivalentsAtCarryingValue") else None
                
                # Calculate total debt
                short_term_debt = float(report.get("shortTermDebt", 0)) if report.get("shortTermDebt") else 0
                long_term_debt = float(report.get("longTermDebt", 0)) if report.get("longTermDebt") else 0
                total_debt = short_term_debt + long_term_debt
                
                # If cash is missing, skip this year
                if cash is None:
                    continue
                
                # Get optional values
                total_assets = float(report.get("totalAssets", 0)) if report.get("totalAssets") else None
                total_equity = float(report.get("totalShareholderEquity", 0)) if report.get("totalShareholderEquity") else None
                current_assets = float(report.get("totalCurrentAssets", 0)) if report.get("totalCurrentAssets") else None
                current_liabilities = float(report.get("totalCurrentLiabilities", 0)) if report.get("totalCurrentLiabilities") else None
                shares = float(report.get("commonStockSharesOutstanding", 0)) if report.get("commonStockSharesOutstanding") else None
                
                # Create BalanceSheet object
                balance_sheet_obj: BalanceSheet = {
                    "year": year,
                    "cash": cash,
                    "total_debt": total_debt,
                    "shares": shares,
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
    
    def _get_cash_flow(self, ticker: str) -> List[CashFlow]:
        """Get cash flow data."""
        try:
            # Call Alpha Vantage API
            data = self._make_api_call("CASH_FLOW", ticker)
            
            # Extract annual reports
            annual_reports = data.get("annualReports", [])
            if not annual_reports:
                raise DataNotAvailableError(f"No cash flow data available for {ticker}")
            
            # Convert to list of CashFlow objects
            result = []
            
            for report in annual_reports:
                # Get fiscal year
                fiscal_date = report.get("fiscalDateEnding", "")
                if not fiscal_date:
                    continue
                
                year = int(fiscal_date.split("-")[0])
                
                # Get values
                capex = float(report.get("capitalExpenditures", 0)) if report.get("capitalExpenditures") else None
                
                # If capex is missing, skip this year
                if capex is None:
                    continue
                
                # Make capex positive for consistency
                capex = abs(capex)
                
                # Get optional values
                delta_nwc = float(report.get("changeInWorkingCapital", 0)) if report.get("changeInWorkingCapital") else None
                depreciation_amortization = float(report.get("depreciation", 0)) if report.get("depreciation") else None
                operating_cash_flow = float(report.get("operatingCashflow", 0)) if report.get("operatingCashflow") else None
                
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
            quote_data = self._make_api_call("GLOBAL_QUOTE", ticker)
            
            # Get company overview
            overview_data = self._make_api_call("OVERVIEW", ticker)
            
            # Get price
            price = float(quote_data.get("Global Quote", {}).get("05. price", 0))
            if price == 0:
                raise DataNotAvailableError(f"No price data available for {ticker}")
            
            # Get shares outstanding
            shares_outstanding = float(overview_data.get("SharesOutstanding", 0)) if overview_data.get("SharesOutstanding") else None
            
            # Calculate market cap if not available
            market_cap = float(overview_data.get("MarketCapitalization", 0)) if overview_data.get("MarketCapitalization") else None
            if market_cap is None and shares_outstanding is not None and price is not None:
                market_cap = shares_outstanding * price
            
            # Get beta
            beta = float(overview_data.get("Beta", 0)) if overview_data.get("Beta") else None
            
            # Create MarketData object
            market_data: MarketData = {
                "price": price,
                "market_cap": market_cap,
                "beta": beta,
                "shares_outstanding": shares_outstanding,
                "pe_ratio": float(overview_data.get("PERatio", 0)) if overview_data.get("PERatio") else None,
                "industry": overview_data.get("Industry", None),
                "sector": overview_data.get("Sector", None),
                "company_name": overview_data.get("Name", ticker)
            }
            
            return market_data
        except Exception as e:
            if isinstance(e, (DataNotAvailableError, ProviderTimeoutError, ProviderRateLimitError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve market data for {ticker}: {e}")
    
    def get_estimates(self, ticker: str) -> Optional[Estimates]:
        """Get analyst estimates."""
        try:
            # Get company overview for EPS estimates
            overview_data = self._make_api_call("OVERVIEW", ticker)
            
            # Extract growth estimates
            eps_growth = float(overview_data.get("EPSGrowth", 0)) if overview_data.get("EPSGrowth") else None
            
            # If we don't have any estimates, return None
            if eps_growth is None:
                return None
            
            # Create Estimates object
            estimates: Estimates = {
                "rev_growth_y1": eps_growth,  # Use EPS growth as a proxy for revenue growth
                "rev_growth_y2": None,
                "margin_y1": None
            }
            
            return estimates
        except Exception as e:
            # Don't raise an exception for estimates, just return None
            print(f"Could not retrieve estimates for {ticker}: {e}")
            return None
    
    def get_prices(self, ticker: str, period: str = "2y", freq: str = "weekly") -> Optional[List[PricePoint]]:
        """Get historical price data."""
        try:
            # Convert period to Alpha Vantage outputsize
            outputsize = "full" if period == "5y" else "compact"
            
            # Convert frequency to Alpha Vantage function
            function = "TIME_SERIES_WEEKLY" if freq == "weekly" else "TIME_SERIES_DAILY"
            
            # Make API call
            data = self._make_api_call(function, ticker, outputsize=outputsize)
            
            # Extract time series
            time_series_key = "Weekly Time Series" if freq == "weekly" else "Time Series (Daily)"
            time_series = data.get(time_series_key, {})
            
            if not time_series:
                return None
            
            # Convert to list of PricePoint objects
            result = []
            
            for date_str, values in time_series.items():
                price_point: PricePoint = {
                    "t": date_str,
                    "p": float(values.get("4. close", 0))
                }
                
                result.append(price_point)
            
            # Sort by date (most recent first)
            result.sort(key=lambda x: x["t"], reverse=True)
            
            # Limit by period
            if period == "2y":
                # Get data for last 2 years (104 weeks or 730 days)
                limit = 104 if freq == "weekly" else 730
                result = result[:limit]
            
            return result
        except Exception as e:
            # Don't raise an exception for prices, just return None
            print(f"Could not retrieve prices for {ticker}: {e}")
            return None
    
    def get_risk_free_rate(self) -> Optional[float]:
        """Get the current risk-free rate from US Treasury yield."""
        try:
            # Call Alpha Vantage API for Treasury yield
            data = self._make_api_call("TREASURY_YIELD", maturity="10year")
            
            # Extract latest yield
            latest_data = data.get("data", [])
            if not latest_data:
                return None
            
            # Get the most recent yield
            latest_yield = float(latest_data[0].get("value", 0)) / 100  # Convert from percentage to decimal
            
            return latest_yield
        except Exception as e:
            print(f"Could not retrieve risk-free rate: {e}")
            return None
