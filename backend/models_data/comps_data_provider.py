"""
Data provider integration for Trading Comps model
Fetches company metrics from multiple providers with fallbacks
"""

import asyncio
from typing import Dict, List, Optional, Tuple
import logging
from datetime import datetime, timedelta
import pandas as pd

from backend.models_data.comps_model import CompanyMetrics
from backend.providers.polygon_provider import PolygonProvider
from backend.providers.alpha_vantage_provider import AlphaVantageProvider
from backend.providers.finnhub_provider import FinnhubProvider

logger = logging.getLogger(__name__)

class CompsDataProvider:
    """Fetches and aggregates company data from multiple providers"""
    
    def __init__(self):
        self.polygon = PolygonProvider()
        self.alpha_vantage = AlphaVantageProvider()
        self.finnhub = FinnhubProvider()
        
    async def get_market_data(self, ticker: str) -> Dict[str, float]:
        """
        Get market data with fallbacks
        Priority: Polygon > Finnhub > Alpha Vantage
        """
        try:
            # Try Polygon first (most reliable real-time data)
            data = await self.polygon.get_ticker_details(ticker)
            if data:
                return {
                    "share_price": data["last_price"],
                    "shares_outstanding": data["shares_outstanding"],
                    "market_cap": data["market_cap"]
                }
        except Exception as e:
            logger.warning(f"Polygon market data fetch failed for {ticker}: {e}")

        try:
            # Fallback to Finnhub
            data = await self.finnhub.get_quote(ticker)
            shares = await self.finnhub.get_company_profile(ticker)
            if data and shares:
                return {
                    "share_price": data["c"],  # Current price
                    "shares_outstanding": shares["shareOutstanding"],
                    "market_cap": data["c"] * shares["shareOutstanding"]
                }
        except Exception as e:
            logger.warning(f"Finnhub market data fetch failed for {ticker}: {e}")

        try:
            # Last resort: Alpha Vantage
            data = await self.alpha_vantage.get_quote(ticker)
            if data:
                return {
                    "share_price": float(data["Global Quote"]["05. price"]),
                    "shares_outstanding": await self._get_shares_outstanding(ticker),
                    "market_cap": float(data["Global Quote"]["08. market cap"].replace("B", "e9").replace("M", "e6"))
                }
        except Exception as e:
            logger.warning(f"Alpha Vantage market data fetch failed for {ticker}: {e}")
            
        raise ValueError(f"Could not fetch market data for {ticker} from any provider")

    async def get_financial_data(self, ticker: str) -> Dict[str, float]:
        """
        Get financial data with fallbacks
        Priority: Polygon > Alpha Vantage > Finnhub
        """
        try:
            # Try Polygon first (most comprehensive)
            financials = await self.polygon.get_financials(ticker)
            if financials:
                return self._process_polygon_financials(financials)
        except Exception as e:
            logger.warning(f"Polygon financials fetch failed for {ticker}: {e}")

        try:
            # Fallback to Alpha Vantage
            income = await self.alpha_vantage.get_income_statement(ticker)
            balance = await self.alpha_vantage.get_balance_sheet(ticker)
            if income and balance:
                return self._process_alphavantage_financials(income, balance)
        except Exception as e:
            logger.warning(f"Alpha Vantage financials fetch failed for {ticker}: {e}")

        try:
            # Last resort: Finnhub
            financials = await self.finnhub.get_financials(ticker)
            metrics = await self.finnhub.get_company_metrics(ticker)
            if financials and metrics:
                return self._process_finnhub_financials(financials, metrics)
        except Exception as e:
            logger.warning(f"Finnhub financials fetch failed for {ticker}: {e}")
            
        raise ValueError(f"Could not fetch financial data for {ticker} from any provider")

    async def get_company_info(self, ticker: str) -> Dict[str, str]:
        """Get basic company information"""
        for provider in [self.polygon, self.finnhub, self.alpha_vantage]:
            try:
                info = await provider.get_company_info(ticker)
                if info:
                    return {
                        "name": info.get("name") or info.get("companyName"),
                        "sector": info.get("sector") or info.get("finnhubIndustry"),
                        "industry": info.get("industry") or info.get("sector")
                    }
            except Exception as e:
                logger.warning(f"Company info fetch failed for {ticker} from {provider.__class__.__name__}: {e}")
                continue
                
        raise ValueError(f"Could not fetch company info for {ticker} from any provider")

    async def get_estimates(self, ticker: str) -> Dict[str, float]:
        """
        Get analyst estimates with fallbacks
        Priority: Polygon > Finnhub > Alpha Vantage
        """
        try:
            # Try Polygon first
            estimates = await self.polygon.get_estimates(ticker)
            if estimates:
                return self._process_polygon_estimates(estimates)
        except Exception as e:
            logger.warning(f"Polygon estimates fetch failed for {ticker}: {e}")

        try:
            # Fallback to Finnhub
            estimates = await self.finnhub.get_estimates(ticker)
            if estimates:
                return self._process_finnhub_estimates(estimates)
        except Exception as e:
            logger.warning(f"Finnhub estimates fetch failed for {ticker}: {e}")

        # Alpha Vantage doesn't provide estimates
        return {}

    def _process_polygon_financials(self, data: Dict) -> Dict[str, float]:
        """Process Polygon financial data"""
        return {
            "revenue_ltm": data["results"][0]["revenues"],
            "ebitda_ltm": data["results"][0]["ebitda"],
            "ebit_ltm": data["results"][0]["operating_income"],
            "net_income_ltm": data["results"][0]["net_income"],
            "total_debt": data["results"][0]["total_debt"],
            "cash": data["results"][0]["cash_and_equivalents"],
            "book_value": data["results"][0]["total_equity"]
        }

    def _process_alphavantage_financials(self, income: Dict, balance: Dict) -> Dict[str, float]:
        """Process Alpha Vantage financial data"""
        latest = 0  # Most recent quarter/year
        return {
            "revenue_ltm": float(income["annualReports"][latest]["totalRevenue"]),
            "ebit_ltm": float(income["annualReports"][latest]["operatingIncome"]),
            "net_income_ltm": float(income["annualReports"][latest]["netIncome"]),
            "total_debt": float(balance["annualReports"][latest]["shortLongTermDebtTotal"]),
            "cash": float(balance["annualReports"][latest]["cashAndShortTermInvestments"]),
            "book_value": float(balance["annualReports"][latest]["totalShareholderEquity"])
        }

    def _process_finnhub_financials(self, financials: Dict, metrics: Dict) -> Dict[str, float]:
        """Process Finnhub financial data"""
        return {
            "revenue_ltm": financials["revenue"][0],
            "ebitda_ltm": metrics["ebitda"],
            "ebit_ltm": financials["operatingIncome"][0],
            "net_income_ltm": financials["netIncome"][0],
            "total_debt": metrics["totalDebt"],
            "cash": metrics["totalCash"],
            "book_value": metrics["totalEquity"]
        }

    def _process_polygon_estimates(self, data: Dict) -> Dict[str, float]:
        """Process Polygon analyst estimates"""
        return {
            "revenue_ntm": data["revenue"]["mean"],
            "ebitda_ntm": data["ebitda"]["mean"],
            "ebit_ntm": data["ebit"]["mean"],
            "eps_ntm": data["eps"]["mean"]
        }

    def _process_finnhub_estimates(self, data: Dict) -> Dict[str, float]:
        """Process Finnhub analyst estimates"""
        return {
            "revenue_ntm": data["revenueAvg"],
            "eps_ntm": data["epsAvg"]
        }

    async def _get_shares_outstanding(self, ticker: str) -> float:
        """Fallback method to get shares outstanding"""
        try:
            data = await self.alpha_vantage.get_company_overview(ticker)
            return float(data["SharesOutstanding"])
        except:
            return None

    async def get_peer_group(self, ticker: str) -> List[str]:
        """
        Get peer group with fallbacks
        Priority: Polygon > Finnhub
        """
        try:
            # Try Polygon first
            peers = await self.polygon.get_peers(ticker)
            if peers:
                return peers[:10]  # Limit to top 10 peers
        except Exception as e:
            logger.warning(f"Polygon peers fetch failed for {ticker}: {e}")

        try:
            # Fallback to Finnhub
            peers = await self.finnhub.get_peers(ticker)
            if peers:
                return peers[:10]
        except Exception as e:
            logger.warning(f"Finnhub peers fetch failed for {ticker}: {e}")

        raise ValueError(f"Could not fetch peer group for {ticker} from any provider")

    async def build_company_metrics(self, ticker: str) -> CompanyMetrics:
        """Build CompanyMetrics object from provider data"""
        try:
            # Fetch all data concurrently
            market_data, financial_data, company_info, estimates = await asyncio.gather(
                self.get_market_data(ticker),
                self.get_financial_data(ticker),
                self.get_company_info(ticker),
                self.get_estimates(ticker)
            )
            
            # Combine all data into CompanyMetrics
            return CompanyMetrics(
                ticker=ticker,
                name=company_info["name"],
                share_price=market_data["share_price"],
                shares_outstanding=market_data["shares_outstanding"],
                total_debt=financial_data["total_debt"],
                cash=financial_data["cash"],
                revenue_ltm=financial_data["revenue_ltm"],
                revenue_ntm=estimates.get("revenue_ntm"),
                ebitda_ltm=financial_data["ebitda_ltm"],
                ebitda_ntm=estimates.get("ebitda_ntm"),
                ebit_ltm=financial_data["ebit_ltm"],
                ebit_ntm=estimates.get("ebit_ntm"),
                net_income_ltm=financial_data["net_income_ltm"],
                net_income_ntm=None,  # Not always available
                eps_ltm=financial_data["net_income_ltm"] / market_data["shares_outstanding"],
                eps_ntm=estimates.get("eps_ntm"),
                book_value=financial_data["book_value"]
            )
            
        except Exception as e:
            logger.error(f"Error building CompanyMetrics for {ticker}: {e}")
            raise

    async def build_comps_model(self, ticker: str) -> Tuple[CompanyMetrics, List[CompanyMetrics]]:
        """Build complete comps model with target and peers"""
        try:
            # Get peer group
            peer_tickers = await self.get_peer_group(ticker)
            
            # Build target and peer metrics concurrently
            all_metrics = await asyncio.gather(
                self.build_company_metrics(ticker),
                *[self.build_company_metrics(peer) for peer in peer_tickers]
            )
            
            target = all_metrics[0]
            peers = all_metrics[1:]
            
            return target, peers
            
        except Exception as e:
            logger.error(f"Error building comps model for {ticker}: {e}")
            raise

async def run_comps_analysis(ticker: str, output_path: Optional[str] = None) -> Dict:
    """
    Run complete Trading Comps analysis with real data
    
    Args:
        ticker: Target company ticker
        output_path: Optional path to save Excel output
        
    Returns:
        Dict containing analysis results
    """
    provider = CompsDataProvider()
    
    # Build model with real data
    target, peers = await provider.build_comps_model(ticker)
    
    # Run analysis
    model = CompsModel(target, peers)
    analysis = model.run_analysis()
    
    # Export to Excel if path provided
    if output_path:
        from backend.exports.comps_excel import export_comps_to_excel
        export_comps_to_excel(analysis, output_path)
    
    return analysis
