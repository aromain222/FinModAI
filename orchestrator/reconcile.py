"""
Data reconciliation and merging with provider priority and field-level provenance.
"""
import logging
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime
from dataclasses import dataclass
from providers.base import ProviderResult, validate_market_cap_consistency, normalize_capex, safe_divide


@dataclass
class ReconciledData:
    """Reconciled data with field-level provenance."""
    data: Dict[str, Any]
    provenance: Dict[str, str]  # field -> provider
    as_of_fundamentals: Optional[datetime] = None
    as_of_quotes: Optional[datetime] = None
    consistency_flags: List[str] = None
    
    def __post_init__(self):
        if self.consistency_flags is None:
            self.consistency_flags = []


class DataReconciler:
    """Reconciles data from multiple providers with priority and validation."""
    
    def __init__(self):
        self.logger = logging.getLogger("orchestrator.reconcile")
        
        # Provider priority by data type
        self.priority_map = {
            "fundamentals": ["edgar", "finnhub", "fmp", "alphavantage"],
            "quotes": ["yahoo", "finnhub", "alphavantage", "fmp"],
            "charts": ["yahoo", "finnhub", "fmp"],
            "metadata": ["finnhub", "fmp", "alphavantage", "yahoo"],
            "risk_free": ["fred"]
        }
    
    def reconcile_fundamentals(self, results: List[ProviderResult]) -> ReconciledData:
        """Reconcile fundamental data from multiple providers."""
        if not results:
            return ReconciledData(
                data={},
                provenance={},
                consistency_flags=["no_data"]
            )
        
        # Filter successful results and sort by priority
        successful_results = [r for r in results if r.success and r.data]
        if not successful_results:
            return ReconciledData(
                data={},
                provenance={},
                consistency_flags=["no_successful_data"]
            )
        
        # Sort by provider priority
        prioritized = self._prioritize_results(successful_results, "fundamentals")
        
        reconciled = ReconciledData(
            data={},
            provenance={},
            as_of_fundamentals=self._get_latest_timestamp(successful_results)
        )
        
        # Define field mappings and reconciliation logic
        field_mappings = {
            # Revenue fields
            "revenue_ttm": ["revenue_ttm", "totalRevenue", "revenue"],
            "revenue_latest": ["revenue_latest", "revenue"],
            
            # Profitability fields
            "ebitda_ttm": ["ebitda_ttm", "ebitda"],
            "ebit_ttm": ["ebit_ttm", "ebit", "operatingIncome"],
            "net_income_ttm": ["net_income_ttm", "netIncome", "netIncomeToCommon"],
            
            # Balance sheet fields
            "cash": ["cash", "totalCash", "cashAndCashEquivalents"],
            "total_debt": ["total_debt", "totalDebt"],
            "long_term_debt": ["long_term_debt", "longTermDebt"],
            "short_term_debt": ["short_term_debt", "shortTermDebt"],
            "total_assets": ["total_assets", "totalAssets"],
            "total_liabilities": ["total_liabilities", "totalLiabilities"],
            "total_equity": ["total_equity", "totalEquity"],
            
            # Share data
            "shares_out": ["shares_out", "sharesOutstanding", "shareOutstanding"],
            
            # Ratios
            "pe_ratio": ["pe_ratio", "trailingPE", "pe"],
            "ev_to_ebitda": ["ev_to_ebitda", "enterpriseToEbitda"],
            "ev_to_revenue": ["ev_to_revenue", "enterpriseToRevenue"],
            "beta": ["beta"],
            
            # CapEx and D&A
            "capex": ["capex", "capitalExpenditures", "paymentsToAcquirePropertyPlantAndEquipment"],
            "d_and_a": ["d_and_a", "depreciationAndAmortization"],
        }
        
        # Reconcile each field
        for target_field, source_fields in field_mappings.items():
            value, provider = self._reconcile_field(prioritized, source_fields)
            if value is not None:
                reconciled.data[target_field] = value
                reconciled.provenance[target_field] = provider
        
        # Special handling for CapEx normalization
        if "capex" in reconciled.data:
            capex_value, was_flipped = normalize_capex(reconciled.data["capex"])
            reconciled.data["capex"] = capex_value
            if was_flipped:
                reconciled.consistency_flags.append("capex_sign_flipped")
        
        # Calculate derived fields
        self._calculate_derived_fields(reconciled)
        
        # Validate consistency
        self._validate_fundamental_consistency(reconciled)
        
        return reconciled
    
    def reconcile_quotes(self, results: List[ProviderResult]) -> ReconciledData:
        """Reconcile quote data from multiple providers."""
        if not results:
            return ReconciledData(
                data={},
                provenance={},
                consistency_flags=["no_data"]
            )
        
        successful_results = [r for r in results if r.success and r.data]
        if not successful_results:
            return ReconciledData(
                data={},
                provenance={},
                consistency_flags=["no_successful_data"]
            )
        
        prioritized = self._prioritize_results(successful_results, "quotes")
        
        reconciled = ReconciledData(
            data={},
            provenance={},
            as_of_quotes=self._get_latest_timestamp(successful_results)
        )
        
        # Quote field mappings
        field_mappings = {
            "price": ["price", "c", "regularMarketPrice"],
            "previous_close": ["previous_close", "pc", "previousClose"],
            "change": ["change", "d", "regularMarketChange"],
            "change_percent": ["change_percent", "dp", "regularMarketChangePercent"],
            "volume": ["volume", "v", "regularMarketVolume"],
            "high": ["high", "h"],
            "low": ["low", "l"],
            "open": ["open", "o"],
            "market_cap": ["market_cap", "marketCap"],
            "currency": ["currency"],
            "exchange": ["exchange", "exchangeName"],
        }
        
        # Reconcile each field
        for target_field, source_fields in field_mappings.items():
            value, provider = self._reconcile_field(prioritized, source_fields)
            if value is not None:
                reconciled.data[target_field] = value
                reconciled.provenance[target_field] = provider
        
        # Validate market cap consistency
        self._validate_quote_consistency(reconciled)
        
        return reconciled
    
    def reconcile_metadata(self, results: List[ProviderResult]) -> ReconciledData:
        """Reconcile metadata from multiple providers."""
        if not results:
            return ReconciledData(
                data={},
                provenance={}
            )
        
        successful_results = [r for r in results if r.success and r.data]
        if not successful_results:
            return ReconciledData(
                data={},
                provenance={}
            )
        
        prioritized = self._prioritize_results(successful_results, "metadata")
        
        reconciled = ReconciledData(data={}, provenance={})
        
        # Metadata field mappings
        field_mappings = {
            "name": ["name", "longName"],
            "sector": ["sector", "finnhubIndustry"],
            "industry": ["industry", "finnhubIndustry"],
            "country": ["country"],
            "website": ["website", "weburl", "web_url"],
            "description": ["description", "longBusinessSummary"],
            "employees": ["employees", "fullTimeEmployees"],
        }
        
        # Reconcile each field
        for target_field, source_fields in field_mappings.items():
            value, provider = self._reconcile_field(prioritized, source_fields)
            if value is not None:
                reconciled.data[target_field] = value
                reconciled.provenance[target_field] = provider
        
        return reconciled
    
    def reconcile_charts(self, results: List[ProviderResult]) -> ReconciledData:
        """Reconcile chart data from multiple providers."""
        if not results:
            return ReconciledData(
                data={},
                provenance={}
            )
        
        successful_results = [r for r in results if r.success and r.data]
        if not successful_results:
            return ReconciledData(
                data={},
                provenance={}
            )
        
        prioritized = self._prioritize_results(successful_results, "charts")
        
        reconciled = ReconciledData(data={}, provenance={})
        
        # Chart field mappings
        field_mappings = {
            "sparkline": ["sparkline"],
            "period": ["period"],
            "prices": ["prices", "c"],
            "timestamps": ["timestamps", "t"],
        }
        
        # Reconcile each field
        for target_field, source_fields in field_mappings.items():
            value, provider = self._reconcile_field(prioritized, source_fields)
            if value is not None:
                reconciled.data[target_field] = value
                reconciled.provenance[target_field] = provider
        
        return reconciled
    
    def _prioritize_results(self, results: List[ProviderResult], data_type: str) -> List[ProviderResult]:
        """Sort results by provider priority for data type."""
        priority = self.priority_map.get(data_type, [])
        
        def priority_key(result):
            if result.provider in priority:
                return priority.index(result.provider)
            return len(priority)  # Unknown providers go to end
        
        return sorted(results, key=priority_key)
    
    def _reconcile_field(self, prioritized_results: List[ProviderResult], source_fields: List[str]) -> Tuple[Optional[Any], Optional[str]]:
        """Reconcile a field from prioritized results."""
        for result in prioritized_results:
            if not result.data:
                continue
            
            for source_field in source_fields:
                if source_field in result.data:
                    value = result.data[source_field]
                    if value is not None and value != "":
                        return value, result.provider
        
        return None, None
    
    def _get_latest_timestamp(self, results: List[ProviderResult]) -> Optional[datetime]:
        """Get the latest timestamp from results."""
        timestamps = [r.as_of for r in results if r.as_of]
        return max(timestamps) if timestamps else None
    
    def _calculate_derived_fields(self, reconciled: ReconciledData):
        """Calculate derived fields from reconciled data."""
        data = reconciled.data
        
        # Calculate net debt
        if data.get("cash") and data.get("total_debt"):
            data["net_debt"] = data["total_debt"] - data["cash"]
            reconciled.provenance["net_debt"] = "calculated"
        
        # Calculate EBITDA if we have EBIT and D&A
        if data.get("ebit") and data.get("d_and_a"):
            data["ebitda_calculated"] = data["ebit"] + data["d_and_a"]
            reconciled.provenance["ebitda_calculated"] = "calculated"
        
        # Calculate ratios with safe division
        if data.get("market_cap") and data.get("shares_out"):
            data["price_calculated"] = data["market_cap"] / data["shares_out"]
            reconciled.provenance["price_calculated"] = "calculated"
        
        if data.get("market_cap") and data.get("net_income_ttm"):
            pe_calculated = safe_divide(data["market_cap"], data["net_income_ttm"])
            if pe_calculated:
                data["pe_calculated"] = pe_calculated
                reconciled.provenance["pe_calculated"] = "calculated"
    
    def _validate_fundamental_consistency(self, reconciled: ReconciledData):
        """Validate fundamental data consistency."""
        data = reconciled.data
        flags = reconciled.consistency_flags
        
        # Check market cap consistency if we have price and shares
        if all(data.get(field) for field in ["price", "shares_out", "market_cap"]):
            if not validate_market_cap_consistency(data["price"], data["shares_out"], data["market_cap"]):
                flags.append("market_cap_inconsistent")
        
        # Check for negative values where they shouldn't be
        if data.get("revenue_ttm") and data["revenue_ttm"] <= 0:
            flags.append("negative_revenue")
        
        if data.get("shares_out") and data["shares_out"] <= 0:
            flags.append("invalid_shares")
    
    def _validate_quote_consistency(self, reconciled: ReconciledData):
        """Validate quote data consistency."""
        data = reconciled.data
        flags = reconciled.consistency_flags
        
        # Check price consistency
        if data.get("price") and data.get("previous_close"):
            if data["price"] <= 0 or data["previous_close"] <= 0:
                flags.append("invalid_prices")
        
        # Check change calculation
        if all(data.get(field) for field in ["price", "previous_close", "change", "change_percent"]):
            calculated_change = data["price"] - data["previous_close"]
            calculated_change_pct = (calculated_change / data["previous_close"]) * 100
            
            if abs(calculated_change - data["change"]) > 0.01:
                flags.append("change_inconsistent")
            
            if abs(calculated_change_pct - data["change_percent"]) > 0.1:
                flags.append("change_percent_inconsistent")


# Global reconciler instance
data_reconciler = DataReconciler()
