"""
Revised LBO Analysis for Canada Goose (GOOS)
Using more conservative assumptions based on latest financials
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List
import pandas as pd
import numpy as np
import numpy_financial as npf
from datetime import datetime

from goos_lbo_standalone import LBOModel, format_currency

@dataclass
class RevisedLBOAssumptions:
    """Revised LBO model assumptions"""
    # Purchase assumptions
    purchase_multiple: float = 9.0   # Lower multiple given current market
    transaction_fees: float = 0.02   # 2% of EV
    minimum_equity: float = 0.40     # 40% equity given higher risk
    
    # Debt assumptions
    term_loan_spread: float = 0.0425  # L + 425bps (higher spread)
    revolver_spread: float = 0.0375   # L + 375bps
    libor_rate: float = 0.0525        # 5.25% base rate
    required_dcr: float = 1.35        # Higher coverage requirement
    
    # Exit assumptions
    exit_year: int = 5
    exit_multiple: float = 8.5    # Conservative exit multiple
    
    # Operating assumptions
    revenue_growth: float = 0.06      # 6% average growth
    ebitda_margin: float = 0.115      # Target 11.5% margin
    capex_percent: float = 0.05      # 5% of revenue (including digital)
    nwc_percent: float = 0.25        # 25% (retail/DTC business)
    tax_rate: float = 0.25           # 25% tax rate

def run_revised_lbo():
    """Run revised LBO analysis"""
    try:
        # Get financial data
        print("\nFetching GOOS financial data...")
        from goos_test_data import GOOS_FINANCIALS
        financials = GOOS_FINANCIALS
        
        print("\nCurrent Metrics:")
        print(f"Revenue: {format_currency(financials['revenue_ltm'])}")
        print(f"EBITDA: {format_currency(financials['ebitda_ltm'])} ({financials['ebitda_ltm']/financials['revenue_ltm']*100:.1f}% margin)")
        print(f"Total Debt: {format_currency(financials['total_debt'])} ({financials['total_debt']/financials['ebitda_ltm']:.1f}x EBITDA)")
        print(f"Market Cap: {format_currency(financials['market_cap'])}")
        print(f"Enterprise Value: {format_currency(financials['market_cap'] + financials['total_debt'] - financials['cash'])}")
        
        # Create assumptions
        assumptions = RevisedLBOAssumptions()
        
        # Run model
        print("\nRunning LBO analysis with revised assumptions...")
        model = LBOModel(financials, assumptions)
        output = model.run_model()
        
        # Print detailed analysis
        print("\nCanada Goose (GOOS) LBO Analysis - Revised")
        print("=" * 50)
        
        print("\nValuation Summary:")
        print(f"Current EV/EBITDA: {(financials['market_cap'] + financials['total_debt'] - financials['cash'])/financials['ebitda_ltm']:.1f}x")
        print(f"Purchase Multiple: {assumptions.purchase_multiple:.1f}x")
        print(f"Purchase Enterprise Value: {format_currency(output['purchase_price']['enterprise_value'])}")
        
        print("\nCapital Structure:")
        total_sources = sum(output['purchase_price']['sources_uses']['Sources'].values())
        for source, amount in output['purchase_price']['sources_uses']['Sources'].items():
            print(f"{source}: {format_currency(amount)} ({amount/total_sources*100:.1f}%)")
        
        print("\nLeverage Profile:")
        initial_leverage = (output['purchase_price']['sources_uses']['Sources']['Term Loan'] + 
                          output['purchase_price']['sources_uses']['Sources']['Revolver']) / financials['ebitda_ltm']
        print(f"Initial Leverage: {initial_leverage:.2f}x EBITDA")
        print(f"Exit Leverage: {output['returns']['exit_leverage']:.2f}x EBITDA")
        
        print("\nOperational Improvements:")
        print("Target EBITDA Margin: {:.1f}%".format(assumptions.ebitda_margin * 100))
        print("Revenue Growth Rate: {:.1f}%".format(assumptions.revenue_growth * 100))
        
        print("\nProjected Metrics (Year 5):")
        print(f"Revenue: {format_currency(output['projections']['income_stmt'].loc[5, 'revenue'])}")
        print(f"EBITDA: {format_currency(output['projections']['income_stmt'].loc[5, 'ebitda'])}")
        print(f"EBITDA Margin: {output['projections']['income_stmt'].loc[5, 'ebitda']/output['projections']['income_stmt'].loc[5, 'revenue']*100:.1f}%")
        
        print("\nDebt Paydown:")
        print("Term Loan:")
        for year in range(6):
            print(f"Year {year}: {format_currency(output['debt_schedule'].loc[year, 'term_loan'])} " +
                  f"({output['debt_schedule'].loc[year, 'term_loan']/output['projections']['income_stmt'].loc[year, 'ebitda']:.2f}x)")
        
        print("\nCredit Stats (Year 5):")
        final_ebitda = output['projections']['income_stmt'].loc[5, 'ebitda']
        final_debt = output['debt_schedule'].loc[5, 'term_loan'] + output['debt_schedule'].loc[5, 'revolver']
        print(f"EBITDA: {format_currency(final_ebitda)}")
        print(f"Total Debt: {format_currency(final_debt)}")
        print(f"Leverage: {final_debt/final_ebitda:.2f}x")
        
        print("\nReturns Analysis:")
        print(f"Exit Enterprise Value: {format_currency(output['returns']['exit_enterprise_value'])} ({assumptions.exit_multiple:.1f}x EBITDA)")
        print(f"Exit Equity Value: {format_currency(output['returns']['exit_equity_value'])}")
        print(f"Initial Equity: {format_currency(output['purchase_price']['sources_uses']['Sources']['Equity'])}")
        print(f"Equity Multiple: {output['returns']['equity_multiple']:.2f}x")
        print(f"IRR: {output['returns']['irr']*100:.1f}%")
        
        print("\nKey Assumptions:")
        print(f"Purchase Multiple: {assumptions.purchase_multiple:.1f}x")
        print(f"Exit Multiple: {assumptions.exit_multiple:.1f}x")
        print(f"Debt Pricing: L+{assumptions.term_loan_spread*100:.0f}bps (TL), L+{assumptions.revolver_spread*100:.0f}bps (RCF)")
        print(f"Base Rate: {assumptions.libor_rate*100:.2f}%")
        
        return output
        
    except Exception as e:
        print(f"Error running revised LBO analysis: {e}")
        return None

if __name__ == "__main__":
    run_revised_lbo()
