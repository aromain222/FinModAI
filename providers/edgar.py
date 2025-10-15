"""
SEC EDGAR provider for fundamental financial data.
No API key required - uses public SEC data.
"""
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime
import pandas as pd
from .base import BaseProvider, ProviderResult


class EdgarProvider(BaseProvider):
    """SEC EDGAR provider for fundamental financial data."""
    
    def __init__(self):
        super().__init__("edgar")
        self.base_url = "https://data.sec.gov/api/xbrl/companyfacts"
        
    def _get_headers(self) -> Dict[str, str]:
        """EDGAR requires specific headers."""
        headers = super()._get_headers()
        headers.update({
            "User-Agent": "FinModAI financial-modeling@example.com",
            "Accept-Encoding": "gzip, deflate",
            "Host": "data.sec.gov"
        })
        return headers
    
    async def get_fundamentals(self, ticker: str) -> ProviderResult:
        """Get fundamental financial data from EDGAR."""
        ticker = self._normalize_ticker(ticker)
        
        # EDGAR uses CIK (Central Index Key) - we'll need to map ticker to CIK
        cik = await self._get_cik_for_ticker(ticker)
        if not cik:
            return ProviderResult(
                success=False,
                error=f"Could not find CIK for ticker {ticker}",
                provider=self.name
            )
        
        url = f"{self.base_url}/CIK{cik.zfill(10)}.json"
        
        result = await self._make_request("GET", url)
        if not result.success:
            return result
        
        # Parse EDGAR data into standardized format
        try:
            parsed_data = self._parse_edgar_fundamentals(result.data, ticker)
            return ProviderResult(
                success=True,
                data=parsed_data,
                as_of=datetime.utcnow(),
                provider=self.name
            )
        except Exception as e:
            self.logger.error(f"Failed to parse EDGAR data for {ticker}: {e}")
            return ProviderResult(
                success=False,
                error=f"Failed to parse EDGAR data: {str(e)}",
                provider=self.name
            )
    
    async def get_quote(self, ticker: str) -> ProviderResult:
        """EDGAR doesn't provide real-time quotes."""
        return ProviderResult(
            success=False,
            error="EDGAR does not provide real-time quotes",
            provider=self.name
        )
    
    async def get_chart(self, ticker: str, period: str = "1mo") -> ProviderResult:
        """EDGAR doesn't provide historical price data."""
        return ProviderResult(
            success=False,
            error="EDGAR does not provide historical price data",
            provider=self.name
        )
    
    async def get_metadata(self, ticker: str) -> ProviderResult:
        """Get company metadata from EDGAR."""
        ticker = self._normalize_ticker(ticker)
        
        cik = await self._get_cik_for_ticker(ticker)
        if not cik:
            return ProviderResult(
                success=False,
                error=f"Could not find CIK for ticker {ticker}",
                provider=self.name
            )
        
        url = f"{self.base_url}/CIK{cik.zfill(10)}.json"
        
        result = await self._make_request("GET", url)
        if not result.success:
            return result
        
        try:
            parsed_metadata = self._parse_edgar_metadata(result.data, ticker)
            return ProviderResult(
                success=True,
                data=parsed_metadata,
                as_of=datetime.utcnow(),
                provider=self.name
            )
        except Exception as e:
            self.logger.error(f"Failed to parse EDGAR metadata for {ticker}: {e}")
            return ProviderResult(
                success=False,
                error=f"Failed to parse EDGAR metadata: {str(e)}",
                provider=self.name
            )
    
    async def _get_cik_for_ticker(self, ticker: str) -> Optional[str]:
        """Get CIK for a ticker symbol."""
        # This is a simplified mapping - in production, you'd want a comprehensive ticker-to-CIK database
        ticker_cik_map = {
            "AAPL": "0000320193",
            "MSFT": "0000789019",
            "GOOGL": "0001652044",
            "AMZN": "0001018724",
            "TSLA": "0001318605",
            "META": "0001326801",
            "NVDA": "0001045810",
            "NFLX": "0001067983",
            "ADBE": "0000796343",
            "CRM": "0001108524",
            "ORCL": "0001341439",
            "INTC": "0000050863",
            "IBM": "0000051143",
            "CSCO": "0000858877",
            "AMD": "0000002488",
            "QCOM": "0000804328",
            "AVGO": "0001730168",
            "TXN": "0000097476",
            "AMAT": "0000006951",
            "MU": "0000723125",
        }
        
        return ticker_cik_map.get(ticker.upper())
    
    def _parse_edgar_fundamentals(self, data: Dict, ticker: str) -> Dict[str, Any]:
        """Parse EDGAR company facts data into standardized format."""
        if not data or "facts" not in data:
            raise ValueError("Invalid EDGAR data structure")
        
        facts = data["facts"]
        us_gaap = facts.get("us-gaap", {})
        
        # Extract historical financial data
        historicals = []
        
        # Revenue data
        revenue_data = self._extract_gaap_data(us_gaap, ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"])
        ebit_data = self._extract_gaap_data(us_gaap, ["OperatingIncomeLoss", "IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"])
        ebitda_data = self._extract_gaap_data(us_gaap, ["OperatingIncomeLoss"])  # Will need to add back D&A
        net_income_data = self._extract_gaap_data(us_gaap, ["NetIncomeLoss", "NetIncomeLossAttributableToParent"])
        
        # CapEx data
        capex_data = self._extract_gaap_data(us_gaap, ["PaymentsToAcquirePropertyPlantAndEquipment", "CapitalExpenditures"])
        
        # Depreciation & Amortization
        d_and_a_data = self._extract_gaap_data(us_gaap, ["DepreciationAndAmortization", "DepreciationDepletionAndAmortization"])
        
        # Working capital components
        cash_data = self._extract_gaap_data(us_gaap, ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsAndShortTermInvestments"])
        current_assets_data = self._extract_gaap_data(us_gaap, ["AssetsCurrent"])
        current_liabilities_data = self._extract_gaap_data(us_gaap, ["LiabilitiesCurrent"])
        
        # Share count
        shares_data = self._extract_gaap_data(us_gaap, ["WeightedAverageNumberOfSharesOutstandingBasic", "WeightedAverageNumberOfSharesOutstandingDiluted"])
        
        # Debt data
        long_term_debt_data = self._extract_gaap_data(us_gaap, ["LongTermDebt", "LongTermDebtNoncurrent"])
        short_term_debt_data = self._extract_gaap_data(us_gaap, ["ShortTermBorrowings", "DebtCurrent"])
        
        # Build historical records
        fiscal_years = set()
        for data_source in [revenue_data, ebit_data, net_income_data]:
            if data_source:
                fiscal_years.update(data_source.keys())
        
        for fy in sorted(fiscal_years, reverse=True)[:10]:  # Last 10 years max
            historical = {
                "fiscal_year": fy,
                "revenue": revenue_data.get(fy),
                "ebit": ebit_data.get(fy),
                "ebitda": None,  # Will calculate if we have EBIT + D&A
                "d_and_a": d_and_a_data.get(fy),
                "capex": capex_data.get(fy),
                "net_income": net_income_data.get(fy),
                "cash": cash_data.get(fy),
                "shares_out": shares_data.get(fy),
                "long_term_debt": long_term_debt_data.get(fy),
                "short_term_debt": short_term_debt_data.get(fy),
            }
            
            # Calculate EBITDA if we have EBIT and D&A
            if historical["ebit"] and historical["d_and_a"]:
                historical["ebitda"] = historical["ebit"] + historical["d_and_a"]
            
            # Calculate working capital
            current_assets = current_assets_data.get(fy)
            current_liabilities = current_liabilities_data.get(fy)
            if current_assets and current_liabilities:
                historical["nwc"] = current_assets - current_liabilities
            
            # Calculate delta NWC
            if len(historicals) > 0 and historical["nwc"] and historicals[-1].get("nwc"):
                historical["delta_nwc"] = historical["nwc"] - historicals[-1]["nwc"]
            
            historicals.append(historical)
        
        # Get current/latest data
        current = {}
        if historicals:
            latest = historicals[0]  # Most recent year
            current = {
                "revenue_ttm": latest.get("revenue"),
                "ebitda_ttm": latest.get("ebitda"),
                "cash": latest.get("cash"),
                "shares_out": latest.get("shares_out"),
                "long_term_debt": latest.get("long_term_debt"),
                "short_term_debt": latest.get("short_term_debt"),
            }
        
        # Calculate net debt
        if current.get("cash") and (current.get("long_term_debt") or current.get("short_term_debt")):
            total_debt = (current.get("long_term_debt", 0) + current.get("short_term_debt", 0))
            current["net_debt"] = total_debt - current["cash"]
        
        return {
            "ticker": ticker,
            "historicals": historicals,
            "current": current,
            "source": "edgar",
            "as_of": datetime.utcnow().isoformat()
        }
    
    def _parse_edgar_metadata(self, data: Dict, ticker: str) -> Dict[str, Any]:
        """Parse EDGAR metadata."""
        if not data or "entityName" not in data:
            raise ValueError("Invalid EDGAR metadata structure")
        
        return {
            "ticker": ticker,
            "name": data.get("entityName", ticker),
            "cik": data.get("cik"),
            "sic": data.get("sic"),
            "sic_description": data.get("sicDescription"),
            "state_of_incorporation": data.get("stateOfIncorporation"),
            "source": "edgar",
            "as_of": datetime.utcnow().isoformat()
        }
    
    def _extract_gaap_data(self, us_gaap: Dict, field_names: List[str]) -> Dict[int, float]:
        """Extract GAAP data for given field names."""
        data = {}
        
        for field_name in field_names:
            if field_name in us_gaap:
                field_data = us_gaap[field_name]
                
                # Look for annual data (10-K filings)
                if "units" in field_data and "USD" in field_data["units"]:
                    usd_data = field_data["units"]["USD"]
                    
                    # Prefer annual data over quarterly
                    for period in usd_data:
                        if "fy" in period.lower() and "end" in period.lower():
                            try:
                                fiscal_year = int(period.split("-")[0])
                                value = usd_data[period]
                                if isinstance(value, (int, float)) and value != 0:
                                    data[fiscal_year] = float(value)
                            except (ValueError, IndexError, TypeError):
                                continue
        
        return data
