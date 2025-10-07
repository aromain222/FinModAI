"""
Assumptions Calculator - Company-specific, no generic defaults.
Calculates revenue growth, margins, WACC, terminal value with fail-fast validation.
"""

from typing import List, Optional, Tuple
import numpy as np
from .contracts import (
    Assumptions, WACC, Terminal, Historicals, Provenance, Config
)


class AssumptionsCalculator:
    """Calculate company-specific financial assumptions."""
    
    @staticmethod
    def calculate_revenue_growth(
        historicals: Historicals,
        analyst_growth_y1: Optional[float] = None,
        analyst_growth_y2: Optional[float] = None,
        forecast_years: int = Config.DEFAULT_FORECAST_YEARS
    ) -> List[float]:
        """
        Calculate revenue growth path with fade to terminal.
        
        Logic:
        - Y1-Y2: Use analyst estimates if available
        - Else: Use 3-5y CAGR as starting point
        - Fade linearly to 2-4% terminal growth
        - Clamp to 0-30% unless history exceeded
        """
        revenue = historicals.revenue[:5]  # Last 5 years
        
        # Calculate historical CAGR with trend analysis
        if len(revenue) >= 3:
            # Method 1: Traditional CAGR
            start = revenue[-1]  # Oldest
            end = revenue[0]     # Most recent
            years_back = min(3, len(revenue) - 1)
            
            if start and start > 0 and end and end > 0:
                cagr = (end / start) ** (1 / years_back) - 1
            else:
                return None  # Can't calculate growth without valid revenue
            
            # Method 2: Trend-weighted CAGR (recent years matter more)
            valid_revenue = [r for r in revenue[:3] if r and r > 0]
            if len(valid_revenue) >= 3:
                # Calculate year-over-year growth rates
                yoy_growth = []
                for i in range(len(valid_revenue) - 1):
                    if valid_revenue[i+1] and valid_revenue[i+1] > 0:
                        growth = (valid_revenue[i] / valid_revenue[i+1]) - 1
                        yoy_growth.append(growth)
                
                if yoy_growth:
                    # Use trend-weighted average of YoY growth
                    trend_cagr = self.calculate_trend_weighted_average(yoy_growth)
                    # Blend traditional CAGR with trend-weighted CAGR
                    cagr = (cagr * 0.6) + (trend_cagr * 0.4)
        else:
            return None
        
        # Clamp CAGR to reasonable bounds
        cagr = max(Config.GROWTH_MIN, min(Config.GROWTH_MAX, cagr))
        
        # Determine starting growth
        if analyst_growth_y1 is not None:
            start_growth = analyst_growth_y1
        else:
            start_growth = cagr
        
        # Terminal growth (2-4%)
        terminal_growth = min(
            Config.TERMINAL_GROWTH_MAX,
            max(Config.TERMINAL_GROWTH_MIN, cagr * 0.3)  # 30% of historical
        )
        
        # Build growth path with linear fade
        growth_path = []
        fade_years = Config.FADE_YEARS
        
        for i in range(forecast_years):
            if i == 0 and analyst_growth_y1 is not None:
                growth = analyst_growth_y1
            elif i == 1 and analyst_growth_y2 is not None:
                growth = analyst_growth_y2
            elif i < fade_years:
                # Linear fade from start to terminal
                progress = i / fade_years
                growth = start_growth * (1 - progress) + terminal_growth * progress
            else:
                # Terminal growth
                growth = terminal_growth
            
            # Clamp
            growth = max(Config.GROWTH_MIN, min(Config.GROWTH_MAX, growth))
            growth_path.append(growth)
        
        return growth_path
    
    @staticmethod
    def calculate_operating_margin_path(
        historicals: Historicals,
        analyst_margin_y1: Optional[float] = None,
        forecast_years: int = Config.DEFAULT_FORECAST_YEARS
    ) -> List[float]:
        """
        Calculate operating margin path.
        
        Logic:
        - Base = 3-year average EBIT/Rev
        - Allow ±300bps improvement if trend supports
        - Bound -5% to 50%
        """
        margins = historicals.op_margin[:3]  # Last 3 years
        
        if not margins or len(margins) < 3:
            return None
        
        # Calculate 3-year average with trend analysis
        valid_margins = [m for m in margins if m is not None]
        if len(valid_margins) < 3:
            return None
        
        # Method 1: Simple average
        avg_margin = sum(valid_margins) / len(valid_margins)
        
        # Method 2: Trend-weighted average (recent years matter more)
        trend_margin = self.calculate_trend_weighted_average(valid_margins)
        
        # Method 3: Trend slope analysis
        trend_slope = self.calculate_trend_slope(valid_margins)
        
        # Blend methods: 50% average, 30% trend-weighted, 20% trend slope adjustment
        base_margin = (avg_margin * 0.5) + (trend_margin * 0.3)
        
        # Apply trend slope adjustment (conservative)
        slope_adjustment = min(0.02, max(-0.02, trend_slope * 0.1))  # Max ±200bps
        adjusted_margin = base_margin + slope_adjustment
        
        # Check trend (is margin improving?)
        if len(valid_margins) >= 3:
            trend = valid_margins[0] - valid_margins[2]  # Recent - Old
            margin_improvement = min(0.03, max(-0.03, trend))  # ±300bps max
        else:
            margin_improvement = 0
        
        # Target margin (slight improvement if trend positive)
        if analyst_margin_y1 is not None:
            final_margin = analyst_margin_y1
        else:
            final_margin = adjusted_margin + (margin_improvement * 0.3)  # Conservative
        
        # Bound margin
        final_margin = max(Config.MARGIN_MIN, min(Config.MARGIN_MAX, final_margin))
        
        # Build path (gradual improvement over first 3 years, then flat)
        margin_path = []
        for i in range(forecast_years):
            if i < 3:
                progress = i / 3
                margin = avg_margin * (1 - progress) + final_margin * progress
            else:
                margin = final_margin
            
            margin = max(Config.MARGIN_MIN, min(Config.MARGIN_MAX, margin))
            margin_path.append(margin)
        
        return margin_path
    
    @staticmethod
    def calculate_percentage_of_revenue(
        historicals: Historicals,
        metric: str  # 'da', 'capex', 'delta_nwc'
    ) -> Optional[float]:
        """
        Calculate metric as % of revenue (3-year average).
        Winsorize outliers.
        """
        revenue = historicals.revenue[:3]
        
        if metric == 'da':
            values = historicals.da[:3]
        elif metric == 'capex':
            values = historicals.capex[:3]
        elif metric == 'delta_nwc':
            values = historicals.delta_nwc[:3]
        else:
            return None
        
        if not revenue or not values or len(revenue) != len(values):
            return None
        
        # Calculate percentages
        percentages = []
        for i in range(len(revenue)):
            if revenue[i] and revenue[i] > 0 and values[i] is not None:
                pct = abs(values[i]) / revenue[i]
                # Winsorize: cap at 50% for sanity
                pct = min(0.50, pct)
                percentages.append(pct)
        
        if not percentages:
            return None
        
        # Use trend-weighted average (recent years matter more)
        trend_weighted_pct = self.calculate_trend_weighted_average(percentages)
        
        # Also calculate simple average for comparison
        simple_avg = sum(percentages) / len(percentages)
        
        # Blend: 70% trend-weighted, 30% simple average
        final_pct = (trend_weighted_pct * 0.7) + (simple_avg * 0.3)
        
        return final_pct
    
    @staticmethod
    def calculate_tax_rate(historicals: Historicals) -> Optional[float]:
        """
        Calculate effective tax rate from historical data.
        Uses 3-year average of tax_expense / pretax_income.
        Bounded 10-30%.
        """
        if not historicals.tax_expense or not historicals.pretax_income:
            return None
        
        # Calculate tax rates for each year
        tax_rates = []
        for i in range(min(3, len(historicals.tax_expense))):
            if (historicals.tax_expense[i] is not None and 
                historicals.pretax_income[i] is not None and 
                historicals.pretax_income[i] > 0):
                
                rate = historicals.tax_expense[i] / historicals.pretax_income[i]
                # Clamp to reasonable bounds
                rate = max(Config.TAX_MIN, min(Config.TAX_MAX, rate))
                tax_rates.append(rate)
        
        if not tax_rates:
            return None
        
        # Return average tax rate
        return sum(tax_rates) / len(tax_rates)
    
    @staticmethod
    def calculate_wacc(
        rf: float,
        beta: float,
        total_debt: float,
        market_cap: float,
        tax_rate: float,
        kd_pre: Optional[float] = None
    ) -> Optional[WACC]:
        """
        Calculate WACC with proper bounds.
        
        Ke = Rf + Beta * ERP
        Kd_after = Kd_pre * (1 - tax)
        WACC = we*Ke + wd*Kd_after
        """
        erp = Config.ERP
        
        # Clamp beta
        beta = max(Config.BETA_MIN, min(Config.BETA_MAX, beta))
        
        # Cost of equity
        ke = rf + beta * erp
        
        # Weights
        if market_cap and market_cap > 0:
            total_value = market_cap + (total_debt if total_debt else 0)
            if total_value > 0:
                wd = (total_debt if total_debt else 0) / total_value
                we = market_cap / total_value
            else:
                wd = 0
                we = 1.0
        else:
            wd = 0
            we = 1.0
        
        # Cap debt weight
        wd = min(Config.DEBT_WEIGHT_MAX, wd)
        we = 1.0 - wd
        
        # Cost of debt
        if kd_pre is None:
            # Proxy: Rf + spread based on credit quality
            # Simple heuristic: higher debt/equity = higher spread
            if wd < 0.3:
                spread = 0.02  # Investment grade
            elif wd < 0.5:
                spread = 0.03
            else:
                spread = 0.05  # High yield
            kd_pre = rf + spread
        
        kd_after = kd_pre * (1 - tax_rate)
        
        # WACC
        wacc = we * ke + wd * kd_after
        
        # Clamp WACC
        wacc = max(Config.WACC_MIN, min(Config.WACC_MAX, wacc))
        
        return WACC(
            rf=rf,
            erp=erp,
            beta=beta,
            ke=ke,
            kd_pre=kd_pre,
            tax=tax_rate,
            wd=wd,
            we=we,
            kd_after=kd_after,
            wacc=wacc
        )
    
    @staticmethod
    def calculate_terminal(wacc: float) -> Terminal:
        """
        Calculate terminal value assumptions.
        Perpetuity growth capped below WACC.
        """
        # Terminal growth: 2-3% for developed markets
        terminal_g = 0.025
        
        # Ensure g < WACC (with buffer)
        if terminal_g >= wacc:
            terminal_g = max(0.02, wacc * 0.5)
        
        return Terminal(
            method="perpetuity",
            g=terminal_g
        )

    @staticmethod
    def calculate_trend_weighted_average(values: List[float], weights: List[float] = None) -> float:
        """
        Calculate weighted average with more weight on recent years.
        Default weights: [0.5, 0.3, 0.2] for most recent 3 years.
        """
        if not values or len(values) == 0:
            return 0.0
        
        # Use only the most recent values (up to 3)
        recent_values = values[:min(3, len(values))]
        
        if not weights:
            # Default weights: recent years matter more
            weights = [0.5, 0.3, 0.2][:len(recent_values)]
        
        # Normalize weights to sum to 1
        weight_sum = sum(weights)
        if weight_sum > 0:
            weights = [w / weight_sum for w in weights]
        else:
            weights = [1.0 / len(recent_values)] * len(recent_values)
        
        # Calculate weighted average
        weighted_sum = sum(v * w for v, w in zip(recent_values, weights))
        return weighted_sum
    
    @staticmethod
    def calculate_trend_slope(values: List[float]) -> float:
        """
        Calculate trend slope using linear regression.
        Returns slope (positive = improving trend, negative = declining).
        """
        if not values or len(values) < 2:
            return 0.0
        
        # Use numpy for linear regression
        try:
            x = np.arange(len(values))
            y = np.array(values)
            
            # Simple linear regression: y = mx + b
            n = len(values)
            sum_x = np.sum(x)
            sum_y = np.sum(y)
            sum_xy = np.sum(x * y)
            sum_x2 = np.sum(x * x)
            
            # Calculate slope
            slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x)
            return slope
            
        except Exception:
            return 0.0
    
    @staticmethod
    def calculate_volatility(values: List[float]) -> float:
        """
        Calculate coefficient of variation (std/mean) as volatility measure.
        Higher values indicate more volatile metrics.
        """
        if not values or len(values) < 2:
            return 0.0
        
        try:
            mean_val = np.mean(values)
            if mean_val == 0:
                return 0.0
            
            std_val = np.std(values)
            return std_val / abs(mean_val)
            
        except Exception:
            return 0.0

