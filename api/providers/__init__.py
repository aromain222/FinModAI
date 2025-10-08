#!/usr/bin/env python3
"""
Provider Interface and Manager
Handles data fetching from multiple sources with fallbacks
"""

import os
import asyncio
import logging
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
import httpx
import yfinance as yf
import pandas as pd

logger = logging.getLogger(__name__)

@dataclass
class FinancialData:
    """Standardized financial data structure"""
    ticker: str
    company_name: str
    currency: str
    historicals: 'HistoricalData'
    market_data: 'MarketData'
    estimates: Optional['EstimatesData'] = None
    provenance: Dict[str, Dict[str, str]] = None

@dataclass
class HistoricalData:
    """Historical financial statements"""
    years: List[int]
    revenue: List[float]
    operating_income: List[float]
    op_margin: List[float]
    da: List[float]
    capex: List[float]
    delta_nwc: List[float]
    tax_expense: List[float]
    pretax_income: List[float]
    interest_expense: List[float]
    total_debt: List[float]
    shares_outstanding: List[float]

@dataclass
class MarketData:
    """Market data"""
    price: float
    market_cap: float
    beta: Optional[float]
    last_updated: str

@dataclass
class EstimatesData:
    """Analyst estimates"""
    revenue_growth_y1: Optional[float]
    revenue_growth_y2: Optional[float]
    margin_y1: Optional[float]
    margin_y2: Optional[float]

class BaseProvider(ABC):
    """Abstract base class for data providers"""
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self.name = self.__class__.__name__.replace("Provider", "")
        self.timeout = 10.0
        self.max_retries = 3
    
    @abstractmethod
    async def get_fundamentals(self, ticker: str) -> Optional[HistoricalData]:
        """Get fundamental financial data"""
        pass
    
    @abstractmethod
    async def get_market_data(self, ticker: str) -> Optional[MarketData]:
        """Get market data (price, beta, etc.)"""
        pass
    
    @abstractmethod
    async def get_estimates(self, ticker: str) -> Optional[EstimatesData]:
        """Get analyst estimates"""
        pass
    
    async def get_financial_data(self, ticker: str) -> Optional[FinancialData]:
        """Get complete financial data"""
        try:
            historicals = await self.get_fundamentals(ticker)
            market_data = await self.get_market_data(ticker)
            estimates = await self.get_estimates(ticker)
            
            if not historicals or not market_data:
                return None
            
            return FinancialData(
                ticker=ticker,
                company_name=market_data.company_name if hasattr(market_data, 'company_name') else ticker,
                currency="USD",  # Default, could be enhanced
                historicals=historicals,
                market_data=market_data,
                estimates=estimates,
                provenance=self._get_provenance()
            )
        except Exception as e:
            logger.error(f"Error in {self.name} provider", ticker=ticker, error=str(e))
            return None
    
    def _get_provenance(self) -> Dict[str, Dict[str, str]]:
        """Get data provenance information"""
        return {
            "revenue": {"source": self.name, "as_of": datetime.now().strftime("%Y-%m-%d")},
            "op_margin": {"source": self.name, "as_of": datetime.now().strftime("%Y-%m-%d")},
            "capex": {"source": self.name, "as_of": datetime.now().strftime("%Y-%m-%d")},
            "nwc": {"source": self.name, "as_of": datetime.now().strftime("%Y-%m-%d")},
            "price": {"source": self.name, "as_of": datetime.now().strftime("%Y-%m-%d")},
            "beta": {"source": self.name, "as_of": datetime.now().strftime("%Y-%m-%d")},
        }

class FMPProvider(BaseProvider):
    """Financial Modeling Prep provider"""
    
    def __init__(self):
        super().__init__(os.getenv("FMP_API_KEY"))
        self.base_url = "https://financialmodelingprep.com/api/v3"
    
    async def get_fundamentals(self, ticker: str) -> Optional[HistoricalData]:
        """Get fundamentals from FMP"""
        if not self.api_key:
            return None
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Get income statements
                income_url = f"{self.base_url}/income-statement/{ticker}"
                params = {"apikey": self.api_key, "limit": 5}
                
                response = await client.get(income_url, params=params)
                response.raise_for_status()
                income_data = response.json()
                
                if not income_data:
                    return None
                
                # Get balance sheets
                balance_url = f"{self.base_url}/balance-sheet-statement/{ticker}"
                balance_response = await client.get(balance_url, params=params)
                balance_response.raise_for_status()
                balance_data = balance_response.json()
                
                # Get cash flow statements
                cashflow_url = f"{self.base_url}/cash-flow-statement/{ticker}"
                cashflow_response = await client.get(cashflow_url, params=params)
                cashflow_response.raise_for_status()
                cashflow_data = cashflow_response.json()
                
                return self._parse_financial_statements(income_data, balance_data, cashflow_data)
                
        except Exception as e:
            logger.error(f"FMP provider error", ticker=ticker, error=str(e))
            return None
    
    def _parse_financial_statements(self, income_data: List[Dict], balance_data: List[Dict], cashflow_data: List[Dict]) -> HistoricalData:
        """Parse financial statements into standardized format"""
        years = []
        revenue = []
        operating_income = []
        op_margin = []
        da = []
        capex = []
        delta_nwc = []
        tax_expense = []
        pretax_income = []
        interest_expense = []
        total_debt = []
        shares_outstanding = []
        
        # Process income statements
        for stmt in income_data[:5]:  # Last 5 years
            year = stmt.get("calendarYear", stmt.get("date", ""))[:4]
            if year.isdigit():
                years.append(int(year))
                revenue.append(float(stmt.get("revenue", 0)))
                operating_income.append(float(stmt.get("operatingIncome", 0)))
                tax_expense.append(float(stmt.get("incomeTaxExpense", 0)))
                pretax_income.append(float(stmt.get("incomeBeforeTax", 0)))
                interest_expense.append(float(stmt.get("interestExpense", 0)))
        
        # Process balance sheets
        for stmt in balance_data[:5]:
            total_debt.append(float(stmt.get("totalDebt", 0)))
            shares_outstanding.append(float(stmt.get("commonStock", 0)))
        
        # Process cash flow statements
        for stmt in cashflow_data[:5]:
            da.append(float(stmt.get("depreciationAndAmortization", 0)))
            capex.append(abs(float(stmt.get("capitalExpenditure", 0))))  # Make positive
        
        # Calculate derived metrics
        for i in range(len(years)):
            if revenue[i] > 0:
                op_margin.append(operating_income[i] / revenue[i])
            else:
                op_margin.append(0)
        
        # Calculate delta NWC (simplified)
        delta_nwc = [0] * len(years)  # Would need working capital data
        
        return HistoricalData(
            years=years,
            revenue=revenue,
            operating_income=operating_income,
            op_margin=op_margin,
            da=da,
            capex=capex,
            delta_nwc=delta_nwc,
            tax_expense=tax_expense,
            pretax_income=pretax_income,
            interest_expense=interest_expense,
            total_debt=total_debt,
            shares_outstanding=shares_outstanding
        )
    
    async def get_market_data(self, ticker: str) -> Optional[MarketData]:
        """Get market data from FMP"""
        if not self.api_key:
            return None
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                url = f"{self.base_url}/quote/{ticker}"
                params = {"apikey": self.api_key}
                
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()
                
                if not data:
                    return None
                
                quote = data[0]
                return MarketData(
                    price=float(quote.get("price", 0)),
                    market_cap=float(quote.get("marketCap", 0)),
                    beta=float(quote.get("beta", 0)) if quote.get("beta") else None,
                    last_updated=datetime.now().strftime("%Y-%m-%d")
                )
                
        except Exception as e:
            logger.error(f"FMP market data error", ticker=ticker, error=str(e))
            return None
    
    async def get_estimates(self, ticker: str) -> Optional[EstimatesData]:
        """Get analyst estimates from FMP"""
        # FMP doesn't provide estimates in free tier
        return None

class YahooProvider(BaseProvider):
    """Yahoo Finance provider using yfinance"""
    
    def __init__(self):
        super().__init__()
    
    async def get_fundamentals(self, ticker: str) -> Optional[HistoricalData]:
        """Get fundamentals from Yahoo Finance"""
        try:
            # Run yfinance in thread pool to avoid blocking
            loop = asyncio.get_event_loop()
            ticker_obj = await loop.run_in_executor(None, yf.Ticker, ticker)
            
            # Get financials
            income_stmt = await loop.run_in_executor(None, ticker_obj.financials)
            balance_sheet = await loop.run_in_executor(None, ticker_obj.balance_sheet)
            cashflow = await loop.run_in_executor(None, ticker_obj.cashflow)
            
            if income_stmt.empty:
                return None
            
            return self._parse_yahoo_financials(income_stmt, balance_sheet, cashflow)
            
        except Exception as e:
            logger.error(f"Yahoo provider error", ticker=ticker, error=str(e))
            return None
    
    def _parse_yahoo_financials(self, income_stmt: pd.DataFrame, balance_sheet: pd.DataFrame, cashflow: pd.DataFrame) -> HistoricalData:
        """Parse Yahoo Finance financials"""
        years = []
        revenue = []
        operating_income = []
        op_margin = []
        da = []
        capex = []
        delta_nwc = []
        tax_expense = []
        pretax_income = []
        interest_expense = []
        total_debt = []
        shares_outstanding = []
        
        # Process last 5 years
        for i, (date, row) in enumerate(income_stmt.iteritems()):
            if i >= 5:
                break
            
            year = date.year
            years.append(year)
            
            revenue.append(float(row.get("Total Revenue", 0)))
            operating_income.append(float(row.get("Operating Income", 0)))
            tax_expense.append(float(row.get("Tax Provision", 0)))
            pretax_income.append(float(row.get("Pretax Income", 0)))
            interest_expense.append(float(row.get("Interest Expense", 0)))
            
            # Get balance sheet data
            if not balance_sheet.empty and date in balance_sheet.columns:
                balance_row = balance_sheet[date]
                total_debt.append(float(balance_row.get("Total Debt", 0)))
                shares_outstanding.append(float(balance_row.get("Common Stock", 0)))
            else:
                total_debt.append(0)
                shares_outstanding.append(0)
            
            # Get cash flow data
            if not cashflow.empty and date in cashflow.columns:
                cf_row = cashflow[date]
                da.append(float(cf_row.get("Depreciation", 0)))
                capex.append(abs(float(cf_row.get("Capital Expenditures", 0))))
            else:
                da.append(0)
                capex.append(0)
            
            # Calculate operating margin
            if revenue[-1] > 0:
                op_margin.append(operating_income[-1] / revenue[-1])
            else:
                op_margin.append(0)
            
            delta_nwc.append(0)  # Simplified
        
        return HistoricalData(
            years=years,
            revenue=revenue,
            operating_income=operating_income,
            op_margin=op_margin,
            da=da,
            capex=capex,
            delta_nwc=delta_nwc,
            tax_expense=tax_expense,
            pretax_income=pretax_income,
            interest_expense=interest_expense,
            total_debt=total_debt,
            shares_outstanding=shares_outstanding
        )
    
    async def get_market_data(self, ticker: str) -> Optional[MarketData]:
        """Get market data from Yahoo Finance"""
        try:
            loop = asyncio.get_event_loop()
            ticker_obj = await loop.run_in_executor(None, yf.Ticker, ticker)
            
            info = await loop.run_in_executor(None, ticker_obj.info)
            
            return MarketData(
                price=float(info.get("currentPrice", info.get("regularMarketPrice", 0))),
                market_cap=float(info.get("marketCap", 0)),
                beta=float(info.get("beta", 0)) if info.get("beta") else None,
                last_updated=datetime.now().strftime("%Y-%m-%d")
            )
            
        except Exception as e:
            logger.error(f"Yahoo market data error", ticker=ticker, error=str(e))
            return None
    
    async def get_estimates(self, ticker: str) -> Optional[EstimatesData]:
        """Get analyst estimates from Yahoo Finance"""
        try:
            loop = asyncio.get_event_loop()
            ticker_obj = await loop.run_in_executor(None, yf.Ticker, ticker)
            
            info = await loop.run_in_executor(None, ticker_obj.info)
            
            return EstimatesData(
                revenue_growth_y1=info.get("revenueGrowth"),
                revenue_growth_y2=None,
                margin_y1=None,
                margin_y2=None
            )
            
        except Exception as e:
            logger.error(f"Yahoo estimates error", ticker=ticker, error=str(e))
            return None

class AlphaVantageProvider(BaseProvider):
    """Alpha Vantage provider"""
    
    def __init__(self):
        super().__init__(os.getenv("ALPHAVANTAGE_API_KEY"))
        self.base_url = "https://www.alphavantage.co/query"
    
    async def get_fundamentals(self, ticker: str) -> Optional[HistoricalData]:
        """Get fundamentals from Alpha Vantage"""
        if not self.api_key:
            return None
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                # Get income statement
                params = {
                    "function": "INCOME_STATEMENT",
                    "symbol": ticker,
                    "apikey": self.api_key
                }
                
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                
                if "Error Message" in data or "Note" in data:
                    return None
                
                return self._parse_alpha_vantage_income(data.get("annualReports", []))
                
        except Exception as e:
            logger.error(f"Alpha Vantage provider error", ticker=ticker, error=str(e))
            return None
    
    def _parse_alpha_vantage_income(self, reports: List[Dict]) -> HistoricalData:
        """Parse Alpha Vantage income statements"""
        years = []
        revenue = []
        operating_income = []
        op_margin = []
        da = []
        capex = []
        delta_nwc = []
        tax_expense = []
        pretax_income = []
        interest_expense = []
        total_debt = []
        shares_outstanding = []
        
        for report in reports[:5]:  # Last 5 years
            year = int(report.get("fiscalDateEnding", "0")[:4])
            if year > 0:
                years.append(year)
                revenue.append(float(report.get("totalRevenue", 0)))
                operating_income.append(float(report.get("operatingIncome", 0)))
                tax_expense.append(float(report.get("incomeTaxExpense", 0)))
                pretax_income.append(float(report.get("incomeBeforeTax", 0)))
                interest_expense.append(float(report.get("interestExpense", 0)))
                
                # Calculate operating margin
                if revenue[-1] > 0:
                    op_margin.append(operating_income[-1] / revenue[-1])
                else:
                    op_margin.append(0)
                
                # Default values for missing data
                da.append(0)
                capex.append(0)
                delta_nwc.append(0)
                total_debt.append(0)
                shares_outstanding.append(0)
        
        return HistoricalData(
            years=years,
            revenue=revenue,
            operating_income=operating_income,
            op_margin=op_margin,
            da=da,
            capex=capex,
            delta_nwc=delta_nwc,
            tax_expense=tax_expense,
            pretax_income=pretax_income,
            interest_expense=interest_expense,
            total_debt=total_debt,
            shares_outstanding=shares_outstanding
        )
    
    async def get_market_data(self, ticker: str) -> Optional[MarketData]:
        """Get market data from Alpha Vantage"""
        if not self.api_key:
            return None
        
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                params = {
                    "function": "GLOBAL_QUOTE",
                    "symbol": ticker,
                    "apikey": self.api_key
                }
                
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                
                quote = data.get("Global Quote", {})
                if not quote:
                    return None
                
                return MarketData(
                    price=float(quote.get("05. price", 0)),
                    market_cap=0,  # Not provided in Global Quote
                    beta=None,  # Not provided in Global Quote
                    last_updated=datetime.now().strftime("%Y-%m-%d")
                )
                
        except Exception as e:
            logger.error(f"Alpha Vantage market data error", ticker=ticker, error=str(e))
            return None
    
    async def get_estimates(self, ticker: str) -> Optional[EstimatesData]:
        """Get analyst estimates from Alpha Vantage"""
        return None  # Not available in free tier

class ProviderManager:
    """Manages multiple data providers with fallback logic"""
    
    def __init__(self):
        self.providers = [
            FMPProvider(),
            AlphaVantageProvider(),
            YahooProvider(),
        ]
        self.attempted_providers = []
    
    def get_active_providers(self) -> List[str]:
        """Get list of active providers"""
        active = []
        for provider in self.providers:
            if provider.api_key or provider.name == "Yahoo":
                active.append(provider.name)
        return active
    
    def get_attempted_providers(self) -> List[str]:
        """Get list of attempted providers"""
        return self.attempted_providers.copy()
    
    async def get_financial_data(self, ticker: str) -> Optional[FinancialData]:
        """Get financial data with provider fallback"""
        self.attempted_providers = []
        
        for provider in self.providers:
            self.attempted_providers.append(provider.name)
            
            try:
                data = await provider.get_financial_data(ticker)
                if data and len(data.historicals.years) >= 3:
                    logger.info(f"Successfully fetched data from {provider.name}", ticker=ticker)
                    return data
            except Exception as e:
                logger.warning(f"Provider {provider.name} failed", ticker=ticker, error=str(e))
                continue
        
        logger.error("All providers failed", ticker=ticker, attempted=self.attempted_providers)
        return None
