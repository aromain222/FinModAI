"""
LBO Analysis for Canada Goose (GOOS)
"""

import asyncio
import pandas as pd
import numpy as np
from datetime import datetime
from typing import Dict, Any
from dataclasses import dataclass
from decimal import Decimal

@dataclass
class LBOAssumptions:
    """LBO model assumptions"""
    # Purchase assumptions
    purchase_multiple: float = 12.0  # EV/EBITDA multiple
    transaction_fees: float = 0.02   # 2% of EV
    minimum_equity: float = 0.35     # 35% equity minimum
    
    # Debt assumptions
    term_loan_spread: float = 0.0375  # L + 375bps
    revolver_spread: float = 0.0325   # L + 325bps
    libor_rate: float = 0.0525        # 5.25% base rate
    required_dcr: float = 1.25        # Minimum debt coverage ratio
    
    # Exit assumptions
    exit_year: int = 5
    exit_multiple: float = 11.0  # Conservative exit multiple
    
    # Operating assumptions
    revenue_growth: float = 0.08      # 8% annual growth
    ebitda_margin: float = 0.22      # 22% EBITDA margin
    capex_percent: float = 0.04      # 4% of revenue
    nwc_percent: float = 0.20        # 20% of revenue
    tax_rate: float = 0.25           # 25% tax rate

class LBOModel:
    """LBO model implementation"""
    
    def __init__(self, financials: Dict[str, Any], assumptions: LBOAssumptions):
        self.financials = financials
        self.assumptions = assumptions
        self.model_output = {}
        
    def calculate_purchase_price(self) -> Dict[str, float]:
        """Calculate purchase price and structure"""
        ebitda = self.financials["ebitda_ltm"]
        enterprise_value = ebitda * self.assumptions.purchase_multiple
        transaction_fees = enterprise_value * self.assumptions.transaction_fees
        total_debt = self.financials["total_debt"]
        
        # Calculate minimum equity check
        required_equity = enterprise_value * self.assumptions.minimum_equity
        
        # Calculate sources and uses
        sources_uses = {
            "Sources": {
                "Term Loan": min(ebitda * 4.5, enterprise_value * 0.4),  # Max 4.5x EBITDA or 40% EV
                "Revolver": min(ebitda * 1.0, enterprise_value * 0.1),   # Max 1.0x EBITDA or 10% EV
                "Equity": required_equity
            },
            "Uses": {
                "Purchase Equity": enterprise_value - total_debt,
                "Refinance Existing Debt": total_debt,
                "Transaction Fees": transaction_fees
            }
        }
        
        # Adjust equity to balance sources and uses
        total_uses = sum(sources_uses["Uses"].values())
        total_sources_excl_equity = sum(v for k, v in sources_uses["Sources"].items() if k != "Equity")
        sources_uses["Sources"]["Equity"] = max(
            required_equity,
            total_uses - total_sources_excl_equity
        )
        
        return {
            "enterprise_value": enterprise_value,
            "purchase_equity": enterprise_value - total_debt,
            "transaction_fees": transaction_fees,
            "sources_uses": sources_uses,
            "total_uses": total_uses
        }
        
    def project_financials(self) -> Dict[str, pd.DataFrame]:
        """Project financial statements"""
        # Initialize projection dataframes
        years = range(self.assumptions.exit_year + 1)
        
        # Income statement projections
        income_stmt = pd.DataFrame(index=years)
        income_stmt.loc[0, "revenue"] = self.financials["revenue_ltm"]
        income_stmt.loc[0, "ebitda"] = self.financials["ebitda_ltm"]
        
        # Project revenue and EBITDA
        for year in years[1:]:
            income_stmt.loc[year, "revenue"] = (
                income_stmt.loc[year-1, "revenue"] * 
                (1 + self.assumptions.revenue_growth)
            )
            income_stmt.loc[year, "ebitda"] = (
                income_stmt.loc[year, "revenue"] * 
                self.assumptions.ebitda_margin
            )
            
        # Calculate other metrics
        for year in years:
            # CapEx
            income_stmt.loc[year, "capex"] = (
                income_stmt.loc[year, "revenue"] * 
                self.assumptions.capex_percent
            )
            
            # Net Working Capital
            income_stmt.loc[year, "nwc"] = (
                income_stmt.loc[year, "revenue"] * 
                self.assumptions.nwc_percent
            )
            
            # NWC Change
            if year > 0:
                income_stmt.loc[year, "nwc_change"] = (
                    income_stmt.loc[year, "nwc"] - 
                    income_stmt.loc[year-1, "nwc"]
                )
            else:
                income_stmt.loc[year, "nwc_change"] = 0
                
        return {
            "income_stmt": income_stmt
        }
        
    def calculate_debt_schedule(self, purchase_price: Dict[str, float], 
                              projections: Dict[str, pd.DataFrame]) -> pd.DataFrame:
        """Calculate debt schedule and interest"""
        years = range(self.assumptions.exit_year + 1)
        debt = pd.DataFrame(index=years)
        
        # Initial debt balances
        debt.loc[0, "term_loan"] = purchase_price["sources_uses"]["Sources"]["Term Loan"]
        debt.loc[0, "revolver"] = purchase_price["sources_uses"]["Sources"]["Revolver"]
        
        # Interest rates
        term_rate = self.assumptions.libor_rate + self.assumptions.term_loan_spread
        revolver_rate = self.assumptions.libor_rate + self.assumptions.revolver_spread
        
        # Calculate debt service
        income_stmt = projections["income_stmt"]
        
        for year in years[1:]:
            # Calculate available cash flow
            ebitda = income_stmt.loc[year, "ebitda"]
            capex = income_stmt.loc[year, "capex"]
            nwc_change = income_stmt.loc[year, "nwc_change"]
            
            available_cf = ebitda - capex - nwc_change
            
            # Calculate required debt service
            prev_term = debt.loc[year-1, "term_loan"]
            prev_rev = debt.loc[year-1, "revolver"]
            
            term_interest = prev_term * term_rate
            rev_interest = prev_rev * revolver_rate
            
            # Required principal payments (20% per year for term loan)
            required_term_payment = prev_term * 0.20
            
            # Check debt service coverage
            total_required = term_interest + rev_interest + required_term_payment
            coverage_ratio = available_cf / total_required
            
            if coverage_ratio < self.assumptions.required_dcr:
                # Reduce debt paydown to meet coverage ratio
                available_for_debt = available_cf / self.assumptions.required_dcr
                required_term_payment = (
                    available_for_debt - term_interest - rev_interest
                )
                
            # Update balances
            debt.loc[year, "term_loan"] = prev_term - required_term_payment
            debt.loc[year, "revolver"] = prev_rev  # Assume revolver stays outstanding
            
            # Record interest
            debt.loc[year, "term_interest"] = term_interest
            debt.loc[year, "rev_interest"] = rev_interest
            debt.loc[year, "total_interest"] = term_interest + rev_interest
            
        return debt
        
    def calculate_returns(self, purchase_price: Dict[str, float],
                         projections: Dict[str, pd.DataFrame],
                         debt_schedule: pd.DataFrame) -> Dict[str, float]:
        """Calculate investment returns"""
        # Exit assumptions
        exit_year = self.assumptions.exit_year
        exit_ebitda = projections["income_stmt"].loc[exit_year, "ebitda"]
        exit_ev = exit_ebitda * self.assumptions.exit_multiple
        
        # Exit equity value
        exit_debt = (
            debt_schedule.loc[exit_year, "term_loan"] +
            debt_schedule.loc[exit_year, "revolver"]
        )
        exit_equity = exit_ev - exit_debt
        
        # Initial equity
        initial_equity = purchase_price["sources_uses"]["Sources"]["Equity"]
        
        # Calculate returns
        equity_multiple = exit_equity / initial_equity
        
        # IRR calculation
        cashflows = [-initial_equity]  # Initial investment
        # Add any interim cash flows here if needed
        cashflows.append(exit_equity)  # Exit proceeds
        
        irr = np.irr(cashflows)
        
        return {
            "exit_enterprise_value": exit_ev,
            "exit_equity_value": exit_equity,
            "equity_multiple": equity_multiple,
            "irr": irr,
            "exit_leverage": exit_debt / exit_ebitda
        }
        
    def run_model(self) -> Dict[str, Any]:
        """Run complete LBO analysis"""
        # Step 1: Calculate purchase price
        purchase_price = self.calculate_purchase_price()
        
        # Step 2: Project financials
        projections = self.project_financials()
        
        # Step 3: Calculate debt schedule
        debt_schedule = self.calculate_debt_schedule(purchase_price, projections)
        
        # Step 4: Calculate returns
        returns = self.calculate_returns(purchase_price, projections, debt_schedule)
        
        # Compile output
        self.model_output = {
            "purchase_price": purchase_price,
            "projections": projections,
            "debt_schedule": debt_schedule,
            "returns": returns,
            "assumptions": self.assumptions
        }
        
        return self.model_output

async def run_goos_lbo():
    """Run LBO analysis for GOOS"""
    try:
        # Get real financial data
        from backend.providers.polygon_provider import PolygonProvider
        polygon = PolygonProvider()
        
        # Get latest financials
        financials = await polygon.get_financials("GOOS")
        
        # Create assumptions
        assumptions = LBOAssumptions()
        
        # Run model
        model = LBOModel(financials, assumptions)
        output = model.run_model()
        
        # Print summary
        print("\nCanada Goose (GOOS) LBO Analysis")
        print("=" * 40)
        
        print("\nPurchase Summary:")
        print(f"Enterprise Value: ${output['purchase_price']['enterprise_value']/1e6:.1f}M")
        print(f"Equity Check: ${output['purchase_price']['sources_uses']['Sources']['Equity']/1e6:.1f}M")
        print(f"Total Debt: ${(output['purchase_price']['sources_uses']['Sources']['Term Loan'] + output['purchase_price']['sources_uses']['Sources']['Revolver'])/1e6:.1f}M")
        
        print("\nProjected Metrics (Year 5):")
        print(f"Revenue: ${output['projections']['income_stmt'].loc[5, 'revenue']/1e6:.1f}M")
        print(f"EBITDA: ${output['projections']['income_stmt'].loc[5, 'ebitda']/1e6:.1f}M")
        
        print("\nReturns:")
        print(f"Exit Enterprise Value: ${output['returns']['exit_enterprise_value']/1e6:.1f}M")
        print(f"Equity Multiple: {output['returns']['equity_multiple']:.2f}x")
        print(f"IRR: {output['returns']['irr']*100:.1f}%")
        print(f"Exit Leverage: {output['returns']['exit_leverage']:.2f}x")
        
        return output
        
    except Exception as e:
        print(f"Error running LBO analysis: {e}")
        return None

if __name__ == "__main__":
    asyncio.run(run_goos_lbo())
