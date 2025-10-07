"""
Purchase Price Allocation Module - Handles PPA and adjusted balance sheet.
"""

from typing import Dict, Any
from .contracts import LBOAssumptions, SourcesUses, PurchasePriceAllocation


class PurchasePriceAllocationModule:
    """Handles Purchase Price Allocation and adjusted balance sheet."""
    
    def calculate_ppa(self, assumptions: LBOAssumptions, sources_uses: SourcesUses) -> PurchasePriceAllocation:
        """
        Calculate Purchase Price Allocation.
        
        Args:
            assumptions: LBO assumptions
            sources_uses: Sources and Uses calculation
            
        Returns:
            PurchasePriceAllocation object
        """
        # Calculate enterprise value and purchase price
        enterprise_value = assumptions.entry_ebitda * assumptions.entry_multiple
        equity_purchase_price = sources_uses.equity_purchase_price
        net_debt_adjustment = assumptions.existing_debt - assumptions.existing_cash
        
        # Purchase price allocation
        # Assume 80% goodwill, 20% intangible assets
        goodwill = equity_purchase_price * 0.80
        intangible_assets = equity_purchase_price * 0.20
        
        # Deferred tax liability (assume 25% tax rate on step-up)
        deferred_tax_liability = intangible_assets * assumptions.tax_rate
        
        # Adjusted balance sheet
        adjusted_cash = assumptions.existing_cash
        adjusted_debt = sources_uses.senior_debt + sources_uses.mezzanine_debt
        adjusted_equity = sources_uses.sponsor_equity + sources_uses.management_rollover
        
        return PurchasePriceAllocation(
            enterprise_value=enterprise_value,
            equity_purchase_price=equity_purchase_price,
            net_debt_adjustment=net_debt_adjustment,
            goodwill=goodwill,
            intangible_assets=intangible_assets,
            deferred_tax_liability=deferred_tax_liability,
            adjusted_cash=adjusted_cash,
            adjusted_debt=adjusted_debt,
            adjusted_equity=adjusted_equity
        )
