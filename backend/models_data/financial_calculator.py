"""
Advanced financial calculations and derivations for gap filling
"""

from typing import Dict, Optional, List, Tuple
import numpy as np
from dataclasses import dataclass
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

@dataclass
class FinancialMetrics:
    """Core financial metrics with confidence scores"""
    value: float
    confidence: float
    method: str
    inputs: List[str]
    timestamp: datetime

class FinancialCalculator:
    """Advanced financial calculations for deriving missing metrics"""
    
    def __init__(self):
        self.calculations = {
            # Income Statement Metrics
            "revenue": self._calculate_revenue,
            "ebitda": self._calculate_ebitda,
            "ebit": self._calculate_ebit,
            "net_income": self._calculate_net_income,
            "eps": self._calculate_eps,
            
            # Balance Sheet Metrics
            "total_assets": self._calculate_total_assets,
            "total_liabilities": self._calculate_total_liabilities,
            "book_value": self._calculate_book_value,
            "net_debt": self._calculate_net_debt,
            "working_capital": self._calculate_working_capital,
            
            # Cash Flow Metrics
            "operating_cash_flow": self._calculate_operating_cash_flow,
            "free_cash_flow": self._calculate_free_cash_flow,
            "capex": self._calculate_capex,
            
            # Growth Metrics
            "revenue_growth": self._calculate_revenue_growth,
            "ebitda_growth": self._calculate_ebitda_growth,
            "eps_growth": self._calculate_eps_growth,
            
            # Margin Metrics
            "gross_margin": self._calculate_gross_margin,
            "ebitda_margin": self._calculate_ebitda_margin,
            "ebit_margin": self._calculate_ebit_margin,
            "net_margin": self._calculate_net_margin,
            
            # Return Metrics
            "roe": self._calculate_roe,
            "roa": self._calculate_roa,
            "roic": self._calculate_roic,
            
            # Valuation Metrics
            "enterprise_value": self._calculate_ev,
            "market_cap": self._calculate_market_cap,
            "ev_ebitda": self._calculate_ev_ebitda,
            "pe_ratio": self._calculate_pe,
            "pb_ratio": self._calculate_pb
        }
        
    def derive_metric(self, metric: str, data: Dict[str, float]) -> Optional[FinancialMetrics]:
        """
        Attempt to derive a missing financial metric
        Returns None if derivation not possible
        """
        if metric not in self.calculations:
            logger.warning(f"No calculation method for metric: {metric}")
            return None
            
        try:
            return self.calculations[metric](data)
        except Exception as e:
            logger.warning(f"Failed to derive {metric}: {e}")
            return None

    def _calculate_ebitda(self, data: Dict[str, float]) -> Optional[FinancialMetrics]:
        """Calculate EBITDA through multiple methods"""
        methods = [
            # Method 1: EBIT + D&A
            {
                "calc": lambda: data["ebit"] + data["depreciation_amortization"],
                "inputs": ["ebit", "depreciation_amortization"],
                "confidence": 0.95
            },
            # Method 2: Revenue * EBITDA margin
            {
                "calc": lambda: data["revenue"] * data["ebitda_margin"],
                "inputs": ["revenue", "ebitda_margin"],
                "confidence": 0.85
            },
            # Method 3: Net Income + Interest + Taxes + D&A
            {
                "calc": lambda: (
                    data["net_income"] +
                    data["interest_expense"] +
                    data["income_tax"] +
                    data["depreciation_amortization"]
                ),
                "inputs": ["net_income", "interest_expense", "income_tax", "depreciation_amortization"],
                "confidence": 0.90
            }
        ]
        
        for method in methods:
            try:
                if all(i in data for i in method["inputs"]):
                    value = method["calc"]()
                    return FinancialMetrics(
                        value=value,
                        confidence=method["confidence"],
                        method=f"derived_from_{'+'.join(method['inputs'])}",
                        inputs=method["inputs"],
                        timestamp=datetime.now()
                    )
            except Exception as e:
                logger.debug(f"Method failed: {e}")
                continue
                
        return None

    def _calculate_ebit(self, data: Dict[str, float]) -> Optional[FinancialMetrics]:
        """Calculate EBIT through multiple methods"""
        methods = [
            # Method 1: EBITDA - D&A
            {
                "calc": lambda: data["ebitda"] - data["depreciation_amortization"],
                "inputs": ["ebitda", "depreciation_amortization"],
                "confidence": 0.95
            },
            # Method 2: Revenue * EBIT margin
            {
                "calc": lambda: data["revenue"] * data["ebit_margin"],
                "inputs": ["revenue", "ebit_margin"],
                "confidence": 0.85
            },
            # Method 3: Net Income + Interest + Taxes
            {
                "calc": lambda: data["net_income"] + data["interest_expense"] + data["income_tax"],
                "inputs": ["net_income", "interest_expense", "income_tax"],
                "confidence": 0.90
            }
        ]
        
        for method in methods:
            try:
                if all(i in data for i in method["inputs"]):
                    value = method["calc"]()
                    return FinancialMetrics(
                        value=value,
                        confidence=method["confidence"],
                        method=f"derived_from_{'+'.join(method['inputs'])}",
                        inputs=method["inputs"],
                        timestamp=datetime.now()
                    )
            except Exception:
                continue
                
        return None

    def _calculate_net_income(self, data: Dict[str, float]) -> Optional[FinancialMetrics]:
        """Calculate Net Income through multiple methods"""
        methods = [
            # Method 1: EBIT * (1 - Tax Rate)
            {
                "calc": lambda: data["ebit"] * (1 - data["effective_tax_rate"]),
                "inputs": ["ebit", "effective_tax_rate"],
                "confidence": 0.85
            },
            # Method 2: Revenue * Net Margin
            {
                "calc": lambda: data["revenue"] * data["net_margin"],
                "inputs": ["revenue", "net_margin"],
                "confidence": 0.80
            },
            # Method 3: EPS * Shares Outstanding
            {
                "calc": lambda: data["eps"] * data["shares_outstanding"],
                "inputs": ["eps", "shares_outstanding"],
                "confidence": 0.90
            }
        ]
        
        for method in methods:
            try:
                if all(i in data for i in method["inputs"]):
                    value = method["calc"]()
                    return FinancialMetrics(
                        value=value,
                        confidence=method["confidence"],
                        method=f"derived_from_{'+'.join(method['inputs'])}",
                        inputs=method["inputs"],
                        timestamp=datetime.now()
                    )
            except Exception:
                continue
                
        return None

    def _calculate_free_cash_flow(self, data: Dict[str, float]) -> Optional[FinancialMetrics]:
        """Calculate Free Cash Flow through multiple methods"""
        methods = [
            # Method 1: Operating Cash Flow - CapEx
            {
                "calc": lambda: data["operating_cash_flow"] - data["capex"],
                "inputs": ["operating_cash_flow", "capex"],
                "confidence": 0.95
            },
            # Method 2: EBITDA * (1 - Tax Rate) - CapEx - Change in WC
            {
                "calc": lambda: (
                    data["ebitda"] * (1 - data["effective_tax_rate"]) -
                    data["capex"] -
                    (data["working_capital"] - data["working_capital_prev"])
                ),
                "inputs": ["ebitda", "effective_tax_rate", "capex", "working_capital", "working_capital_prev"],
                "confidence": 0.85
            }
        ]
        
        for method in methods:
            try:
                if all(i in data for i in method["inputs"]):
                    value = method["calc"]()
                    return FinancialMetrics(
                        value=value,
                        confidence=method["confidence"],
                        method=f"derived_from_{'+'.join(method['inputs'])}",
                        inputs=method["inputs"],
                        timestamp=datetime.now()
                    )
            except Exception:
                continue
                
        return None

    def _calculate_ev(self, data: Dict[str, float]) -> Optional[FinancialMetrics]:
        """Calculate Enterprise Value"""
        try:
            if all(k in data for k in ["market_cap", "total_debt", "cash", "minority_interest"]):
                value = (
                    data["market_cap"] +
                    data["total_debt"] -
                    data["cash"] +
                    data.get("minority_interest", 0)
                )
                return FinancialMetrics(
                    value=value,
                    confidence=0.95,
                    method="standard_ev_calculation",
                    inputs=["market_cap", "total_debt", "cash", "minority_interest"],
                    timestamp=datetime.now()
                )
        except Exception:
            pass
            
        return None

    def _calculate_market_cap(self, data: Dict[str, float]) -> Optional[FinancialMetrics]:
        """Calculate Market Cap"""
        try:
            if all(k in data for k in ["share_price", "shares_outstanding"]):
                value = data["share_price"] * data["shares_outstanding"]
                return FinancialMetrics(
                    value=value,
                    confidence=0.99,
                    method="price_times_shares",
                    inputs=["share_price", "shares_outstanding"],
                    timestamp=datetime.now()
                )
        except Exception:
            pass
            
        return None

    def _calculate_growth_rate(self, current: float, previous: float) -> float:
        """Calculate year-over-year growth rate"""
        return (current / previous) - 1 if previous else None

    def _calculate_margin(self, numerator: float, denominator: float) -> float:
        """Calculate margin ratio"""
        return numerator / denominator if denominator else None

    def derive_forward_metrics(self, ltm_data: Dict[str, float], 
                             growth_rates: Dict[str, float]) -> Dict[str, FinancialMetrics]:
        """Derive forward (NTM) metrics from LTM data and growth rates"""
        forward = {}
        
        for metric, ltm_value in ltm_data.items():
            if metric in growth_rates:
                try:
                    value = ltm_value * (1 + growth_rates[metric])
                    forward[f"{metric}_ntm"] = FinancialMetrics(
                        value=value,
                        confidence=0.80,  # Lower confidence for forward estimates
                        method="ltm_plus_growth",
                        inputs=[metric, f"{metric}_growth"],
                        timestamp=datetime.now()
                    )
                except Exception:
                    continue
                    
        return forward

    def validate_metrics(self, metrics: Dict[str, float]) -> Dict[str, bool]:
        """Validate derived metrics against financial rules"""
        validations = {
            # Basic sanity checks
            "positive_revenue": metrics.get("revenue", 0) > 0,
            "positive_assets": metrics.get("total_assets", 0) > 0,
            
            # Margin checks
            "margin_range": all(
                0 <= metrics.get(m, 0) <= 1 for m in 
                ["gross_margin", "ebitda_margin", "ebit_margin", "net_margin"]
            ),
            
            # Balance sheet checks
            "assets_eq_liab_equity": abs(
                metrics.get("total_assets", 0) -
                (metrics.get("total_liabilities", 0) + metrics.get("book_value", 0))
            ) < 1e-6,
            
            # Income statement checks
            "ebitda_gt_ebit": metrics.get("ebitda", 0) >= metrics.get("ebit", 0),
            "ebit_gt_net_income": metrics.get("ebit", 0) >= metrics.get("net_income", 0),
            
            # Growth rate checks
            "reasonable_growth": all(
                -0.5 <= metrics.get(g, 0) <= 2.0 for g in
                ["revenue_growth", "ebitda_growth", "eps_growth"]
            )
        }
        
        return validations

    def get_metric_quality_score(self, metric: FinancialMetrics) -> float:
        """Calculate quality score for a derived metric"""
        scores = {
            # Base confidence
            "confidence": metric.confidence,
            
            # Method reliability
            "method_score": {
                "standard_calculation": 1.0,
                "derived_from": 0.9,
                "estimated": 0.7,
                "ai_generated": 0.5
            }.get(metric.method.split("_")[0], 0.5),
            
            # Input quality
            "input_count": min(len(metric.inputs) / 5, 1.0),  # Normalize to 0-1
            
            # Timestamp freshness
            "freshness": min(
                (datetime.now() - metric.timestamp).total_seconds() / (24 * 60 * 60),
                1.0
            )
        }
        
        # Weighted average
        weights = {
            "confidence": 0.4,
            "method_score": 0.3,
            "input_count": 0.2,
            "freshness": 0.1
        }
        
        return sum(score * weights[key] for key, score in scores.items())
