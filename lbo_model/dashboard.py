"""
Dashboard Module - Builds executive dashboard and summary.
"""

from typing import Dict, Any, List
from .contracts import LBOAssumptions, ReturnsAnalysis, CovenantMetrics, SensitivityMatrix


class DashboardModule:
    """Builds executive dashboard and summary."""
    
    def build_dashboard(
        self, 
        assumptions: LBOAssumptions, 
        returns: ReturnsAnalysis, 
        covenants: CovenantMetrics,
        sensitivity_matrices: List[SensitivityMatrix]
    ) -> Dict[str, Any]:
        """
        Build executive dashboard.
        
        Args:
            assumptions: LBO assumptions
            returns: Returns analysis
            covenants: Covenant metrics
            sensitivity_matrices: Sensitivity analysis
            
        Returns:
            Dashboard dictionary
        """
        dashboard = {
            "executive_summary": self._build_executive_summary(assumptions, returns),
            "key_metrics": self._build_key_metrics(assumptions, returns, covenants),
            "leverage_profile": self._build_leverage_profile(covenants),
            "returns_analysis": self._build_returns_summary(returns),
            "sensitivity_highlights": self._build_sensitivity_highlights(sensitivity_matrices),
            "risk_factors": self._build_risk_factors(covenants, returns),
            "investment_thesis": self._build_investment_thesis(assumptions, returns)
        }
        
        return dashboard
    
    def _build_executive_summary(self, assumptions: LBOAssumptions, returns: ReturnsAnalysis) -> Dict[str, Any]:
        """Build executive summary."""
        return {
            "transaction_overview": {
                "entry_multiple": f"{assumptions.entry_multiple:.1f}x",
                "exit_multiple": f"{assumptions.exit_multiple:.1f}x",
                "holding_period": f"{assumptions.holding_period} years",
                "entry_ebitda": f"${assumptions.entry_ebitda:,.0f}",
                "exit_ebitda": f"${returns.exit_ebitda:,.0f}"
            },
            "returns_summary": {
                "sponsor_irr": f"{returns.sponsor_irr:.1%}",
                "sponsor_moic": f"{returns.sponsor_moic:.1f}x",
                "exit_equity_value": f"${returns.exit_equity_value:,.0f}",
                "sponsor_equity_invested": f"${returns.sponsor_equity_invested:,.0f}"
            }
        }
    
    def _build_key_metrics(self, assumptions: LBOAssumptions, returns: ReturnsAnalysis, covenants: CovenantMetrics) -> Dict[str, Any]:
        """Build key metrics table."""
        return {
            "financial_metrics": {
                "entry_ebitda": assumptions.entry_ebitda,
                "exit_ebitda": returns.exit_ebitda,
                "ebitda_cagr": self._calculate_cagr(assumptions.entry_ebitda, returns.exit_ebitda, assumptions.holding_period),
                "entry_multiple": assumptions.entry_multiple,
                "exit_multiple": assumptions.exit_multiple
            },
            "leverage_metrics": {
                "entry_leverage": covenants.debt_to_ebitda[0] if covenants.debt_to_ebitda else 0,
                "exit_leverage": covenants.debt_to_ebitda[-1] if covenants.debt_to_ebitda else 0,
                "leverage_paydown": (covenants.debt_to_ebitda[0] - covenants.debt_to_ebitda[-1]) if len(covenants.debt_to_ebitda) > 1 else 0,
                "max_leverage": max(covenants.debt_to_ebitda) if covenants.debt_to_ebitda else 0
            },
            "returns_metrics": {
                "sponsor_irr": returns.sponsor_irr,
                "sponsor_moic": returns.sponsor_moic,
                "management_irr": returns.management_irr,
                "management_moic": returns.management_moic,
                "weighted_avg_debt_irr": returns.weighted_average_debt_irr
            }
        }
    
    def _build_leverage_profile(self, covenants: CovenantMetrics) -> Dict[str, Any]:
        """Build leverage profile."""
        return {
            "leverage_trajectory": {
                "years": covenants.years,
                "debt_to_ebitda": covenants.debt_to_ebitda,
                "senior_debt_to_ebitda": covenants.senior_debt_to_ebitda
            },
            "coverage_trajectory": {
                "years": covenants.years,
                "interest_coverage": covenants.interest_coverage,
                "fixed_charge_coverage": covenants.fixed_charge_coverage
            },
            "covenant_status": {
                "leverage_breaches": sum(covenants.leverage_breach),
                "coverage_breaches": sum(covenants.coverage_breach),
                "covenant_limit_leverage": covenants.max_leverage_covenant,
                "covenant_limit_coverage": covenants.min_interest_coverage_covenant
            }
        }
    
    def _build_returns_summary(self, returns: ReturnsAnalysis) -> Dict[str, Any]:
        """Build returns summary."""
        return {
            "sponsor_returns": {
                "irr": returns.sponsor_irr,
                "moic": returns.sponsor_moic,
                "equity_invested": returns.sponsor_equity_invested,
                "equity_exit_value": returns.sponsor_equity_exit_value
            },
            "management_returns": {
                "irr": returns.management_irr,
                "moic": returns.management_moic,
                "equity_value": returns.management_equity_value
            },
            "exit_valuation": {
                "exit_ebitda": returns.exit_ebitda,
                "exit_multiple": returns.exit_multiple,
                "exit_enterprise_value": returns.exit_enterprise_value,
                "exit_net_debt": returns.exit_net_debt,
                "exit_equity_value": returns.exit_equity_value
            }
        }
    
    def _build_sensitivity_highlights(self, sensitivity_matrices: List[SensitivityMatrix]) -> Dict[str, Any]:
        """Build sensitivity highlights."""
        highlights = {}
        
        for matrix in sensitivity_matrices:
            if matrix.x_axis_label == "Exit Multiple" and matrix.y_axis_label == "Total Leverage":
                # Find best and worst case scenarios
                max_irr = max(max(row) for row in matrix.irr_matrix)
                min_irr = min(min(row) for row in matrix.irr_matrix)
                
                highlights["exit_leverage_sensitivity"] = {
                    "best_case_irr": max_irr,
                    "worst_case_irr": min_irr,
                    "irr_range": max_irr - min_irr
                }
        
        return highlights
    
    def _build_risk_factors(self, covenants: CovenantMetrics, returns: ReturnsAnalysis) -> Dict[str, Any]:
        """Build risk factors analysis."""
        risks = []
        
        # Leverage risk
        if covenants.debt_to_ebitda and max(covenants.debt_to_ebitda) > 6.0:
            risks.append("High leverage risk - peak leverage exceeds 6.0x")
        
        # Coverage risk
        if covenants.interest_coverage and min(covenants.interest_coverage) < 2.0:
            risks.append("Low interest coverage risk - minimum coverage below 2.0x")
        
        # Covenant breach risk
        if sum(covenants.leverage_breach) > 0:
            risks.append(f"Covenant breach risk - {sum(covenants.leverage_breach)} leverage breaches")
        
        if sum(covenants.coverage_breach) > 0:
            risks.append(f"Covenant breach risk - {sum(covenants.coverage_breach)} coverage breaches")
        
        # Returns risk
        if returns.sponsor_irr < 0.15:
            risks.append("Low returns risk - IRR below 15%")
        
        return {
            "risk_factors": risks,
            "risk_level": "HIGH" if len(risks) > 2 else "MEDIUM" if len(risks) > 0 else "LOW"
        }
    
    def _build_investment_thesis(self, assumptions: LBOAssumptions, returns: ReturnsAnalysis) -> Dict[str, Any]:
        """Build investment thesis."""
        return {
            "value_creation_drivers": [
                f"Revenue growth: {assumptions.revenue_growth[0]:.1%} CAGR",
                f"Margin expansion: {assumptions.ebitda_margin[0]:.1%} to {assumptions.ebitda_margin[-1]:.1%}",
                f"Multiple expansion: {assumptions.entry_multiple:.1f}x to {assumptions.exit_multiple:.1f}x",
                f"Debt paydown: {assumptions.senior_debt_multiple + assumptions.mezzanine_debt_multiple:.1f}x leverage"
            ],
            "key_assumptions": {
                "revenue_growth": assumptions.revenue_growth,
                "ebitda_margin": assumptions.ebitda_margin,
                "capex_pct": assumptions.capex_pct_revenue,
                "tax_rate": assumptions.tax_rate
            },
            "success_probability": self._calculate_success_probability(returns, assumptions)
        }
    
    def _calculate_cagr(self, start_value: float, end_value: float, years: int) -> float:
        """Calculate CAGR."""
        if start_value <= 0 or end_value <= 0 or years <= 0:
            return 0.0
        return (end_value / start_value) ** (1 / years) - 1
    
    def _calculate_success_probability(self, returns: ReturnsAnalysis, assumptions: LBOAssumptions) -> str:
        """Calculate success probability."""
        if returns.sponsor_irr > 0.25:
            return "HIGH (IRR > 25%)"
        elif returns.sponsor_irr > 0.20:
            return "MEDIUM-HIGH (IRR 20-25%)"
        elif returns.sponsor_irr > 0.15:
            return "MEDIUM (IRR 15-20%)"
        else:
            return "LOW (IRR < 15%)"
