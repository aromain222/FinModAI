"""
Equity Waterfall Module - Calculates equity waterfall and distributions.
"""

from typing import Dict, Any
from .contracts import LBOAssumptions, ReturnsAnalysis, EquityWaterfall


class EquityWaterfallModule:
    """Calculates equity waterfall and distribution analysis."""
    
    def calculate_waterfall(self, assumptions: LBOAssumptions, returns: ReturnsAnalysis) -> EquityWaterfall:
        """
        Calculate equity waterfall.
        
        Args:
            assumptions: LBO assumptions
            returns: Returns analysis
            
        Returns:
            EquityWaterfall object
        """
        # Calculate ownership percentages
        sponsor_equity_invested = returns.sponsor_equity_invested
        management_rollover = sponsor_equity_invested * assumptions.management_rollover_pct
        total_equity_invested = sponsor_equity_invested + management_rollover
        
        sponsor_ownership_pct = sponsor_equity_invested / total_equity_invested
        management_ownership_pct = management_rollover / total_equity_invested
        rollover_ownership_pct = 0  # Simplified - no seller rollover
        
        # Exit distributions
        total_exit_proceeds = returns.exit_equity_value
        sponsor_proceeds = total_exit_proceeds * sponsor_ownership_pct
        management_proceeds = total_exit_proceeds * management_ownership_pct
        rollover_proceeds = total_exit_proceeds * rollover_ownership_pct
        
        # Management incentives
        management_carry_pct = assumptions.management_incentive_pct
        management_carry_value = management_proceeds * management_carry_pct
        
        return EquityWaterfall(
            sponsor_ownership_pct=sponsor_ownership_pct,
            management_ownership_pct=management_ownership_pct,
            rollover_ownership_pct=rollover_ownership_pct,
            total_exit_proceeds=total_exit_proceeds,
            sponsor_proceeds=sponsor_proceeds,
            management_proceeds=management_proceeds,
            rollover_proceeds=rollover_proceeds,
            management_carry_pct=management_carry_pct,
            management_carry_value=management_carry_value
        )
    
    def get_waterfall_summary(self, waterfall: EquityWaterfall) -> Dict[str, Any]:
        """Get waterfall summary."""
        return {
            "ownership_structure": {
                "sponsor_pct": waterfall.sponsor_ownership_pct * 100,
                "management_pct": waterfall.management_ownership_pct * 100,
                "rollover_pct": waterfall.rollover_ownership_pct * 100
            },
            "exit_distributions": {
                "sponsor_proceeds": waterfall.sponsor_proceeds,
                "management_proceeds": waterfall.management_proceeds,
                "rollover_proceeds": waterfall.rollover_proceeds,
                "total_proceeds": waterfall.total_exit_proceeds
            },
            "management_incentives": {
                "carry_percentage": waterfall.management_carry_pct * 100,
                "carry_value": waterfall.management_carry_value,
                "management_net_proceeds": waterfall.management_proceeds - waterfall.management_carry_value
            }
        }
