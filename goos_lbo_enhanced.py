"""
Enhanced LBO Analysis for Canada Goose (GOOS)
Using validated data and assumptions
"""

import asyncio
import os
from backend.models_data.lbo_validator import CompanyMetrics, MarketConditions
from backend.models_data.lbo_model import LBOModelInputs, EnhancedLBOModel
from backend.models_data.lbo_data_provider import LBODataProvider

async def run_enhanced_goos_lbo():
    """Run enhanced LBO analysis for GOOS"""
    try:
        # Initialize data provider
        data_provider = LBODataProvider(
            polygon_key=os.getenv("POLYGON_API_KEY", ""),
            alpha_vantage_key=os.getenv("ALPHAVANTAGE_API_KEY", ""),
            finnhub_key=os.getenv("FINNHUB_API_KEY", "")
        )
        
        try:
            # Fetch real company data
            print("\nFetching real-time GOOS data...")
            company = await data_provider.get_company_metrics("GOOS")
        except Exception as e:
            print(f"Error fetching real data: {e}")
            print("Using cached test data...")
            # Use cached test data as fallback
            company = CompanyMetrics(
                ticker="GOOS",
                revenue_ltm=1428.0e6,   # $1.428B (FY2023)
                ebitda_ltm=106.8e6,     # $106.8M (7.48% margin)
                total_debt=374.8e6,     # $374.8M
                cash=287.7e6,           # $287.7M
                market_cap=1350.0e6,    # $1.35B
                current_price=13.54,    # $13.54
                shares_outstanding=104.83e6,  # 104.83M shares
                revenue_growth_3yr=0.08,  # 8% historical growth
                ebitda_margin_3yr_avg=0.075,  # 7.5% historical margin
                industry_revenue_growth=0.06,  # 6% industry growth
                industry_ebitda_margin=0.11,   # 11% industry margin
                industry_ev_ebitda=9.5         # 9.5x industry multiple
            )
        
        # Get current market conditions
        market = MarketConditions(
            risk_free_rate=0.0525,  # 5.25% treasury
            market_risk_premium=0.06,  # 6% equity premium
            high_yield_spread=0.05,  # 500bps spread
            leverage_loan_spread=0.0425,  # 425bps spread
            typical_leverage=4.5,  # 4.5x EBITDA
            typical_equity_portion=0.45  # 45% equity
        )
        
        # Create validated model inputs
        inputs = LBOModelInputs(
            company=company,
            market=market,
            purchase_multiple=9.0,   # Below current 13.5x
            revenue_growth=0.06,     # Conservative growth
            ebitda_margin=0.115,     # Target margin improvement
            exit_multiple=8.5,       # Conservative exit
            exit_year=5,
            minimum_equity=0.40,     # Higher equity given retail exposure
            term_loan_spread=0.0425, # L + 425bps
            revolver_spread=0.0375,  # L + 375bps
            capex_percent=0.05,      # 5% of revenue
            nwc_percent=0.25,        # 25% for retail/DTC
            tax_rate=0.25            # 25% tax rate
        )
        
        # Run enhanced model
        print("\nRunning enhanced LBO analysis...")
        model = EnhancedLBOModel(inputs)
        results = model.run_model()
        
        # Print detailed analysis
        print("\nCanada Goose (GOOS) - Enhanced LBO Analysis")
        print("=" * 50)
        
        print("\nCurrent Metrics:")
        print(f"Revenue: ${company.revenue_ltm/1e6:.1f}M")
        print(f"EBITDA: ${company.ebitda_ltm/1e6:.1f}M ({company.ebitda_ltm/company.revenue_ltm*100:.1f}% margin)")
        print(f"Total Debt: ${company.total_debt/1e6:.1f}M ({company.total_debt/company.ebitda_ltm:.1f}x EBITDA)")
        print(f"Market Cap: ${company.market_cap/1e6:.1f}M")
        print(f"Enterprise Value: ${(company.market_cap + company.total_debt - company.cash)/1e6:.1f}M")
        
        print("\nTransaction Summary:")
        pp = results["purchase_price"]
        print(f"Purchase Multiple: {inputs.purchase_multiple:.1f}x")
        print(f"Enterprise Value: ${pp['enterprise_value']/1e6:.1f}M")
        
        print("\nCapital Structure:")
        sources = pp["sources_uses"]["Sources"]
        total = sum(sources.values())
        for source, amount in sources.items():
            print(f"{source}: ${amount/1e6:.1f}M ({amount/total*100:.1f}%)")
        
        print("\nCredit Statistics:")
        initial_leverage = (sources["Term Loan"] + sources["Revolver"]) / company.ebitda_ltm
        print(f"Initial Leverage: {initial_leverage:.2f}x")
        print(f"Exit Leverage: {results['returns']['exit_leverage']:.2f}x")
        
        print("\nOperational Improvements:")
        print(f"Revenue Growth: {inputs.revenue_growth*100:.1f}% per year")
        print(f"EBITDA Margin: {company.ebitda_ltm/company.revenue_ltm*100:.1f}% to {inputs.ebitda_margin*100:.1f}%")
        
        print("\nProjected Metrics (Year 5):")
        proj = results["projections"]["income_stmt"]
        print(f"Revenue: ${proj.loc[5, 'revenue']/1e6:.1f}M")
        print(f"EBITDA: ${proj.loc[5, 'ebitda']/1e6:.1f}M")
        print(f"EBITDA Margin: {proj.loc[5, 'ebitda']/proj.loc[5, 'revenue']*100:.1f}%")
        
        print("\nDebt Paydown Schedule:")
        ds = results["debt_schedule"]
        for year in range(6):
            total_debt = ds.loc[year, "term_loan"] + ds.loc[year, "revolver"]
            leverage = total_debt / proj.loc[year, "ebitda"]
            print(f"Year {year}: ${total_debt/1e6:.1f}M ({leverage:.2f}x)")
        
        print("\nReturns Analysis:")
        returns = results["returns"]
        print(f"Exit Enterprise Value: ${returns['exit_enterprise_value']/1e6:.1f}M")
        print(f"Exit Equity Value: ${returns['exit_equity_value']/1e6:.1f}M")
        print(f"Equity Multiple: {returns['equity_multiple']:.2f}x")
        print(f"IRR: {returns['irr']*100:.1f}%")
        
        print("\nSensitivity Analysis:")
        sens = results["sensitivity"]
        
        print("\nExit Multiple Sensitivity (IRR):")
        for mult, irr in sens["exit_multiple_irr"].items():
            print(f"{mult}x: {irr*100:.1f}%")
        
        print("\nEBITDA Margin Sensitivity (IRR):")
        for margin, irr in sens["margin_irr"].items():
            print(f"{margin}: {irr*100:.1f}%")
        
        print("\nRevenue Growth Sensitivity (IRR):")
        for growth, irr in sens["growth_irr"].items():
            print(f"{growth}: {irr*100:.1f}%")
        
    except Exception as e:
        print(f"Error running enhanced LBO analysis: {e}")
    finally:
        await data_provider.close()

if __name__ == "__main__":
    asyncio.run(run_enhanced_goos_lbo())
