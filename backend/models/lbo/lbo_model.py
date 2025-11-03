"""
Core LBO (Leveraged Buyout) Modeling Engine.

This module contains the primary class for building and calculating a full LBO model,
including sources & uses, pro-forma financials, debt schedules, and returns analysis.
"""
from dataclasses import dataclass, field
from typing import Dict, Any, List

# --- Data Structures for Inputs and Outputs ---

@dataclass
class LBOInputs:
    """Structured inputs for the LBO model."""
    # Target Financials
    ebitda: float
    net_debt: float
    
    # Entry & Exit Assumptions
    entry_multiple: float  # EV/EBITDA
    exit_multiple: float   # EV/EBITDA
    
    # Financing Structure (% of total capital)
    equity_financing_percent: float
    debt_financing_percent: float
    
    # Operating Projections
    revenue_growth_rate: float
    ebitda_margin: float
    holding_period_years: int = 5

@dataclass
class LBOReturns:
    """Structured outputs for the LBO model's return metrics."""
    irr: float  # Internal Rate of Return
    mom: float  # Multiple of Money
    entry_enterprise_value: float
    exit_enterprise_value: float
    entry_equity: float
    exit_equity: float

# --- Core Modeling Class ---

class LBOModel:
    """
    A class to perform a full LBO analysis.
    """
    def __init__(self, inputs: LBOInputs):
        self.inputs = inputs
        self.assumptions = self._prepare_assumptions()
        self.sources_and_uses = {}
        self.pro_forma_statements = {}
        self.returns: LBOReturns = None

    def _prepare_assumptions(self) -> Dict[str, Any]:
        """Prepare detailed assumptions from high-level inputs."""
        entry_ev = self.inputs.ebitda * self.inputs.entry_multiple
        
        return {
            "entry_enterprise_value": entry_ev,
            "entry_equity_value": entry_ev - self.inputs.net_debt,
            "equity_contribution": entry_ev * (self.inputs.equity_financing_percent / 100),
            "debt_contribution": entry_ev * (self.inputs.debt_financing_percent / 100),
        }

    def _calculate_sources_and_uses(self):
        """Build the sources and uses of funds table."""
        # This is a simplified version. A full model would have more detail.
        uses = {
            "purchase_equity": self.assumptions["entry_equity_value"],
            "refinance_debt": self.inputs.net_debt,
            "fees_and_expenses": self.assumptions["entry_enterprise_value"] * 0.02, # Assume 2%
        }
        total_uses = sum(uses.values())

        sources = {
            "sponsor_equity": self.assumptions["equity_contribution"],
            "new_lbo_debt": total_uses - self.assumptions["equity_contribution"],
        }
        
        self.sources_and_uses = {"sources": sources, "uses": uses, "total": total_uses}
        print("Calculated Sources & Uses:", self.sources_and_uses)

    def _project_financials(self):
        """Project financials over the holding period (stubbed for now)."""
        # In a real model, this would be a complex projection of IS, BS, and CFS.
        # For now, we will create a simplified cash flow projection.
        print("Projecting financials (simplified)...")
        # Placeholder for complex logic
        self.pro_forma_statements = {"status": "projection_stub"}

    def _calculate_returns(self):
        """Calculate the final IRR and MoM returns."""
        # This is a simplified version. A real model depends on projected cash flows.
        exit_ebitda_projection = self.inputs.ebitda * ((1 + self.inputs.revenue_growth_rate) ** self.inputs.holding_period_years)
        exit_ev = exit_ebitda_projection * self.inputs.exit_multiple
        
        # Assume debt is paid down by 50% for this simplified model
        ending_debt = self.sources_and_uses["sources"]["new_lbo_debt"] * 0.5
        exit_equity = exit_ev - ending_debt
        
        entry_equity = self.sources_and_uses["sources"]["sponsor_equity"]
        
        # Simplified IRR calculation (assumes all equity in at T0, all out at T_end)
        mom = exit_equity / entry_equity if entry_equity > 0 else 0
        irr = (mom ** (1 / self.inputs.holding_period_years)) - 1 if mom > 0 else 0
        
        self.returns = LBOReturns(
            irr=irr * 100, # As percentage
            mom=mom,
            entry_enterprise_value=self.assumptions["entry_enterprise_value"],
            exit_enterprise_value=exit_ev,
            entry_equity=entry_equity,
            exit_equity=exit_equity
        )
        print("Calculated Returns:", self.returns)

    def run(self) -> Dict[str, Any]:
        """
        Run all steps of the LBO model calculation.
        """
        self._calculate_sources_and_uses()
        self._project_financials()
        self._calculate_returns()
        
        return {
            "inputs": self.inputs,
            "assumptions": self.assumptions,
            "sources_and_uses": self.sources_and_uses,
            "returns": self.returns,
        }

if __name__ == '__main__':
    # --- Example Usage ---
    example_inputs = LBOInputs(
        ebitda=100_000_000,
        net_debt=200_000_000,
        entry_multiple=10.0,
        exit_multiple=10.0,
        equity_financing_percent=40.0,
        debt_financing_percent=60.0,
        revenue_growth_rate=0.05,
        ebitda_margin=0.20,
    )

    lbo_model = LBOModel(example_inputs)
    results = lbo_model.run()

    import json
    print("\n--- LBO Model Results ---")
    print(json.dumps(results, indent=2, default=lambda o: o.__dict__))
