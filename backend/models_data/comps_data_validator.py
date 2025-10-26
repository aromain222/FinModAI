"""
Data validation and gap filling for Trading Comps
Ensures data completeness and quality with AI assistance
"""

from typing import Dict, List, Optional, Tuple, Any
import logging
from datetime import datetime
import pandas as pd
import numpy as np
from dataclasses import asdict

from backend.models_data.comps_model import CompanyMetrics
from backend.gap_filler_agent import GapFillerAgent
from backend.validation.rules import validate_financial_data

logger = logging.getLogger(__name__)

class CompsDataValidator:
    """Validates and fills gaps in comps data"""
    
    def __init__(self):
        self.gap_filler = GapFillerAgent()
        
    async def validate_market_data(self, data: Dict[str, Any], ticker: str) -> Dict[str, Any]:
        """Validate market data and fill gaps if needed"""
        required_fields = {
            "share_price": "current trading price",
            "shares_outstanding": "total shares outstanding",
            "market_cap": "market capitalization"
        }
        
        # Check for missing fields
        missing_fields = [
            field for field, desc in required_fields.items()
            if not data.get(field)
        ]
        
        if missing_fields:
            logger.warning(f"Missing market data fields for {ticker}: {missing_fields}")
            
            # Try to derive missing fields
            if "market_cap" in missing_fields and data.get("share_price") and data.get("shares_outstanding"):
                data["market_cap"] = data["share_price"] * data["shares_outstanding"]
                missing_fields.remove("market_cap")
            
            if missing_fields:
                # Use gap filler for remaining fields
                filled_data = await self.gap_filler.fill_fields(
                    ticker=ticker,
                    data_type="market_data",
                    missing_fields=missing_fields,
                    context=data
                )
                
                if filled_data:
                    data.update(filled_data)
                    logger.info(f"Filled market data gaps for {ticker}: {filled_data.keys()}")
        
        return data

    async def validate_financial_data(self, data: Dict[str, Any], ticker: str) -> Dict[str, Any]:
        """Validate financial data and fill gaps if needed"""
        required_fields = {
            "revenue_ltm": "last twelve months revenue",
            "ebitda_ltm": "last twelve months EBITDA",
            "ebit_ltm": "last twelve months EBIT",
            "net_income_ltm": "last twelve months net income",
            "total_debt": "total debt",
            "cash": "cash and equivalents",
            "book_value": "total shareholder equity"
        }
        
        # Check for missing fields
        missing_fields = [
            field for field, desc in required_fields.items()
            if not data.get(field)
        ]
        
        if missing_fields:
            logger.warning(f"Missing financial data fields for {ticker}: {missing_fields}")
            
            # Try to derive missing fields
            derivable = await self._derive_financial_metrics(data)
            data.update(derivable)
            
            # Remove derived fields from missing
            missing_fields = [f for f in missing_fields if f not in derivable]
            
            if missing_fields:
                # Use gap filler for remaining fields
                filled_data = await self.gap_filler.fill_fields(
                    ticker=ticker,
                    data_type="financial_data",
                    missing_fields=missing_fields,
                    context=data
                )
                
                if filled_data:
                    data.update(filled_data)
                    logger.info(f"Filled financial data gaps for {ticker}: {filled_data.keys()}")
        
        return data

    async def validate_estimates(self, data: Dict[str, Any], ticker: str) -> Dict[str, Any]:
        """Validate forward estimates and fill gaps if needed"""
        required_fields = {
            "revenue_ntm": "next twelve months revenue",
            "ebitda_ntm": "next twelve months EBITDA",
            "ebit_ntm": "next twelve months EBIT",
            "eps_ntm": "next twelve months EPS"
        }
        
        # Check for missing fields
        missing_fields = [
            field for field, desc in required_fields.items()
            if not data.get(field)
        ]
        
        if missing_fields:
            logger.warning(f"Missing estimate fields for {ticker}: {missing_fields}")
            
            # Try to derive missing fields
            derivable = await self._derive_estimates(data)
            data.update(derivable)
            
            # Remove derived fields from missing
            missing_fields = [f for f in missing_fields if f not in derivable]
            
            if missing_fields:
                # Use gap filler for remaining fields
                filled_data = await self.gap_filler.fill_fields(
                    ticker=ticker,
                    data_type="estimates",
                    missing_fields=missing_fields,
                    context=data
                )
                
                if filled_data:
                    data.update(filled_data)
                    logger.info(f"Filled estimate gaps for {ticker}: {filled_data.keys()}")
        
        return data

    async def _derive_financial_metrics(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Derive missing financial metrics from available data"""
        derived = {}
        
        # EBITDA = EBIT + D&A
        if not data.get("ebitda_ltm") and data.get("ebit_ltm") and data.get("depreciation_amortization_ltm"):
            derived["ebitda_ltm"] = data["ebit_ltm"] + data["depreciation_amortization_ltm"]
        
        # EBIT = Revenue * EBIT margin
        if not data.get("ebit_ltm") and data.get("revenue_ltm") and data.get("ebit_margin_ltm"):
            derived["ebit_ltm"] = data["revenue_ltm"] * data["ebit_margin_ltm"]
        
        # Net Income = EBIT * (1 - tax rate)
        if not data.get("net_income_ltm") and data.get("ebit_ltm") and data.get("effective_tax_rate_ltm"):
            derived["net_income_ltm"] = data["ebit_ltm"] * (1 - data["effective_tax_rate_ltm"])
        
        return derived

    async def _derive_estimates(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Derive missing estimates from available data"""
        derived = {}
        
        # Revenue NTM = Revenue LTM * (1 + growth rate)
        if not data.get("revenue_ntm") and data.get("revenue_ltm") and data.get("revenue_growth_rate"):
            derived["revenue_ntm"] = data["revenue_ltm"] * (1 + data["revenue_growth_rate"])
        
        # EBITDA NTM = Revenue NTM * EBITDA margin
        if not data.get("ebitda_ntm") and data.get("revenue_ntm") and data.get("ebitda_margin_ltm"):
            derived["ebitda_ntm"] = data["revenue_ntm"] * data["ebitda_margin_ltm"]
        
        # EBIT NTM = EBITDA NTM - D&A
        if not data.get("ebit_ntm") and data.get("ebitda_ntm") and data.get("depreciation_amortization_ntm"):
            derived["ebit_ntm"] = data["ebitda_ntm"] - data["depreciation_amortization_ntm"]
        
        return derived

    def validate_peer_selection(self, target: CompanyMetrics, peers: List[CompanyMetrics]) -> List[CompanyMetrics]:
        """Validate and filter peer group"""
        if not peers:
            return []
            
        # Convert to DataFrame for easier analysis
        peer_data = pd.DataFrame([asdict(p) for p in peers])
        target_data = pd.Series(asdict(target))
        
        # Calculate key metrics for filtering
        peer_data["revenue_size_ratio"] = peer_data["revenue_ltm"] / target_data["revenue_ltm"]
        peer_data["ebitda_margin"] = peer_data["ebitda_ltm"] / peer_data["revenue_ltm"]
        target_margin = target_data["ebitda_ltm"] / target_data["revenue_ltm"]
        
        # Filter criteria
        size_filter = (peer_data["revenue_size_ratio"] >= 0.3) & (peer_data["revenue_size_ratio"] <= 3.0)
        margin_filter = (peer_data["ebitda_margin"] >= target_margin * 0.5) & (peer_data["ebitda_margin"] <= target_margin * 2.0)
        
        # Apply filters
        filtered_peers = peer_data[size_filter & margin_filter]
        
        # Convert back to CompanyMetrics objects
        valid_peers = [
            CompanyMetrics(**{k: v for k, v in peer.items() if k in CompanyMetrics.__annotations__})
            for peer in filtered_peers.to_dict("records")
        ]
        
        return valid_peers

    async def validate_and_fill_company_metrics(self, metrics: CompanyMetrics) -> CompanyMetrics:
        """Validate and fill gaps in CompanyMetrics object"""
        # Convert to dict for validation
        data = asdict(metrics)
        ticker = metrics.ticker
        
        # Validate each component
        market_data = {k: v for k, v in data.items() if k in ["share_price", "shares_outstanding", "market_cap"]}
        financial_data = {k: v for k, v in data.items() if "_ltm" in k or k in ["total_debt", "cash", "book_value"]}
        estimates = {k: v for k, v in data.items() if "_ntm" in k}
        
        validated_market = await self.validate_market_data(market_data, ticker)
        validated_financial = await self.validate_financial_data(financial_data, ticker)
        validated_estimates = await self.validate_estimates(estimates, ticker)
        
        # Combine validated data
        validated_data = {**data, **validated_market, **validated_financial, **validated_estimates}
        
        # Create new CompanyMetrics object
        return CompanyMetrics(**validated_data)

    async def validate_comps_data(self, target: CompanyMetrics, peers: List[CompanyMetrics]) -> Tuple[CompanyMetrics, List[CompanyMetrics]]:
        """Validate and fill gaps in complete comps dataset"""
        # Validate target company
        validated_target = await self.validate_and_fill_company_metrics(target)
        
        # Validate each peer
        validated_peers = []
        for peer in peers:
            try:
                validated_peer = await self.validate_and_fill_company_metrics(peer)
                validated_peers.append(validated_peer)
            except Exception as e:
                logger.warning(f"Failed to validate peer {peer.ticker}: {e}")
                continue
        
        # Filter peer group
        final_peers = self.validate_peer_selection(validated_target, validated_peers)
        
        return validated_target, final_peers
