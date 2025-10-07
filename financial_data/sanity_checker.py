"""
Sanity Checker - Validate assumptions and flag issues.
"""

from typing import List
from .contracts import FinancialData, Config


class SanityChecker:
    """Perform sanity checks on financial assumptions."""
    
    @staticmethod
    def check_all(data: FinancialData) -> List[str]:
        """
        Run all sanity checks and return list of flags.
        """
        flags = []
        
        # 1. Terminal growth vs WACC
        if data.terminal.g >= data.wacc.wacc:
            flags.append("terminal_g_ge_wacc")
        
        # 2. Terminal value dominance (would need DCF calculation)
        # For now, flag if terminal g is very close to WACC
        if data.terminal.g >= data.wacc.wacc * 0.9:
            flags.append("tv_likely_dominates_ev")
        
        # 3. Growth off consensus (if we have analyst estimates)
        # This would be checked during calculation
        
        # 4. Margin reasonableness
        avg_margin = sum(data.assumptions.operating_margin) / len(data.assumptions.operating_margin)
        if avg_margin < 0.05:
            flags.append("low_operating_margin")
        elif avg_margin > 0.40:
            flags.append("high_operating_margin")
        
        # 5. Growth reasonableness
        avg_growth = sum(data.assumptions.revenue_growth[:3]) / 3  # First 3 years
        if avg_growth > 0.20:
            flags.append("high_growth_forecast")
        elif avg_growth < 0.02:
            flags.append("low_growth_forecast")
        
        # 6. WACC reasonableness
        if data.wacc.wacc < 0.06:
            flags.append("low_wacc")
        elif data.wacc.wacc > 0.12:
            flags.append("high_wacc")
        
        # 7. Beta reasonableness
        if data.wacc.beta < 0.7:
            flags.append("low_beta")
        elif data.wacc.beta > 1.5:
            flags.append("high_beta")
        
        # 8. Check for missing estimates
        # Would be added during data fetching
        
        return flags
    
    @staticmethod
    def check_data_quality(
        revenue: List[float],
        operating_income: List[float],
        has_estimates: bool
    ) -> List[str]:
        """Check quality of input data."""
        flags = []
        
        # Check revenue trend
        if len(revenue) >= 3:
            if revenue[0] < revenue[-1]:  # Revenue declining
                flags.append("declining_revenue")
        
        # Check for negative operating income
        if any(oi and oi < 0 for oi in operating_income[:3]):
            flags.append("negative_operating_income")
        
        # Flag if no analyst estimates
        if not has_estimates:
            flags.append("no_analyst_estimates")
        
        return flags

