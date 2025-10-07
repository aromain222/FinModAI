"""
LBO Assumptions Module - Processes and validates LBO assumptions.
"""

from typing import Dict, Any
from .contracts import LBOAssumptions


class LBOAssumptionsModule:
    """Processes LBO assumptions with validation and defaults."""
    
    def process_assumptions(self, assumptions_input: Dict[str, Any]) -> LBOAssumptions:
        """
        Process and validate LBO assumptions.
        
        Args:
            assumptions_input: Raw assumptions dictionary
            
        Returns:
            Validated LBOAssumptions object
        """
        # Extract and validate assumptions
        entry_year = assumptions_input.get("entry_year", 2024)
        entry_ebitda = float(assumptions_input.get("entry_ebitda", 100_000_000))
        entry_multiple = float(assumptions_input.get("entry_multiple", 8.0))
        existing_debt = float(assumptions_input.get("existing_debt", 50_000_000))
        existing_cash = float(assumptions_input.get("existing_cash", 10_000_000))
        
        # Exit assumptions
        holding_period = int(assumptions_input.get("holding_period", 5))
        exit_year = entry_year + holding_period
        exit_multiple = float(assumptions_input.get("exit_multiple", 10.0))
        
        # Leverage structure
        senior_debt_multiple = float(assumptions_input.get("senior_debt_multiple", 4.0))
        mezzanine_debt_multiple = float(assumptions_input.get("mezzanine_debt_multiple", 1.5))
        sponsor_equity_multiple = float(assumptions_input.get("sponsor_equity_multiple", 2.5))
        
        # Interest rates
        senior_debt_rate = float(assumptions_input.get("senior_debt_rate", 0.06))
        mezzanine_debt_rate = float(assumptions_input.get("mezzanine_debt_rate", 0.12))
        revolver_rate = float(assumptions_input.get("revolver_rate", 0.05))
        
        # Transaction costs
        advisory_fees = float(assumptions_input.get("advisory_fees", 5_000_000))
        financing_fees = float(assumptions_input.get("financing_fees", 3_000_000))
        other_fees = float(assumptions_input.get("other_fees", 2_000_000))
        
        # Operating assumptions
        revenue_growth = assumptions_input.get("revenue_growth", [0.05, 0.05, 0.05, 0.05, 0.05])
        ebitda_margin = assumptions_input.get("ebitda_margin", [0.25, 0.25, 0.25, 0.25, 0.25])
        capex_pct_revenue = float(assumptions_input.get("capex_pct_revenue", 0.05))
        nwc_pct_revenue = float(assumptions_input.get("nwc_pct_revenue", 0.10))
        tax_rate = float(assumptions_input.get("tax_rate", 0.25))
        depreciation_rate = float(assumptions_input.get("depreciation_rate", 0.05))
        
        # Management & rollover
        management_rollover_pct = float(assumptions_input.get("management_rollover_pct", 0.10))
        management_incentive_pct = float(assumptions_input.get("management_incentive_pct", 0.20))
        
        # Validate assumptions
        self._validate_assumptions(
            entry_multiple, exit_multiple, senior_debt_multiple, 
            mezzanine_debt_multiple, sponsor_equity_multiple
        )
        
        return LBOAssumptions(
            entry_year=entry_year,
            entry_ebitda=entry_ebitda,
            entry_multiple=entry_multiple,
            existing_debt=existing_debt,
            existing_cash=existing_cash,
            exit_year=exit_year,
            exit_multiple=exit_multiple,
            holding_period=holding_period,
            senior_debt_multiple=senior_debt_multiple,
            mezzanine_debt_multiple=mezzanine_debt_multiple,
            sponsor_equity_multiple=sponsor_equity_multiple,
            senior_debt_rate=senior_debt_rate,
            mezzanine_debt_rate=mezzanine_debt_rate,
            revolver_rate=revolver_rate,
            advisory_fees=advisory_fees,
            financing_fees=financing_fees,
            other_fees=other_fees,
            revenue_growth=revenue_growth,
            ebitda_margin=ebitda_margin,
            capex_pct_revenue=capex_pct_revenue,
            nwc_pct_revenue=nwc_pct_revenue,
            tax_rate=tax_rate,
            depreciation_rate=depreciation_rate,
            management_rollover_pct=management_rollover_pct,
            management_incentive_pct=management_incentive_pct
        )
    
    def _validate_assumptions(
        self, 
        entry_multiple: float, 
        exit_multiple: float,
        senior_debt_multiple: float,
        mezzanine_debt_multiple: float,
        sponsor_equity_multiple: float
    ):
        """Validate assumption ranges."""
        # Entry multiple validation
        if entry_multiple < 3.0 or entry_multiple > 20.0:
            raise ValueError(f"Entry multiple {entry_multiple:.1f}x outside reasonable range (3.0x - 20.0x)")
        
        # Exit multiple validation
        if exit_multiple < 3.0 or exit_multiple > 20.0:
            raise ValueError(f"Exit multiple {exit_multiple:.1f}x outside reasonable range (3.0x - 20.0x)")
        
        # Leverage validation
        total_leverage = senior_debt_multiple + mezzanine_debt_multiple
        if total_leverage < 1.0 or total_leverage > 8.0:
            raise ValueError(f"Total leverage {total_leverage:.1f}x outside reasonable range (1.0x - 8.0x)")
        
        # Equity validation
        if sponsor_equity_multiple < 0.5 or sponsor_equity_multiple > 5.0:
            raise ValueError(f"Sponsor equity {sponsor_equity_multiple:.1f}x outside reasonable range (0.5x - 5.0x)")
        
        # Total capitalization check
        total_cap = total_leverage + sponsor_equity_multiple
        if abs(total_cap - entry_multiple) > 0.1:
            raise ValueError(f"Total capitalization {total_cap:.1f}x doesn't match entry multiple {entry_multiple:.1f}x")
