"""
Investment Analysis Example for GOOS
"""

import asyncio
import json
from datetime import datetime
from backend.models_data.lbo_validator import CompanyMetrics, MarketConditions
from backend.models_data.investment_analyzer import InvestmentAnalyzer

def format_currency(amount: float) -> str:
    """Format currency in billions/millions"""
    if abs(amount) >= 1e9:
        return f"${amount/1e9:.1f}B"
    return f"${amount/1e6:.1f}M"

def format_percent(value: float) -> str:
    """Format percentage"""
    return f"{value*100:.1f}%"

async def run_goos_analysis():
    """Run comprehensive investment analysis for GOOS"""
    try:
        # Create company metrics
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
        
        # Create market conditions
        market = MarketConditions(
            risk_free_rate=0.0525,  # 5.25% treasury
            market_risk_premium=0.06,  # 6% equity premium
            high_yield_spread=0.05,  # 500bps spread
            leverage_loan_spread=0.0425,  # 425bps spread
            typical_leverage=4.5,  # 4.5x EBITDA
            typical_equity_portion=0.45  # 45% equity
        )
        
        # Run analysis
        analyzer = InvestmentAnalyzer(company, market)
        report = analyzer.analyze()
        
        # Print detailed report
        print("\nCanada Goose (GOOS) - Investment Analysis Report")
        print("=" * 50)
        
        print("\nCurrent Metrics:")
        print(f"Revenue: {format_currency(company.revenue_ltm)}")
        print(f"EBITDA: {format_currency(company.ebitda_ltm)} ({format_percent(company.ebitda_ltm/company.revenue_ltm)} margin)")
        print(f"Market Cap: {format_currency(company.market_cap)}")
        
        print("\nSeasonality Analysis:")
        if report["seasonality"]["is_seasonal"]:
            print("High Seasonality Detected")
            print(f"Peak Quarters: {', '.join(f'Q{q}' for q in report['seasonality']['peak_quarters'])}")
            print(f"Trough Quarters: {', '.join(f'Q{q}' for q in report['seasonality']['trough_quarters'])}")
        
        print("\nCompetitive Position:")
        comp = report["competitive_position"]
        print(f"Market Share: {format_percent(comp['market_share'])}")
        print(f"Brand Strength: {comp['brand_strength'].title()}")
        print("Key Competitors:")
        for competitor in comp["key_competitors"]:
            print(f"- {competitor}")
        
        print("\nMacro Exposure:")
        macro = report["macro_factors"]
        print("\nGeographic Concentration:")
        for region, exposure in macro["geographic_exposure"].items():
            print(f"- {region}: {format_percent(exposure)}")
        print(f"Recession Sensitivity: {format_percent(macro['recession_sensitivity'])} (Higher = More Sensitive)")
        
        print("\nInvestment Scores:")
        scores = report["investment_score"]["components"]
        print(f"Financial Health: {scores['financial_health']:.1f}/100")
        print(f"Market Position: {scores['market_position']:.1f}/100")
        print(f"Growth Potential: {scores['growth_potential']:.1f}/100")
        print(f"Risk Profile: {scores['risk_profile']:.1f}/100")
        print(f"Management Quality: {scores['management_quality']:.1f}/100")
        
        print(f"\nTotal Investment Score: {report['investment_score']['total']:.1f}/100")
        print(f"Recommendation: {report['investment_score']['recommendation']}")
        
        print("\nKey Analysis Points:")
        for point in report["analysis_points"]:
            print(f"- {point}")
        
        # Save report to file
        filename = f"goos_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)
        print(f"\nDetailed report saved to {filename}")
        
    except Exception as e:
        print(f"Error running investment analysis: {e}")

if __name__ == "__main__":
    asyncio.run(run_goos_analysis())
