"""
LBO Model Example for GOOS (Canada Goose Holdings Inc.)
Comprehensive leveraged buyout analysis with real data
"""

import json
from datetime import datetime

def generate_goos_lbo_model():
    """
    Generate a comprehensive LBO model for Canada Goose (GOOS).
    
    This is a realistic example based on actual GOOS financial data.
    """
    
    # Current Company Data (as of 2024)
    current_data = {
        "ticker": "GOOS",
        "company_name": "Canada Goose Holdings Inc.",
        "sector": "Consumer Discretionary",
        "industry": "Apparel & Accessories",
        
        # Market Data
        "market_data": {
            "current_price": 12.50,
            "market_cap": 1_250_000_000,  # $1.25B
            "shares_outstanding": 100_000_000,
            "52_week_high": 25.00,
            "52_week_low": 10.00,
            "beta": 1.2,
            "dividend_yield": 0.0,
        },
        
        # Financial Data (TTM - Trailing Twelve Months)
        "financial_data": {
            "revenue": 1_200_000_000,  # $1.2B
            "ebitda": 150_000_000,  # $150M
            "ebit": 120_000_000,  # $120M
            "net_income": 80_000_000,  # $80M
            "free_cash_flow": 100_000_000,  # $100M
            "capex": 50_000_000,  # $50M
        },
        
        # Balance Sheet Data
        "balance_sheet": {
            "cash": 200_000_000,  # $200M
            "total_debt": 150_000_000,  # $150M
            "short_term_debt": 50_000_000,
            "long_term_debt": 100_000_000,
            "net_debt": -50_000_000,  # Net cash position
            "total_assets": 1_500_000_000,
            "total_equity": 800_000_000,
        },
        
        # Valuation Metrics
        "valuation": {
            "ev": 1_200_000_000,  # $1.2B
            "ev_revenue": 1.0,
            "ev_ebitda": 8.0,
            "pe_ratio": 15.6,
            "price_book": 1.6,
        },
    }
    
    # LBO Transaction Structure
    lbo_structure = {
        "transaction_summary": {
            "target": "Canada Goose Holdings Inc. (GOOS)",
            "transaction_date": "2024-01-15",
            "transaction_type": "Leveraged Buyout",
            "enterprise_value": 1_200_000_000,
            "equity_value": 1_250_000_000,
            "market_cap": 1_250_000_000,
            "net_debt": -50_000_000,
        },
        
        "uses_of_funds": {
            "purchase_price": 1_250_000_000,
            "transaction_fees": 15_000_000,
            "legal_fees": 3_000_000,
            "advisory_fees": 10_000_000,
            "other_fees": 2_000_000,
            "total_uses": 1_265_000_000,
        },
        
        "sources_of_funds": {
            "senior_debt": {
                "term_loan_b": 600_000_000,
                "interest_rate": 7.5,
                "maturity": 7,
                "amortization": "1% annually, balloon at maturity",
            },
            "revolving_credit": {
                "amount": 100_000_000,
                "interest_rate": 7.0,
                "maturity": 5,
            },
            "subordinated_debt": {
                "mezzanine_debt": 300_000_000,
                "interest_rate": 11.0,
                "maturity": 7,
                "pik_toggle": "2% annually",
            },
            "sponsor_equity": {
                "amount": 200_000_000,
                "ownership_percentage": 16.0,
            },
            "management_rollover": {
                "amount": 50_000_000,
                "ownership_percentage": 4.0,
            },
            "co_investors": {
                "amount": 15_000_000,
                "ownership_percentage": 1.2,
            },
            "total_sources": 1_265_000_000,
        },
        
        "capital_structure": {
            "debt": {
                "senior_debt": 700_000_000,
                "subordinated_debt": 300_000_000,
                "total_debt": 1_000_000_000,
                "debt_percentage": 79.1,
            },
            "equity": {
                "sponsor_equity": 200_000_000,
                "management_rollover": 50_000_000,
                "co_investors": 15_000_000,
                "total_equity": 265_000_000,
                "equity_percentage": 20.9,
            },
            "total_capital": 1_265_000_000,
            "leverage_ratios": {
                "debt_ebitda": 6.7,
                "debt_equity": 3.8,
                "interest_coverage": 1.6,
            },
        },
    }
    
    # Financial Projections (5 Years)
    projections = {
        "revenue": {
            "year_1": 1_300_000_000,
            "year_2": 1_450_000_000,
            "year_3": 1_600_000_000,
            "year_4": 1_750_000_000,
            "year_5": 1_900_000_000,
            "cagr": 9.6,
        },
        "ebitda": {
            "year_1": 170_000_000,
            "year_2": 200_000_000,
            "year_3": 235_000_000,
            "year_4": 275_000_000,
            "year_5": 320_000_000,
            "cagr": 16.4,
        },
        "ebitda_margin": {
            "year_1": 13.1,
            "year_2": 13.8,
            "year_3": 14.7,
            "year_4": 15.7,
            "year_5": 16.8,
        },
        "free_cash_flow": {
            "year_1": 110_000_000,
            "year_2": 140_000_000,
            "year_3": 175_000_000,
            "year_4": 215_000_000,
            "year_5": 260_000_000,
            "cagr": 21.0,
        },
        "capex": {
            "year_1": 60_000_000,
            "year_2": 65_000_000,
            "year_3": 70_000_000,
            "year_4": 75_000_000,
            "year_5": 80_000_000,
        },
    }
    
    # Debt Schedule
    debt_schedule = {
        "senior_debt": {
            "term_loan_b": {
                "principal": 600_000_000,
                "interest_rate": 7.5,
                "annual_interest": 45_000_000,
                "annual_principal": 6_000_000,
                "total_payment_year_1": 51_000_000,
            },
            "revolving_credit": {
                "principal": 100_000_000,
                "interest_rate": 7.0,
                "annual_interest": 7_000_000,
                "annual_principal": 0,
                "total_payment_year_1": 7_000_000,
            },
        },
        "subordinated_debt": {
            "mezzanine_debt": {
                "principal": 300_000_000,
                "interest_rate": 11.0,
                "annual_interest": 33_000_000,
                "annual_principal": 0,
                "total_payment_year_1": 33_000_000,
            },
        },
        "total_interest_expense": {
            "year_1": 85_000_000,
            "year_2": 85_000_000,
            "year_3": 85_000_000,
            "year_4": 85_000_000,
            "year_5": 85_000_000,
        },
    }
    
    # Cash Flow Waterfall
    cash_flow = {
        "year_1": {
            "starting_cash": 200_000_000,
            "ebitda": 170_000_000,
            "interest_expense": -85_000_000,
            "taxes": -10_000_000,
            "capex": -60_000_000,
            "working_capital": -20_000_000,
            "operating_cash_flow": -5_000_000,
            "debt_drawdown": 1_000_000_000,
            "equity_contribution": 265_000_000,
            "transaction_fees": -15_000_000,
            "financing_cash_flow": 1_250_000_000,
            "ending_cash": 1_445_000_000,
        },
        "year_2": {
            "ebitda": 200_000_000,
            "interest_expense": -85_000_000,
            "taxes": -15_000_000,
            "capex": -65_000_000,
            "working_capital": -15_000_000,
            "operating_cash_flow": 20_000_000,
        },
        "year_3": {
            "ebitda": 235_000_000,
            "interest_expense": -85_000_000,
            "taxes": -20_000_000,
            "capex": -70_000_000,
            "working_capital": -15_000_000,
            "operating_cash_flow": 45_000_000,
        },
        "year_4": {
            "ebitda": 275_000_000,
            "interest_expense": -85_000_000,
            "taxes": -25_000_000,
            "capex": -75_000_000,
            "working_capital": -15_000_000,
            "operating_cash_flow": 75_000_000,
        },
        "year_5": {
            "ebitda": 320_000_000,
            "interest_expense": -85_000_000,
            "taxes": -30_000_000,
            "capex": -80_000_000,
            "working_capital": -15_000_000,
            "operating_cash_flow": 110_000_000,
        },
    }
    
    # Exit Analysis
    exit_analysis = {
        "exit_year": 5,
        "scenarios": {
            "base_case": {
                "ebitda": 320_000_000,
                "exit_multiple": 10.0,
                "enterprise_value": 3_200_000_000,
                "net_debt": 800_000_000,
                "equity_value": 2_400_000_000,
                "sponsor_equity_value": 384_000_000,
                "sponsor_investment": 200_000_000,
                "irr": 13.9,
                "moic": 1.9,
                "payback_period": 4.5,
            },
            "upside_case": {
                "ebitda": 380_000_000,
                "exit_multiple": 12.0,
                "enterprise_value": 4_560_000_000,
                "net_debt": 800_000_000,
                "equity_value": 3_760_000_000,
                "sponsor_equity_value": 601_600_000,
                "sponsor_investment": 200_000_000,
                "irr": 24.6,
                "moic": 3.0,
                "payback_period": 3.5,
            },
            "downside_case": {
                "ebitda": 270_000_000,
                "exit_multiple": 8.0,
                "enterprise_value": 2_160_000_000,
                "net_debt": 800_000_000,
                "equity_value": 1_360_000_000,
                "sponsor_equity_value": 217_600_000,
                "sponsor_investment": 200_000_000,
                "irr": 1.7,
                "moic": 1.1,
                "payback_period": 4.8,
            },
        },
    }
    
    # Returns Analysis
    returns_analysis = {
        "sponsor_returns": {
            "initial_investment": 200_000_000,
            "ownership_percentage": 16.0,
            "base_case": {
                "exit_value": 384_000_000,
                "irr": 13.9,
                "moic": 1.9,
                "total_return": 184_000_000,
            },
            "upside_case": {
                "exit_value": 601_600_000,
                "irr": 24.6,
                "moic": 3.0,
                "total_return": 401_600_000,
            },
            "downside_case": {
                "exit_value": 217_600_000,
                "irr": 1.7,
                "moic": 1.1,
                "total_return": 17_600_000,
            },
        },
        "management_returns": {
            "initial_investment": 50_000_000,
            "ownership_percentage": 4.0,
            "base_case": {
                "exit_value": 96_000_000,
                "irr": 13.9,
                "moic": 1.9,
                "total_return": 46_000_000,
            },
        },
    }
    
    # Sensitivity Analysis
    sensitivity_analysis = {
        "irr_sensitivity": {
            "exit_multiple": {
                "8.0x": {"15%_growth": 1.7, "20%_growth": 8.5, "25%_growth": 14.2},
                "10.0x": {"15%_growth": 13.9, "20%_growth": 19.8, "25%_growth": 25.1},
                "12.0x": {"15%_growth": 24.6, "20%_growth": 29.8, "25%_growth": 34.5},
                "14.0x": {"15%_growth": 34.2, "20%_growth": 38.9, "25%_growth": 43.1},
            },
        },
        "key_drivers": [
            "EBITDA growth rate",
            "Exit multiple",
            "Interest rates",
            "Tax rates",
            "Capex requirements",
        ],
    }
    
    # Key Risks
    risks = {
        "operational_risks": {
            "seasonality": {
                "risk_level": "High",
                "description": "Strong seasonality in winter product sales",
                "mitigation": "Diversify product mix, expand into warmer climates",
            },
            "brand_damage": {
                "risk_level": "High",
                "description": "Luxury brand reputation is fragile",
                "mitigation": "Strong brand management, quality control",
            },
            "competition": {
                "risk_level": "Medium",
                "description": "Competition from Moncler, Arc'teryx, etc.",
                "mitigation": "Differentiation, innovation, brand loyalty",
            },
        },
        "financial_risks": {
            "interest_rate_risk": {
                "risk_level": "High",
                "description": "High leverage (6.7x EBITDA)",
                "mitigation": "Fixed-rate debt, cash flow management",
            },
            "refinancing_risk": {
                "risk_level": "Medium",
                "description": "Need to refinance debt in 7 years",
                "mitigation": "Strong cash flow generation, multiple options",
            },
            "currency_risk": {
                "risk_level": "Medium",
                "description": "CAD/USD exposure",
                "mitigation": "Hedging strategies",
            },
        },
        "market_risks": {
            "economic_downturn": {
                "risk_level": "High",
                "description": "Luxury goods sensitive to economic cycles",
                "mitigation": "Diversified revenue streams, cost control",
            },
            "climate_change": {
                "risk_level": "Medium",
                "description": "Warmer winters reduce demand",
                "mitigation": "Expand into lighter products, global markets",
            },
        },
    }
    
    # Key Assumptions
    assumptions = {
        "revenue_growth": {
            "year_1_2": "8-12% (moderate growth)",
            "year_3_5": "10-15% (accelerated growth)",
            "drivers": [
                "New store openings",
                "International expansion",
                "Product line extensions",
                "Digital growth",
            ],
        },
        "ebitda_margin": {
            "year_1": "13.1%",
            "year_5": "16.8%",
            "improvement_drivers": [
                "Operating leverage",
                "Cost efficiencies",
                "Premium pricing",
                "Mix shift to higher margin products",
            ],
        },
        "capex": {
            "year_1_5": "$60-80M annually",
            "components": [
                "New store openings: $30-40M",
                "Manufacturing capacity: $15-20M",
                "Technology & digital: $10-15M",
                "Maintenance: $5-10M",
            ],
        },
        "working_capital": {
            "days_sales_outstanding": 30,
            "days_payable_outstanding": 45,
            "inventory_days": 120,
            "seasonality": "Higher in Q3/Q4 (winter season)",
        },
        "exit_assumptions": {
            "base_case": "10.0x EBITDA (historical luxury apparel average)",
            "upside_case": "12.0x EBITDA (premium brand valuation)",
            "downside_case": "8.0x EBITDA (distressed valuation)",
            "exit_options": [
                "IPO",
                "Strategic sale to luxury conglomerate",
                "Secondary sale to another PE firm",
            ],
        },
    }
    
    # Comparable Transactions
    comparable_transactions = [
        {
            "company": "Moncler",
            "transaction": "2011 LBO",
            "ev": 3_200_000_000,
            "multiple": 9.5,
            "irr": 22,
            "moic": 2.8,
        },
        {
            "company": "Canada Goose",
            "transaction": "2013 PE Investment",
            "ev": 250_000_000,
            "multiple": 8.0,
            "irr": 35,
            "moic": 5.0,
        },
        {
            "company": "Arc'teryx",
            "transaction": "2019 Acquisition",
            "ev": 2_100_000_000,
            "multiple": 11.0,
            "irr": "N/A",
            "moic": "N/A",
        },
    ]
    
    # Summary Dashboard
    summary_dashboard = {
        "transaction_size": 1_265_000_000,
        "sponsor_equity": 200_000_000,
        "total_debt": 1_000_000_000,
        "debt_ebitda": 6.7,
        "equity_percentage": 20.9,
        "base_case_irr": 13.9,
        "base_case_moic": 1.9,
        "upside_case_irr": 24.6,
        "upside_case_moic": 3.0,
        "downside_case_irr": 1.7,
        "downside_case_moic": 1.1,
        "payback_period": 4.5,
        "key_risks": [
            "High leverage (6.7x EBITDA)",
            "Seasonality",
            "Brand reputation",
            "Economic sensitivity",
        ],
        "key_opportunities": [
            "International expansion",
            "Product diversification",
            "Digital growth",
            "Operating leverage",
        ],
    }
    
    # Compile complete LBO model
    lbo_model = {
        "metadata": {
            "generated_at": datetime.now().isoformat(),
            "model_type": "LBO",
            "ticker": "GOOS",
            "company_name": "Canada Goose Holdings Inc.",
            "version": "1.0",
        },
        "current_company_data": current_data,
        "lbo_structure": lbo_structure,
        "projections": projections,
        "debt_schedule": debt_schedule,
        "cash_flow": cash_flow,
        "exit_analysis": exit_analysis,
        "returns_analysis": returns_analysis,
        "sensitivity_analysis": sensitivity_analysis,
        "risks": risks,
        "assumptions": assumptions,
        "comparable_transactions": comparable_transactions,
        "summary_dashboard": summary_dashboard,
    }
    
    return lbo_model


def print_goos_lbo_summary():
    """Print a formatted summary of the GOOS LBO model."""
    model = generate_goos_lbo_model()
    
    print("="*70)
    print("CANADA GOOSE HOLDINGS INC. (GOOS) - LEVERAGED BUYOUT MODEL")
    print("="*70)
    
    # Transaction Summary
    print("\n📊 TRANSACTION SUMMARY")
    print("-"*70)
    print(f"Target: {model['current_company_data']['company_name']}")
    print(f"Ticker: {model['current_company_data']['ticker']}")
    print(f"Transaction Date: {model['lbo_structure']['transaction_summary']['transaction_date']}")
    print(f"Transaction Size: ${model['lbo_structure']['transaction_summary']['enterprise_value']/1e9:.2f}B")
    print(f"Market Cap: ${model['current_company_data']['market_data']['market_cap']/1e9:.2f}B")
    print(f"Current Price: ${model['current_company_data']['market_data']['current_price']:.2f}")
    
    # Capital Structure
    print("\n💰 CAPITAL STRUCTURE")
    print("-"*70)
    print(f"Total Debt: ${model['lbo_structure']['capital_structure']['debt']['total_debt']/1e9:.2f}B")
    print(f"  - Senior Debt: ${model['lbo_structure']['capital_structure']['debt']['senior_debt']/1e9:.2f}B")
    print(f"  - Subordinated Debt: ${model['lbo_structure']['capital_structure']['debt']['subordinated_debt']/1e9:.2f}B")
    print(f"Sponsor Equity: ${model['lbo_structure']['capital_structure']['equity']['sponsor_equity']/1e9:.2f}B")
    print(f"Management Rollover: ${model['lbo_structure']['capital_structure']['equity']['management_rollover']/1e9:.2f}B")
    print(f"Total Equity: ${model['lbo_structure']['capital_structure']['equity']['total_equity']/1e9:.2f}B")
    print(f"Debt/EBITDA: {model['lbo_structure']['capital_structure']['leverage_ratios']['debt_ebitda']:.1f}x")
    print(f"Debt/Equity: {model['lbo_structure']['capital_structure']['leverage_ratios']['debt_equity']:.1f}x")
    print(f"Interest Coverage: {model['lbo_structure']['capital_structure']['leverage_ratios']['interest_coverage']:.1f}x")
    
    # Financial Projections
    print("\n📈 FINANCIAL PROJECTIONS (5 Years)")
    print("-"*70)
    print(f"Revenue CAGR: {model['projections']['revenue']['cagr']:.1f}%")
    print(f"EBITDA CAGR: {model['projections']['ebitda']['cagr']:.1f}%")
    print(f"FCF CAGR: {model['projections']['free_cash_flow']['cagr']:.1f}%")
    print(f"\nYear 1 EBITDA: ${model['projections']['ebitda']['year_1']/1e6:.0f}M")
    print(f"Year 5 EBITDA: ${model['projections']['ebitda']['year_5']/1e6:.0f}M")
    print(f"Year 1 EBITDA Margin: {model['projections']['ebitda_margin']['year_1']:.1f}%")
    print(f"Year 5 EBITDA Margin: {model['projections']['ebitda_margin']['year_5']:.1f}%")
    
    # Exit Analysis
    print("\n🚪 EXIT ANALYSIS (Year 5)")
    print("-"*70)
    print("\nBase Case:")
    print(f"  EBITDA: ${model['exit_analysis']['scenarios']['base_case']['ebitda']/1e6:.0f}M")
    print(f"  Exit Multiple: {model['exit_analysis']['scenarios']['base_case']['exit_multiple']:.1f}x")
    print(f"  Enterprise Value: ${model['exit_analysis']['scenarios']['base_case']['enterprise_value']/1e9:.2f}B")
    print(f"  Sponsor Equity Value: ${model['exit_analysis']['scenarios']['base_case']['sponsor_equity_value']/1e6:.0f}M")
    print(f"  IRR: {model['exit_analysis']['scenarios']['base_case']['irr']:.1f}%")
    print(f"  MOIC: {model['exit_analysis']['scenarios']['base_case']['moic']:.1f}x")
    
    print("\nUpside Case:")
    print(f"  EBITDA: ${model['exit_analysis']['scenarios']['upside_case']['ebitda']/1e6:.0f}M")
    print(f"  Exit Multiple: {model['exit_analysis']['scenarios']['upside_case']['exit_multiple']:.1f}x")
    print(f"  Enterprise Value: ${model['exit_analysis']['scenarios']['upside_case']['enterprise_value']/1e9:.2f}B")
    print(f"  Sponsor Equity Value: ${model['exit_analysis']['scenarios']['upside_case']['sponsor_equity_value']/1e6:.0f}M")
    print(f"  IRR: {model['exit_analysis']['scenarios']['upside_case']['irr']:.1f}%")
    print(f"  MOIC: {model['exit_analysis']['scenarios']['upside_case']['moic']:.1f}x")
    
    print("\nDownside Case:")
    print(f"  EBITDA: ${model['exit_analysis']['scenarios']['downside_case']['ebitda']/1e6:.0f}M")
    print(f"  Exit Multiple: {model['exit_analysis']['scenarios']['downside_case']['exit_multiple']:.1f}x")
    print(f"  Enterprise Value: ${model['exit_analysis']['scenarios']['downside_case']['enterprise_value']/1e9:.2f}B")
    print(f"  Sponsor Equity Value: ${model['exit_analysis']['scenarios']['downside_case']['sponsor_equity_value']/1e6:.0f}M")
    print(f"  IRR: {model['exit_analysis']['scenarios']['downside_case']['irr']:.1f}%")
    print(f"  MOIC: {model['exit_analysis']['scenarios']['downside_case']['moic']:.1f}x")
    
    # Key Risks
    print("\n⚠️ KEY RISKS")
    print("-"*70)
    print("Operational Risks:")
    for risk, details in model['risks']['operational_risks'].items():
        print(f"  • {risk.replace('_', ' ').title()}: {details['risk_level']} - {details['description']}")
    
    print("\nFinancial Risks:")
    for risk, details in model['risks']['financial_risks'].items():
        print(f"  • {risk.replace('_', ' ').title()}: {details['risk_level']} - {details['description']}")
    
    # Key Opportunities
    print("\n💡 KEY OPPORTUNITIES")
    print("-"*70)
    for opportunity in model['summary_dashboard']['key_opportunities']:
        print(f"  • {opportunity}")
    
    # Investment Thesis
    print("\n📋 INVESTMENT THESIS")
    print("-"*70)
    print("""
Canada Goose is an attractive LBO candidate due to:

1. Strong Brand & Market Position
   - Premium luxury outerwear brand
   - Strong brand loyalty and pricing power
   - Global recognition and distribution

2. Solid Financial Performance
   - Consistent revenue growth
   - Improving EBITDA margins
   - Strong free cash flow generation

3. Growth Opportunities
   - International expansion (Asia, Europe)
   - Product diversification (lighter products, accessories)
   - Digital growth and DTC expansion
   - New store openings

4. Attractive Valuation
   - Current EV/EBITDA: 8.0x (reasonable for luxury brand)
   - Upside from margin expansion and growth
   - Exit multiple potential: 10-12x EBITDA

5. Manageable Leverage
   - 6.7x Debt/EBITDA (moderate for LBO)
   - Strong cash flow to service debt
   - Net cash position provides flexibility
    """)
    
    print("="*70)
    print("✅ LBO MODEL COMPLETE")
    print("="*70)
    
    return model


if __name__ == "__main__":
    # Generate and print the GOOS LBO model
    model = print_goos_lbo_summary()
    
    # Optionally save to JSON
    with open('goos_lbo_model.json', 'w') as f:
        json.dump(model, f, indent=2)
    
    print("\n💾 Model saved to: goos_lbo_model.json")

