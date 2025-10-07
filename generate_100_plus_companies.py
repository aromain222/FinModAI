#!/usr/bin/env python3
"""
Generate 100+ companies for comprehensive demo data
"""

from datetime import datetime

def generate_company_data(ticker, company_name, sector, base_revenue, growth_rate, margin, beta, wacc):
    """Generate realistic company data based on sector characteristics."""
    
    # Calculate 5 years of historical data
    years = [2024, 2023, 2022, 2021, 2020]
    revenue = [base_revenue * (1 + growth_rate) ** (4-i) for i in range(5)]
    operating_income = [rev * margin for rev in revenue]
    
    # Calculate other metrics
    da = [rev * 0.05 for rev in revenue]  # 5% of revenue
    capex = [rev * 0.06 for rev in revenue]  # 6% of revenue
    delta_nwc = [rev * 0.02 for rev in revenue]  # 2% of revenue
    tax_expense = [op_inc * 0.20 for op_inc in operating_income]  # 20% tax rate
    pretax_income = operating_income.copy()
    interest_expense = [rev * 0.01 for rev in revenue]  # 1% of revenue
    total_debt = [rev * 0.3 for rev in revenue]  # 30% of revenue
    shares_outstanding = [base_revenue / 100] * 5  # Assume $100 per share
    
    # Generate assumptions
    forecast_years = 10
    revenue_growth = [growth_rate * (0.8 ** i) for i in range(10)]  # Declining growth
    operating_margin = [margin + (0.01 * i) for i in range(10)]  # Improving margins
    
    return {
        "ticker": ticker,
        "company_name": company_name,
        "currency": "USD",
        "provenance": {"revenue": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")}},
        "historicals": {
            "years": years,
            "revenue": revenue,
            "operating_income": operating_income,
            "op_margin": [oi / rev for oi, rev in zip(operating_income, revenue)],
            "da": da,
            "capex": capex,
            "delta_nwc": delta_nwc,
            "tax_expense": tax_expense,
            "pretax_income": pretax_income,
            "interest_expense": interest_expense,
            "total_debt": total_debt,
            "shares_outstanding": shares_outstanding
        },
        "assumptions": {
            "forecast_years": forecast_years,
            "revenue_growth": revenue_growth,
            "operating_margin": operating_margin,
            "da_pct_rev": 0.05,
            "capex_pct_rev": 0.06,
            "nwc_pct_rev": 0.02,
            "tax_rate": 0.20
        },
        "wacc": {
            "rf": 0.045,
            "erp": 0.055,
            "beta": beta,
            "ke": 0.045 + beta * 0.055,
            "kd_pre": 0.055,
            "tax": 0.20,
            "wd": 0.20,
            "we": 0.80,
            "kd_after": 0.055 * (1 - 0.20),
            "wacc": wacc
        },
        "terminal": {"method": "perpetuity", "g": 0.025},
        "flags": ["demo_data_used"]
    }

def generate_100_plus_companies():
    """Generate 100+ companies across all sectors."""
    
    companies = {}
    
    # TECH GIANTS (15)
    tech_companies = [
        ("MSFT", "Microsoft Corporation", 245000000000, 0.10, 0.44, 0.9, 0.09),
        ("AAPL", "Apple Inc.", 391000000000, 0.055, 0.31, 1.2, 0.105),
        ("GOOGL", "Alphabet Inc.", 307000000000, 0.095, 0.28, 1.1, 0.10),
        ("AMZN", "Amazon.com, Inc.", 575000000000, 0.12, 0.055, 1.3, 0.105),
        ("META", "Meta Platforms, Inc.", 135000000000, 0.12, 0.345, 1.4, 0.115),
        ("NFLX", "Netflix, Inc.", 34000000000, 0.08, 0.21, 1.2, 0.102),
        ("NVDA", "NVIDIA Corporation", 61000000000, 0.25, 0.58, 1.8, 0.139),
        ("TSLA", "Tesla, Inc.", 97000000000, 0.15, 0.085, 2.0, 0.133),
        ("ORCL", "Oracle Corporation", 50000000000, 0.08, 0.30, 1.0, 0.088),
        ("CRM", "Salesforce, Inc.", 35000000000, 0.12, 0.14, 1.3, 0.110),
        ("ADBE", "Adobe Inc.", 20000000000, 0.10, 0.35, 1.1, 0.095),
        ("INTC", "Intel Corporation", 80000000000, 0.05, 0.20, 1.0, 0.085),
        ("AMD", "Advanced Micro Devices, Inc.", 25000000000, 0.15, 0.25, 1.5, 0.120),
        ("CSCO", "Cisco Systems, Inc.", 60000000000, 0.06, 0.28, 0.9, 0.085),
        ("IBM", "International Business Machines Corporation", 60000000000, 0.03, 0.15, 0.8, 0.075)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in tech_companies:
        companies[ticker] = generate_company_data(ticker, name, "Technology", revenue, growth, margin, beta, wacc)
    
    # FINANCIAL SERVICES (20)
    financial_companies = [
        ("JPM", "JPMorgan Chase & Co.", 150000000000, 0.06, 0.33, 1.1, 0.085),
        ("BAC", "Bank of America Corporation", 100000000000, 0.05, 0.30, 1.2, 0.092),
        ("WFC", "Wells Fargo & Company", 80000000000, 0.04, 0.25, 1.3, 0.100),
        ("GS", "Goldman Sachs Group, Inc.", 60000000000, 0.08, 0.33, 1.4, 0.110),
        ("MS", "Morgan Stanley", 50000000000, 0.08, 0.30, 1.3, 0.100),
        ("C", "Citigroup Inc.", 70000000000, 0.05, 0.26, 1.4, 0.100),
        ("AXP", "American Express Company", 50000000000, 0.08, 0.16, 1.2, 0.090),
        ("V", "Visa Inc.", 30000000000, 0.08, 0.67, 0.9, 0.090),
        ("MA", "Mastercard Incorporated", 25000000000, 0.08, 0.60, 1.0, 0.090),
        ("BLK", "BlackRock, Inc.", 20000000000, 0.08, 0.40, 1.1, 0.095),
        ("SPGI", "S&P Global Inc.", 12000000000, 0.10, 0.35, 1.0, 0.090),
        ("MCO", "Moody's Corporation", 6000000000, 0.08, 0.45, 1.0, 0.090),
        ("ICE", "Intercontinental Exchange, Inc.", 10000000000, 0.06, 0.50, 0.9, 0.085),
        ("CME", "CME Group Inc.", 6000000000, 0.05, 0.60, 0.8, 0.080),
        ("CB", "Chubb Limited", 45000000000, 0.05, 0.20, 0.9, 0.085),
        ("AON", "Aon plc", 12000000000, 0.06, 0.25, 1.0, 0.090),
        ("MMC", "Marsh & McLennan Companies, Inc.", 20000000000, 0.06, 0.25, 1.0, 0.090),
        ("TRV", "The Travelers Companies, Inc.", 40000000000, 0.05, 0.20, 0.9, 0.085),
        ("ALL", "The Allstate Corporation", 50000000000, 0.04, 0.15, 1.0, 0.090),
        ("PRU", "Prudential Financial, Inc.", 60000000000, 0.04, 0.15, 1.1, 0.095)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in financial_companies:
        companies[ticker] = generate_company_data(ticker, name, "Financial", revenue, growth, margin, beta, wacc)
    
    # HEALTHCARE (20)
    healthcare_companies = [
        ("JNJ", "Johnson & Johnson", 95000000000, 0.08, 0.263, 0.7, 0.078),
        ("PFE", "Pfizer Inc.", 80000000000, 0.07, 0.25, 0.8, 0.081),
        ("UNH", "UnitedHealth Group Incorporated", 400000000000, 0.08, 0.075, 0.6, 0.075),
        ("ABBV", "AbbVie Inc.", 60000000000, 0.06, 0.333, 0.9, 0.081),
        ("MRK", "Merck & Co., Inc.", 65000000000, 0.08, 0.277, 0.8, 0.081),
        ("TMO", "Thermo Fisher Scientific Inc.", 45000000000, 0.10, 0.25, 1.0, 0.090),
        ("ABT", "Abbott Laboratories", 40000000000, 0.08, 0.20, 0.8, 0.080),
        ("DHR", "Danaher Corporation", 30000000000, 0.08, 0.25, 1.0, 0.090),
        ("BMY", "Bristol Myers Squibb Company", 45000000000, 0.05, 0.25, 0.8, 0.080),
        ("LLY", "Eli Lilly and Company", 30000000000, 0.12, 0.30, 1.0, 0.090),
        ("GILD", "Gilead Sciences, Inc.", 25000000000, 0.05, 0.35, 1.1, 0.095),
        ("AMGN", "Amgen Inc.", 25000000000, 0.05, 0.40, 1.0, 0.090),
        ("BIIB", "Biogen Inc.", 10000000000, 0.03, 0.30, 1.2, 0.100),
        ("REGN", "Regeneron Pharmaceuticals, Inc.", 12000000000, 0.08, 0.35, 1.1, 0.095),
        ("VRTX", "Vertex Pharmaceuticals Incorporated", 8000000000, 0.15, 0.40, 1.3, 0.110),
        ("ISRG", "Intuitive Surgical, Inc.", 6000000000, 0.12, 0.25, 1.2, 0.100),
        ("ZTS", "Zoetis Inc.", 8000000000, 0.08, 0.30, 1.0, 0.090),
        ("EW", "Edwards Lifesciences Corporation", 6000000000, 0.10, 0.30, 1.1, 0.095),
        ("SYK", "Stryker Corporation", 20000000000, 0.08, 0.20, 1.0, 0.090),
        ("BDX", "Becton, Dickinson and Company", 20000000000, 0.05, 0.15, 0.9, 0.085)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in healthcare_companies:
        companies[ticker] = generate_company_data(ticker, name, "Healthcare", revenue, growth, margin, beta, wacc)
    
    # CONSUMER (20)
    consumer_companies = [
        ("WMT", "Walmart Inc.", 600000000000, 0.04, 0.04, 0.5, 0.065),
        ("PG", "The Procter & Gamble Company", 80000000000, 0.05, 0.22, 0.6, 0.070),
        ("KO", "The Coca-Cola Company", 40000000000, 0.05, 0.25, 0.6, 0.070),
        ("PEP", "PepsiCo, Inc.", 90000000000, 0.06, 0.15, 0.7, 0.075),
        ("MCD", "McDonald's Corporation", 25000000000, 0.05, 0.45, 0.8, 0.080),
        ("NKE", "NIKE, Inc.", 50000000000, 0.08, 0.12, 1.0, 0.090),
        ("SBUX", "Starbucks Corporation", 35000000000, 0.08, 0.15, 1.1, 0.095),
        ("TGT", "Target Corporation", 110000000000, 0.05, 0.06, 0.8, 0.080),
        ("HD", "The Home Depot, Inc.", 160000000000, 0.06, 0.15, 1.0, 0.090),
        ("LOW", "Lowe's Companies, Inc.", 100000000000, 0.05, 0.12, 1.1, 0.095),
        ("COST", "Costco Wholesale Corporation", 240000000000, 0.08, 0.03, 0.7, 0.075),
        ("TJX", "The TJX Companies, Inc.", 50000000000, 0.06, 0.10, 0.9, 0.085),
        ("ROST", "Ross Stores, Inc.", 20000000000, 0.05, 0.12, 1.0, 0.090),
        ("ULTA", "Ulta Beauty, Inc.", 10000000000, 0.08, 0.15, 1.2, 0.100),
        ("LULU", "Lululemon Athletica Inc.", 8000000000, 0.15, 0.20, 1.5, 0.120),
        ("NKE", "NIKE, Inc.", 50000000000, 0.08, 0.12, 1.0, 0.090),
        ("DIS", "The Walt Disney Company", 90000000000, 0.06, 0.15, 1.2, 0.100),
        ("CMCSA", "Comcast Corporation", 120000000000, 0.04, 0.20, 1.1, 0.095),
        ("NFLX", "Netflix, Inc.", 34000000000, 0.08, 0.21, 1.2, 0.102),
        ("CHTR", "Charter Communications, Inc.", 55000000000, 0.03, 0.20, 1.3, 0.110)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in consumer_companies:
        companies[ticker] = generate_company_data(ticker, name, "Consumer", revenue, growth, margin, beta, wacc)
    
    # ENERGY (15)
    energy_companies = [
        ("XOM", "Exxon Mobil Corporation", 400000000000, 0.05, 0.10, 1.2, 0.090),
        ("CVX", "Chevron Corporation", 200000000000, 0.05, 0.12, 1.1, 0.085),
        ("COP", "ConocoPhillips", 80000000000, 0.08, 0.15, 1.3, 0.100),
        ("EOG", "EOG Resources, Inc.", 25000000000, 0.10, 0.20, 1.4, 0.110),
        ("SLB", "Schlumberger Limited", 35000000000, 0.06, 0.15, 1.3, 0.100),
        ("KMI", "Kinder Morgan, Inc.", 20000000000, 0.03, 0.25, 1.0, 0.090),
        ("WMB", "The Williams Companies, Inc.", 12000000000, 0.05, 0.30, 1.1, 0.095),
        ("PSX", "Phillips 66", 150000000000, 0.04, 0.08, 1.2, 0.090),
        ("VLO", "Valero Energy Corporation", 150000000000, 0.03, 0.05, 1.3, 0.100),
        ("MPC", "Marathon Petroleum Corporation", 140000000000, 0.03, 0.06, 1.3, 0.100),
        ("OXY", "Occidental Petroleum Corporation", 30000000000, 0.08, 0.15, 1.4, 0.110),
        ("PXD", "Pioneer Natural Resources Company", 20000000000, 0.10, 0.25, 1.5, 0.120),
        ("HES", "Hess Corporation", 10000000000, 0.12, 0.20, 1.6, 0.130),
        ("DVN", "Devon Energy Corporation", 15000000000, 0.08, 0.18, 1.4, 0.110),
        ("FANG", "Diamondback Energy, Inc.", 8000000000, 0.15, 0.30, 1.7, 0.140)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in energy_companies:
        companies[ticker] = generate_company_data(ticker, name, "Energy", revenue, growth, margin, beta, wacc)
    
    # INDUSTRIAL (15)
    industrial_companies = [
        ("BA", "The Boeing Company", 80000000000, 0.05, 0.08, 1.5, 0.120),
        ("CAT", "Caterpillar Inc.", 60000000000, 0.06, 0.15, 1.2, 0.100),
        ("GE", "General Electric Company", 80000000000, 0.04, 0.10, 1.3, 0.110),
        ("HON", "Honeywell International Inc.", 40000000000, 0.05, 0.20, 1.0, 0.090),
        ("MMM", "3M Company", 35000000000, 0.03, 0.20, 0.9, 0.085),
        ("UPS", "United Parcel Service, Inc.", 100000000000, 0.05, 0.12, 1.1, 0.095),
        ("FDX", "FedEx Corporation", 90000000000, 0.04, 0.08, 1.2, 0.100),
        ("LMT", "Lockheed Martin Corporation", 70000000000, 0.04, 0.12, 0.8, 0.080),
        ("RTX", "Raytheon Technologies Corporation", 70000000000, 0.05, 0.15, 1.0, 0.090),
        ("DE", "Deere & Company", 50000000000, 0.06, 0.18, 1.1, 0.095),
        ("EMR", "Emerson Electric Co.", 20000000000, 0.04, 0.20, 1.0, 0.090),
        ("ITW", "Illinois Tool Works Inc.", 15000000000, 0.04, 0.25, 1.0, 0.090),
        ("ETN", "Eaton Corporation plc", 20000000000, 0.05, 0.15, 1.1, 0.095),
        ("PH", "Parker-Hannifin Corporation", 15000000000, 0.05, 0.18, 1.1, 0.095),
        ("CMI", "Cummins Inc.", 25000000000, 0.05, 0.15, 1.2, 0.100)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in industrial_companies:
        companies[ticker] = generate_company_data(ticker, name, "Industrial", revenue, growth, margin, beta, wacc)
    
    # INTERNATIONAL (15)
    international_companies = [
        ("ASML", "ASML Holding N.V.", 30000000000, 0.15, 0.30, 1.3, 0.110),
        ("TSM", "Taiwan Semiconductor Manufacturing Company Limited", 80000000000, 0.12, 0.40, 1.2, 0.100),
        ("SAP", "SAP SE", 35000000000, 0.08, 0.25, 1.0, 0.090),
        ("UL", "Unilever PLC", 60000000000, 0.04, 0.15, 0.7, 0.075),
        ("NVO", "Novo Nordisk A/S", 25000000000, 0.12, 0.35, 1.0, 0.090),
        ("RHHBY", "Roche Holding AG", 70000000000, 0.05, 0.25, 0.8, 0.080),
        ("TM", "Toyota Motor Corporation", 300000000000, 0.03, 0.08, 0.9, 0.085),
        ("SONY", "Sony Group Corporation", 90000000000, 0.06, 0.10, 1.1, 0.095),
        ("BABA", "Alibaba Group Holding Limited", 100000000000, 0.08, 0.15, 1.4, 0.120),
        ("JD", "JD.com, Inc.", 150000000000, 0.10, 0.02, 1.5, 0.130),
        ("PDD", "PDD Holdings Inc.", 20000000000, 0.20, 0.15, 1.8, 0.150),
        ("BIDU", "Baidu, Inc.", 20000000000, 0.05, 0.12, 1.3, 0.110),
        ("NIO", "NIO Inc.", 8000000000, 0.30, 0.05, 2.0, 0.160),
        ("XPEV", "XPeng Inc.", 4000000000, 0.25, 0.03, 2.2, 0.170),
        ("LI", "Li Auto Inc.", 6000000000, 0.20, 0.08, 2.1, 0.165)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in international_companies:
        companies[ticker] = generate_company_data(ticker, name, "International", revenue, growth, margin, beta, wacc)
    
    # REITs (10)
    reit_companies = [
        ("AMT", "American Tower Corporation", 12000000000, 0.08, 0.40, 0.8, 0.080),
        ("PLD", "Prologis, Inc.", 6000000000, 0.10, 0.50, 0.9, 0.085),
        ("CCI", "Crown Castle Inc.", 7000000000, 0.06, 0.35, 0.8, 0.080),
        ("EQIX", "Equinix, Inc.", 8000000000, 0.08, 0.25, 1.0, 0.090),
        ("PSA", "Public Storage", 4000000000, 0.05, 0.60, 0.7, 0.075),
        ("EXR", "Extra Space Storage Inc.", 2000000000, 0.08, 0.45, 0.8, 0.080),
        ("AVB", "AvalonBay Communities, Inc.", 3000000000, 0.04, 0.35, 0.8, 0.080),
        ("EQR", "Equity Residential", 3000000000, 0.03, 0.30, 0.8, 0.080),
        ("MAA", "Mid-America Apartment Communities, Inc.", 2000000000, 0.05, 0.40, 0.8, 0.080),
        ("WELL", "Welltower Inc.", 4000000000, 0.06, 0.25, 0.9, 0.085)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in reit_companies:
        companies[ticker] = generate_company_data(ticker, name, "REIT", revenue, growth, margin, beta, wacc)
    
    # UTILITIES (10)
    utility_companies = [
        ("NEE", "NextEra Energy, Inc.", 20000000000, 0.08, 0.25, 0.6, 0.070),
        ("DUK", "Duke Energy Corporation", 30000000000, 0.03, 0.20, 0.7, 0.075),
        ("SO", "The Southern Company", 25000000000, 0.02, 0.15, 0.6, 0.070),
        ("D", "Dominion Energy, Inc.", 20000000000, 0.02, 0.18, 0.7, 0.075),
        ("EXC", "Exelon Corporation", 35000000000, 0.03, 0.12, 0.8, 0.080),
        ("AEP", "American Electric Power Company, Inc.", 20000000000, 0.03, 0.15, 0.7, 0.075),
        ("XEL", "Xcel Energy Inc.", 15000000000, 0.04, 0.18, 0.6, 0.070),
        ("WEC", "WEC Energy Group, Inc.", 8000000000, 0.03, 0.20, 0.6, 0.070),
        ("ES", "Eversource Energy", 10000000000, 0.03, 0.15, 0.6, 0.070),
        ("ED", "Consolidated Edison, Inc.", 15000000000, 0.02, 0.12, 0.6, 0.070)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in utility_companies:
        companies[ticker] = generate_company_data(ticker, name, "Utilities", revenue, growth, margin, beta, wacc)
    
    # MATERIALS (10)
    materials_companies = [
        ("LIN", "Linde plc", 30000000000, 0.06, 0.20, 0.9, 0.085),
        ("APD", "Air Products and Chemicals, Inc.", 12000000000, 0.05, 0.25, 1.0, 0.090),
        ("SHW", "The Sherwin-Williams Company", 20000000000, 0.06, 0.15, 1.1, 0.095),
        ("ECL", "Ecolab Inc.", 15000000000, 0.05, 0.15, 0.9, 0.085),
        ("DD", "DuPont de Nemours, Inc.", 12000000000, 0.03, 0.20, 1.2, 0.100),
        ("DOW", "Dow Inc.", 50000000000, 0.02, 0.10, 1.3, 0.110),
        ("PPG", "PPG Industries, Inc.", 18000000000, 0.04, 0.12, 1.1, 0.095),
        ("NEM", "Newmont Corporation", 12000000000, 0.05, 0.25, 0.8, 0.080),
        ("FCX", "Freeport-McMoRan Inc.", 20000000000, 0.08, 0.20, 1.5, 0.120),
        ("NUE", "Nucor Corporation", 35000000000, 0.05, 0.15, 1.2, 0.100)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in materials_companies:
        companies[ticker] = generate_company_data(ticker, name, "Materials", revenue, growth, margin, beta, wacc)
    
    # COMMUNICATION SERVICES (10)
    communication_companies = [
        ("VZ", "Verizon Communications Inc.", 140000000000, 0.02, 0.25, 0.7, 0.075),
        ("T", "AT&T Inc.", 120000000000, 0.01, 0.20, 0.8, 0.080),
        ("TMUS", "T-Mobile US, Inc.", 80000000000, 0.05, 0.15, 1.0, 0.090),
        ("CHTR", "Charter Communications, Inc.", 55000000000, 0.03, 0.20, 1.3, 0.110),
        ("CMCSA", "Comcast Corporation", 120000000000, 0.04, 0.20, 1.1, 0.095),
        ("DIS", "The Walt Disney Company", 90000000000, 0.06, 0.15, 1.2, 0.100),
        ("NFLX", "Netflix, Inc.", 34000000000, 0.08, 0.21, 1.2, 0.102),
        ("GOOGL", "Alphabet Inc.", 307000000000, 0.095, 0.28, 1.1, 0.100),
        ("META", "Meta Platforms, Inc.", 135000000000, 0.12, 0.345, 1.4, 0.115),
        ("TWTR", "Twitter, Inc.", 5000000000, 0.10, 0.15, 1.5, 0.125)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in communication_companies:
        companies[ticker] = generate_company_data(ticker, name, "Communication", revenue, growth, margin, beta, wacc)
    
    # SMALL/MID CAP GROWTH (15)
    growth_companies = [
        ("ROKU", "Roku, Inc.", 3000000000, 0.20, 0.15, 1.8, 0.150),
        ("SQ", "Block, Inc.", 20000000000, 0.15, 0.10, 1.6, 0.130),
        ("ZM", "Zoom Video Communications, Inc.", 4000000000, 0.05, 0.25, 1.4, 0.120),
        ("DOCU", "DocuSign, Inc.", 2000000000, 0.08, 0.20, 1.5, 0.125),
        ("SNOW", "Snowflake Inc.", 2000000000, 0.30, 0.15, 2.0, 0.160),
        ("CRWD", "CrowdStrike Holdings, Inc.", 3000000000, 0.25, 0.20, 1.8, 0.150),
        ("OKTA", "Okta, Inc.", 2000000000, 0.20, 0.15, 1.7, 0.140),
        ("DDOG", "Datadog, Inc.", 2000000000, 0.30, 0.25, 1.9, 0.155),
        ("NET", "Cloudflare, Inc.", 1000000000, 0.25, 0.10, 1.8, 0.150),
        ("PLTR", "Palantir Technologies Inc.", 2000000000, 0.20, 0.15, 2.0, 0.160),
        ("U", "Unity Software Inc.", 1500000000, 0.15, 0.10, 1.6, 0.130),
        ("SHOP", "Shopify Inc.", 6000000000, 0.20, 0.15, 1.7, 0.140),
        ("TWLO", "Twilio Inc.", 4000000000, 0.15, 0.05, 1.5, 0.125),
        ("PINS", "Pinterest, Inc.", 3000000000, 0.10, 0.15, 1.4, 0.120),
        ("SNAP", "Snap Inc.", 5000000000, 0.12, 0.05, 1.6, 0.130)
    ]
    
    for ticker, name, revenue, growth, margin, beta, wacc in growth_companies:
        companies[ticker] = generate_company_data(ticker, name, "Growth", revenue, growth, margin, beta, wacc)
    
    return companies

if __name__ == "__main__":
    companies = generate_100_plus_companies()
    print(f"Generated {len(companies)} companies")
    
    # Print first few companies as example
    for i, (ticker, data) in enumerate(companies.items()):
        if i < 5:
            print(f"{ticker}: {data['company_name']} - {data['historicals']['revenue'][0]:,}")
        else:
            break
