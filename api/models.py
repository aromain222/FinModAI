#!/usr/bin/env python3
"""
Model Calculator - DCF, LBO, Trading Comps, Merger Analysis
Calculates model previews for frontend display
"""

import logging
from typing import Dict, List, Optional, Any
from dataclasses import dataclass
import numpy as np

logger = logging.getLogger(__name__)

@dataclass
class ModelPreview:
    """Model preview data"""
    dcf: Optional[Dict[str, Any]] = None
    lbo: Optional[Dict[str, Any]] = None
    comps: Optional[Dict[str, Any]] = None
    merger: Optional[Dict[str, Any]] = None

class ModelCalculator:
    """Calculates financial model previews"""
    
    def __init__(self):
        self.forecast_years = 10
    
    def calculate_model(self, model_type: str, assumptions_result) -> ModelPreview:
        """Calculate model preview based on type"""
        if model_type == "dcf":
            return ModelPreview(dcf=self._calculate_dcf(assumptions_result))
        elif model_type == "lbo":
            return ModelPreview(lbo=self._calculate_lbo(assumptions_result))
        elif model_type == "comps":
            return ModelPreview(comps=self._calculate_comps(assumptions_result))
        elif model_type == "merger":
            return ModelPreview(merger=self._calculate_merger(assumptions_result))
        else:
            raise ValueError(f"Unknown model type: {model_type}")
    
    def _calculate_dcf(self, assumptions_result) -> Dict[str, Any]:
        """Calculate DCF model preview"""
        historicals = assumptions_result.historicals
        assumptions = assumptions_result.assumptions
        wacc = assumptions_result.wacc
        terminal = assumptions_result.terminal
        
        # Project financials
        years = list(range(2024, 2024 + self.forecast_years))
        revenue = self._project_revenue(historicals, assumptions)
        ebitda = self._project_ebitda(revenue, assumptions)
        ufcf = self._project_ufcf(revenue, ebitda, assumptions)
        
        # Calculate present values
        pv_ufcf = []
        for i, cf in enumerate(ufcf):
            pv = cf / ((1 + wacc.wacc) ** (i + 1))
            pv_ufcf.append(pv)
        
        # Terminal value
        terminal_value = self._calculate_terminal_value(ufcf[-1], terminal.g, wacc.wacc)
        pv_terminal = terminal_value / ((1 + wacc.wacc) ** self.forecast_years)
        
        # Enterprise value
        ev = sum(pv_ufcf) + pv_terminal
        
        # Equity value
        net_debt = historicals.total_debt[0] if historicals.total_debt else 0
        equity_value = ev - net_debt
        
        # Implied price
        shares = historicals.shares_outstanding[0] if historicals.shares_outstanding else 1
        implied_price = equity_value / shares if shares > 0 else 0
        
        # Current price (from market data)
        current_price = 100  # Would come from market data
        
        # Upside
        upside_pct = (implied_price - current_price) / current_price * 100 if current_price > 0 else 0
        
        return {
            "years": years,
            "revenue": revenue,
            "ebitda": ebitda,
            "ufcf": ufcf,
            "pv_ufcf": pv_ufcf,
            "terminal_value": terminal_value,
            "pv_terminal": pv_terminal,
            "ev": ev,
            "net_debt": net_debt,
            "equity_value": equity_value,
            "implied_price": implied_price,
            "current_price": current_price,
            "upside_pct": upside_pct,
            "wacc": wacc.wacc,
            "terminal_growth": terminal.g
        }
    
    def _calculate_lbo(self, assumptions_result) -> Dict[str, Any]:
        """Calculate LBO model preview"""
        historicals = assumptions_result.historicals
        assumptions = assumptions_result.assumptions
        
        # Entry assumptions
        entry_ev = historicals.revenue[0] * 8.0  # 8x revenue multiple
        entry_ebitda = historicals.revenue[0] * assumptions.operating_margin[0]
        
        # Sources & Uses
        sources_uses = {
            "sources": {
                "senior_debt": entry_ev * 0.50,
                "subordinated_debt": entry_ev * 0.20,
                "sponsor_equity": entry_ev * 0.30
            },
            "uses": {
                "purchase_price": entry_ev * 0.90,
                "transaction_fees": entry_ev * 0.05,
                "working_capital": entry_ev * 0.05
            }
        }
        
        # Debt stack
        debt_stack = [
            {
                "name": "Senior Term Loan",
                "amount": sources_uses["sources"]["senior_debt"],
                "rate": 0.06,
                "amortization": "bullet"
            },
            {
                "name": "Subordinated Debt",
                "amount": sources_uses["sources"]["subordinated_debt"],
                "rate": 0.10,
                "amortization": "bullet"
            }
        ]
        
        # Project FCF and debt paydown
        years = list(range(2024, 2029))  # 5-year LBO
        fcf = []
        net_debt = []
        leverage_path = []
        
        initial_debt = sources_uses["sources"]["senior_debt"] + sources_uses["sources"]["subordinated_debt"]
        current_debt = initial_debt
        
        for i, year in enumerate(years):
            # Project FCF
            revenue = historicals.revenue[0] * ((1 + assumptions.revenue_growth[i]) ** (i + 1))
            ebitda = revenue * assumptions.operating_margin[i]
            capex = revenue * assumptions.capex_pct_rev
            delta_nwc = revenue * assumptions.nwc_pct_rev
            
            cf = ebitda - capex - delta_nwc
            fcf.append(cf)
            
            # Debt paydown (simplified)
            if cf > 0:
                current_debt = max(0, current_debt - cf * 0.5)  # 50% cash sweep
            
            net_debt.append(current_debt)
            leverage_path.append(current_debt / ebitda if ebitda > 0 else 0)
        
        # Returns calculation
        exit_value = revenue * 10.0  # 10x exit multiple
        exit_debt = net_debt[-1]
        exit_equity = exit_value - exit_debt
        
        sponsor_equity = sources_uses["sources"]["sponsor_equity"]
        moic = exit_equity / sponsor_equity if sponsor_equity > 0 else 0
        
        # IRR calculation (simplified)
        irr = (moic ** (1/5)) - 1  # 5-year hold
        
        # Covenants
        covenants = {
            "debt_to_ebitda": leverage_path[-1],
            "interest_coverage": ebitda / (current_debt * 0.08) if current_debt > 0 else 0,
            "max_leverage": max(leverage_path)
        }
        
        return {
            "sources_uses": sources_uses,
            "debt_stack": debt_stack,
            "years": years,
            "fcf": fcf,
            "net_debt": net_debt,
            "leverage_path": leverage_path,
            "irr": irr,
            "moic": moic,
            "covenants": covenants,
            "entry_ev": entry_ev,
            "exit_value": exit_value,
            "sponsor_equity": sponsor_equity,
            "exit_equity": exit_equity
        }
    
    def _calculate_comps(self, assumptions_result) -> Dict[str, Any]:
        """Calculate Trading Comps preview"""
        # Mock peer data (in production, this would come from a database)
        peers = [
            {"ticker": "AAPL", "name": "Apple Inc.", "ev_revenue": 6.5, "ev_ebitda": 18.2, "pe": 28.5},
            {"ticker": "MSFT", "name": "Microsoft Corp.", "ev_revenue": 8.2, "ev_ebitda": 22.1, "pe": 32.1},
            {"ticker": "GOOGL", "name": "Alphabet Inc.", "ev_revenue": 4.8, "ev_ebitda": 15.3, "pe": 25.8},
            {"ticker": "AMZN", "name": "Amazon.com Inc.", "ev_revenue": 2.1, "ev_ebitda": 12.4, "pe": 45.2},
            {"ticker": "META", "name": "Meta Platforms Inc.", "ev_revenue": 5.2, "ev_ebitda": 16.7, "pe": 22.3}
        ]
        
        # Calculate multiples
        ev_revenue_multiples = [peer["ev_revenue"] for peer in peers]
        ev_ebitda_multiples = [peer["ev_ebitda"] for peer in peers]
        pe_multiples = [peer["pe"] for peer in peers]
        
        # Calculate medians
        median_ev_revenue = np.median(ev_revenue_multiples)
        median_ev_ebitda = np.median(ev_ebitda_multiples)
        median_pe = np.median(pe_multiples)
        
        # Subject company metrics
        historicals = assumptions_result.historicals
        assumptions = assumptions_result.assumptions
        
        subject_revenue = historicals.revenue[0]
        subject_ebitda = subject_revenue * assumptions.operating_margin[0]
        subject_net_income = subject_ebitda * (1 - assumptions.tax_rate)
        
        # Implied valuations
        implied_ev_revenue = subject_revenue * median_ev_revenue
        implied_ev_ebitda = subject_ebitda * median_ev_ebitda
        implied_equity_pe = subject_net_income * median_pe
        
        # Valuation range
        implied_range = {
            "low": min(implied_ev_revenue, implied_ev_ebitda) * 0.9,
            "mid": (implied_ev_revenue + implied_ev_ebitda) / 2,
            "high": max(implied_ev_revenue, implied_ev_ebitda) * 1.1
        }
        
        return {
            "peers": peers,
            "multiples": {
                "ev_revenue": ev_revenue_multiples,
                "ev_ebitda": ev_ebitda_multiples,
                "pe": pe_multiples
            },
            "median": {
                "ev_revenue": median_ev_revenue,
                "ev_ebitda": median_ev_ebitda,
                "pe": median_pe
            },
            "implied_range": implied_range,
            "subject_metrics": {
                "revenue": subject_revenue,
                "ebitda": subject_ebitda,
                "net_income": subject_net_income
            }
        }
    
    def _calculate_merger(self, assumptions_result) -> Dict[str, Any]:
        """Calculate Merger model preview"""
        historicals = assumptions_result.historicals
        assumptions = assumptions_result.assumptions
        
        # Acquirer and target assumptions
        acquirer_revenue = historicals.revenue[0] * 2.0  # Assume acquirer is 2x larger
        target_revenue = historicals.revenue[0]
        
        acquirer_ebitda = acquirer_revenue * assumptions.operating_margin[0]
        target_ebitda = target_revenue * assumptions.operating_margin[0]
        
        # Synergies
        synergies = {
            "cost_synergies": target_ebitda * 0.15,  # 15% of target EBITDA
            "revenue_synergies": target_revenue * 0.05,  # 5% of target revenue
            "total_synergies": target_ebitda * 0.15 + target_revenue * 0.05
        }
        
        # Pro forma financials
        pf_revenue = acquirer_revenue + target_revenue + synergies["revenue_synergies"]
        pf_ebitda = acquirer_ebitda + target_ebitda + synergies["total_synergies"]
        
        # Purchase price
        purchase_price = target_revenue * 8.0  # 8x revenue multiple
        
        # Financing
        debt_financing = purchase_price * 0.60  # 60% debt
        equity_financing = purchase_price * 0.40  # 40% equity
        
        # Pro forma leverage
        acquirer_debt = historicals.total_debt[0] if historicals.total_debt else 0
        pf_debt = acquirer_debt + debt_financing
        pf_leverage = pf_debt / pf_ebitda if pf_ebitda > 0 else 0
        
        # EPS accretion/dilution
        acquirer_shares = historicals.shares_outstanding[0] if historicals.shares_outstanding else 1
        new_shares = equity_financing / 100  # Assume $100 per share
        pf_shares = acquirer_shares + new_shares
        
        acquirer_net_income = acquirer_ebitda * (1 - assumptions.tax_rate)
        target_net_income = target_ebitda * (1 - assumptions.tax_rate)
        pf_net_income = acquirer_net_income + target_net_income + synergies["total_synergies"] * (1 - assumptions.tax_rate)
        
        acquirer_eps = acquirer_net_income / acquirer_shares if acquirer_shares > 0 else 0
        pf_eps = pf_net_income / pf_shares if pf_shares > 0 else 0
        
        eps_accretion = (pf_eps - acquirer_eps) / acquirer_eps * 100 if acquirer_eps > 0 else 0
        
        return {
            "acquirer_metrics": {
                "revenue": acquirer_revenue,
                "ebitda": acquirer_ebitda,
                "net_income": acquirer_net_income,
                "shares": acquirer_shares,
                "eps": acquirer_eps
            },
            "target_metrics": {
                "revenue": target_revenue,
                "ebitda": target_ebitda,
                "net_income": target_net_income
            },
            "synergies": synergies,
            "pf_metrics": {
                "revenue": pf_revenue,
                "ebitda": pf_ebitda,
                "net_income": pf_net_income,
                "shares": pf_shares,
                "eps": pf_eps
            },
            "financing": {
                "purchase_price": purchase_price,
                "debt_financing": debt_financing,
                "equity_financing": equity_financing
            },
            "pf_leverage": pf_leverage,
            "eps_accretion": eps_accretion
        }
    
    def _project_revenue(self, historicals, assumptions) -> List[float]:
        """Project revenue based on growth assumptions"""
        base_revenue = historicals.revenue[0]
        revenue = []
        
        for i, growth in enumerate(assumptions.revenue_growth):
            projected_revenue = base_revenue * ((1 + growth) ** (i + 1))
            revenue.append(projected_revenue)
        
        return revenue
    
    def _project_ebitda(self, revenue: List[float], assumptions) -> List[float]:
        """Project EBITDA based on margin assumptions"""
        ebitda = []
        
        for i, margin in enumerate(assumptions.operating_margin):
            ebitda.append(revenue[i] * margin)
        
        return ebitda
    
    def _project_ufcf(self, revenue: List[float], ebitda: List[float], assumptions) -> List[float]:
        """Project unlevered free cash flow"""
        ufcf = []
        
        for i in range(len(revenue)):
            # D&A
            da = revenue[i] * assumptions.da_pct_rev
            
            # CapEx
            capex = revenue[i] * assumptions.capex_pct_rev
            
            # Change in NWC
            delta_nwc = revenue[i] * assumptions.nwc_pct_rev
            
            # UFCF = EBITDA + D&A - CapEx - ΔNWC
            cf = ebitda[i] + da - capex - delta_nwc
            ufcf.append(cf)
        
        return ufcf
    
    def _calculate_terminal_value(self, final_ufcf: float, terminal_growth: float, wacc: float) -> float:
        """Calculate terminal value using perpetuity growth model"""
        if wacc <= terminal_growth:
            return final_ufcf * 10  # Fallback multiple
        
        return final_ufcf * (1 + terminal_growth) / (wacc - terminal_growth)
