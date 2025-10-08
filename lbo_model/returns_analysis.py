"""
Returns Analysis Module - Calculates IRR, MOIC, and exit valuation.
"""

from typing import Dict, Any, List
import math
from .contracts import LBOAssumptions, ProFormaFinancials, DebtTranche, ReturnsAnalysis


class ReturnsAnalysisModule:
    """Calculates returns analysis and exit valuation."""
    
    def calculate_returns(self, assumptions: LBOAssumptions, proforma: ProFormaFinancials, debt_schedule: List[DebtTranche]) -> ReturnsAnalysis:
        """
        Calculate returns analysis.
        
        Args:
            assumptions: LBO assumptions
            proforma: Pro forma financials
            debt_schedule: Debt schedule
            
        Returns:
            ReturnsAnalysis object
        """
        # Exit valuation
        exit_year_idx = len(proforma.years) - 1
        exit_ebitda = proforma.ebitda[exit_year_idx]
        exit_multiple = assumptions.exit_multiple
        exit_enterprise_value = exit_ebitda * exit_multiple
        
        # Calculate exit net debt
        exit_total_debt = proforma.total_debt[exit_year_idx]
        exit_cash = proforma.cash[exit_year_idx]
        exit_net_debt = exit_total_debt - exit_cash
        
        # Exit equity value
        exit_equity_value = exit_enterprise_value - exit_net_debt
        
        # Sponsor returns
        sponsor_equity_invested = assumptions.entry_ebitda * assumptions.sponsor_equity_multiple
        management_rollover = assumptions.entry_ebitda * assumptions.sponsor_equity_multiple * assumptions.management_rollover_pct
        total_equity_invested = sponsor_equity_invested + management_rollover
        
        # Ownership split
        sponsor_ownership_pct = sponsor_equity_invested / total_equity_invested
        management_ownership_pct = management_rollover / total_equity_invested
        
        sponsor_equity_exit_value = exit_equity_value * sponsor_ownership_pct
        management_equity_value = exit_equity_value * management_ownership_pct
        
        # Calculate MOIC
        sponsor_moic = sponsor_equity_exit_value / sponsor_equity_invested
        management_moic = management_equity_value / management_rollover
        
        # Calculate IRR
        holding_period = assumptions.holding_period
        sponsor_irr = self._calculate_irr(sponsor_equity_invested, sponsor_equity_exit_value, holding_period)
        management_irr = self._calculate_irr(management_rollover, management_equity_value, holding_period)
        
        # Debt returns
        debt_irr_by_tranche = {}
        weighted_average_debt_irr = 0
        total_debt_invested = 0
        
        for tranche in debt_schedule:
            # Handle both old object format and new dictionary format
            if hasattr(tranche, 'initial_amount'):
                debt_invested = tranche.initial_amount
                debt_exit_value = tranche.outstanding_balance[-1] if tranche.outstanding_balance else 0
                tranche_name = tranche.name
            else:
                debt_invested = tranche.get('initial_amount', 0)
                debt_exit_value = tranche.get('outstanding_balance', [0])[-1] if tranche.get('outstanding_balance') else 0
                tranche_name = tranche.get('name', 'Unknown Tranche')
            
            # Calculate debt IRR (simplified - assumes bullet payment)
            if debt_invested > 0:
                debt_irr = self._calculate_debt_irr(tranche, holding_period)
                debt_irr_by_tranche[tranche_name] = debt_irr
                
                weighted_average_debt_irr += debt_irr * debt_invested
                total_debt_invested += debt_invested
        
        if total_debt_invested > 0:
            weighted_average_debt_irr /= total_debt_invested
        
        return ReturnsAnalysis(
            exit_ebitda=exit_ebitda,
            exit_multiple=exit_multiple,
            exit_enterprise_value=exit_enterprise_value,
            exit_net_debt=exit_net_debt,
            exit_equity_value=exit_equity_value,
            sponsor_equity_invested=sponsor_equity_invested,
            sponsor_equity_exit_value=sponsor_equity_exit_value,
            sponsor_moic=sponsor_moic,
            sponsor_irr=sponsor_irr,
            debt_irr_by_tranche=debt_irr_by_tranche,
            weighted_average_debt_irr=weighted_average_debt_irr,
            management_equity_value=management_equity_value,
            management_moic=management_moic,
            management_irr=management_irr
        )
    
    def _calculate_irr(self, initial_investment: float, exit_value: float, years: int) -> float:
        """Calculate IRR using simple formula."""
        if initial_investment <= 0 or exit_value <= 0:
            return 0.0
        
        return (exit_value / initial_investment) ** (1 / years) - 1
    
    def _calculate_debt_irr(self, tranche, years: int) -> float:
        """Calculate debt IRR considering interest payments and principal."""
        # Handle both old object format and new dictionary format
        if hasattr(tranche, 'outstanding_balance'):
            outstanding_balance = tranche.outstanding_balance
            interest_expense = tranche.interest_expense
            initial_amount = tranche.initial_amount
        else:
            outstanding_balance = tranche.get('outstanding_balance', [])
            interest_expense = tranche.get('interest_expense', [])
            initial_amount = tranche.get('initial_amount', 0)
        
        if not outstanding_balance or len(outstanding_balance) == 0:
            return 0.0
        
        # Simplified calculation - assumes interest payments and final principal
        total_interest = sum(interest_expense)
        final_principal = outstanding_balance[-1] if outstanding_balance else 0
        total_return = total_interest + final_principal
        
        return self._calculate_irr(initial_amount, total_return, years)
