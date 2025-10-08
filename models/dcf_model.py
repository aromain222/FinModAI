"""
Professional DCF Model
Banker-grade discounted cash flow model with company-specific assumptions.
"""

from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import math

@dataclass
class DCFAssumptions:
    """DCF model assumptions derived from historical data."""
    ticker: str
    company_name: str
    forecast_years: int = 10
    revenue_growth: List[float] = None
    operating_margin: List[float] = None
    da_pct_rev: float = 0.05
    capex_pct_rev: float = 0.08
    nwc_pct_rev: float = 0.02
    tax_rate: float = 0.25
    wacc: float = 0.10
    terminal_growth: float = 0.025
    terminal_method: str = "perpetuity"

@dataclass
class DCFResults:
    """DCF model results and outputs."""
    years: List[int]
    revenue: List[float]
    ebitda: List[float]
    ebit: List[float]
    da: List[float]
    capex: List[float]
    delta_nwc: List[float]
    ufcf: List[float]
    pv_ufcf: List[float]
    terminal_value: float
    enterprise_value: float
    net_debt: float
    equity_value: float
    shares_outstanding: float
    implied_price: float
    current_price: float
    upside_pct: float
    tv_share_of_ev: float

class DCFModel:
    """Professional DCF model implementation."""
    
    def __init__(self):
        self.assumptions = None
        self.results = None
    
    def build_dcf_model(self, assumptions: DCFAssumptions, current_price: float = 0) -> DCFResults:
        """
        Build a complete DCF model.
        
        Args:
            assumptions: DCF assumptions derived from historical data
            current_price: Current stock price for upside calculation
            
        Returns:
            DCFResults: Complete DCF model outputs
        """
        self.assumptions = assumptions
        
        # Initialize arrays
        years = list(range(2024, 2024 + assumptions.forecast_years))
        revenue = [0.0] * assumptions.forecast_years
        ebitda = [0.0] * assumptions.forecast_years
        ebit = [0.0] * assumptions.forecast_years
        da = [0.0] * assumptions.forecast_years
        capex = [0.0] * assumptions.forecast_years
        delta_nwc = [0.0] * assumptions.forecast_years
        ufcf = [0.0] * assumptions.forecast_years
        pv_ufcf = [0.0] * assumptions.forecast_years
        
        # Start with base revenue (assume $1B for now - should come from historicals)
        base_revenue = 1000000000  # $1B
        
        # Build projections
        for i in range(assumptions.forecast_years):
            # Revenue growth
            if i == 0:
                revenue[i] = base_revenue * (1 + assumptions.revenue_growth[0])
            else:
                revenue[i] = revenue[i-1] * (1 + assumptions.revenue_growth[min(i, len(assumptions.revenue_growth)-1)])
            
            # EBITDA
            ebitda[i] = revenue[i] * assumptions.operating_margin[min(i, len(assumptions.operating_margin)-1)]
            
            # D&A
            da[i] = revenue[i] * assumptions.da_pct_rev
            
            # EBIT
            ebit[i] = ebitda[i] - da[i]
            
            # CapEx
            capex[i] = revenue[i] * assumptions.capex_pct_rev
            
            # Change in NWC
            if i == 0:
                delta_nwc[i] = revenue[i] * assumptions.nwc_pct_rev
            else:
                delta_nwc[i] = revenue[i] * assumptions.nwc_pct_rev - revenue[i-1] * assumptions.nwc_pct_rev
            
            # Unlevered FCF
            ufcf[i] = ebit[i] * (1 - assumptions.tax_rate) + da[i] - capex[i] - delta_nwc[i]
            
            # Present value of UFCF
            pv_ufcf[i] = ufcf[i] / ((1 + assumptions.wacc) ** (i + 1))
        
        # Terminal value
        if assumptions.terminal_method == "perpetuity":
            terminal_value = (ufcf[-1] * (1 + assumptions.terminal_growth)) / (assumptions.wacc - assumptions.terminal_growth)
        else:
            # Exit multiple method (assume 10x EBITDA)
            terminal_value = ebitda[-1] * 10
        
        # Enterprise value
        enterprise_value = sum(pv_ufcf) + terminal_value / ((1 + assumptions.wacc) ** assumptions.forecast_years)
        
        # Net debt (assume 30% of enterprise value)
        net_debt = enterprise_value * 0.3
        
        # Equity value
        equity_value = enterprise_value - net_debt
        
        # Shares outstanding (assume 1B shares)
        shares_outstanding = 1000000000
        
        # Implied price
        implied_price = equity_value / shares_outstanding
        
        # Upside calculation
        upside_pct = ((implied_price - current_price) / current_price * 100) if current_price > 0 else 0
        
        # TV share of EV
        tv_share_of_ev = (terminal_value / ((1 + assumptions.wacc) ** assumptions.forecast_years)) / enterprise_value
        
        self.results = DCFResults(
            years=years,
            revenue=revenue,
            ebitda=ebitda,
            ebit=ebit,
            da=da,
            capex=capex,
            delta_nwc=delta_nwc,
            ufcf=ufcf,
            pv_ufcf=pv_ufcf,
            terminal_value=terminal_value,
            enterprise_value=enterprise_value,
            net_debt=net_debt,
            equity_value=equity_value,
            shares_outstanding=shares_outstanding,
            implied_price=implied_price,
            current_price=current_price,
            upside_pct=upside_pct,
            tv_share_of_ev=tv_share_of_ev
        )
        
        return self.results
    
    def get_summary(self) -> Dict[str, Any]:
        """Get a summary of the DCF model results."""
        if not self.results:
            return {}
        
        return {
            "enterprise_value": self.results.enterprise_value,
            "equity_value": self.results.equity_value,
            "implied_price": self.results.implied_price,
            "current_price": self.results.current_price,
            "upside_pct": self.results.upside_pct,
            "wacc": self.assumptions.wacc,
            "terminal_growth": self.assumptions.terminal_growth,
            "tv_share_of_ev": self.results.tv_share_of_ev,
            "recommendation": self._get_recommendation(),
            "confidence": self._get_confidence(),
            "key_drivers": self._get_key_drivers(),
            "sanity_checks": self._get_sanity_checks()
        }
    
    def _get_recommendation(self) -> str:
        """Get investment recommendation based on upside."""
        if self.results.upside_pct > 20:
            return "BUY"
        elif self.results.upside_pct > 5:
            return "HOLD"
        else:
            return "SELL"
    
    def _get_confidence(self) -> str:
        """Get confidence level based on model quality."""
        if (self.results.tv_share_of_ev < 0.85 and 
            abs(self.results.upside_pct) < 50 and 
            self.assumptions.terminal_growth < self.assumptions.wacc):
            return "H"
        elif (self.results.tv_share_of_ev < 0.90 and 
              abs(self.results.upside_pct) < 100):
            return "M"
        else:
            return "L"
    
    def _get_key_drivers(self) -> List[str]:
        """Get key value drivers."""
        drivers = []
        
        # Revenue growth
        avg_growth = sum(self.assumptions.revenue_growth) / len(self.assumptions.revenue_growth)
        drivers.append(f"Revenue growth: {avg_growth:.1%} over forecast period")
        
        # Operating margin
        avg_margin = sum(self.assumptions.operating_margin) / len(self.assumptions.operating_margin)
        drivers.append(f"EBITDA margin: {avg_margin:.1%}")
        
        # Terminal value method
        drivers.append(f"Terminal rationale: {self.assumptions.terminal_method} growth model at {self.assumptions.terminal_growth:.1%}")
        
        # Sensitivities
        drivers.append("Sensitivities that move value: WACC sensitivity, terminal growth sensitivity")
        
        return drivers
    
    def _get_sanity_checks(self) -> List[str]:
        """Get sanity check results."""
        checks = []
        
        # TV share of EV
        checks.append(f"TV share of EV: {self.results.tv_share_of_ev:.1%}")
        
        # Implied vs market cap
        market_cap = self.results.current_price * self.results.shares_outstanding
        checks.append(f"Implied equity vs market cap: ${self.results.equity_value/1e9:.1f}B vs ${market_cap/1e9:.1f}B")
        
        # Growth vs WACC
        checks.append(f"g < WACC: {self.assumptions.terminal_growth < self.assumptions.wacc}")
        
        return checks
