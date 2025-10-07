"""
Assumptions builder for financial models.
"""

from typing import Dict, List, Any, Optional, Union, TypedDict, cast
from datetime import datetime
import math
import statistics

from .data_merger import MergedData
from .config import (
    DEFAULT_RISK_FREE_RATE,
    DEFAULT_EQUITY_RISK_PREMIUM,
    DEFAULT_BETA,
    DEFAULT_TERMINAL_GROWTH_RATE,
    REVENUE_GROWTH_MIN,
    REVENUE_GROWTH_MAX,
    MARGIN_DRIFT_BPS,
    TAX_RATE_MIN,
    TAX_RATE_MAX,
    DEBT_WEIGHT_MAX,
    WACC_MIN,
    WACC_MAX,
    TERMINAL_GROWTH_MIN,
    TERMINAL_GROWTH_MAX,
    GDP_GROWTH_RATES,
    INDUSTRY_PARAMS,
    DEFAULT_INDUSTRY_PARAMS,
)

class AssumptionSet(TypedDict):
    """Type for a set of assumptions."""
    ticker: str
    company_name: str
    currency: str
    provenance: Dict[str, Dict[str, str]]
    historicals: Dict[str, List[float]]
    assumptions: Dict[str, Any]
    wacc: Dict[str, float]
    terminal: Dict[str, Any]
    flags: List[str]

class AssumptionsBuilder:
    """Builder for financial model assumptions."""
    
    def __init__(self):
        """Initialize the assumptions builder."""
        self.flags = []
    
    def _add_flag(self, flag: str) -> None:
        """Add a flag to the list of flags."""
        self.flags.append(flag)
    
    def _get_historical_cagr(self, values: List[float], years: int) -> Optional[float]:
        """Calculate compound annual growth rate from historical values."""
        if not values or len(values) < 2:
            return None
        
        # Take the minimum of requested years and available data
        years = min(years, len(values) - 1)
        
        # Calculate CAGR
        start_value = values[years]  # Older value
        end_value = values[0]  # Most recent value
        
        if start_value <= 0 or end_value <= 0:
            return None
        
        cagr = (end_value / start_value) ** (1 / years) - 1
        return cagr
    
    def _calculate_average(self, values: List[float], years: int) -> Optional[float]:
        """Calculate average of the most recent years."""
        if not values or len(values) == 0:
            return None
        
        # Take the minimum of requested years and available data
        years = min(years, len(values))
        
        # Calculate average
        avg = sum(values[:years]) / years
        return avg
    
    def _calculate_revenue_growth_path(
        self,
        historical_revenue: List[float],
        estimates: Optional[Dict[str, Any]],
        forecast_years: int = 5
    ) -> List[float]:
        """
        Calculate revenue growth path for the forecast period.
        
        Args:
            historical_revenue: List of historical revenue values (most recent first)
            estimates: Analyst estimates for revenue growth
            forecast_years: Number of years to forecast
            
        Returns:
            List of revenue growth rates for each forecast year
        """
        # Calculate historical CAGR (3-5 years)
        historical_cagr = self._get_historical_cagr(historical_revenue, min(5, len(historical_revenue) - 1))
        
        # If no historical CAGR, use default
        if historical_cagr is None:
            historical_cagr = 0.08  # 8% default
            self._add_flag("No historical revenue data, using default growth rate")
        
        # Get analyst estimates for next 1-2 years if available
        rev_growth_y1 = None
        rev_growth_y2 = None
        
        if estimates:
            rev_growth_y1 = estimates.get("rev_growth_y1")
            rev_growth_y2 = estimates.get("rev_growth_y2")
        
        # Initialize growth path
        growth_path = [0.0] * forecast_years
        
        # Year 1 growth
        if rev_growth_y1 is not None:
            growth_path[0] = rev_growth_y1
        else:
            growth_path[0] = historical_cagr
        
        # Year 2 growth
        if rev_growth_y2 is not None:
            if forecast_years > 1:
                growth_path[1] = rev_growth_y2
        else:
            if forecast_years > 1:
                # If Y1 is from estimates, fade from Y1 to historical CAGR
                if rev_growth_y1 is not None:
                    growth_path[1] = (rev_growth_y1 + historical_cagr) / 2
                else:
                    # Otherwise, slightly fade from historical CAGR
                    growth_path[1] = historical_cagr * 0.95
        
        # Get terminal growth rate (proxy for GDP growth)
        terminal_growth = DEFAULT_TERMINAL_GROWTH_RATE
        
        # Fade to steady-state by year 5
        for i in range(2, forecast_years):
            # Linear fade from year 2 to terminal growth
            progress = (i - 1) / (forecast_years - 2)  # 0 at year 2, 1 at year 5
            growth_path[i] = growth_path[1] * (1 - progress) + terminal_growth * progress
        
        # Clamp growth rates within bounds
        for i in range(forecast_years):
            growth_path[i] = max(REVENUE_GROWTH_MIN, min(REVENUE_GROWTH_MAX, growth_path[i]))
        
        return growth_path
    
    def _calculate_margin_path(
        self,
        historical_margins: List[float],
        estimates: Optional[Dict[str, Any]],
        forecast_years: int = 5
    ) -> List[float]:
        """
        Calculate operating margin path for the forecast period.
        
        Args:
            historical_margins: List of historical operating margin values (most recent first)
            estimates: Analyst estimates for margins
            forecast_years: Number of years to forecast
            
        Returns:
            List of operating margin values for each forecast year
        """
        if not historical_margins or len(historical_margins) == 0:
            # Use default margin if no historical data
            base_margin = 0.20  # 20% default
            self._add_flag("No historical margin data, using default margin")
        else:
            # Use 3-year average as base margin
            base_margin = self._calculate_average(historical_margins, min(3, len(historical_margins)))
        
        # Determine margin trend
        margin_trend = 0.0
        if len(historical_margins) >= 3:
            # Calculate average annual change in margin over the last 3 years
            changes = [historical_margins[i] - historical_margins[i+1] for i in range(min(2, len(historical_margins) - 1))]
            margin_trend = sum(changes) / len(changes)
        
        # Initialize margin path
        margin_path = [0.0] * forecast_years
        
        # Get Y1 margin estimate if available
        margin_y1 = None
        if estimates:
            margin_y1 = estimates.get("margin_y1")
        
        # Allow margin drift based on trend or estimates
        max_drift = MARGIN_DRIFT_BPS / 10000  # Convert from basis points to decimal
        
        if margin_y1 is not None:
            # If estimate is within reasonable drift, use it for Y1
            if abs(margin_y1 - base_margin) <= max_drift:
                margin_path[0] = margin_y1
                
                # Fade back to base margin + trend for remaining years
                for i in range(1, forecast_years):
                    progress = i / (forecast_years - 1)  # 0 at year 1, 1 at year 5
                    drift = margin_trend * (forecast_years - i) / forecast_years
                    drift = max(-max_drift, min(max_drift, drift))
                    margin_path[i] = margin_y1 * (1 - progress) + (base_margin + drift * (i + 1)) * progress
            else:
                # If estimate is outside reasonable drift, flag it and use base margin + trend
                self._add_flag(f"Margin estimate ({margin_y1:.1%}) differs from historical average ({base_margin:.1%}) by more than {MARGIN_DRIFT_BPS} bps")
                
                for i in range(forecast_years):
                    drift = margin_trend * (forecast_years - i) / forecast_years
                    drift = max(-max_drift, min(max_drift, drift))
                    margin_path[i] = base_margin + drift * (i + 1)
        else:
            # Use base margin + trend
            for i in range(forecast_years):
                drift = margin_trend * (forecast_years - i) / forecast_years
                drift = max(-max_drift, min(max_drift, drift))
                margin_path[i] = base_margin + drift * (i + 1)
        
        # Ensure margins are reasonable (5% to 50%)
        for i in range(forecast_years):
            margin_path[i] = max(0.05, min(0.50, margin_path[i]))
        
        return margin_path
    
    def _calculate_capex_percent(
        self,
        historical_capex: List[float],
        historical_revenue: List[float]
    ) -> float:
        """
        Calculate capital expenditures as a percentage of revenue.
        
        Args:
            historical_capex: List of historical capital expenditure values (most recent first)
            historical_revenue: List of historical revenue values (most recent first)
            
        Returns:
            Capital expenditures as a percentage of revenue
        """
        if not historical_capex or not historical_revenue or len(historical_capex) == 0 or len(historical_revenue) == 0:
            # Use default capex percentage if no historical data
            capex_percent = 0.06  # 6% default
            self._add_flag("No historical capex data, using default capex percentage")
            return capex_percent
        
        # Calculate capex as percentage of revenue for each year
        min_len = min(len(historical_capex), len(historical_revenue))
        capex_percentages = []
        
        for i in range(min_len):
            if historical_revenue[i] > 0:
                capex_percentages.append(historical_capex[i] / historical_revenue[i])
        
        if not capex_percentages:
            # Use default if no valid percentages
            capex_percent = 0.06  # 6% default
            self._add_flag("Invalid historical capex data, using default capex percentage")
            return capex_percent
        
        # Use 3-year average
        capex_percent = sum(capex_percentages[:min(3, len(capex_percentages))]) / min(3, len(capex_percentages))
        
        # Ensure capex percentage is reasonable (1% to 20%)
        capex_percent = max(0.01, min(0.20, capex_percent))
        
        return capex_percent
    
    def _calculate_nwc_percent(
        self,
        historical_nwc_change: List[float],
        historical_revenue: List[float]
    ) -> float:
        """
        Calculate change in net working capital as a percentage of revenue change.
        
        Args:
            historical_nwc_change: List of historical change in net working capital values (most recent first)
            historical_revenue: List of historical revenue values (most recent first)
            
        Returns:
            Change in net working capital as a percentage of revenue change
        """
        if not historical_nwc_change or not historical_revenue or len(historical_nwc_change) == 0 or len(historical_revenue) == 0:
            # Use default NWC percentage if no historical data
            nwc_percent = 0.03  # 3% default
            self._add_flag("No historical NWC data, using default NWC percentage")
            return nwc_percent
        
        # Calculate NWC change as percentage of revenue for each year
        min_len = min(len(historical_nwc_change), len(historical_revenue) - 1)
        nwc_percentages = []
        
        for i in range(min_len):
            revenue_change = historical_revenue[i] - historical_revenue[i+1]
            if revenue_change != 0:
                nwc_percentages.append(historical_nwc_change[i] / revenue_change)
        
        if not nwc_percentages:
            # Use default if no valid percentages
            nwc_percent = 0.03  # 3% default
            self._add_flag("Invalid historical NWC data, using default NWC percentage")
            return nwc_percent
        
        # Filter out extreme values (winsorize)
        filtered_percentages = [p for p in nwc_percentages if -0.5 <= p <= 0.5]
        if not filtered_percentages:
            filtered_percentages = nwc_percentages
        
        # Use 3-year average
        nwc_percent = sum(filtered_percentages[:min(3, len(filtered_percentages))]) / min(3, len(filtered_percentages))
        
        # Ensure NWC percentage is reasonable (-10% to 20%)
        nwc_percent = max(-0.10, min(0.20, nwc_percent))
        
        return nwc_percent
    
    def _calculate_da_percent(
        self,
        historical_da: List[float],
        historical_revenue: List[float]
    ) -> float:
        """
        Calculate depreciation and amortization as a percentage of revenue.
        
        Args:
            historical_da: List of historical depreciation and amortization values (most recent first)
            historical_revenue: List of historical revenue values (most recent first)
            
        Returns:
            Depreciation and amortization as a percentage of revenue
        """
        if not historical_da or not historical_revenue or len(historical_da) == 0 or len(historical_revenue) == 0:
            # Use default D&A percentage if no historical data
            da_percent = 0.04  # 4% default
            self._add_flag("No historical D&A data, using default D&A percentage")
            return da_percent
        
        # Calculate D&A as percentage of revenue for each year
        min_len = min(len(historical_da), len(historical_revenue))
        da_percentages = []
        
        for i in range(min_len):
            if historical_revenue[i] > 0:
                da_percentages.append(historical_da[i] / historical_revenue[i])
        
        if not da_percentages:
            # Use default if no valid percentages
            da_percent = 0.04  # 4% default
            self._add_flag("Invalid historical D&A data, using default D&A percentage")
            return da_percent
        
        # Use 3-year average
        da_percent = sum(da_percentages[:min(3, len(da_percentages))]) / min(3, len(da_percentages))
        
        # Ensure D&A percentage is reasonable (1% to 15%)
        da_percent = max(0.01, min(0.15, da_percent))
        
        return da_percent
    
    def _calculate_tax_rate(
        self,
        historical_tax_expense: List[float],
        historical_pretax_income: List[float]
    ) -> float:
        """
        Calculate effective tax rate.
        
        Args:
            historical_tax_expense: List of historical tax expense values (most recent first)
            historical_pretax_income: List of historical pre-tax income values (most recent first)
            
        Returns:
            Effective tax rate
        """
        if not historical_tax_expense or not historical_pretax_income or len(historical_tax_expense) == 0 or len(historical_pretax_income) == 0:
            # Use default tax rate if no historical data
            tax_rate = 0.21  # 21% default (US corporate tax rate)
            self._add_flag("No historical tax data, using default tax rate")
            return tax_rate
        
        # Calculate effective tax rate for each year
        min_len = min(len(historical_tax_expense), len(historical_pretax_income))
        tax_rates = []
        
        for i in range(min_len):
            if historical_pretax_income[i] > 0:
                tax_rates.append(historical_tax_expense[i] / historical_pretax_income[i])
        
        if not tax_rates:
            # Use default if no valid rates
            tax_rate = 0.21  # 21% default (US corporate tax rate)
            self._add_flag("Invalid historical tax data, using default tax rate")
            return tax_rate
        
        # Use 3-year average
        tax_rate = sum(tax_rates[:min(3, len(tax_rates))]) / min(3, len(tax_rates))
        
        # Ensure tax rate is reasonable (10% to 30%)
        tax_rate = max(TAX_RATE_MIN, min(TAX_RATE_MAX, tax_rate))
        
        return tax_rate
    
    def _calculate_wacc(
        self,
        market_data: Dict[str, Any],
        risk_free_rate: Optional[float],
        tax_rate: float
    ) -> Dict[str, float]:
        """
        Calculate weighted average cost of capital (WACC).
        
        Args:
            market_data: Market data for the company
            risk_free_rate: Risk-free rate
            tax_rate: Effective tax rate
            
        Returns:
            Dict with WACC components
        """
        # Get risk-free rate
        rf = risk_free_rate if risk_free_rate is not None else DEFAULT_RISK_FREE_RATE
        
        # Get equity risk premium
        erp = DEFAULT_EQUITY_RISK_PREMIUM
        
        # Get beta
        beta = market_data.get("beta", DEFAULT_BETA)
        
        # Ensure beta is within reasonable bounds
        if beta is None or beta <= 0:
            beta = DEFAULT_BETA
            self._add_flag("Invalid beta, using default beta")
        
        # Calculate cost of equity using CAPM
        cost_of_equity = rf + beta * erp
        
        # Get pre-tax cost of debt
        # In a more complex implementation, this could be based on credit rating or debt-to-EBITDA
        pre_tax_cost_of_debt = rf + 0.02  # Risk-free rate + 200 bps
        
        # Calculate after-tax cost of debt
        after_tax_cost_of_debt = pre_tax_cost_of_debt * (1 - tax_rate)
        
        # Calculate capital weights
        market_cap = market_data.get("market_cap", 0)
        total_debt = market_data.get("total_debt", 0)
        
        if market_cap <= 0 or total_debt < 0:
            # Use default weights if market data is invalid
            debt_weight = 0.25  # 25% debt
            equity_weight = 0.75  # 75% equity
            self._add_flag("Invalid market data, using default capital weights")
        else:
            # Calculate weights based on market values
            total_capital = market_cap + total_debt
            debt_weight = total_debt / total_capital if total_capital > 0 else 0.25
            equity_weight = 1 - debt_weight
            
            # Cap debt weight at DEBT_WEIGHT_MAX
            if debt_weight > DEBT_WEIGHT_MAX:
                debt_weight = DEBT_WEIGHT_MAX
                equity_weight = 1 - debt_weight
        
        # Calculate WACC
        wacc = equity_weight * cost_of_equity + debt_weight * after_tax_cost_of_debt
        
        # Ensure WACC is within reasonable bounds
        wacc = max(WACC_MIN, min(WACC_MAX, wacc))
        
        return {
            "rf": rf,
            "erp": erp,
            "beta": beta,
            "ke": cost_of_equity,
            "kd_pre": pre_tax_cost_of_debt,
            "tax": tax_rate,
            "wd": debt_weight,
            "we": equity_weight,
            "kd_after": after_tax_cost_of_debt,
            "wacc": wacc
        }
    
    def _calculate_terminal_value_params(
        self,
        market_data: Dict[str, Any],
        wacc: float
    ) -> Dict[str, Any]:
        """
        Calculate terminal value parameters.
        
        Args:
            market_data: Market data for the company
            wacc: Weighted average cost of capital
            
        Returns:
            Dict with terminal value parameters
        """
        # Get industry and sector
        industry = market_data.get("industry", "")
        sector = market_data.get("sector", "")
        
        # Try to get industry-specific parameters
        industry_params = INDUSTRY_PARAMS.get(industry, INDUSTRY_PARAMS.get(sector, DEFAULT_INDUSTRY_PARAMS))
        
        # Get terminal growth rate from industry parameters
        terminal_growth = industry_params.get("terminal_growth", DEFAULT_TERMINAL_GROWTH_RATE)
        
        # Ensure terminal growth is less than WACC
        if terminal_growth >= wacc:
            terminal_growth = wacc * 0.75  # Set to 75% of WACC
            self._add_flag("Terminal growth >= WACC, adjusted terminal growth")
        
        # Ensure terminal growth is within reasonable bounds
        terminal_growth = max(TERMINAL_GROWTH_MIN, min(TERMINAL_GROWTH_MAX, terminal_growth))
        
        # Get exit multiple from industry parameters
        ev_ebitda_multiple = industry_params.get("ev_ebitda_multiple", 10.0)
        
        return {
            "method": "perpetuity",
            "g": terminal_growth,
            "ev_ebitda": ev_ebitda_multiple
        }
    
    def _perform_sanity_checks(
        self,
        assumptions: AssumptionSet
    ) -> List[str]:
        """
        Perform sanity checks on the assumptions.
        
        Args:
            assumptions: Assumption set to check
            
        Returns:
            List of sanity check flags
        """
        sanity_flags = []
        
        # Check if terminal growth rate is less than WACC
        terminal_growth = assumptions["terminal"]["g"]
        wacc = assumptions["wacc"]["wacc"]
        
        if terminal_growth >= wacc:
            sanity_flags.append("Terminal growth rate >= WACC")
        
        # Check if terminal growth rate is reasonable
        if terminal_growth < TERMINAL_GROWTH_MIN:
            sanity_flags.append(f"Terminal growth rate ({terminal_growth:.1%}) < {TERMINAL_GROWTH_MIN:.1%}")
        
        if terminal_growth > TERMINAL_GROWTH_MAX:
            sanity_flags.append(f"Terminal growth rate ({terminal_growth:.1%}) > {TERMINAL_GROWTH_MAX:.1%}")
        
        # Check if WACC is reasonable
        if wacc < WACC_MIN:
            sanity_flags.append(f"WACC ({wacc:.1%}) < {WACC_MIN:.1%}")
        
        if wacc > WACC_MAX:
            sanity_flags.append(f"WACC ({wacc:.1%}) > {WACC_MAX:.1%}")
        
        # Check if revenue growth is reasonable
        revenue_growth = assumptions["assumptions"]["revenue_growth"]
        if revenue_growth[0] > REVENUE_GROWTH_MAX:
            sanity_flags.append(f"Year 1 revenue growth ({revenue_growth[0]:.1%}) > {REVENUE_GROWTH_MAX:.1%}")
        
        # Check if operating margin is reasonable
        operating_margin = assumptions["assumptions"]["operating_margin"]
        if operating_margin[0] < 0.05:
            sanity_flags.append(f"Year 1 operating margin ({operating_margin[0]:.1%}) < 5%")
        
        if operating_margin[0] > 0.50:
            sanity_flags.append(f"Year 1 operating margin ({operating_margin[0]:.1%}) > 50%")
        
        return sanity_flags
    
    def build_assumptions(self, merged_data: MergedData, forecast_years: int = 5) -> Optional[AssumptionSet]:
        """
        Build assumptions from merged data.
        
        Args:
            merged_data: Merged data from multiple providers
            forecast_years: Number of years to forecast
            
        Returns:
            AssumptionSet object with assumptions, or None if insufficient data
        """
        # Reset flags
        self.flags = []
        
        # Check if we have sufficient data
        if not merged_data["fundamentals"]:
            return None
        
        # Extract data
        fundamentals = merged_data["fundamentals"]
        market_data = merged_data["market_data"] or {}
        estimates = merged_data["estimates"]
        risk_free_rate = merged_data["risk_free_rate"]
        
        # Extract historical data
        income_statements = fundamentals.get("income", [])
        balance_sheets = fundamentals.get("balance", [])
        cash_flows = fundamentals.get("cashflow", [])
        
        # Extract historical values
        historical_revenue = [stmt["revenue"] for stmt in income_statements]
        historical_ebit = [stmt["ebit"] for stmt in income_statements]
        historical_tax_expense = [stmt.get("tax_expense", 0) for stmt in income_statements]
        historical_pretax_income = [stmt.get("pretax_income", 0) for stmt in income_statements]
        
        # Calculate historical margins
        historical_margins = []
        for i in range(len(historical_revenue)):
            if historical_revenue[i] > 0:
                historical_margins.append(historical_ebit[i] / historical_revenue[i])
        
        # Extract historical cash flow values
        historical_capex = [cf["capex"] for cf in cash_flows]
        historical_da = [cf.get("depreciation_amortization", 0) for cf in cash_flows]
        historical_nwc_change = [cf.get("delta_nwc", 0) for cf in cash_flows]
        
        # Calculate forecast assumptions
        revenue_growth = self._calculate_revenue_growth_path(historical_revenue, estimates, forecast_years)
        operating_margin = self._calculate_margin_path(historical_margins, estimates, forecast_years)
        capex_pct = self._calculate_capex_percent(historical_capex, historical_revenue)
        nwc_pct = self._calculate_nwc_percent(historical_nwc_change, historical_revenue)
        da_pct = self._calculate_da_percent(historical_da, historical_revenue)
        tax_rate = self._calculate_tax_rate(historical_tax_expense, historical_pretax_income)
        
        # Calculate WACC
        wacc_params = self._calculate_wacc(market_data, risk_free_rate, tax_rate)
        
        # Calculate terminal value parameters
        terminal_params = self._calculate_terminal_value_params(market_data, wacc_params["wacc"])
        
        # Build assumptions set
        assumptions: AssumptionSet = {
            "ticker": market_data.get("ticker", ""),
            "company_name": market_data.get("company_name", ""),
            "currency": market_data.get("currency", "USD"),
            "provenance": merged_data["provenance"],
            "historicals": {
                "years": [stmt["year"] for stmt in income_statements],
                "revenue": historical_revenue,
                "op_margin": historical_margins,
                "capex_pct": [historical_capex[i] / historical_revenue[i] if i < len(historical_revenue) and historical_revenue[i] > 0 else 0 for i in range(min(len(historical_capex), len(historical_revenue)))],
                "nwc_pct": [historical_nwc_change[i] / (historical_revenue[i] - historical_revenue[i+1]) if i < len(historical_revenue) - 1 and historical_revenue[i] - historical_revenue[i+1] != 0 else 0 for i in range(min(len(historical_nwc_change), len(historical_revenue) - 1))]
            },
            "assumptions": {
                "forecast_years": forecast_years,
                "revenue_growth": revenue_growth,
                "operating_margin": operating_margin,
                "da_pct_rev": da_pct,
                "capex_pct_rev": capex_pct,
                "nwc_pct_rev": nwc_pct,
                "tax_rate": tax_rate
            },
            "wacc": wacc_params,
            "terminal": terminal_params,
            "flags": self.flags
        }
        
        # Perform sanity checks
        sanity_flags = self._perform_sanity_checks(assumptions)
        assumptions["flags"].extend(sanity_flags)
        
        return assumptions
