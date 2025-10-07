"""
Yahoo Finance data provider implementation.
"""

import yfinance as yf
import pandas as pd
import numpy as np
from typing import Dict, List, Any, Optional, Union
from datetime import datetime, timedelta
import time

from .base import FinancialDataProvider, DataNotAvailableError, retry_with_backoff
from ..config import API_CACHE_TTL, API_RETRY_COUNT, API_RETRY_DELAY

class YahooFinanceProvider(FinancialDataProvider):
    """Yahoo Finance data provider implementation."""
    
    def __init__(self, cache_ttl=API_CACHE_TTL):
        """Initialize the Yahoo Finance provider."""
        super().__init__(cache_ttl=cache_ttl)
    
    @retry_with_backoff(max_retries=API_RETRY_COUNT, initial_delay=API_RETRY_DELAY)
    def _get_ticker_info(self, ticker: str) -> Any:
        """Get yfinance Ticker object with caching."""
        cache_key = f"yf_ticker_{ticker}"
        ticker_info = self.cache.get(cache_key)
        
        if ticker_info is None:
            ticker_info = yf.Ticker(ticker)
            self.cache.set(cache_key, ticker_info)
        
        return ticker_info
    
    def get_company_info(self, ticker: str) -> Dict[str, Any]:
        """Get basic company information."""
        try:
            ticker_obj = self._get_ticker_info(ticker)
            info = ticker_obj.info
            
            return {
                "name": info.get("longName", info.get("shortName", ticker)),
                "industry": info.get("industry", ""),
                "sector": info.get("sector", ""),
                "description": info.get("longBusinessSummary", ""),
                "currency": info.get("currency", "USD"),
                "country": info.get("country", ""),
                "exchange": info.get("exchange", ""),
                "market": info.get("market", ""),
                "ticker": ticker
            }
        except Exception as e:
            print(f"Error getting company info for {ticker}: {e}")
            raise DataNotAvailableError(f"Could not retrieve company info for {ticker}: {e}")
    
    def get_income_statement(self, ticker: str, years: int = 5) -> Dict[str, List[float]]:
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
            
            # Convert to dictionary with lists
            result = {
                "dates": [d.strftime("%Y-%m-%d") for d in income_stmt.columns[:years]],
                "revenue": income_stmt.loc["Total Revenue"].values[:years].tolist(),
                "operating_income": income_stmt.loc["Operating Income"].values[:years].tolist() if "Operating Income" in income_stmt.index else [],
                "ebit": income_stmt.loc["EBIT"].values[:years].tolist() if "EBIT" in income_stmt.index else [],
                "net_income": income_stmt.loc["Net Income"].values[:years].tolist() if "Net Income" in income_stmt.index else [],
                "eps": income_stmt.loc["Basic EPS"].values[:years].tolist() if "Basic EPS" in income_stmt.index else [],
                "interest_expense": income_stmt.loc["Interest Expense"].values[:years].tolist() if "Interest Expense" in income_stmt.index else [],
                "income_tax_expense": income_stmt.loc["Tax Provision"].values[:years].tolist() if "Tax Provision" in income_stmt.index else [],
                "pretax_income": income_stmt.loc["Pretax Income"].values[:years].tolist() if "Pretax Income" in income_stmt.index else []
            }
            
            # Handle missing operating income
            if not result["operating_income"] and "EBIT" in income_stmt.index:
                result["operating_income"] = income_stmt.loc["EBIT"].values[:years].tolist()
            
            # Fill any missing lists with empty lists to avoid KeyErrors
            for key in ["operating_income", "ebit", "net_income", "eps", "interest_expense", "income_tax_expense", "pretax_income"]:
                if not result.get(key):
                    result[key] = [0] * len(result["dates"])
            
            return result
        except Exception as e:
            print(f"Error getting income statement for {ticker}: {e}")
            raise DataNotAvailableError(f"Could not retrieve income statement for {ticker}: {e}")
    
    def get_balance_sheet(self, ticker: str, years: int = 5) -> Dict[str, List[float]]:
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
            
            # Convert to dictionary with lists
            result = {
                "dates": [d.strftime("%Y-%m-%d") for d in balance_sheet.columns[:years]],
                "cash": balance_sheet.loc["Cash And Cash Equivalents"].values[:years].tolist() if "Cash And Cash Equivalents" in balance_sheet.index else [],
                "total_assets": balance_sheet.loc["Total Assets"].values[:years].tolist() if "Total Assets" in balance_sheet.index else [],
                "short_term_debt": balance_sheet.loc["Short Term Debt"].values[:years].tolist() if "Short Term Debt" in balance_sheet.index else [],
                "long_term_debt": balance_sheet.loc["Long Term Debt"].values[:years].tolist() if "Long Term Debt" in balance_sheet.index else [],
                "total_debt": [],  # Will calculate below
                "total_equity": balance_sheet.loc["Total Stockholder Equity"].values[:years].tolist() if "Total Stockholder Equity" in balance_sheet.index else [],
                "shares_outstanding": [],  # Will get from market data
                "working_capital": [],  # Will calculate below
                "current_assets": balance_sheet.loc["Current Assets"].values[:years].tolist() if "Current Assets" in balance_sheet.index else [],
                "current_liabilities": balance_sheet.loc["Current Liabilities"].values[:years].tolist() if "Current Liabilities" in balance_sheet.index else []
            }
            
            # Calculate total debt
            short_term = result.get("short_term_debt", [0] * len(result["dates"]))
            long_term = result.get("long_term_debt", [0] * len(result["dates"]))
            
            # Handle potential length mismatch
            min_len = min(len(short_term), len(long_term))
            result["total_debt"] = [short_term[i] + long_term[i] for i in range(min_len)]
            
            # Calculate working capital
            current_assets = result.get("current_assets", [0] * len(result["dates"]))
            current_liabilities = result.get("current_liabilities", [0] * len(result["dates"]))
            
            # Handle potential length mismatch
            min_len = min(len(current_assets), len(current_liabilities))
            result["working_capital"] = [current_assets[i] - current_liabilities[i] for i in range(min_len)]
            
            # Fill any missing lists with empty lists to avoid KeyErrors
            for key in ["cash", "total_assets", "short_term_debt", "long_term_debt", "total_debt", "total_equity", "working_capital"]:
                if not result.get(key):
                    result[key] = [0] * len(result["dates"])
            
            return result
        except Exception as e:
            print(f"Error getting balance sheet for {ticker}: {e}")
            raise DataNotAvailableError(f"Could not retrieve balance sheet for {ticker}: {e}")
    
    def get_cash_flow(self, ticker: str, years: int = 5) -> Dict[str, List[float]]:
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
            
            # Convert to dictionary with lists
            result = {
                "dates": [d.strftime("%Y-%m-%d") for d in cash_flow.columns[:years]],
                "operating_cash_flow": cash_flow.loc["Operating Cash Flow"].values[:years].tolist() if "Operating Cash Flow" in cash_flow.index else [],
                "capital_expenditures": cash_flow.loc["Capital Expenditure"].values[:years].tolist() if "Capital Expenditure" in cash_flow.index else [],
                "free_cash_flow": [],  # Will calculate below
                "change_in_working_capital": cash_flow.loc["Change In Working Capital"].values[:years].tolist() if "Change In Working Capital" in cash_flow.index else [],
                "depreciation_amortization": cash_flow.loc["Depreciation And Amortization"].values[:years].tolist() if "Depreciation And Amortization" in cash_flow.index else []
            }
            
            # Calculate free cash flow
            op_cash = result.get("operating_cash_flow", [0] * len(result["dates"]))
            capex = result.get("capital_expenditures", [0] * len(result["dates"]))
            
            # Handle potential length mismatch
            min_len = min(len(op_cash), len(capex))
            result["free_cash_flow"] = [op_cash[i] + capex[i] for i in range(min_len)]  # capex is negative in yfinance
            
            # Fill any missing lists with empty lists to avoid KeyErrors
            for key in ["operating_cash_flow", "capital_expenditures", "free_cash_flow", "change_in_working_capital", "depreciation_amortization"]:
                if not result.get(key):
                    result[key] = [0] * len(result["dates"])
            
            return result
        except Exception as e:
            print(f"Error getting cash flow for {ticker}: {e}")
            raise DataNotAvailableError(f"Could not retrieve cash flow for {ticker}: {e}")
    
    def get_market_data(self, ticker: str) -> Dict[str, Any]:
        """Get current market data."""
        try:
            ticker_obj = self._get_ticker_info(ticker)
            info = ticker_obj.info
            
            # Get shares outstanding
            shares = info.get("sharesOutstanding", 0)
            if shares == 0:
                shares = info.get("impliedSharesOutstanding", 0)
            
            # Calculate market cap if not available
            market_cap = info.get("marketCap", 0)
            if market_cap == 0 and shares > 0:
                market_cap = shares * info.get("currentPrice", info.get("previousClose", 0))
            
            return {
                "price": info.get("currentPrice", info.get("previousClose", 0)),
                "market_cap": market_cap,
                "beta": info.get("beta", None),
                "pe_ratio": info.get("trailingPE", info.get("forwardPE", None)),
                "dividend_yield": info.get("dividendYield", 0) * 100 if info.get("dividendYield") else 0,
                "shares_outstanding": shares,
                "52_week_high": info.get("fiftyTwoWeekHigh", 0),
                "52_week_low": info.get("fiftyTwoWeekLow", 0),
                "volume": info.get("volume", 0),
                "avg_volume": info.get("averageVolume", 0),
                "total_debt": info.get("totalDebt", 0)
            }
        except Exception as e:
            print(f"Error getting market data for {ticker}: {e}")
            raise DataNotAvailableError(f"Could not retrieve market data for {ticker}: {e}")
    
    def get_historical_prices(self, ticker: str, period: str = "5y") -> Dict[str, List[float]]:
        """Get historical price data."""
        try:
            ticker_obj = self._get_ticker_info(ticker)
            
            # Get historical prices
            hist = ticker_obj.history(period=period)
            
            if hist.empty:
                raise DataNotAvailableError(f"No historical price data available for {ticker}")
            
            # Convert to dictionary with lists
            return {
                "dates": [d.strftime("%Y-%m-%d") for d in hist.index],
                "prices": hist["Close"].tolist(),
                "volumes": hist["Volume"].tolist()
            }
        except Exception as e:
            print(f"Error getting historical prices for {ticker}: {e}")
            raise DataNotAvailableError(f"Could not retrieve historical prices for {ticker}: {e}")
    
    def get_analyst_estimates(self, ticker: str) -> Dict[str, Any]:
        """Get analyst estimates."""
        try:
            ticker_obj = self._get_ticker_info(ticker)
            
            # Get analyst recommendations
            try:
                recommendations = ticker_obj.recommendations
                latest_rec = None
                if recommendations is not None and not recommendations.empty:
                    # Try different column names that might exist
                    if 'To Grade' in recommendations.columns:
                        latest_rec = recommendations.iloc[-1]["To Grade"]
                    elif 'Action' in recommendations.columns:
                        latest_rec = recommendations.iloc[-1]["Action"]
            except Exception as e:
                print(f"Error getting recommendations for {ticker}: {e}")
                recommendations = None
                latest_rec = None
            
            # Get earnings estimates
            try:
                earnings = ticker_obj.earnings_dates
            except Exception as e:
                print(f"Error getting earnings dates for {ticker}: {e}")
                earnings = None
            
            # Extract growth estimates
            growth = {}
            info = ticker_obj.info
            
            if "earningsGrowth" in info:
                growth["earnings_growth"] = info["earningsGrowth"]
            
            if "revenueGrowth" in info:
                growth["revenue_growth"] = info["revenueGrowth"]
            
            if "earningsQuarterlyGrowth" in info:
                growth["earnings_quarterly_growth"] = info["earningsQuarterlyGrowth"]
            
            # Get earnings trend data if available
            trend_data = {}
            
            # Get earnings estimates if available
            eps_estimates = []
            if earnings is not None and not earnings.empty:
                try:
                    for i in range(min(4, len(earnings))):
                        eps_estimates.append({
                            "date": earnings.index[i].strftime("%Y-%m-%d"),
                            "estimate": earnings.iloc[i]["epsestimate"] if not pd.isna(earnings.iloc[i]["epsestimate"]) else None,
                            "actual": earnings.iloc[i]["epsactual"] if not pd.isna(earnings.iloc[i]["epsactual"]) else None
                        })
                except Exception as e:
                    print(f"Error processing earnings estimates for {ticker}: {e}")
            
            return {
                "revenue_estimates": [],  # Not easily available in yfinance
                "eps_estimates": eps_estimates,
                "price_target": info.get("targetMeanPrice", None),
                "recommendation": latest_rec,
                "growth_estimates": {**growth, **trend_data}
            }
        except Exception as e:
            print(f"Error getting analyst estimates for {ticker}: {e}")
            raise DataNotAvailableError(f"Could not retrieve analyst estimates for {ticker}: {e}")
    
    def get_risk_metrics(self, ticker: str) -> Dict[str, Any]:
        """Get risk metrics."""
        try:
            ticker_obj = self._get_ticker_info(ticker)
            info = ticker_obj.info
            
            # Get risk-free rate from 10-Year Treasury
            risk_free_rate = None
            try:
                treasury = yf.Ticker("^TNX")
                treasury_info = treasury.info
                risk_free_rate = treasury_info.get("previousClose", None)
                if risk_free_rate:
                    risk_free_rate = risk_free_rate / 100  # Convert from percentage to decimal
            except Exception as e:
                print(f"Error getting risk-free rate: {e}")
                risk_free_rate = None
            
            # Use default values if not available
            from ..config import DEFAULT_RISK_FREE_RATE, DEFAULT_EQUITY_RISK_PREMIUM
            
            # Get beta or calculate it
            beta = info.get("beta", None)
            if beta is None:
                beta = self.calculate_beta(ticker)
            
            return {
                "beta": beta,
                "risk_free_rate": risk_free_rate or DEFAULT_RISK_FREE_RATE,
                "equity_risk_premium": DEFAULT_EQUITY_RISK_PREMIUM
            }
        except Exception as e:
            print(f"Error getting risk metrics for {ticker}: {e}")
            raise DataNotAvailableError(f"Could not retrieve risk metrics for {ticker}: {e}")
    
    def get_industry_peers(self, ticker: str) -> List[str]:
        """Get industry peers for the company."""
        try:
            # First get the company's sector and industry
            company_info = self.get_company_info(ticker)
            sector = company_info.get("sector", "")
            industry = company_info.get("industry", "")
            
            if not sector and not industry:
                return []
            
            # This would require a more complex implementation to get peers
            # For now, return an empty list as yfinance doesn't provide this directly
            return []
        except Exception as e:
            print(f"Error getting industry peers for {ticker}: {e}")
            return []