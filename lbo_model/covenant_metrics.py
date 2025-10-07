"""
Covenant Metrics Module - Calculates covenant and credit metrics.
"""

from typing import Dict, Any, List
from .contracts import LBOAssumptions, ProFormaFinancials, DebtTranche, CovenantMetrics


class CovenantMetricsModule:
    """Calculates covenant and credit metrics."""
    
    def calculate_covenants(self, assumptions: LBOAssumptions, proforma: ProFormaFinancials, debt_schedule: List[DebtTranche]) -> CovenantMetrics:
        """
        Calculate covenant and credit metrics.
        
        Args:
            assumptions: LBO assumptions
            proforma: Pro forma financials
            debt_schedule: Debt schedule
            
        Returns:
            CovenantMetrics object
        """
        years = proforma.years
        n_years = len(years)
        
        # Calculate leverage ratios
        debt_to_ebitda = []
        senior_debt_to_ebitda = []
        
        for i in range(n_years):
            if proforma.ebitda[i] > 0:
                debt_to_ebitda.append(proforma.total_debt[i] / proforma.ebitda[i])
                
                # Calculate senior debt
                senior_debt = 0
                for tranche in debt_schedule:
                    if tranche.tranche_type.value in ["term_loan_a", "revolver"]:
                        senior_debt += tranche.outstanding_balance[i] if i < len(tranche.outstanding_balance) else 0
                
                senior_debt_to_ebitda.append(senior_debt / proforma.ebitda[i])
            else:
                debt_to_ebitda.append(0)
                senior_debt_to_ebitda.append(0)
        
        # Calculate coverage ratios
        interest_coverage = []
        ebitda_coverage = []
        fixed_charge_coverage = []
        
        for i in range(n_years):
            if proforma.interest_expense[i] > 0:
                interest_coverage.append(proforma.ebitda[i] / proforma.interest_expense[i])
            else:
                interest_coverage.append(float('inf'))
            
            # EBITDA coverage (simplified)
            ebitda_coverage.append(proforma.ebitda[i] / max(proforma.interest_expense[i], 1))
            
            # Fixed charge coverage (EBITDA / (Interest + Principal))
            total_principal = sum(tranche.principal_payments[i] + tranche.cash_sweep_payments[i] for tranche in debt_schedule)
            fixed_charges = proforma.interest_expense[i] + total_principal
            if fixed_charges > 0:
                fixed_charge_coverage.append(proforma.ebitda[i] / fixed_charges)
            else:
                fixed_charge_coverage.append(float('inf'))
        
        # Covenant thresholds (use most restrictive from debt tranches)
        max_leverage_covenant = min(tranche.covenants.get("max_leverage", 10.0) for tranche in debt_schedule)
        min_interest_coverage_covenant = max(tranche.covenants.get("min_interest_coverage", 1.0) for tranche in debt_schedule)
        
        # Check for breaches
        leverage_breach = [ratio > max_leverage_covenant for ratio in debt_to_ebitda]
        coverage_breach = [ratio < min_interest_coverage_covenant for ratio in interest_coverage]
        
        return CovenantMetrics(
            years=years,
            debt_to_ebitda=debt_to_ebitda,
            senior_debt_to_ebitda=senior_debt_to_ebitda,
            interest_coverage=interest_coverage,
            ebitda_coverage=ebitda_coverage,
            fixed_charge_coverage=fixed_charge_coverage,
            max_leverage_covenant=max_leverage_covenant,
            min_interest_coverage_covenant=min_interest_coverage_covenant,
            leverage_breach=leverage_breach,
            coverage_breach=coverage_breach
        )
    
    def get_covenant_summary(self, covenant_metrics: CovenantMetrics) -> Dict[str, Any]:
        """Get covenant summary."""
        return {
            "leverage_profile": {
                "entry_leverage": covenant_metrics.debt_to_ebitda[0] if covenant_metrics.debt_to_ebitda else 0,
                "exit_leverage": covenant_metrics.debt_to_ebitda[-1] if covenant_metrics.debt_to_ebitda else 0,
                "max_leverage": max(covenant_metrics.debt_to_ebitda) if covenant_metrics.debt_to_ebitda else 0,
                "covenant_limit": covenant_metrics.max_leverage_covenant
            },
            "coverage_profile": {
                "min_interest_coverage": min(covenant_metrics.interest_coverage) if covenant_metrics.interest_coverage else 0,
                "covenant_limit": covenant_metrics.min_interest_coverage_covenant,
                "avg_coverage": sum(covenant_metrics.interest_coverage) / len(covenant_metrics.interest_coverage) if covenant_metrics.interest_coverage else 0
            },
            "breach_analysis": {
                "leverage_breaches": sum(covenant_metrics.leverage_breach),
                "coverage_breaches": sum(covenant_metrics.coverage_breach),
                "total_breaches": sum(covenant_metrics.leverage_breach) + sum(covenant_metrics.coverage_breach)
            }
        }
