#!/usr/bin/env python3
"""
Deterministic Assumption Engine
Generates company-specific assumptions from historical data
"""

import os
import logging
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
import numpy as np
from scipy import stats
import httpx

logger = logging.getLogger(__name__)

@dataclass
class AssumptionsResult:
    """Result of assumption generation"""
    ticker: str
    company_name: str
    currency: str
    provenance: Dict[str, Dict[str, str]]
    historicals: 'HistoricalData'
    assumptions: 'AssumptionsData'
    wacc: 'WACCData'
    terminal: 'TerminalData'
    flags: List[str]

@dataclass
class AssumptionsData:
    """Generated assumptions"""
    forecast_years: int
    revenue_growth: List[float]
    operating_margin: List[float]
    da_pct_rev: float
    capex_pct_rev: float
    nwc_pct_rev: float
    tax_rate: float

@dataclass
class WACCData:
    """WACC calculation"""
    rf: float
    erp: float
    beta: float
    ke: float
    kd_pre: float
    tax: float
    wd: float
    we: float
    kd_after: float
    wacc: float

@dataclass
class TerminalData:
    """Terminal value assumptions"""
    method: str
    g: float

class AssumptionEngine:
    """Deterministic assumption generation engine"""
    
    def __init__(self):
        self.erp_default = float(os.getenv("ERP_DEFAULT", "0.055"))
        self.forecast_years = 10
        self.terminal_growth_min = 0.02
        self.terminal_growth_max = 0.04
    
    async def generate_assumptions(self, financial_data, model_type: str) -> AssumptionsResult:
        """Generate company-specific assumptions"""
        historicals = financial_data.historicals
        market_data = financial_data.market_data
        estimates = financial_data.estimates
        
        flags = []
        
        # Revenue growth path
        revenue_growth = self._calculate_revenue_growth_path(historicals, estimates, flags)
        
        # Operating margin path
        operating_margin = self._calculate_operating_margin_path(historicals, flags)
        
        # D&A, CapEx, NWC as % of revenue
        da_pct_rev = self._calculate_percentage_of_revenue(historicals.da, historicals.revenue)
        capex_pct_rev = self._calculate_percentage_of_revenue(historicals.capex, historicals.revenue)
        nwc_pct_rev = self._calculate_percentage_of_revenue(historicals.delta_nwc, historicals.revenue)
        
        # Tax rate
        tax_rate = self._calculate_tax_rate(historicals, flags)
        
        # WACC
        wacc = await self._calculate_wacc(market_data, historicals, flags)
        
        # Terminal value
        terminal = self._calculate_terminal_value(wacc.wacc, flags)
        
        # Create assumptions data
        assumptions = AssumptionsData(
            forecast_years=self.forecast_years,
            revenue_growth=revenue_growth,
            operating_margin=operating_margin,
            da_pct_rev=da_pct_rev,
            capex_pct_rev=capex_pct_rev,
            nwc_pct_rev=nwc_pct_rev,
            tax_rate=tax_rate
        )
        
        return AssumptionsResult(
            ticker=financial_data.ticker,
            company_name=financial_data.company_name,
            currency=financial_data.currency,
            provenance=financial_data.provenance,
            historicals=historicals,
            assumptions=assumptions,
            wacc=wacc,
            terminal=terminal,
            flags=flags
        )
    
    def _calculate_revenue_growth_path(self, historicals, estimates, flags: List[str]) -> List[float]:
        """Calculate revenue growth path with analyst estimates and fade"""
        years = historicals.years
        revenue = historicals.revenue
        
        if len(revenue) < 3:
            flags.append("insufficient_historicals")
            return [0.05] * self.forecast_years  # Default growth
        
        # Calculate historical CAGR
        if len(revenue) >= 3:
            cagr = (revenue[0] / revenue[-1]) ** (1 / (len(revenue) - 1)) - 1
        else:
            cagr = 0.05
        
        # Start with analyst estimates if available
        start_growth = cagr
        if estimates and estimates.revenue_growth_y1:
            start_growth = estimates.revenue_growth_y1
            flags.append("analyst_estimates_used")
        
        # Clamp to reasonable range
        start_growth = max(0.0, min(0.30, start_growth))
        
        # Fade to terminal growth
        terminal_growth = 0.025  # 2.5% default
        growth_path = []
        
        for year in range(self.forecast_years):
            # Linear fade from start to terminal
            fade_factor = year / (self.forecast_years - 1)
            growth = start_growth * (1 - fade_factor) + terminal_growth * fade_factor
            growth_path.append(growth)
        
        return growth_path
    
    def _calculate_operating_margin_path(self, historicals, flags: List[str]) -> List[float]:
        """Calculate operating margin path"""
        margins = historicals.op_margin
        
        if len(margins) < 3:
            flags.append("insufficient_margin_history")
            return [0.15] * self.forecast_years  # Default margin
        
        # Calculate average margin
        avg_margin = np.mean(margins)
        
        # Calculate trend
        if len(margins) >= 3:
            x = np.arange(len(margins))
            slope, _, _, _, _ = stats.linregress(x, margins)
            trend_bps = slope * 100  # Convert to basis points
        else:
            trend_bps = 0
        
        # Apply trend with bounds
        trend_bps = max(-300, min(300, trend_bps))  # ±300 bps max
        
        margin_path = []
        for year in range(self.forecast_years):
            margin = avg_margin + (trend_bps / 10000) * year
            margin = max(-0.05, min(0.50, margin))  # Clamp to -5% to 50%
            margin_path.append(margin)
        
        if abs(trend_bps) > 100:
            flags.append("margin_trend_applied")
        
        return margin_path
    
    def _calculate_percentage_of_revenue(self, values: List[float], revenue: List[float]) -> float:
        """Calculate percentage of revenue with winsorization"""
        if len(values) != len(revenue) or len(values) < 3:
            return 0.0
        
        ratios = []
        for i in range(len(values)):
            if revenue[i] > 0:
                ratios.append(values[i] / revenue[i])
        
        if not ratios:
            return 0.0
        
        # Winsorize at 5th and 95th percentiles
        ratios = np.array(ratios)
        p5, p95 = np.percentile(ratios, [5, 95])
        ratios = np.clip(ratios, p5, p95)
        
        return float(np.mean(ratios))
    
    def _calculate_tax_rate(self, historicals, flags: List[str]) -> float:
        """Calculate effective tax rate"""
        tax_expense = historicals.tax_expense
        pretax_income = historicals.pretax_income
        
        if len(tax_expense) < 3 or len(pretax_income) < 3:
            flags.append("insufficient_tax_data")
            return 0.25  # Default tax rate
        
        # Calculate effective tax rates
        tax_rates = []
        for i in range(min(len(tax_expense), len(pretax_income))):
            if pretax_income[i] > 0:
                tax_rate = tax_expense[i] / pretax_income[i]
                if 0.05 <= tax_rate <= 0.50:  # Reasonable range
                    tax_rates.append(tax_rate)
        
        if not tax_rates:
            flags.append("invalid_tax_calculations")
            return 0.25
        
        # Use 3-year average
        avg_tax_rate = np.mean(tax_rates[-3:]) if len(tax_rates) >= 3 else np.mean(tax_rates)
        
        # Clamp to reasonable range
        return max(0.10, min(0.30, avg_tax_rate))
    
    async def _calculate_wacc(self, market_data, historicals, flags: List[str]) -> WACCData:
        """Calculate WACC"""
        # Risk-free rate
        rf = await self._get_risk_free_rate()
        
        # Equity risk premium
        erp = self.erp_default
        
        # Beta
        beta = market_data.beta
        if beta is None or beta <= 0:
            beta = 1.0
            flags.append("beta_defaulted")
        
        # Clamp beta
        beta = max(0.5, min(2.0, beta))
        
        # Cost of equity
        ke = rf + beta * erp
        
        # Cost of debt
        kd_pre = self._calculate_cost_of_debt(historicals, rf, flags)
        
        # Tax rate
        tax = self._calculate_tax_rate(historicals, flags)
        
        # Capital structure
        wd, we = self._calculate_capital_structure(market_data, historicals, flags)
        
        # After-tax cost of debt
        kd_after = kd_pre * (1 - tax)
        
        # WACC
        wacc = we * ke + wd * kd_after
        
        # Clamp WACC
        wacc = max(0.06, min(0.14, wacc))
        
        if wacc < 0.06 or wacc > 0.14:
            flags.append("wacc_clamped")
        
        return WACCData(
            rf=rf,
            erp=erp,
            beta=beta,
            ke=ke,
            kd_pre=kd_pre,
            tax=tax,
            wd=wd,
            we=we,
            kd_after=kd_after,
            wacc=wacc
        )
    
    async def _get_risk_free_rate(self) -> float:
        """Get risk-free rate from FRED or default"""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                # Try FRED API
                api_key = os.getenv("FRED_API_KEY")
                if api_key:
                    url = f"https://api.stlouisfed.org/fred/series/observations"
                    params = {
                        "series_id": "DGS10",
                        "api_key": api_key,
                        "file_type": "json",
                        "limit": 1,
                        "sort_order": "desc"
                    }
                    
                    response = await client.get(url, params=params)
                    if response.status_code == 200:
                        data = response.json()
                        observations = data.get("observations", [])
                        if observations:
                            rate = float(observations[0].get("value", 0))
                            if rate > 0:
                                return rate / 100  # Convert to decimal
        except Exception as e:
            logger.warning("Failed to fetch risk-free rate from FRED", error=str(e))
        
        # Default fallback
        return 0.045  # 4.5%
    
    def _calculate_cost_of_debt(self, historicals, rf: float, flags: List[str]) -> float:
        """Calculate cost of debt"""
        interest_expense = historicals.interest_expense
        total_debt = historicals.total_debt
        
        if len(interest_expense) < 3 or len(total_debt) < 3:
            flags.append("insufficient_debt_data")
            return rf + 0.02  # Default spread
        
        # Calculate interest rates
        interest_rates = []
        for i in range(min(len(interest_expense), len(total_debt))):
            if total_debt[i] > 0:
                rate = interest_expense[i] / total_debt[i]
                if 0.01 <= rate <= 0.20:  # Reasonable range
                    interest_rates.append(rate)
        
        if not interest_rates:
            flags.append("invalid_debt_calculations")
            return rf + 0.02
        
        # Use average
        avg_rate = np.mean(interest_rates[-3:]) if len(interest_rates) >= 3 else np.mean(interest_rates)
        
        # Clamp to reasonable range
        return max(rf + 0.005, min(rf + 0.10, avg_rate))
    
    def _calculate_capital_structure(self, market_data, historicals, flags: List[str]) -> Tuple[float, float]:
        """Calculate capital structure weights"""
        market_cap = market_data.market_cap
        total_debt = historicals.total_debt
        
        if market_cap <= 0 or len(total_debt) == 0:
            flags.append("insufficient_capital_structure_data")
            return 0.30, 0.70  # Default weights
        
        # Use latest debt
        latest_debt = total_debt[0] if total_debt else 0
        
        # Calculate enterprise value
        enterprise_value = market_cap + latest_debt
        
        if enterprise_value <= 0:
            flags.append("invalid_enterprise_value")
            return 0.30, 0.70
        
        # Calculate weights
        wd = latest_debt / enterprise_value
        we = market_cap / enterprise_value
        
        # Cap debt weight at 70%
        if wd > 0.70:
            wd = 0.70
            we = 0.30
            flags.append("debt_weight_capped")
        
        return wd, we
    
    def _calculate_terminal_value(self, wacc: float, flags: List[str]) -> TerminalData:
        """Calculate terminal value assumptions"""
        # Terminal growth rate
        terminal_g = 0.025  # 2.5% default
        
        # Ensure g < WACC
        if terminal_g >= wacc:
            terminal_g = wacc - 0.005  # 50 bps below WACC
            flags.append("terminal_g_adjusted")
        
        return TerminalData(
            method="perpetuity",
            g=terminal_g
        )
    
    def apply_overrides(self, assumptions_result: AssumptionsResult, overrides: Dict[str, Any]) -> AssumptionsResult:
        """Apply user overrides to assumptions"""
        if not overrides:
            return assumptions_result
        
        # Create a copy to modify
        result = AssumptionsResult(
            ticker=assumptions_result.ticker,
            company_name=assumptions_result.company_name,
            currency=assumptions_result.currency,
            provenance=assumptions_result.provenance,
            historicals=assumptions_result.historicals,
            assumptions=AssumptionsData(
                forecast_years=assumptions_result.assumptions.forecast_years,
                revenue_growth=assumptions_result.assumptions.revenue_growth.copy(),
                operating_margin=assumptions_result.assumptions.operating_margin.copy(),
                da_pct_rev=assumptions_result.assumptions.da_pct_rev,
                capex_pct_rev=assumptions_result.assumptions.capex_pct_rev,
                nwc_pct_rev=assumptions_result.assumptions.nwc_pct_rev,
                tax_rate=assumptions_result.assumptions.tax_rate
            ),
            wacc=WACCData(
                rf=assumptions_result.wacc.rf,
                erp=assumptions_result.wacc.erp,
                beta=assumptions_result.wacc.beta,
                ke=assumptions_result.wacc.ke,
                kd_pre=assumptions_result.wacc.kd_pre,
                tax=assumptions_result.wacc.tax,
                wd=assumptions_result.wacc.wd,
                we=assumptions_result.wacc.we,
                kd_after=assumptions_result.wacc.kd_after,
                wacc=assumptions_result.wacc.wacc
            ),
            terminal=TerminalData(
                method=assumptions_result.terminal.method,
                g=assumptions_result.terminal.g
            ),
            flags=assumptions_result.flags.copy()
        )
        
        # Apply overrides
        if "revenue_growth" in overrides:
            result.assumptions.revenue_growth = overrides["revenue_growth"]
            result.flags.append("revenue_growth_overridden")
        
        if "operating_margin" in overrides:
            result.assumptions.operating_margin = overrides["operating_margin"]
            result.flags.append("operating_margin_overridden")
        
        if "tax_rate" in overrides:
            result.assumptions.tax_rate = overrides["tax_rate"]
            result.flags.append("tax_rate_overridden")
        
        if "wacc" in overrides:
            result.wacc.wacc = overrides["wacc"]
            result.flags.append("wacc_overridden")
        
        if "terminal_growth" in overrides:
            result.terminal.g = overrides["terminal_growth"]
            result.flags.append("terminal_growth_overridden")
        
        return result
