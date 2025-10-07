"""
Google Sheets provider implementation for Google Finance data.
"""

import os
import json
from typing import Dict, List, Any, Optional, Union, cast
from datetime import datetime, timedelta
import time
import re

import gspread
from google.oauth2.service_account import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

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
from ..config import GOOGLE_SHEETS_CREDENTIALS, GOOGLE_SHEETS_SPREADSHEET_ID, PROVIDER_TIMEOUT, PROVIDER_MAX_RETRIES, PROVIDER_RETRY_DELAY

class GoogleSheetsProvider(FinancialDataProvider):
    """Google Sheets provider implementation for Google Finance data."""
    
    def __init__(self, credentials_json=None, spreadsheet_id=None, cache_ttl=86400):
        """Initialize the Google Sheets provider."""
        super().__init__(cache_ttl=cache_ttl)
        self.name = "google_sheets"
        
        # Get credentials from environment variable or parameter
        if credentials_json:
            self.credentials_json = credentials_json
        elif GOOGLE_SHEETS_CREDENTIALS:
            try:
                self.credentials_json = json.loads(GOOGLE_SHEETS_CREDENTIALS)
            except json.JSONDecodeError:
                # If not valid JSON, assume it's a path to a JSON file
                if os.path.exists(GOOGLE_SHEETS_CREDENTIALS):
                    with open(GOOGLE_SHEETS_CREDENTIALS, 'r') as f:
                        self.credentials_json = json.load(f)
                else:
                    print("Warning: Google Sheets credentials not valid JSON and not a valid path")
                    self.credentials_json = None
        else:
            self.credentials_json = None
        
        # Get spreadsheet ID from environment variable or parameter
        self.spreadsheet_id = spreadsheet_id or GOOGLE_SHEETS_SPREADSHEET_ID
        
        # Initialize client
        self.client = None
        if self.credentials_json:
            try:
                scopes = [
                    'https://www.googleapis.com/auth/spreadsheets',
                    'https://www.googleapis.com/auth/drive'
                ]
                credentials = Credentials.from_service_account_info(
                    self.credentials_json, scopes=scopes
                )
                self.client = gspread.authorize(credentials)
            except Exception as e:
                print(f"Error initializing Google Sheets client: {e}")
                self.client = None
        
        if not self.client:
            print("Warning: Google Sheets client not initialized. API calls will fail.")
    
    @retry_with_backoff(max_retries=PROVIDER_MAX_RETRIES, initial_delay=PROVIDER_RETRY_DELAY)
    def _get_or_create_sheet(self, ticker: str) -> Any:
        """Get or create a sheet for the ticker."""
        if not self.client or not self.spreadsheet_id:
            raise DataNotAvailableError("Google Sheets client not initialized")
        
        try:
            # Open the spreadsheet
            spreadsheet = self.client.open_by_key(self.spreadsheet_id)
            
            # Check if sheet for ticker exists
            try:
                sheet = spreadsheet.worksheet(ticker)
                return sheet
            except gspread.exceptions.WorksheetNotFound:
                # Create a new sheet for the ticker
                sheet = spreadsheet.add_worksheet(title=ticker, rows=100, cols=20)
                
                # Initialize the sheet with GOOGLEFINANCE formulas
                # Current price
                sheet.update_cell(1, 1, "Current Price")
                sheet.update_cell(1, 2, f'=GOOGLEFINANCE("{ticker}", "price")')
                
                # Market cap
                sheet.update_cell(2, 1, "Market Cap")
                sheet.update_cell(2, 2, f'=GOOGLEFINANCE("{ticker}", "marketcap")')
                
                # P/E ratio
                sheet.update_cell(3, 1, "P/E Ratio")
                sheet.update_cell(3, 2, f'=GOOGLEFINANCE("{ticker}", "pe")')
                
                # 52-week high
                sheet.update_cell(4, 1, "52-Week High")
                sheet.update_cell(4, 2, f'=GOOGLEFINANCE("{ticker}", "high52")')
                
                # 52-week low
                sheet.update_cell(5, 1, "52-Week Low")
                sheet.update_cell(5, 2, f'=GOOGLEFINANCE("{ticker}", "low52")')
                
                # Volume
                sheet.update_cell(6, 1, "Volume")
                sheet.update_cell(6, 2, f'=GOOGLEFINANCE("{ticker}", "volume")')
                
                # Historical prices (weekly for 2 years)
                sheet.update_cell(8, 1, "Date")
                sheet.update_cell(8, 2, "Close")
                sheet.update_cell(9, 1, f'=GOOGLEFINANCE("{ticker}", "price", TODAY()-730, TODAY(), "weekly")')
                
                # Wait for formulas to calculate
                time.sleep(2)
                
                return sheet
        except Exception as e:
            if isinstance(e, gspread.exceptions.APIError) and "Rate Limit Exceeded" in str(e):
                raise ProviderRateLimitError("Google Sheets API rate limit reached")
            raise DataNotAvailableError(f"Error accessing Google Sheets: {e}")
    
    def get_fundamentals(self, ticker: str) -> Fundamentals:
        """
        Get fundamental financial data.
        
        Note: Google Finance does not provide full financial statements,
        so this method always raises DataNotAvailableError.
        """
        raise DataNotAvailableError("Google Finance does not provide full financial statements")
    
    def get_market_data(self, ticker: str) -> MarketData:
        """Get current market data."""
        try:
            # Get or create sheet for ticker
            sheet = self._get_or_create_sheet(ticker)
            
            # Get all values
            values = sheet.get_all_values()
            
            # Extract market data
            price = None
            market_cap = None
            pe_ratio = None
            
            for row in values[:6]:  # First 6 rows contain market data
                if len(row) >= 2:
                    if row[0] == "Current Price":
                        try:
                            price = float(row[1])
                        except (ValueError, TypeError):
                            pass
                    elif row[0] == "Market Cap":
                        try:
                            # Convert market cap string to number
                            market_cap_str = row[1]
                            if market_cap_str.endswith("T"):  # Trillion
                                market_cap = float(market_cap_str[:-1]) * 1e12
                            elif market_cap_str.endswith("B"):  # Billion
                                market_cap = float(market_cap_str[:-1]) * 1e9
                            elif market_cap_str.endswith("M"):  # Million
                                market_cap = float(market_cap_str[:-1]) * 1e6
                            elif market_cap_str.endswith("K"):  # Thousand
                                market_cap = float(market_cap_str[:-1]) * 1e3
                            else:
                                market_cap = float(market_cap_str)
                        except (ValueError, TypeError, AttributeError):
                            pass
                    elif row[0] == "P/E Ratio":
                        try:
                            pe_ratio = float(row[1])
                        except (ValueError, TypeError):
                            pass
            
            # Validate data
            if price is None:
                raise DataNotAvailableError(f"No price data available for {ticker}")
            
            # Create MarketData object
            market_data: MarketData = {
                "price": price,
                "market_cap": market_cap,
                "beta": None,  # Google Finance doesn't provide beta directly
                "shares_outstanding": None,  # Google Finance doesn't provide shares outstanding
                "pe_ratio": pe_ratio,
                "industry": None,  # Google Finance doesn't provide industry classification
                "sector": None,  # Google Finance doesn't provide sector classification
                "company_name": ticker  # Google Finance doesn't provide company name
            }
            
            return market_data
        except Exception as e:
            if isinstance(e, (DataNotAvailableError, ProviderTimeoutError, ProviderRateLimitError)):
                raise
            raise DataNotAvailableError(f"Could not retrieve market data for {ticker}: {e}")
    
    def get_estimates(self, ticker: str) -> Optional[Estimates]:
        """
        Get analyst estimates.
        
        Note: Google Finance does not provide analyst estimates,
        so this method always returns None.
        """
        return None
    
    def get_prices(self, ticker: str, period: str = "2y", freq: str = "weekly") -> Optional[List[PricePoint]]:
        """Get historical price data."""
        try:
            # Get or create sheet for ticker
            sheet = self._get_or_create_sheet(ticker)
            
            # Get all values
            values = sheet.get_all_values()
            
            # Find historical prices
            historical_prices = []
            in_price_data = False
            
            for row in values:
                if len(row) >= 2:
                    if in_price_data:
                        try:
                            date_str = row[0]
                            price = float(row[1])
                            
                            # Skip empty or invalid rows
                            if date_str and price > 0:
                                historical_prices.append({
                                    "t": date_str,
                                    "p": price
                                })
                        except (ValueError, TypeError):
                            pass
                    elif row[0] == "Date" and row[1] == "Close":
                        in_price_data = True
            
            # If no historical prices found, try to refresh the formula
            if not historical_prices:
                # Update the formula to trigger a refresh
                days = 730 if period == "2y" else 1825  # 2 years = 730 days, 5 years = 1825 days
                freq_str = "weekly" if freq == "weekly" else "daily"
                sheet.update_cell(9, 1, f'=GOOGLEFINANCE("{ticker}", "price", TODAY()-{days}, TODAY(), "{freq_str}")')
                
                # Wait for formulas to calculate
                time.sleep(2)
                
                # Try again
                values = sheet.get_all_values()
                in_price_data = False
                
                for row in values:
                    if len(row) >= 2:
                        if in_price_data:
                            try:
                                date_str = row[0]
                                price = float(row[1])
                                
                                # Skip empty or invalid rows
                                if date_str and price > 0:
                                    historical_prices.append({
                                        "t": date_str,
                                        "p": price
                                    })
                            except (ValueError, TypeError):
                                pass
                        elif row[0] == "Date" and row[1] == "Close":
                            in_price_data = True
            
            # Sort by date (most recent first)
            historical_prices.sort(key=lambda x: x["t"], reverse=True)
            
            return historical_prices
        except Exception as e:
            # Don't raise an exception for prices, just return None
            print(f"Could not retrieve prices for {ticker}: {e}")
            return None
    
    def get_risk_free_rate(self) -> Optional[float]:
        """Get the current risk-free rate from 10-Year Treasury yield."""
        try:
            # Get or create sheet for risk-free rate
            sheet = self._get_or_create_sheet("RiskFreeRate")
            
            # Update the formula to get the current 10-Year Treasury yield
            sheet.update_cell(1, 1, "10-Year Treasury Yield")
            sheet.update_cell(1, 2, '=GOOGLEFINANCE("^TNX", "price")')
            
            # Wait for formula to calculate
            time.sleep(2)
            
            # Get the value
            values = sheet.get_all_values()
            if len(values) >= 1 and len(values[0]) >= 2:
                try:
                    return float(values[0][1]) / 100  # Convert from percentage to decimal
                except (ValueError, TypeError):
                    pass
            
            return None
        except Exception as e:
            print(f"Could not retrieve risk-free rate: {e}")
            return None
    
    def calculate_beta(self, ticker: str, market_ticker: str = "^GSPC", years: int = 2) -> Optional[float]:
        """Calculate beta using regression of returns against market returns."""
        try:
            # Get historical prices for ticker and market
            ticker_prices = self.get_prices(ticker, f"{years}y", "weekly")
            market_prices = self.get_prices(market_ticker, f"{years}y", "weekly")
            
            if not ticker_prices or not market_prices:
                return None
            
            # Extract prices
            ticker_price_values = [p["p"] for p in ticker_prices]
            market_price_values = [p["p"] for p in market_prices]
            
            # Ensure we have the same number of data points
            min_len = min(len(ticker_price_values), len(market_price_values))
            if min_len < 30:  # Need at least 30 data points
                return None
                
            ticker_price_values = ticker_price_values[:min_len]
            market_price_values = market_price_values[:min_len]
            
            # Calculate returns
            ticker_returns = [(ticker_price_values[i] / ticker_price_values[i+1]) - 1 for i in range(min_len-1)]
            market_returns = [(market_price_values[i] / market_price_values[i+1]) - 1 for i in range(min_len-1)]
            
            # Calculate beta using covariance and variance
            mean_ticker = sum(ticker_returns) / len(ticker_returns)
            mean_market = sum(market_returns) / len(market_returns)
            
            covariance = sum((ticker_returns[i] - mean_ticker) * (market_returns[i] - mean_market) 
                            for i in range(len(ticker_returns))) / len(ticker_returns)
            variance = sum((market_returns[i] - mean_market) ** 2 for i in range(len(market_returns))) / len(market_returns)
            
            if variance == 0:
                return None
                
            beta = covariance / variance
            
            # Bound beta within reasonable limits
            from ..config import BETA_MIN, BETA_MAX
            beta = max(BETA_MIN, min(BETA_MAX, beta))
            
            return beta
        except Exception as e:
            print(f"Error calculating beta: {e}")
            return None
