"""
Debt Schedule Module - Detailed debt tranche modeling with cash sweep logic.
"""

from typing import Dict, Any, List
from .contracts import LBOAssumptions, ProFormaFinancials, DebtTranche, DebtTrancheType


class DebtScheduleModule:
    """Builds detailed debt schedule with cash sweep logic."""
    
    def build_debt_schedule(self, assumptions: LBOAssumptions, proforma: ProFormaFinancials) -> List[DebtTranche]:
        """
        Build detailed debt schedule.
        
        Args:
            assumptions: LBO assumptions
            proforma: Pro forma financials
            
        Returns:
            List of DebtTranche objects
        """
        debt_tranches = []
        
        # Senior Debt (Term Loan A)
        senior_debt_amount = assumptions.entry_ebitda * assumptions.senior_debt_multiple
        senior_tranche = DebtTranche(
            name="Senior Term Loan A",
            tranche_type=DebtTrancheType.TERM_LOAN_A,
            initial_amount=senior_debt_amount,
            interest_rate=assumptions.senior_debt_rate,
            amortization_schedule=[senior_debt_amount * 0.20] * 5,  # 20% per year
            interest_only_periods=0,
            covenants={"max_leverage": 4.0, "min_interest_coverage": 2.5}
        )
        debt_tranches.append(senior_tranche)
        
        # Mezzanine Debt
        mezzanine_amount = assumptions.entry_ebitda * assumptions.mezzanine_debt_multiple
        mezzanine_tranche = DebtTranche(
            name="Mezzanine Debt",
            tranche_type=DebtTrancheType.MEZZANINE,
            initial_amount=mezzanine_amount,
            interest_rate=assumptions.mezzanine_debt_rate,
            amortization_schedule=[0] * 4 + [mezzanine_amount],  # Bullet payment
            interest_only_periods=4,
            covenants={"max_leverage": 5.0, "min_interest_coverage": 2.0}
        )
        debt_tranches.append(mezzanine_tranche)
        
        # Revolver
        revolver_amount = assumptions.entry_ebitda * 0.5
        revolver_tranche = DebtTranche(
            name="Revolver",
            tranche_type=DebtTrancheType.REVOLVER,
            initial_amount=revolver_amount,
            interest_rate=assumptions.revolver_rate,
            amortization_schedule=[0] * 5,  # No scheduled amortization
            interest_only_periods=5,
            covenants={"max_leverage": 4.5, "min_interest_coverage": 2.5}
        )
        debt_tranches.append(revolver_tranche)
        
        # Calculate debt schedules
        self._calculate_debt_schedules(debt_tranches, proforma, assumptions)
        
        return debt_tranches
    
    def _calculate_debt_schedules(self, debt_tranches: List[DebtTranche], proforma: ProFormaFinancials, assumptions: LBOAssumptions):
        """Calculate detailed debt schedules with cash sweep logic."""
        n_years = len(proforma.years)
        
        # Initialize outstanding balances
        for tranche in debt_tranches:
            tranche.outstanding_balance = [tranche.initial_amount] + [0] * (n_years - 1)
            tranche.interest_expense = [0] * n_years
            tranche.principal_payments = [0] * n_years
            tranche.cash_sweep_payments = [0] * n_years
        
        # Calculate year by year
        for year_idx in range(n_years):
            # Calculate interest expense
            for tranche in debt_tranches:
                if tranche.outstanding_balance[year_idx] > 0:
                    tranche.interest_expense[year_idx] = tranche.outstanding_balance[year_idx] * tranche.interest_rate
            
            # Update proforma interest expense
            total_interest = sum(tranche.interest_expense[year_idx] for tranche in debt_tranches)
            proforma.interest_expense[year_idx] = total_interest
            
            # Recalculate pretax income and tax
            proforma.pretax_income[year_idx] = proforma.ebit[year_idx] - total_interest
            proforma.tax_expense[year_idx] = proforma.pretax_income[year_idx] * assumptions.tax_rate
            proforma.net_income[year_idx] = proforma.pretax_income[year_idx] - proforma.tax_expense[year_idx]
            
            # Calculate mandatory principal payments
            for tranche in debt_tranches:
                if year_idx < len(tranche.amortization_schedule):
                    tranche.principal_payments[year_idx] = tranche.amortization_schedule[year_idx]
            
            # Calculate free cash flow available for debt paydown
            if year_idx > 0:
                fcf = proforma.free_cash_flow[year_idx]
                mandatory_payments = sum(tranche.principal_payments[year_idx] for tranche in debt_tranches)
                excess_cash = fcf - mandatory_payments
                
                # Cash sweep logic (pay down highest cost debt first)
                if excess_cash > 0:
                    # Sort by interest rate (highest first)
                    sorted_tranches = sorted(debt_tranches, key=lambda t: t.interest_rate, reverse=True)
                    
                    remaining_cash = excess_cash
                    for tranche in sorted_tranches:
                        if remaining_cash <= 0:
                            break
                        
                        available_to_pay = min(remaining_cash, tranche.outstanding_balance[year_idx])
                        tranche.cash_sweep_payments[year_idx] = available_to_pay
                        remaining_cash -= available_to_pay
            
            # Update outstanding balances for next year
            if year_idx < n_years - 1:
                for tranche in debt_tranches:
                    total_payment = tranche.principal_payments[year_idx] + tranche.cash_sweep_payments[year_idx]
                    tranche.outstanding_balance[year_idx + 1] = max(0, tranche.outstanding_balance[year_idx] - total_payment)
            
            # Update proforma debt repayments
            total_repayments = sum(tranche.principal_payments[year_idx] + tranche.cash_sweep_payments[year_idx] for tranche in debt_tranches)
            proforma.debt_repayments[year_idx] = total_repayments
            
            # Update total debt
            proforma.total_debt[year_idx] = sum(tranche.outstanding_balance[year_idx] for tranche in debt_tranches)
            
            # Update cash
            if year_idx > 0:
                proforma.cash[year_idx] = proforma.cash[year_idx-1] + proforma.net_change_in_cash[year_idx]
