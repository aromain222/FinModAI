"""
Yahoo Finance data provider implementation.
"""

import yfinance as yf
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Union, cast
from datetime import datetime, timedelta
import time
import signal
from contextlib import contextmanager

from .base import (
    FinancialDataProvider,
    DataNotAvailableError,
    IncompleteDataError,
    ProviderTimeoutError,
    retry_with_backoff,
    Fundamentals,
    MarketData,
    Estimates,
    PricePoint,
    IncomeStatement,
    BalanceSheet,
    CashFlow,
)
from ..config import PROVIDER_TIMEOUT, PROVIDER_MAX_RETRIES, PROVIDER_RETRY_DELAY

class TimeoutException(Exception):
    """Exception raised when a function times out."""
    pass

@contextmanager
def time_limit(seconds):
    """Context manager for limiting function execution time."""
    def signal_handler(signum, frame):
        raise TimeoutException("Timed out")
    
    signal.signal(signal.SIGALRM, signal_handler)
    signal.alarm(seconds)
    try:
        yield
    finally:
        signal.alarm(0)

class YahooFinanceProvider(FinancialDataProvider):
    """Yahoo Finance data provider implementation."""
    
    def __init__(self, cache_ttl=86400):
        """Initialize the Yahoo Finance provider."""
        super().__init__(cache_ttl=cache_ttl)
        self.name = "yahoo"
    
    @retry_with_backoff(max_retries=PROVIDER_MAX_RETRIES, initial_delay=PROVIDER_RETRY_DELAY)
    def _get_ticker_info(self, ticker: str) -> Any:
        """Get yfinance Ticker object with caching."""
        cache_key = f"yf_ticker_{ticker}"
        ticker_info = self.cache.get(cache_key)
        
        if ticker_info is None:
            try:
                with time_limit(PROVIDER_TIMEOUT):
                    ticker_info = yf.Ticker(ticker)
                self.cache.set(cache_key, ticker_info)
            except TimeoutException:
                raise ProviderTimeoutError(f"Yahoo Finance API timed out for {ticker}")
        
        return ticker_info
    
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
            if isinstance(e, (IncompleteDataError, DataNotAvailableError, ProviderTimeoutError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve fundamentals for {ticker}: {e}")
    
    def _get_income_statement(self, ticker: str, years: int = 5) -> List[IncomeStatement]:
        """Get income statement data."""
        try:
            ticker_obj = self._get_ticker_info(ticker)
            
            # Get annual income statement
            income_stmt = ticker_obj.income_stmt
            
            # If empty, try quarterly and aggregate
            if income_stmt.empty:
                income_stmt = ticker_obj.quarterly_income_stmt
                if income_stmt.empty:
                    raise DataNotAvailableError(f"No income statement data available for {ticker}")
            
            # Convert to list of IncomeStatement objects
            result = []
            
            for i, col in enumerate(income_stmt.columns[:years]):
                year = int(col.year)
                
                # Get values
                revenue = float(income_stmt.loc["Total Revenue"].iloc[i]) if "Total Revenue" in income_stmt.index else None
                ebit = float(income_stmt.loc["Operating Income"].iloc[i]) if "Operating Income" in income_stmt.index else None
                
                # If EBIT is not available, try alternative fields
                if ebit is None and "EBIT" in income_stmt.index:
                    ebit = float(income_stmt.loc["EBIT"].iloc[i])
                
                # If revenue or EBIT is missing, skip this year
                if revenue is None or ebit is None:
                    continue
                
                # Get optional values
                net_income = float(income_stmt.loc["Net Income"].iloc[i]) if "Net Income" in income_stmt.index else None
                tax_expense = float(income_stmt.loc["Tax Provision"].iloc[i]) if "Tax Provision" in income_stmt.index else None
                interest_expense = float(income_stmt.loc["Interest Expense"].iloc[i]) if "Interest Expense" in income_stmt.index else None
                
                # Create IncomeStatement object
                income_statement: IncomeStatement = {
                    "year": year,
                    "revenue": revenue,
                    "ebit": ebit,
                    "da": None,  # Will be populated from cash flow
                    "net_income": net_income,
                    "tax_expense": tax_expense,
                    "interest_expense": interest_expense
                }
                
                result.append(income_statement)
            
            # Sort by year (most recent first)
            result.sort(key=lambda x: x["year"], reverse=True)
            
            return result
        except Exception as e:
            if isinstance(e, (DataNotAvailableError, ProviderTimeoutError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve income statement for {ticker}: {e}")
    
    def _get_balance_sheet(self, ticker: str, years: int = 5) -> List[BalanceSheet]:
        """Get balance sheet data."""
        try:
            ticker_obj = self._get_ticker_info(ticker)
            
            # Get annual balance sheet
            balance_sheet = ticker_obj.balance_sheet
            
            # If empty, try quarterly and aggregate
            if balance_sheet.empty:
                balance_sheet = ticker_obj.quarterly_balance_sheet
                if balance_sheet.empty:
                    raise DataNotAvailableError(f"No balance sheet data available for {ticker}")
            
            # Convert to list of BalanceSheet objects
            result = []
            
            for i, col in enumerate(balance_sheet.columns[:years]):
                year = int(col.year)
                
                # Get values
                cash = float(balance_sheet.loc["Cash And Cash Equivalents"].iloc[i]) if "Cash And Cash Equivalents" in balance_sheet.index else None
                
                # Calculate total debt
                short_term_debt = float(balance_sheet.loc["Short Term Debt"].iloc[i]) if "Short Term Debt" in balance_sheet.index else 0
                long_term_debt = float(balance_sheet.loc["Long Term Debt"].iloc[i]) if "Long Term Debt" in balance_sheet.index else 0
                total_debt = short_term_debt + long_term_debt
                
                # If cash or total_debt is missing, skip this year
                if cash is None:
                    continue
                
                # Get optional values
                total_assets = float(balance_sheet.loc["Total Assets"].iloc[i]) if "Total Assets" in balance_sheet.index else None
                total_equity = float(balance_sheet.loc["Total Stockholder Equity"].iloc[i]) if "Total Stockholder Equity" in balance_sheet.index else None
                current_assets = float(balance_sheet.loc["Current Assets"].iloc[i]) if "Current Assets" in balance_sheet.index else None
                current_liabilities = float(balance_sheet.loc["Current Liabilities"].iloc[i]) if "Current Liabilities" in balance_sheet.index else None
                
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
            if isinstance(e, (DataNotAvailableError, ProviderTimeoutError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve balance sheet for {ticker}: {e}")
    
    def _get_cash_flow(self, ticker: str, years: int = 5) -> List[CashFlow]:
        """Get cash flow data."""
        try:
            ticker_obj = self._get_ticker_info(ticker)
            
            # Get annual cash flow statement
            cash_flow = ticker_obj.cashflow
            
            # If empty, try quarterly and aggregate
            if cash_flow.empty:
                cash_flow = ticker_obj.quarterly_cashflow
                if cash_flow.empty:
                    raise DataNotAvailableError(f"No cash flow data available for {ticker}")
            
            # Convert to list of CashFlow objects
            result = []
            
            for i, col in enumerate(cash_flow.columns[:years]):
                year = int(col.year)
                
                # Get values (capex is negative in yfinance)
                capex = float(cash_flow.loc["Capital Expenditure"].iloc[i]) if "Capital Expenditure" in cash_flow.index else None
                
                # If capex is missing, skip this year
                if capex is None:
                    continue
                
                # Make capex positive for consistency
                capex = abs(capex)
                
                # Get optional values
                delta_nwc = float(cash_flow.loc["Change In Working Capital"].iloc[i]) if "Change In Working Capital" in cash_flow.index else None
                depreciation_amortization = float(cash_flow.loc["Depreciation And Amortization"].iloc[i]) if "Depreciation And Amortization" in cash_flow.index else None
                operating_cash_flow = float(cash_flow.loc["Operating Cash Flow"].iloc[i]) if "Operating Cash Flow" in cash_flow.index else None
                
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
            if isinstance(e, (DataNotAvailableError, ProviderTimeoutError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve cash flow for {ticker}: {e}")
    
    def get_market_data(self, ticker: str) -> MarketData:
        """Get current market data."""
        try:
            ticker_obj = self._get_ticker_info(ticker)
            info = ticker_obj.info
            
            # Get price
            price = info.get("currentPrice", info.get("previousClose", None))
            if price is None:
                raise DataNotAvailableError(f"No price data available for {ticker}")
            
            # Get shares outstanding
            shares_outstanding = info.get("sharesOutstanding", info.get("impliedSharesOutstanding", None))
            
            # Calculate market cap if not available
            market_cap = info.get("marketCap", None)
            if market_cap is None and shares_outstanding is not None and price is not None:
                market_cap = shares_outstanding * price
            
            # Get beta
            beta = info.get("beta", None)
            
            # Create MarketData object
            market_data: MarketData = {
                "price": float(price),
                "market_cap": float(market_cap) if market_cap is not None else None,
                "beta": float(beta) if beta is not None else None,
                "shares_outstanding": float(shares_outstanding) if shares_outstanding is not None else None,
                "pe_ratio": float(info.get("trailingPE", info.get("forwardPE", None))) if info.get("trailingPE", info.get("forwardPE", None)) is not None else None,
                "industry": info.get("industry", None),
                "sector": info.get("sector", None),
                "company_name": info.get("longName", info.get("shortName", ticker))
            }
            
            return market_data
        except Exception as e:
            if isinstance(e, (DataNotAvailableError, ProviderTimeoutError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve market data for {ticker}: {e}")
    
    def get_estimates(self, ticker: str) -> Optional[Estimates]:
        """Get analyst estimates."""
        try:
            ticker_obj = self._get_ticker_info(ticker)
            info = ticker_obj.info
            
            # Extract growth estimates
            growth_estimates = {}
            
            # Revenue growth
            if "revenueGrowth" in info:
                growth_estimates["rev_growth_y1"] = info["revenueGrowth"]
            
            # Try to get earnings trend data
            try:
                earnings_forecast = ticker_obj.earnings_trend
                if earnings_forecast is not None and not earnings_forecast.empty:
                    # Extract growth estimates from earnings trend
                    try:
                        growth_estimates["rev_growth_y2"] = earnings_forecast.iloc[-1]["Growth Estimate Next Year"]
                    except:
                        pass
            except:
                pass
            
            # If we don't have any estimates, return None
            if not growth_estimates:
                return None
            
            # Create Estimates object
            estimates: Estimates = {
                "rev_growth_y1": float(growth_estimates.get("rev_growth_y1")) if growth_estimates.get("rev_growth_y1") is not None else None,
                "rev_growth_y2": float(growth_estimates.get("rev_growth_y2")) if growth_estimates.get("rev_growth_y2") is not None else None,
                "margin_y1": None  # Not available from Yahoo Finance
            }
            
            return estimates
        except Exception as e:
            # Don't raise an exception for estimates, just return None
            print(f"Could not retrieve estimates for {ticker}: {e}")
            return None
    
    def get_prices(self, ticker: str, period: str = "2y", freq: str = "weekly") -> Optional[List[PricePoint]]:
        """Get historical price data."""
        try:
            ticker_obj = self._get_ticker_info(ticker)
            
            # Convert frequency to yfinance interval
            interval = "1d" if freq == "daily" else "1wk"
            
            # Get historical prices
            hist = ticker_obj.history(period=period, interval=interval)
            
            if hist.empty:
                return None
            
            # Convert to list of PricePoint objects
            result = []
            
            for date, row in hist.iterrows():
                price_point: PricePoint = {
                    "t": date.strftime("%Y-%m-%d"),
                    "p": float(row["Close"])
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
        """Get the current risk-free rate from 10-Year Treasury."""
        try:
            treasury = yf.Ticker("^TNX")
            info = treasury.info
            
            rate = info.get("previousClose", None)
            if rate is not None:
                return float(rate) / 100  # Convert from percentage to decimal
            
            return None
        except Exception as e:
            print(f"Could not retrieve risk-free rate: {e}")
            return None
