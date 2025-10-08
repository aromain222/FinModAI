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
                    # Handle both old object format and new dictionary format
                    if hasattr(tranche, 'tranche_type'):
                        tranche_type = tranche.tranche_type.value
                        outstanding_balance = tranche.outstanding_balance
                    else:
                        tranche_type = tranche.get('tranche_type', '')
                        outstanding_balance = tranche.get('outstanding_balance', [])
                    
                    if tranche_type in ["term_loan_a", "revolver"]:
                        senior_debt += outstanding_balance[i] if i < len(outstanding_balance) else 0
                
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
            total_principal = 0
            for tranche in debt_schedule:
                # Handle both old object format and new dictionary format
                if hasattr(tranche, 'principal_payments'):
                    principal_payments = tranche.principal_payments
                    cash_sweep_payments = getattr(tranche, 'cash_sweep_payments', [0] * len(principal_payments))
                else:
                    principal_payments = tranche.get('principal_payments', [])
                    cash_sweep_payments = tranche.get('cash_sweep_payments', [0] * len(principal_payments))
                
                if i < len(principal_payments):
                    total_principal += principal_payments[i] + (cash_sweep_payments[i] if i < len(cash_sweep_payments) else 0)
            fixed_charges = proforma.interest_expense[i] + total_principal
            if fixed_charges > 0:
                fixed_charge_coverage.append(proforma.ebitda[i] / fixed_charges)
            else:
                fixed_charge_coverage.append(float('inf'))
        
        # Covenant thresholds (use most restrictive from debt tranches)
        if debt_schedule:
            max_leverage_covenant = min(
                tranche.covenants.get("max_leverage", 10.0) if hasattr(tranche, 'covenants') 
                else tranche.get('covenants', {}).get("max_leverage", 10.0) 
                for tranche in debt_schedule
            )
            min_interest_coverage_covenant = max(
                tranche.covenants.get("min_interest_coverage", 1.0) if hasattr(tranche, 'covenants')
                else tranche.get('covenants', {}).get("min_interest_coverage", 1.0)
                for tranche in debt_schedule
            )
        else:
            # Default covenants if no debt schedule
            max_leverage_covenant = 5.0
            min_interest_coverage_covenant = 2.0
        
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
