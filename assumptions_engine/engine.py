"""
Core assumptions engine for financial models.
"""

import numpy as np
from typing import Dict, List, Any, Optional, Tuple, Union
from datetime import datetime
import math
import json

from .providers import ProviderFactory, DataNotAvailableError
from .config import (
    DEFAULT_RISK_FREE_RATE, DEFAULT_EQUITY_RISK_PREMIUM, DEFAULT_BETA,
    DEFAULT_EFFECTIVE_TAX_RATE, DEFAULT_PRE_TAX_COST_OF_DEBT,
    DEFAULT_TARGET_DEBT_WEIGHT, DEFAULT_TERMINAL_GROWTH_RATE,
    REVENUE_GROWTH_MIN, REVENUE_GROWTH_MAX, BETA_MIN, BETA_MAX,
    MARGIN_DRIFT_BPS, TAX_RATE_MIN, TAX_RATE_MAX, DEBT_WEIGHT_MAX,
    WACC_MIN, WACC_MAX, TERMINAL_GROWTH_MIN, TERMINAL_GROWTH_MAX,
    GDP_GROWTH_RATES, INDUSTRY_PARAMS, DEFAULT_INDUSTRY_PARAMS
)

class AssumptionsEngine:
    """Engine for generating company-specific assumptions."""
    
    def __init__(self, provider_name: str = "yahoo", **provider_kwargs):
        """Initialize the assumptions engine."""
        self.provider = ProviderFactory.create_provider(provider_name, **provider_kwargs)
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
        analyst_estimates: Dict[str, Any],
        years: int = 5
    ) -> List[float]:
        """Calculate revenue growth path for the forecast period."""
        # Calculate historical CAGR (3-5 years)
        historical_cagr = self._get_historical_cagr(historical_revenue, min(5, len(historical_revenue) - 1))
        
        # If no historical CAGR, use default
        if historical_cagr is None:
            historical_cagr = 0.08  # 8% default
            self._add_flag("No historical revenue data, using default growth rate")
        
        # Get analyst estimates for next 1-2 years if available
        growth_estimates = analyst_estimates.get("growth_estimates", {})
        next_year_growth = growth_estimates.get("revenue_growth")
        
        # Initialize growth path
        growth_path = [0.0] * years
        
        # If analyst estimates available, use them for first 1-2 years
        if next_year_growth is not None:
            growth_path[0] = next_year_growth
            
            # For year 2, fade from analyst estimate to historical CAGR
            if len(growth_path) > 1:
                growth_path[1] = (next_year_growth + historical_cagr) / 2
        else:
            # Use historical CAGR for year 1
            growth_path[0] = historical_cagr
            
            # For year 2, slightly fade from historical CAGR
            if len(growth_path) > 1:
                growth_path[1] = historical_cagr * 0.95
        
        # Get terminal growth rate (proxy for GDP growth)
        terminal_growth = DEFAULT_TERMINAL_GROWTH_RATE
        
        # Fade to steady-state by year 5
        for i in range(2, years):
            # Linear fade from year 2 to terminal growth
            progress = (i - 1) / (years - 2)  # 0 at year 2, 1 at year 5
            growth_path[i] = growth_path[1] * (1 - progress) + terminal_growth * progress
        
        # Clamp growth rates within bounds
        for i in range(years):
            growth_path[i] = max(REVENUE_GROWTH_MIN, min(REVENUE_GROWTH_MAX, growth_path[i]))
        
        return growth_path
    
    def _calculate_margin_path(
        self,
        historical_margins: List[float],
        years: int = 5
    ) -> List[float]:
        """Calculate operating margin path for the forecast period."""
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
        margin_path = [0.0] * years
        
        # Allow margin drift based on trend, but limit to MARGIN_DRIFT_BPS
        max_drift = MARGIN_DRIFT_BPS / 10000  # Convert from basis points to decimal
        
        for i in range(years):
            # Apply trend with diminishing effect
            drift = margin_trend * (years - i) / years
            
            # Limit drift
            drift = max(-max_drift, min(max_drift, drift))
            
            # Calculate margin for year i
            margin_path[i] = base_margin + drift * (i + 1)
            
            # Ensure margin is reasonable (5% to 50%)
            margin_path[i] = max(0.05, min(0.50, margin_path[i]))
        
        return margin_path
    
    def _calculate_capex_percent(
        self,
        historical_capex: List[float],
        historical_revenue: List[float]
    ) -> float:
        """Calculate capital expenditures as a percentage of revenue."""
        if not historical_capex or not historical_revenue or len(historical_capex) == 0 or len(historical_revenue) == 0:
            # Use default capex percentage if no historical data
            capex_percent = 0.06  # 6% default
            self._add_flag("No historical capex data, using default capex percentage")
            return capex_percent
        
        # Calculate capex as percentage of revenue for each year
        min_len = min(len(historical_capex), len(historical_revenue))
        capex_percentages = []
        
        for i in range(min_len):
            if historical_revenue[i] > 0 and historical_capex[i] < 0:
                # Capex is typically negative in cash flow statements
                capex_percentages.append(abs(historical_capex[i]) / historical_revenue[i])
        
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
        """Calculate change in net working capital as a percentage of revenue change."""
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
        """Calculate depreciation and amortization as a percentage of revenue."""
        if not historical_da or not historical_revenue or len(historical_da) == 0 or len(historical_revenue) == 0:
            # Use default D&A percentage if no historical data
            da_percent = 0.04  # 4% default
            self._add_flag("No historical D&A data, using default D&A percentage")
            return da_percent
        
        # Calculate D&A as percentage of revenue for each year
        min_len = min(len(historical_da), len(historical_revenue))
        da_percentages = []
        
        for i in range(min_len):
            if historical_revenue[i] > 0 and historical_da[i] > 0:
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
        """Calculate effective tax rate."""
        if not historical_tax_expense or not historical_pretax_income or len(historical_tax_expense) == 0 or len(historical_pretax_income) == 0:
            # Use default tax rate if no historical data
            tax_rate = DEFAULT_EFFECTIVE_TAX_RATE
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
            tax_rate = DEFAULT_EFFECTIVE_TAX_RATE
            self._add_flag("Invalid historical tax data, using default tax rate")
            return tax_rate
        
        # Use 3-year average
        tax_rate = sum(tax_rates[:min(3, len(tax_rates))]) / min(3, len(tax_rates))
        
        # Ensure tax rate is reasonable (10% to 30%)
        tax_rate = max(TAX_RATE_MIN, min(TAX_RATE_MAX, tax_rate))
        
        return tax_rate
    
    def _calculate_wacc(
        self,
        risk_metrics: Dict[str, Any],
        market_data: Dict[str, Any],
        tax_rate: float
    ) -> Dict[str, float]:
        """Calculate weighted average cost of capital (WACC)."""
        # Get risk-free rate, equity risk premium, and beta
        rf = risk_metrics.get("risk_free_rate", DEFAULT_RISK_FREE_RATE)
        erp = risk_metrics.get("equity_risk_premium", DEFAULT_EQUITY_RISK_PREMIUM)
        beta = risk_metrics.get("beta", DEFAULT_BETA)
        
        # Ensure beta is within reasonable bounds
        if beta is None or beta <= 0:
            beta = DEFAULT_BETA
            self._add_flag("Invalid beta, using default beta")
        else:
            beta = max(BETA_MIN, min(BETA_MAX, beta))
        
        # Calculate cost of equity using CAPM
        cost_of_equity = rf + beta * erp
        
        # Get pre-tax cost of debt
        # In a more complex implementation, this could be based on credit rating or debt-to-EBITDA
        pre_tax_cost_of_debt = DEFAULT_PRE_TAX_COST_OF_DEBT
        
        # Calculate after-tax cost of debt
        after_tax_cost_of_debt = pre_tax_cost_of_debt * (1 - tax_rate)
        
        # Calculate capital weights
        market_cap = market_data.get("market_cap", 0)
        total_debt = market_data.get("total_debt", 0)
        
        if market_cap <= 0 or total_debt < 0:
            # Use default weights if market data is invalid
            debt_weight = DEFAULT_TARGET_DEBT_WEIGHT
            equity_weight = 1 - debt_weight
            self._add_flag("Invalid market data, using default capital weights")
        else:
            # Calculate weights based on market values
            total_capital = market_cap + total_debt
            debt_weight = total_debt / total_capital if total_capital > 0 else DEFAULT_TARGET_DEBT_WEIGHT
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
            "cost_of_equity": cost_of_equity,
            "pre_tax_cost_of_debt": pre_tax_cost_of_debt,
            "tax_rate": tax_rate,
            "target_debt_weight": debt_weight,
            "target_equity_weight": equity_weight,
            "after_tax_cost_of_debt": after_tax_cost_of_debt,
            "wacc": wacc
        }
    
    def _calculate_terminal_value_params(
        self,
        company_info: Dict[str, Any],
        wacc: float
    ) -> Dict[str, Any]:
        """Calculate terminal value parameters."""
        # Get industry parameters
        industry = company_info.get("industry", "")
        sector = company_info.get("sector", "")
        
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
        assumptions: Dict[str, Any]
    ) -> List[str]:
        """Perform sanity checks on the assumptions."""
        sanity_flags = []
        
        # Check if terminal growth rate is less than WACC
        terminal_growth = assumptions["terminal"]["g"]
        wacc = assumptions["wacc"]["wacc"]
        
        if terminal_growth >= wacc:
            sanity_flags.append("Terminal growth rate >= WACC")
        
        # Check if terminal value share of EV is reasonable
        # This would require a quick DCF calculation, which we'll skip for now
        
        # Check if margins are realistic
        # This would require industry comparisons, which we'll skip for now
        
        # Check if growth rates are realistic compared to consensus
        # This would require consensus data, which we'll skip for now
        
        return sanity_flags
    
    def _generate_summary(
        self,
        assumptions: Dict[str, Any]
    ) -> str:
        """Generate a human-readable summary of the assumptions."""
        ticker = assumptions["ticker"]
        currency = assumptions["currency"]
        
        # Extract key assumptions
        revenue_growth = assumptions["forecast"]["revenue_growth"]
        operating_margin = assumptions["forecast"]["operating_margin"]
        da_pct = assumptions["forecast"]["da_pct_of_revenue"]
        capex_pct = assumptions["forecast"]["capex_pct_of_revenue"]
        nwc_pct = assumptions["forecast"]["nwc_pct_of_revenue"]
        tax_rate = assumptions["forecast"]["tax_rate"]
        
        wacc_params = assumptions["wacc"]
        wacc = wacc_params["wacc"]
        rf = wacc_params["rf"]
        beta = wacc_params["beta"]
        erp = wacc_params["erp"]
        debt_weight = wacc_params["target_debt_weight"]
        
        terminal = assumptions["terminal"]
        terminal_method = terminal["method"]
        terminal_g = terminal.get("g", 0)
        terminal_multiple = terminal.get("ev_ebitda", 0)
        
        flags = assumptions.get("flags", [])
        
        # Format growth rates as string
        growth_str = ", ".join([f"{g*100:.1f}%" for g in revenue_growth])
        
        # Format margin path as string
        margin_str = f"{operating_margin[0]*100:.1f}%→{operating_margin[-1]*100:.1f}%"
        
        # Format terminal value parameters
        if terminal_method == "perpetuity":
            terminal_str = f"g {terminal_g*100:.1f}%"
        else:
            terminal_str = f"EV/EBITDA {terminal_multiple:.1f}x"
        
        # Build summary string
        summary = f"ASSUMPTIONS — {ticker}\n"
        summary += f"Growth (Y1→Y5): {growth_str} (fade to {terminal_g*100:.1f}%)\n"
        summary += f"Oper. Margin path: {margin_str} (base = last 3y avg)\n"
        summary += f"D&A %Rev: {da_pct*100:.1f}% | CapEx %Rev: {capex_pct*100:.1f}% | ΔNWC %Rev: {nwc_pct*100:.1f}%\n"
        summary += f"Tax: {tax_rate*100:.1f}% | WACC: {wacc*100:.1f}% (Rf {rf*100:.1f}%, Beta {beta:.2f}, ERP {erp*100:.1f}%, D/E {debt_weight/(1-debt_weight):.1f}%)\n"
        summary += f"Terminal: {terminal_method} {terminal_str}\n"
        
        if flags:
            summary += f"Flags: {flags}\n"
        
        return summary
    
    def build_company_assumptions(self, ticker: str, region: str = "US", currency: str = "USD") -> Dict[str, Any]:
        """
        Build company-specific assumptions for financial models.
        
        Args:
            ticker: Company ticker symbol
            region: Region/country (default: "US")
            currency: Currency (default: "USD")
            
        Returns:
            Dict with company-specific assumptions
        """
        try:
            # Reset flags
            self.flags = []
            
            # Get company information
            company_info = self.provider.get_company_info(ticker)
            
            # Get financial data
            income_stmt = self.provider.get_income_statement(ticker)
            balance_sheet = self.provider.get_balance_sheet(ticker)
            cash_flow = self.provider.get_cash_flow(ticker)
            market_data = self.provider.get_market_data(ticker)
            risk_metrics = self.provider.get_risk_metrics(ticker)
            analyst_estimates = self.provider.get_analyst_estimates(ticker)
            
            # Extract historical data
            historical_revenue = income_stmt.get("revenue", [])
            historical_operating_income = income_stmt.get("operating_income", [])
            historical_tax_expense = income_stmt.get("income_tax_expense", [])
            historical_pretax_income = income_stmt.get("pretax_income", [])
            historical_capex = cash_flow.get("capital_expenditures", [])
            historical_nwc_change = cash_flow.get("change_in_working_capital", [])
            historical_da = cash_flow.get("depreciation_amortization", [])
            
            # Calculate historical margins
            historical_margins = []
            min_len = min(len(historical_revenue), len(historical_operating_income))
            for i in range(min_len):
                if historical_revenue[i] > 0:
                    historical_margins.append(historical_operating_income[i] / historical_revenue[i])
            
            # Calculate forecast assumptions
            forecast_years = 5
            revenue_growth = self._calculate_revenue_growth_path(historical_revenue, analyst_estimates, forecast_years)
            operating_margin = self._calculate_margin_path(historical_margins, forecast_years)
            capex_pct = self._calculate_capex_percent(historical_capex, historical_revenue)
            nwc_pct = self._calculate_nwc_percent(historical_nwc_change, historical_revenue)
            da_pct = self._calculate_da_percent(historical_da, historical_revenue)
            tax_rate = self._calculate_tax_rate(historical_tax_expense, historical_pretax_income)
            
            # Calculate WACC
            wacc_params = self._calculate_wacc(risk_metrics, market_data, tax_rate)
            
            # Calculate terminal value parameters
            terminal_params = self._calculate_terminal_value_params(company_info, wacc_params["wacc"])
            
            # Build assumptions pack
            assumptions = {
                "ticker": ticker,
                "currency": currency,
                "historicals": {
                    "revenue": historical_revenue,
                    "op_margin": historical_margins,
                    "capex_pct": [abs(historical_capex[i]) / historical_revenue[i] if i < len(historical_revenue) and historical_revenue[i] > 0 else 0 for i in range(len(historical_capex))],
                    "nwc_pct": [historical_nwc_change[i] / (historical_revenue[i] - historical_revenue[i+1]) if i < len(historical_revenue) - 1 and historical_revenue[i] - historical_revenue[i+1] != 0 else 0 for i in range(len(historical_nwc_change))]
                },
                "forecast": {
                    "years": forecast_years,
                    "revenue_growth": revenue_growth,
                    "operating_margin": operating_margin,
                    "da_pct_of_revenue": da_pct,
                    "capex_pct_of_revenue": capex_pct,
                    "nwc_pct_of_revenue": nwc_pct,
                    "tax_rate": tax_rate
                },
                "wacc": wacc_params,
                "terminal": terminal_params,
                "flags": self.flags
            }
            
            # Perform sanity checks
            sanity_flags = self._perform_sanity_checks(assumptions)
            assumptions["sanity_flags"] = sanity_flags
            
            # Generate summary
            summary = self._generate_summary(assumptions)
            assumptions["summary"] = summary
            
            return assumptions
            
        except DataNotAvailableError as e:
            # Handle missing data
            missing_fields = str(e).split(": ")[1] if ": " in str(e) else "unknown"
            
            return {
                "error": "data_unavailable",
                "missing": [missing_fields],
                "message": f"Provider returned no data for {ticker}: {e}"
            }
        except Exception as e:
            # Handle other errors
            return {
                "error": "processing_error",
                "message": f"Error processing data for {ticker}: {e}"
            }

def build_company_assumptions(ticker: str, region: str = "US", currency: str = "USD") -> Dict[str, Any]:
    """
    Build company-specific assumptions for financial models.
    
    Args:
        ticker: Company ticker symbol
        region: Region/country (default: "US")
        currency: Currency (default: "USD")
        
    Returns:
        Dict with company-specific assumptions
    """
    engine = AssumptionsEngine()
    return engine.build_company_assumptions(ticker, region, currency)
