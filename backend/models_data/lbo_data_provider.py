"""
LBO Model Data Provider
Fetches and validates financial data from multiple sources
"""

from typing import Dict, Any, Optional, Tuple
import pandas as pd
import numpy as np
from datetime import datetime
import logging
import httpx
from functools import lru_cache

from .lbo_validator import CompanyMetrics, MarketConditions

logger = logging.getLogger(__name__)

class DataProviderError(Exception):
    """Base exception for data provider errors"""
    pass

class DataQualityError(Exception):
    """Exception for data quality issues"""
    pass

class LBODataProvider:
    """Fetches and validates financial data from multiple sources"""
    
    def __init__(self, polygon_key: str, alpha_vantage_key: str, finnhub_key: str):
        self.polygon_client = httpx.AsyncClient(
            base_url="https://api.polygon.io/v2",
            headers={"Authorization": f"Bearer {polygon_key}"}
        )
        self.alpha_vantage_client = httpx.AsyncClient(
            base_url="https://www.alphavantage.co/query",
            params={"apikey": alpha_vantage_key}
        )
        self.finnhub_client = httpx.AsyncClient(
            base_url="https://finnhub.io/api/v1",
            headers={"X-Finnhub-Token": finnhub_key}
        )
        
    async def close(self):
        """Close all HTTP clients"""
        await self.polygon_client.aclose()
        await self.alpha_vantage_client.aclose()
        await self.finnhub_client.aclose()
        
    @lru_cache(maxsize=100)
    async def get_company_metrics(self, ticker: str) -> CompanyMetrics:
        """
        Fetch company metrics from multiple sources
        Uses caching to avoid redundant API calls
        """
        try:
            # Fetch basic financials from Polygon (primary)
            financials = await self._get_polygon_financials(ticker)
            if not financials:
                # Fallback to Alpha Vantage
                financials = await self._get_alphavantage_financials(ticker)
                
            if not financials:
                raise DataProviderError(f"Could not fetch financials for {ticker}")
                
            # Get market data (always real-time)
            market_data = await self._get_market_data(ticker)
            
            # Get historical metrics
            historical = await self._get_historical_metrics(ticker)
            
            # Get peer/industry metrics
            industry = await self._get_industry_metrics(ticker)
            
            # Combine all data
            metrics = CompanyMetrics(
                ticker=ticker,
                revenue_ltm=financials["revenue"],
                ebitda_ltm=financials["ebitda"],
                total_debt=financials["total_debt"],
                cash=financials["cash"],
                market_cap=market_data["market_cap"],
                current_price=market_data["price"],
                shares_outstanding=market_data["shares"],
                revenue_growth_3yr=historical.get("revenue_growth_3yr"),
                ebitda_margin_3yr_avg=historical.get("ebitda_margin_3yr"),
                industry_revenue_growth=industry.get("revenue_growth"),
                industry_ebitda_margin=industry.get("ebitda_margin"),
                industry_ev_ebitda=industry.get("ev_ebitda")
            )
            
            return metrics
            
        except Exception as e:
            logger.error(f"Error fetching metrics for {ticker}: {str(e)}")
            raise DataProviderError(f"Failed to get company metrics: {str(e)}")
            
    async def _get_polygon_financials(self, ticker: str) -> Optional[Dict[str, float]]:
        """Fetch financials from Polygon.io"""
        try:
            # Get latest quarterly financials
            resp = await self.polygon_client.get(
                f"/reference/financials/{ticker}",
                params={"limit": 4, "type": "Q"}
            )
            resp.raise_for_status()
            data = resp.json()
            
            if not data.get("results"):
                return None
                
            # Calculate LTM metrics
            quarters = data["results"][:4]
            ltm = {
                "revenue": sum(q["revenue"] for q in quarters),
                "ebitda": sum(q["ebitda"] for q in quarters),
                "total_debt": quarters[0]["total_debt"],
                "cash": quarters[0]["cash"]
            }
            
            return ltm
            
        except Exception as e:
            logger.warning(f"Polygon financials failed for {ticker}: {str(e)}")
            return None
            
    async def _get_alphavantage_financials(self, ticker: str) -> Optional[Dict[str, float]]:
        """Fetch financials from Alpha Vantage as backup"""
        try:
            # Get income statement
            resp = await self.alpha_vantage_client.get(
                "",
                params={
                    "function": "INCOME_STATEMENT",
                    "symbol": ticker
                }
            )
            resp.raise_for_status()
            income_data = resp.json()
            
            # Get balance sheet
            resp = await self.alpha_vantage_client.get(
                "",
                params={
                    "function": "BALANCE_SHEET",
                    "symbol": ticker
                }
            )
            resp.raise_for_status()
            balance_data = resp.json()
            
            if not income_data.get("quarterlyReports") or not balance_data.get("quarterlyReports"):
                return None
                
            # Calculate LTM metrics
            quarters_income = income_data["quarterlyReports"][:4]
            latest_balance = balance_data["quarterlyReports"][0]
            
            ltm = {
                "revenue": sum(float(q["totalRevenue"]) for q in quarters_income),
                "ebitda": sum(float(q["ebitda"]) for q in quarters_income),
                "total_debt": float(latest_balance["shortLongTermDebtTotal"]),
                "cash": float(latest_balance["cashAndShortTermInvestments"])
            }
            
            return ltm
            
        except Exception as e:
            logger.warning(f"Alpha Vantage financials failed for {ticker}: {str(e)}")
            return None
            
    async def _get_market_data(self, ticker: str) -> Dict[str, float]:
        """Fetch real-time market data"""
        try:
            # Try Polygon first
            resp = await self.polygon_client.get(f"/snapshot/locale/us/markets/stocks/{ticker}")
            if resp.status_code == 200:
                data = resp.json()
                return {
                    "price": data["ticker"]["lastTrade"]["p"],
                    "market_cap": data["ticker"]["market_cap"],
                    "shares": data["ticker"]["market_cap"] / data["ticker"]["lastTrade"]["p"]
                }
                
            # Fallback to Finnhub
            resp = await self.finnhub_client.get("quote", params={"symbol": ticker})
            resp.raise_for_status()
            quote = resp.json()
            
            resp = await self.finnhub_client.get("stock/metric", 
                params={"symbol": ticker, "metric": "all"})
            resp.raise_for_status()
            metrics = resp.json()
            
            return {
                "price": quote["c"],
                "market_cap": metrics["metric"]["marketCapitalization"] * 1e6,
                "shares": metrics["metric"]["marketCapitalization"] * 1e6 / quote["c"]
            }
            
        except Exception as e:
            logger.error(f"Failed to get market data for {ticker}: {str(e)}")
            raise DataProviderError("Could not fetch market data")
            
    async def _get_historical_metrics(self, ticker: str) -> Dict[str, float]:
        """Calculate historical growth and margins"""
        try:
            # Get annual financials from Polygon
            resp = await self.polygon_client.get(
                f"/reference/financials/{ticker}",
                params={"limit": 4, "type": "A"}
            )
            resp.raise_for_status()
            data = resp.json()
            
            if not data.get("results"):
                return {}
                
            annuals = data["results"]
            if len(annuals) < 3:
                return {}
                
            # Calculate 3-year metrics
            revenue_growth = (
                (annuals[0]["revenue"] / annuals[2]["revenue"]) ** (1/3) - 1
            )
            
            ebitda_margins = [
                a["ebitda"] / a["revenue"] for a in annuals[:3]
            ]
            
            return {
                "revenue_growth_3yr": revenue_growth,
                "ebitda_margin_3yr": sum(ebitda_margins) / 3
            }
            
        except Exception as e:
            logger.warning(f"Failed to get historical metrics for {ticker}: {str(e)}")
            return {}
            
    async def _get_industry_metrics(self, ticker: str) -> Dict[str, float]:
        """Get industry/peer group metrics"""
        try:
            # Get peer group from Finnhub
            resp = await self.finnhub_client.get("stock/peers", params={"symbol": ticker})
            resp.raise_for_status()
            peers = resp.json()
            
            if not peers:
                return {}
                
            # Get metrics for each peer
            peer_metrics = []
            for peer in peers[:10]:  # Limit to 10 peers
                try:
                    metrics = await self.get_company_metrics(peer)
                    peer_metrics.append({
                        "revenue_growth": metrics.revenue_growth_3yr,
                        "ebitda_margin": metrics.ebitda_ltm / metrics.revenue_ltm,
                        "ev_ebitda": (metrics.market_cap + metrics.total_debt - metrics.cash) / metrics.ebitda_ltm
                    })
                except Exception:
                    continue
                    
            if not peer_metrics:
                return {}
                
            # Calculate median metrics
            df = pd.DataFrame(peer_metrics)
            return {
                "revenue_growth": df["revenue_growth"].median(),
                "ebitda_margin": df["ebitda_margin"].median(),
                "ev_ebitda": df["ev_ebitda"].median()
            }
            
        except Exception as e:
            logger.warning(f"Failed to get industry metrics for {ticker}: {str(e)}")
            return {}
