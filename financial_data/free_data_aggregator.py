"""
Free Data Aggregator for Advanced LBO Model
Combines multiple free sources to create comprehensive data.
"""

import requests
import time
from typing import Dict, Any, Optional
from datetime import datetime, timedelta

class FreeDataAggregator:
    """Aggregates data from multiple free sources for LBO modeling."""
    
    def __init__(self):
        self.alpha_vantage_key = "your_free_key"  # Get from alphavantage.co
        self.fred_key = "your_free_key"  # Get from fred.stlouisfed.org
        
    def get_comprehensive_data(self, ticker: str) -> Dict[str, Any]:
        """Get comprehensive data from multiple free sources."""
        
        data = {
            "ticker": ticker,
            "timestamp": datetime.now().isoformat(),
            "sources": []
        }
        
        # 1. Basic Financials (Demo Data)
        from .demo_data import get_demo_data
        demo = get_demo_data(ticker)
        if demo:
            data["financials"] = demo["historicals"]
            data["assumptions"] = demo["assumptions"]
            data["sources"].append("Demo_Data")
        
        # 2. Market Data (Yahoo Finance)
        market_data = self._get_yahoo_market_data(ticker)
        if market_data:
            data["market"] = market_data
            data["sources"].append("Yahoo_Finance")
        
        # 3. Economic Data (FRED)
        economic_data = self._get_fred_data()
        if economic_data:
            data["economic"] = economic_data
            data["sources"].append("FRED")
        
        # 4. Company Overview (Alpha Vantage)
        overview = self._get_alpha_vantage_overview(ticker)
        if overview:
            data["overview"] = overview
            data["sources"].append("Alpha_Vantage")
        
        # 5. Calculated LBO Assumptions
        lbo_assumptions = self._calculate_lbo_assumptions(data)
        data["lbo_assumptions"] = lbo_assumptions
        
        return data
    
    def _get_yahoo_market_data(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Get market data from Yahoo Finance."""
        try:
            import yfinance as yf
            stock = yf.Ticker(ticker)
            info = stock.info
            
            return {
                "current_price": info.get("currentPrice"),
                "market_cap": info.get("marketCap"),
                "beta": info.get("beta"),
                "pe_ratio": info.get("trailingPE"),
                "sector": info.get("sector"),
                "industry": info.get("industry")
            }
        except Exception as e:
            print(f"Yahoo market data error: {e}")
            return None
    
    def _get_fred_data(self) -> Optional[Dict[str, Any]]:
        """Get economic data from FRED."""
        try:
            # Risk-free rate (10-year Treasury)
            url = "https://api.stlouisfed.org/fred/series/observations"
            params = {
                "series_id": "DGS10",  # 10-year Treasury rate
                "api_key": self.fred_key,
                "file_type": "json",
                "limit": 1,
                "sort_order": "desc"
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            if data.get("observations"):
                latest = data["observations"][0]
                return {
                    "risk_free_rate": float(latest.get("value", 0.045)),
                    "date": latest.get("date")
                }
        except Exception as e:
            print(f"FRED data error: {e}")
            return None
    
    def _get_alpha_vantage_overview(self, ticker: str) -> Optional[Dict[str, Any]]:
        """Get company overview from Alpha Vantage."""
        try:
            # Respect rate limits
            time.sleep(12)  # 5 calls per minute = 12 seconds between calls
            
            url = "https://www.alphavantage.co/query"
            params = {
                "function": "OVERVIEW",
                "symbol": ticker,
                "apikey": self.alpha_vantage_key
            }
            
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            if "Symbol" in data:
                return {
                    "description": data.get("Description"),
                    "sector": data.get("Sector"),
                    "industry": data.get("Industry"),
                    "market_cap": data.get("MarketCapitalization"),
                    "pe_ratio": data.get("PERatio"),
                    "beta": data.get("Beta")
                }
        except Exception as e:
            print(f"Alpha Vantage overview error: {e}")
            return None
    
    def _calculate_lbo_assumptions(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate LBO-specific assumptions from aggregated data."""
        
        assumptions = {}
        
        # Market-based assumptions
        if "market" in data:
            market = data["market"]
            assumptions["current_beta"] = market.get("beta", 1.0)
            assumptions["current_price"] = market.get("current_price")
            assumptions["market_cap"] = market.get("market_cap")
        
        # Economic assumptions
        if "economic" in data:
            economic = data["economic"]
            assumptions["risk_free_rate"] = economic.get("risk_free_rate", 0.045)
        
        # Financial assumptions (from demo data)
        if "assumptions" in data:
            financial = data["assumptions"]
            assumptions["revenue_growth"] = financial.get("revenue_growth", [])
            assumptions["operating_margin"] = financial.get("operating_margin", [])
            assumptions["tax_rate"] = financial.get("tax_rate", 0.25)
        
        # LBO-specific assumptions (calculated)
        assumptions["debt_assumptions"] = self._calculate_debt_assumptions(data)
        assumptions["exit_assumptions"] = self._calculate_exit_assumptions(data)
        assumptions["covenant_assumptions"] = self._calculate_covenant_assumptions(data)
        
        return assumptions
    
    def _calculate_debt_assumptions(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate debt structure assumptions."""
        return {
            "senior_debt_rate": 0.06,  # 6% (market assumption)
            "mezzanine_debt_rate": 0.12,  # 12% (market assumption)
            "revolver_rate": 0.05,  # 5% (market assumption)
            "senior_debt_multiple": 4.0,  # 4x EBITDA
            "mezzanine_debt_multiple": 1.5,  # 1.5x EBITDA
            "total_leverage": 5.5  # 5.5x EBITDA
        }
    
    def _calculate_exit_assumptions(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate exit assumptions."""
        return {
            "exit_multiple": 10.0,  # 10x EBITDA (market assumption)
            "holding_period": 5,  # 5 years
            "terminal_growth": 0.025  # 2.5%
        }
    
    def _calculate_covenant_assumptions(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Calculate covenant assumptions."""
        return {
            "max_leverage_ratio": 6.0,  # 6x EBITDA
            "min_interest_coverage": 2.0,  # 2x
            "min_fixed_charge_coverage": 1.25  # 1.25x
        }
