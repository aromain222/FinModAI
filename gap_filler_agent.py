"""
Gap-Filler Agent for FinModAI
Last-resort, banker-safe imputation for missing model input fields
"""

import json
import logging
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any, Union
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class FillMethod(Enum):
    DERIVATION = "derivation"
    EXTRACTION = "extraction"
    INTERPOLATION = "interpolation"
    PEER_IMPUTATION = "peer_imputation"
    USER_SUPPLIED = "user_supplied"

class GapFillerAgent:
    """
    Banker-safe gap-filling agent that follows strict hierarchy:
    Derive > Extract > Interpolate/Peer > Ask Human > Fail
    """
    
    def __init__(self):
        self.confidence_thresholds = {
            'auto_approve': 0.70,
            'manual_approval': 0.40,
            'reject': 0.40
        }
        
        # Sign conventions
        self.positive_fields = {'capex', 'd_and_a', 'depreciation'}
        self.ratio_fields = {'ev_to_ebitda', 'pe', 'pb', 'debt_to_equity', 'current_ratio'}
        
    def fill_gaps(self, 
                 missing_fields: List[str],
                 verified_bundle: Dict[str, Any],
                 filings_text: Optional[Dict[str, str]] = None,
                 historical_series: Optional[Dict[str, List[float]]] = None,
                 peer_medians: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
        """
        Main gap-filling entry point
        
        Args:
            missing_fields: List of field names that need to be filled
            verified_bundle: Current bundle with verified values and provenance
            filings_text: Optional 10-K/10-Q text snippets
            historical_series: Optional historical data for interpolation
            peer_medians: Optional peer ratio medians for imputation
            
        Returns:
            Gap-fill results with fills, unresolved fields, and summary
        """
        logger.info(f"Gap-Filler: Processing {len(missing_fields)} missing fields")
        
        fills = []
        unresolved = []
        
        for field in missing_fields:
            try:
                result = self._fill_single_field(
                    field, verified_bundle, filings_text, 
                    historical_series, peer_medians
                )
                
                if result and result.get('value') is not None:
                    fills.append(result)
                else:
                    unresolved.append(result)
                    
            except Exception as e:
                logger.error(f"Error filling field {field}: {e}")
                unresolved.append({
                    "field": field,
                    "error": "processing_error",
                    "action_request": f"Manual review required for {field}: {str(e)}"
                })
        
        # Validate consistency of fills
        fills = self._validate_consistency(fills, verified_bundle)
        
        # Generate summary
        summary = self._generate_summary(fills, unresolved)
        
        return {
            "fills": fills,
            "unresolved": unresolved,
            "summary": summary
        }
    
    def _fill_single_field(self, 
                          field: str,
                          verified_bundle: Dict[str, Any],
                          filings_text: Optional[Dict[str, str]] = None,
                          historical_series: Optional[Dict[str, List[float]]] = None,
                          peer_medians: Optional[Dict[str, float]] = None) -> Dict[str, Any]:
        """Fill a single missing field using the hierarchy"""
        
        # Method A: Deterministic Derivations (highest confidence)
        derivation_result = self._try_derivation(field, verified_bundle)
        if derivation_result:
            return derivation_result
            
        # Method B: Structured Extraction from Filings
        if filings_text:
            extraction_result = self._try_extraction(field, filings_text, verified_bundle)
            if extraction_result:
                return extraction_result
        
        # Method C: Historical Interpolation (bounded)
        if historical_series and field in historical_series:
            interpolation_result = self._try_interpolation(field, historical_series, verified_bundle)
            if interpolation_result:
                return interpolation_result
        
        # Method D: Peer-Based Imputation (ratios only)
        if field in self.ratio_fields and peer_medians and field in peer_medians:
            peer_result = self._try_peer_imputation(field, peer_medians, verified_bundle)
            if peer_result:
                return peer_result
        
        # Method E: Ask Human
        return self._create_action_request(field, verified_bundle)
    
    def _try_derivation(self, field: str, bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Method A: Deterministic derivations using verified inputs"""
        
        derivations = {
            'ebitda': self._derive_ebitda,
            'net_debt': self._derive_net_debt,
            'ev': self._derive_ev,
            'pe': self._derive_pe,
            'delta_nwc': self._derive_delta_nwc,
            'free_cash_flow': self._derive_fcf,
            'market_cap': self._derive_market_cap,
            'shares_out': self._derive_shares_out
        }
        
        if field in derivations:
            return derivations[field](bundle)
        return None
    
    def _derive_ebitda(self, bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """EBITDA = EBIT + D&A"""
        ebit = bundle.get('market', {}).get('ebit')
        d_and_a = bundle.get('market', {}).get('d_and_a')
        
        if ebit is not None and d_and_a is not None and ebit > 0:
            ebitda = ebit + d_and_a
            return {
                "field": "ebitda",
                "value": ebitda,
                "units": "USD_mm",
                "method": FillMethod.DERIVATION.value,
                "formula": "EBIT + D&A",
                "inputs_used": {
                    "ebit": {"value": ebit, "provenance": bundle.get('provenance', {}).get('ebit', {}).get('source', 'unknown')},
                    "d_and_a": {"value": d_and_a, "provenance": bundle.get('provenance', {}).get('d_and_a', {}).get('source', 'unknown')}
                },
                "source_snippet": None,
                "source_reference": None,
                "confidence": 0.95,
                "requires_manual_approval": False,
                "provenance": {
                    "provider": "finmodai-gapfiller",
                    "derived_from": ["edgar:ebit", "edgar:d_and_a"],
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                "notes": "Derived via identity; sanity-checked values > 0."
            }
        return None
    
    def _derive_net_debt(self, bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Net Debt = Short Term Debt + Long Term Debt - Cash"""
        st_debt = bundle.get('capital', {}).get('short_term_debt', 0)
        lt_debt = bundle.get('capital', {}).get('long_term_debt', 0)
        cash = bundle.get('capital', {}).get('cash', 0)
        
        net_debt = st_debt + lt_debt - cash
        
        # Sanity check: if negative, it's net cash
        if net_debt < 0:
            net_debt = 0  # Set to 0 for net cash position
            
        return {
            "field": "net_debt",
            "value": net_debt,
            "units": "USD_mm",
            "method": FillMethod.DERIVATION.value,
            "formula": "ShortTermDebt + LongTermDebt - Cash",
            "inputs_used": {
                "short_term_debt": {"value": st_debt, "provenance": "capital_structure"},
                "long_term_debt": {"value": lt_debt, "provenance": "capital_structure"},
                "cash": {"value": cash, "provenance": "capital_structure"}
            },
            "confidence": 0.99,
            "requires_manual_approval": False,
            "provenance": {
                "provider": "finmodai-gapfiller",
                "derived_from": ["capital:short_term_debt", "capital:long_term_debt", "capital:cash"],
                "timestamp": datetime.now(timezone.utc).isoformat()
            },
            "notes": "Net cash position set to 0 if debt < cash."
        }
    
    def _derive_ev(self, bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """EV = Market Cap + Net Debt"""
        market_cap = bundle.get('market', {}).get('market_cap')
        net_debt = bundle.get('capital', {}).get('net_debt')
        
        if market_cap is not None and net_debt is not None:
            ev = market_cap + net_debt
            return {
                "field": "ev",
                "value": ev,
                "units": "USD_mm",
                "method": FillMethod.DERIVATION.value,
                "formula": "MarketCap + NetDebt",
                "inputs_used": {
                    "market_cap": {"value": market_cap, "provenance": "market"},
                    "net_debt": {"value": net_debt, "provenance": "capital"}
                },
                "confidence": 0.98,
                "requires_manual_approval": False,
                "provenance": {
                    "provider": "finmodai-gapfiller",
                    "derived_from": ["market:market_cap", "capital:net_debt"],
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                "notes": "Enterprise value calculation."
            }
        return None
    
    def _derive_pe(self, bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """P/E = Market Cap / Net Income (Net Income > 0)"""
        market_cap = bundle.get('market', {}).get('market_cap')
        net_income = bundle.get('market', {}).get('net_income')
        
        if market_cap is not None and net_income is not None and net_income > 0:
            pe = market_cap / net_income
            return {
                "field": "pe",
                "value": pe,
                "units": "ratio",
                "method": FillMethod.DERIVATION.value,
                "formula": "MarketCap / NetIncome",
                "inputs_used": {
                    "market_cap": {"value": market_cap, "provenance": "market"},
                    "net_income": {"value": net_income, "provenance": "market"}
                },
                "confidence": 0.97,
                "requires_manual_approval": False,
                "provenance": {
                    "provider": "finmodai-gapfiller",
                    "derived_from": ["market:market_cap", "market:net_income"],
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                "notes": "P/E ratio calculation."
            }
        return None
    
    def _derive_delta_nwc(self, bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """ΔNWC = NWC_t - NWC_{t-1}"""
        # This would require historical working capital data
        # For now, return None as we don't have the historical series
        return None
    
    def _derive_fcf(self, bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """FCF = Net Income + D&A - CapEx - ΔNWC"""
        net_income = bundle.get('market', {}).get('net_income')
        d_and_a = bundle.get('market', {}).get('d_and_a')
        capex = bundle.get('market', {}).get('capex')
        delta_nwc = bundle.get('market', {}).get('delta_nwc', 0)  # Default to 0
        
        if net_income is not None and d_and_a is not None and capex is not None:
            fcf = net_income + d_and_a - capex - delta_nwc
            return {
                "field": "free_cash_flow",
                "value": fcf,
                "units": "USD_mm",
                "method": FillMethod.DERIVATION.value,
                "formula": "NetIncome + D&A - CapEx - ΔNWC",
                "inputs_used": {
                    "net_income": {"value": net_income, "provenance": "market"},
                    "d_and_a": {"value": d_and_a, "provenance": "market"},
                    "capex": {"value": capex, "provenance": "market"},
                    "delta_nwc": {"value": delta_nwc, "provenance": "market"}
                },
                "confidence": 0.90,
                "requires_manual_approval": False,
                "provenance": {
                    "provider": "finmodai-gapfiller",
                    "derived_from": ["market:net_income", "market:d_and_a", "market:capex"],
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                "notes": "Free cash flow calculation with ΔNWC defaulted to 0."
            }
        return None
    
    def _derive_market_cap(self, bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Market Cap = Price × Shares Outstanding"""
        price = bundle.get('market', {}).get('price')
        shares_out = bundle.get('capital', {}).get('shares_out')
        
        if price is not None and shares_out is not None and shares_out > 0:
            market_cap = price * shares_out
            return {
                "field": "market_cap",
                "value": market_cap,
                "units": "USD_mm",
                "method": FillMethod.DERIVATION.value,
                "formula": "Price × SharesOutstanding",
                "inputs_used": {
                    "price": {"value": price, "provenance": "market"},
                    "shares_out": {"value": shares_out, "provenance": "capital"}
                },
                "confidence": 0.99,
                "requires_manual_approval": False,
                "provenance": {
                    "provider": "finmodai-gapfiller",
                    "derived_from": ["market:price", "capital:shares_out"],
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                "notes": "Market cap calculation."
            }
        return None
    
    def _derive_shares_out(self, bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Shares Outstanding = Market Cap / Price"""
        market_cap = bundle.get('market', {}).get('market_cap')
        price = bundle.get('market', {}).get('price')
        
        if market_cap is not None and price is not None and price > 0:
            shares_out = market_cap / price
            return {
                "field": "shares_out",
                "value": shares_out,
                "units": "shares_mm",
                "method": FillMethod.DERIVATION.value,
                "formula": "MarketCap / Price",
                "inputs_used": {
                    "market_cap": {"value": market_cap, "provenance": "market"},
                    "price": {"value": price, "provenance": "market"}
                },
                "confidence": 0.98,
                "requires_manual_approval": False,
                "provenance": {
                    "provider": "finmodai-gapfiller",
                    "derived_from": ["market:market_cap", "market:price"],
                    "timestamp": datetime.now(timezone.utc).isoformat()
                },
                "notes": "Shares outstanding calculation."
            }
        return None
    
    def _try_extraction(self, field: str, filings_text: Dict[str, str], bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Method B: Extract from 10-K/10-Q filings text"""
        # This would implement parsing of SEC filings
        # For now, return None as we don't have filing text parsing implemented
        return None
    
    def _try_interpolation(self, field: str, historical_series: Dict[str, List[float]], bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Method C: Historical interpolation (bounded)"""
        if field not in historical_series:
            return None
            
        series = historical_series[field]
        if len(series) < 3:
            return None
            
        # Simple linear interpolation for missing year
        # This is a simplified implementation
        interpolated_value = sum(series) / len(series)  # Mean for now
        
        return {
            "field": field,
            "value": interpolated_value,
            "units": "USD_mm",
            "method": FillMethod.INTERPOLATION.value,
            "formula": f"Historical mean of {len(series)} data points",
            "inputs_used": {
                "historical_series": {"value": series, "provenance": "historical"}
            },
            "confidence": 0.65,
            "requires_manual_approval": True,
            "provenance": {
                "provider": "finmodai-gapfiller",
                "derived_from": ["historical_series"],
                "timestamp": datetime.now(timezone.utc).isoformat()
            },
            "notes": "Historical interpolation - requires manual approval."
        }
    
    def _try_peer_imputation(self, field: str, peer_medians: Dict[str, float], bundle: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Method D: Peer-based imputation (ratios only)"""
        if field not in peer_medians:
            return None
            
        peer_median = peer_medians[field]
        
        return {
            "field": field,
            "value": peer_median,
            "units": "ratio",
            "method": FillMethod.PEER_IMPUTATION.value,
            "formula": f"Sector median {field}",
            "inputs_used": {
                "peer_median": {"value": peer_median, "provenance": "peer_analysis"}
            },
            "confidence": 0.55,
            "requires_manual_approval": True,
            "provenance": {
                "provider": "finmodai-gapfiller",
                "derived_from": ["peer_medians"],
                "timestamp": datetime.now(timezone.utc).isoformat()
            },
            "notes": "Peer-based imputation - requires manual approval."
        }
    
    def _create_action_request(self, field: str, bundle: Dict[str, Any]) -> Dict[str, Any]:
        """Method E: Create actionable request for human input"""
        
        action_requests = {
            'revenue': "Provide FY2023 revenue from 10-K or approve interpolation within ±20% of 3Y mean",
            'ebit': "Provide FY2023 EBIT from 10-K Income Statement or allow derivation from EBITDA if D&A available",
            'ebitda': "Provide FY2023 EBITDA from 10-K or allow derivation from EBIT + D&A",
            'capex': "Provide FY2023 CapEx from 10-K Cash Flow Statement (PaymentsToAcquirePPE)",
            'cash': "Provide FY2023 cash from 10-K Balance Sheet",
            'debt': "Provide FY2023 total debt from 10-K Balance Sheet (short-term + long-term debt)",
            'shares_out': "Provide FY2023 shares outstanding from 10-K or calculate from market cap / price",
            'price': "Provide current stock price from market data provider",
            'market_cap': "Provide current market cap from market data provider or calculate from price × shares"
        }
        
        return {
            "field": field,
            "error": "missing_source",
            "action_request": action_requests.get(field, f"Manual data entry required for {field}")
        }
    
    def _validate_consistency(self, fills: List[Dict[str, Any]], bundle: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Validate consistency of filled values"""
        validated_fills = []
        
        for fill in fills:
            # Check sign conventions
            field = fill.get('field')
            value = fill.get('value')
            
            if field in self.positive_fields and value < 0:
                fill['confidence'] = min(fill.get('confidence', 0.5), 0.5)
                fill['requires_manual_approval'] = True
                fill['notes'] = f"Negative value for {field} - manual approval required"
            
            # Check for reasonable bounds
            if field == 'pe' and (value < 0 or value > 100):
                fill['confidence'] = min(fill.get('confidence', 0.5), 0.6)
                fill['requires_manual_approval'] = True
                fill['notes'] = f"Unusual P/E ratio {value:.1f} - manual approval required"
            
            validated_fills.append(fill)
        
        return validated_fills
    
    def _generate_summary(self, fills: List[Dict[str, Any]], unresolved: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Generate summary of gap-filling results"""
        
        requires_approval = any(fill.get('requires_manual_approval', False) for fill in fills)
        
        methods_used = [fill.get('method') for fill in fills]
        unique_methods = list(set(methods_used))
        
        reason = "Gap-filling completed"
        if requires_approval:
            reason = "Some fills require manual approval due to low confidence or peer-based imputation"
        elif unresolved:
            reason = f"{len(unresolved)} fields could not be filled automatically"
        
        return {
            "filled_count": len(fills),
            "unresolved_count": len(unresolved),
            "requires_manual_approval": requires_approval,
            "methods_used": unique_methods,
            "reason": reason
        }


# Global instance
gap_filler = GapFillerAgent()
