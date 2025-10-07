"""
Example usage of the financial data engine.
"""

import json
from financial_data import build_company_assumptions

def main():
    """Run example."""
    print("Building assumptions for Microsoft (MSFT)...")
    msft_assumptions = build_company_assumptions("MSFT")
    
    if "error" in msft_assumptions:
        print(f"Error: {msft_assumptions['message']}")
        print(f"Provider attempts: {msft_assumptions['provider_attempts']}")
    else:
        print("\nAssumptions Summary:")
        print(f"Ticker: {msft_assumptions['ticker']}")
        print(f"Company: {msft_assumptions['company_name']}")
        print(f"Currency: {msft_assumptions['currency']}")
        
        print("\nRevenue Growth Path:")
        growth_path = msft_assumptions['assumptions']['revenue_growth']
        for i, growth in enumerate(growth_path):
            print(f"Year {i+1}: {growth:.1%}")
        
        print("\nOperating Margin Path:")
        margin_path = msft_assumptions['assumptions']['operating_margin']
        for i, margin in enumerate(margin_path):
            print(f"Year {i+1}: {margin:.1%}")
        
        print("\nOther Assumptions:")
        print(f"D&A % Revenue: {msft_assumptions['assumptions']['da_pct_rev']:.1%}")
        print(f"CapEx % Revenue: {msft_assumptions['assumptions']['capex_pct_rev']:.1%}")
        print(f"NWC % Revenue: {msft_assumptions['assumptions']['nwc_pct_rev']:.1%}")
        print(f"Tax Rate: {msft_assumptions['assumptions']['tax_rate']:.1%}")
        
        print("\nWACC Components:")
        print(f"Risk-Free Rate: {msft_assumptions['wacc']['rf']:.2%}")
        print(f"Equity Risk Premium: {msft_assumptions['wacc']['erp']:.2%}")
        print(f"Beta: {msft_assumptions['wacc']['beta']:.2f}")
        print(f"Cost of Equity: {msft_assumptions['wacc']['ke']:.2%}")
        print(f"Pre-Tax Cost of Debt: {msft_assumptions['wacc']['kd_pre']:.2%}")
        print(f"After-Tax Cost of Debt: {msft_assumptions['wacc']['kd_after']:.2%}")
        print(f"Debt Weight: {msft_assumptions['wacc']['wd']:.2%}")
        print(f"Equity Weight: {msft_assumptions['wacc']['we']:.2%}")
        print(f"WACC: {msft_assumptions['wacc']['wacc']:.2%}")
        
        print("\nTerminal Value Parameters:")
        print(f"Method: {msft_assumptions['terminal']['method']}")
        print(f"Terminal Growth: {msft_assumptions['terminal']['g']:.2%}")
        print(f"EV/EBITDA Multiple: {msft_assumptions['terminal']['ev_ebitda']:.1f}x")
        
        print("\nData Provenance:")
        for key, value in msft_assumptions['provenance'].items():
            print(f"{key}: {value['source']} (as of {value['as_of']})")
        
        print("\nFlags:")
        if msft_assumptions['flags']:
            for flag in msft_assumptions['flags']:
                print(f"- {flag}")
        else:
            print("No flags")
    
    print("\nBuilding assumptions for Apple (AAPL)...")
    aapl_assumptions = build_company_assumptions("AAPL")
    
    if "error" in aapl_assumptions:
        print(f"Error: {aapl_assumptions['message']}")
        print(f"Provider attempts: {aapl_assumptions['provider_attempts']}")
    else:
        print("\nAssumptions Summary:")
        print(f"Ticker: {aapl_assumptions['ticker']}")
        print(f"Company: {aapl_assumptions['company_name']}")
        print(f"Currency: {aapl_assumptions['currency']}")
        
        print("\nRevenue Growth Path:")
        growth_path = aapl_assumptions['assumptions']['revenue_growth']
        for i, growth in enumerate(growth_path):
            print(f"Year {i+1}: {growth:.1%}")
        
        print("\nWACC: {:.2%}".format(aapl_assumptions['wacc']['wacc']))
        print(f"Terminal Growth: {aapl_assumptions['terminal']['g']:.2%}")
        
        print("\nFlags:")
        if aapl_assumptions['flags']:
            for flag in aapl_assumptions['flags']:
                print(f"- {flag}")
        else:
            print("No flags")

if __name__ == "__main__":
    main()
