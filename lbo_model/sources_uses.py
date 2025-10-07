"""
Sources & Uses Module - Calculates financing structure and uses of funds.
"""

from typing import Dict, Any
from .contracts import LBOAssumptions, SourcesUses


class SourcesUsesModule:
    """Calculates Sources and Uses of Funds for LBO transaction."""
    
    def calculate_sources_uses(self, assumptions: LBOAssumptions) -> SourcesUses:
        """
        Calculate Sources and Uses of Funds.
        
        Args:
            assumptions: LBO assumptions
            
        Returns:
            SourcesUses object with complete financing structure
        """
        # Calculate enterprise value and purchase price
        enterprise_value = assumptions.entry_ebitda * assumptions.entry_multiple
        equity_purchase_price = enterprise_value - assumptions.existing_debt + assumptions.existing_cash
        
        # Calculate sources
        senior_debt = assumptions.entry_ebitda * assumptions.senior_debt_multiple
        mezzanine_debt = assumptions.entry_ebitda * assumptions.mezzanine_debt_multiple
        revolver = assumptions.entry_ebitda * 0.5  # 0.5x revolver capacity
        
        # Sponsor equity calculation
        sponsor_equity = assumptions.entry_ebitda * assumptions.sponsor_equity_multiple
        
        # Management rollover
        management_rollover = equity_purchase_price * assumptions.management_rollover_pct
        
        # Calculate uses
        debt_repayment = assumptions.existing_debt
        transaction_fees = assumptions.advisory_fees + assumptions.financing_fees + assumptions.other_fees
        cash_to_balance_sheet = assumptions.existing_cash
        
        # Calculate totals
        sources_total = senior_debt + mezzanine_debt + revolver + sponsor_equity + management_rollover
        uses_total = equity_purchase_price + debt_repayment + transaction_fees + cash_to_balance_sheet
        
        # Balance check
        balance_check = sources_total - uses_total
        
        return SourcesUses(
            senior_debt=senior_debt,
            mezzanine_debt=mezzanine_debt,
            revolver=revolver,
            sponsor_equity=sponsor_equity,
            management_rollover=management_rollover,
            equity_purchase_price=equity_purchase_price,
            debt_repayment=debt_repayment,
            transaction_fees=transaction_fees,
            cash_to_balance_sheet=cash_to_balance_sheet,
            sources_total=sources_total,
            uses_total=uses_total,
            balance_check=balance_check
        )
    
    def get_financing_summary(self, sources_uses: SourcesUses) -> Dict[str, Any]:
        """Get financing structure summary."""
        total_sources = sources_uses.sources_total
        
        return {
            "financing_structure": {
                "senior_debt_pct": (sources_uses.senior_debt / total_sources) * 100,
                "mezzanine_debt_pct": (sources_uses.mezzanine_debt / total_sources) * 100,
                "revolver_pct": (sources_uses.revolver / total_sources) * 100,
                "sponsor_equity_pct": (sources_uses.sponsor_equity / total_sources) * 100,
                "management_rollover_pct": (sources_uses.management_rollover / total_sources) * 100
            },
            "leverage_metrics": {
                "total_leverage": (sources_uses.senior_debt + sources_uses.mezzanine_debt) / total_sources,
                "senior_leverage": sources_uses.senior_debt / total_sources,
                "equity_contribution": (sources_uses.sponsor_equity + sources_uses.management_rollover) / total_sources
            },
            "uses_breakdown": {
                "equity_purchase_pct": (sources_uses.equity_purchase_price / sources_uses.uses_total) * 100,
                "debt_repayment_pct": (sources_uses.debt_repayment / sources_uses.uses_total) * 100,
                "transaction_fees_pct": (sources_uses.transaction_fees / sources_uses.uses_total) * 100,
                "cash_to_bs_pct": (sources_uses.cash_to_balance_sheet / sources_uses.uses_total) * 100
            }
        }
