"""
Universal Company Analysis Tool
"""

import asyncio
import os
import json
from datetime import datetime
from backend.models_data.company_analyzer import UniversalAnalyzer

async def analyze_company(ticker: str):
    """Analyze any company"""
    try:
        # Initialize analyzer with API keys
        analyzer = UniversalAnalyzer({
            "polygon": os.getenv("POLYGON_API_KEY", ""),
            "alpha_vantage": os.getenv("ALPHAVANTAGE_API_KEY", ""),
            "finnhub": os.getenv("FINNHUB_API_KEY", "")
        })
        
        # Run analysis
        print(f"\nAnalyzing {ticker}...")
        analysis = await analyzer.analyze_company(ticker)
        
        # Print formatted report
        print(analyzer.format_analysis_report(analysis))
        
        # Save detailed report
        filename = f"{ticker.lower()}_analysis_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, 'w') as f:
            json.dump({
                "ticker": analysis.ticker,
                "name": analysis.name,
                "industry": analysis.industry,
                "sector": analysis.sector,
                "metrics": {
                    "current_price": analysis.current_price,
                    "market_cap": analysis.market_cap,
                    "enterprise_value": analysis.enterprise_value,
                    "revenue_ttm": analysis.revenue_ttm,
                    "ebitda_ttm": analysis.ebitda_ttm,
                    "net_debt": analysis.net_debt
                },
                "growth_and_margins": {
                    "revenue_growth": analysis.revenue_growth,
                    "ebitda_growth": analysis.ebitda_growth,
                    "gross_margin": analysis.gross_margin,
                    "ebitda_margin": analysis.ebitda_margin
                },
                "valuation": {
                    "ev_ebitda": analysis.ev_ebitda,
                    "pe_ratio": analysis.pe_ratio,
                    "pb_ratio": analysis.pb_ratio
                },
                "market_metrics": {
                    "beta": analysis.beta,
                    "institutional_ownership": analysis.institutional_ownership,
                    "short_interest": analysis.short_interest
                },
                "scores": {
                    "financial_health": analysis.financial_health,
                    "market_position": analysis.market_position,
                    "growth_potential": analysis.growth_potential,
                    "risk_profile": analysis.risk_profile,
                    "management_quality": analysis.management_quality,
                    "total_score": analysis.total_score
                },
                "recommendation": {
                    "rating": analysis.recommendation,
                    "target_price": analysis.target_price,
                    "upside_potential": analysis.upside_potential
                },
                "swot_analysis": {
                    "strengths": analysis.strengths,
                    "weaknesses": analysis.weaknesses,
                    "opportunities": analysis.opportunities,
                    "threats": analysis.threats
                },
                "timestamps": {
                    "analysis_date": analysis.analysis_date.isoformat(),
                    "data_as_of": analysis.data_as_of.isoformat()
                }
            }, f, indent=2)
        
        print(f"\nDetailed report saved to {filename}")
        
    except Exception as e:
        print(f"Error analyzing {ticker}: {e}")

def main():
    """Main function"""
    import sys
    
    # Get ticker from command line argument
    if len(sys.argv) != 2:
        print("Usage: python3 analyze_company.py TICKER")
        sys.exit(1)
        
    ticker = sys.argv[1].upper()
    
    # Run analysis
    asyncio.run(analyze_company(ticker))

if __name__ == "__main__":
    main()
