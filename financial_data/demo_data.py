"""
Demo data for common tickers when APIs are unavailable.
Uses realistic values based on historical data.
"""

from datetime import datetime
from .comprehensive_demo_data import get_comprehensive_demo_data

# Get comprehensive demo data
COMPREHENSIVE_DATA = get_comprehensive_demo_data()

DEMO_DATA = {
    "MSFT": {
        "ticker": "MSFT",
        "company_name": "Microsoft Corporation",
        "currency": "USD",
        "provenance": {
            "revenue": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "op_margin": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "capex": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "nwc": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "price": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "beta": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "rf": {"source": "Demo_Data_UST10Y", "as_of": datetime.now().strftime("%Y-%m-%d")}
        },
        "historicals": {
            "years": [2024, 2023, 2022, 2021, 2020],
            "revenue": [245122000000, 211915000000, 198270000000, 168088000000, 143015000000],
            "operating_income": [109433000000, 88523000000, 83383000000, 69916000000, 52959000000],
            "op_margin": [0.446, 0.418, 0.421, 0.416, 0.370],
            "da": [13888000000, 13796000000, 12796000000, 11686000000, 11682000000],
            "capex": [44477000000, 28107000000, 23886000000, 20622000000, 15441000000],
            "delta_nwc": [2150000000, -3459000000, 2579000000, 5822000000, 9598000000],
            # Additional fields for enhanced analysis
            "tax_expense": [20700000000, 16900000000, 15700000000, 13100000000, 10000000000],
            "pretax_income": [109000000000, 88000000000, 83000000000, 69000000000, 52000000000],
            "interest_expense": [2800000000, 2600000000, 2400000000, 2200000000, 2000000000],
            "total_debt": [65000000000, 60000000000, 55000000000, 50000000000, 45000000000],
            "shares_outstanding": [7400000000, 7500000000, 7600000000, 7700000000, 7800000000]
        },
        "assumptions": {
            "forecast_years": 10,
            "revenue_growth": [0.107, 0.098, 0.088, 0.078, 0.068, 0.058, 0.048, 0.038, 0.030, 0.025],
            "operating_margin": [0.430, 0.435, 0.438, 0.440, 0.440, 0.440, 0.440, 0.440, 0.440, 0.440],
            "da_pct_rev": 0.056,
            "capex_pct_rev": 0.120,
            "nwc_pct_rev": 0.015,
            "tax_rate": 0.19
        },
        "wacc": {
            "rf": 0.045,
            "erp": 0.055,
            "beta": 0.90,
            "ke": 0.095,
            "kd_pre": 0.055,
            "tax": 0.19,
            "wd": 0.10,
            "we": 0.90,
            "kd_after": 0.045,
            "wacc": 0.090
        },
        "terminal": {
            "method": "perpetuity",
            "g": 0.025
        },
        "flags": ["demo_data_used"]
    },
    
    "AAPL": {
        "ticker": "AAPL",
        "company_name": "Apple Inc.",
        "currency": "USD",
        "provenance": {
            "revenue": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "op_margin": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "capex": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "nwc": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "price": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "beta": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "rf": {"source": "Demo_Data_UST10Y", "as_of": datetime.now().strftime("%Y-%m-%d")}
        },
        "historicals": {
            "years": [2024, 2023, 2022, 2021, 2020],
            "revenue": [391035000000, 383285000000, 394328000000, 365817000000, 274515000000],
            "operating_income": [123218000000, 114301000000, 119437000000, 108949000000, 66288000000],
            "op_margin": [0.315, 0.298, 0.303, 0.298, 0.242],
            "da": [11519000000, 11104000000, 11104000000, 11284000000, 11056000000],
            "capex": [10959000000, 10708000000, 10708000000, 11085000000, 7309000000],
            "delta_nwc": [-3452000000, 11312000000, -4912000000, -1085000000, 14794000000],
            # Additional fields for enhanced analysis
            "tax_expense": [18500000000, 17000000000, 18000000000, 16000000000, 10000000000],
            "pretax_income": [123000000000, 114000000000, 119000000000, 109000000000, 66000000000],
            "interest_expense": [3000000000, 2900000000, 2800000000, 2700000000, 2600000000],
            "total_debt": [120000000000, 110000000000, 100000000000, 90000000000, 80000000000],
            "shares_outstanding": [15500000000, 15600000000, 15700000000, 15800000000, 15900000000]
        },
        "assumptions": {
            "forecast_years": 10,
            "revenue_growth": [0.055, 0.050, 0.045, 0.040, 0.038, 0.035, 0.032, 0.030, 0.028, 0.025],
            "operating_margin": [0.308, 0.310, 0.312, 0.315, 0.315, 0.315, 0.315, 0.315, 0.315, 0.315],
            "da_pct_rev": 0.029,
            "capex_pct_rev": 0.028,
            "nwc_pct_rev": 0.010,
            "tax_rate": 0.15
        },
        "wacc": {
            "rf": 0.045,
            "erp": 0.055,
            "beta": 1.20,
            "ke": 0.111,
            "kd_pre": 0.050,
            "tax": 0.15,
            "wd": 0.08,
            "we": 0.92,
            "kd_after": 0.043,
            "wacc": 0.105
        },
        "terminal": {
            "method": "perpetuity",
            "g": 0.025
        },
        "flags": ["demo_data_used"]
    },
    
    "GOOGL": {
        "ticker": "GOOGL",
        "company_name": "Alphabet Inc.",
        "currency": "USD",
        "provenance": {
            "revenue": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "op_margin": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "capex": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "nwc": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "price": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "beta": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "rf": {"source": "Demo_Data_UST10Y", "as_of": datetime.now().strftime("%Y-%m-%d")}
        },
        "historicals": {
            "years": [2024, 2023, 2022, 2021, 2020],
            "revenue": [307394000000, 282836000000, 282836000000, 257637000000, 182527000000],
            "operating_income": [84266000000, 74842000000, 74842000000, 78714000000, 41224000000],
            "op_margin": [0.274, 0.265, 0.265, 0.305, 0.226],
            "da": [16724000000, 13781000000, 13781000000, 12333000000, 11913000000],
            "capex": [32255000000, 32279000000, 32279000000, 24640000000, 22281000000],
            "delta_nwc": [1854000000, -2337000000, -2337000000, 5244000000, 2310000000]
        },
        "assumptions": {
            "forecast_years": 10,
            "revenue_growth": [0.095, 0.088, 0.080, 0.072, 0.065, 0.055, 0.048, 0.040, 0.032, 0.025],
            "operating_margin": [0.280, 0.285, 0.288, 0.290, 0.290, 0.290, 0.290, 0.290, 0.290, 0.290],
            "da_pct_rev": 0.048,
            "capex_pct_rev": 0.108,
            "nwc_pct_rev": 0.008,
            "tax_rate": 0.16
        },
        "wacc": {
            "rf": 0.045,
            "erp": 0.055,
            "beta": 1.05,
            "ke": 0.103,
            "kd_pre": 0.052,
            "tax": 0.16,
            "wd": 0.05,
            "we": 0.95,
            "kd_after": 0.044,
            "wacc": 0.100
        },
        "terminal": {
            "method": "perpetuity",
            "g": 0.025
        },
        "flags": ["demo_data_used"]
    },
    "GOOS": {
        "ticker": "GOOS",
        "company_name": "Canada Goose Holdings Inc.",
        "currency": "CAD",
        "provenance": {
            "revenue": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "op_margin": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "capex": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "nwc": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "price": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "beta": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
            "rf": {"source": "Demo_Data_UST10Y", "as_of": datetime.now().strftime("%Y-%m-%d")}
        },
        "historicals": {
            "years": [2024, 2023, 2022, 2021, 2020],
            "revenue": [1098000000, 1031000000, 905000000, 791000000, 958000000],
            "operating_income": [180000000, 160000000, 120000000, 95000000, 150000000],
            "op_margin": [0.164, 0.155, 0.133, 0.120, 0.157],
            "da": [45000000, 42000000, 38000000, 35000000, 32000000],
            "capex": [55000000, 48000000, 42000000, 38000000, 35000000],
            "delta_nwc": [25000000, 15000000, 20000000, 10000000, 5000000],
            # Additional fields for enhanced analysis
            "tax_expense": [45000000, 40000000, 30000000, 24000000, 38000000],
            "pretax_income": [180000000, 160000000, 120000000, 95000000, 150000000],
            "interest_expense": [8000000, 7000000, 6000000, 5000000, 4000000],
            "total_debt": [200000000, 180000000, 160000000, 140000000, 120000000],
            "shares_outstanding": [100000000, 102000000, 104000000, 106000000, 108000000]
        },
        "assumptions": {
            "forecast_years": 10,
            "revenue_growth": [0.065, 0.060, 0.055, 0.050, 0.045, 0.040, 0.035, 0.030, 0.028, 0.025],
            "operating_margin": [0.160, 0.162, 0.164, 0.166, 0.168, 0.168, 0.168, 0.168, 0.168, 0.168],
            "da_pct_rev": 0.041,
            "capex_pct_rev": 0.050,
            "nwc_pct_rev": 0.020,
            "tax_rate": 0.25
        },
        "wacc": {
            "rf": 0.045,
            "erp": 0.055,
            "beta": 1.15,
            "ke": 0.108,
            "kd_pre": 0.055,
            "tax": 0.25,
            "wd": 0.15,
            "we": 0.85,
            "kd_after": 0.041,
            "wacc": 0.098
        },
        "terminal": {
            "method": "perpetuity",
            "g": 0.025
        },
           "flags": ["demo_data_used"]
       },
       "TSLA": {
           "ticker": "TSLA",
           "company_name": "Tesla, Inc.",
           "currency": "USD",
           "provenance": {
               "revenue": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "op_margin": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "capex": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "nwc": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "price": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "beta": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "rf": {"source": "Demo_Data_UST10Y", "as_of": datetime.now().strftime("%Y-%m-%d")}
           },
           "historicals": {
               "years": [2024, 2023, 2022, 2021, 2020],
               "revenue": [96773000000, 81562000000, 53735000000, 31536000000, 31536000000],
               "operating_income": [8000000000, 9000000000, 6000000000, 4000000000, 2000000000],
               "op_margin": [0.083, 0.110, 0.112, 0.127, 0.063],
               "da": [3000000000, 2500000000, 2000000000, 1500000000, 1000000000],
               "capex": [8000000000, 7000000000, 6000000000, 5000000000, 4000000000],
               "delta_nwc": [2000000000, 1500000000, 1000000000, 500000000, 300000000],
               "tax_expense": [2000000000, 1500000000, 1000000000, 500000000, 300000000],
               "pretax_income": [8000000000, 9000000000, 6000000000, 4000000000, 2000000000],
               "interest_expense": [500000000, 400000000, 300000000, 200000000, 100000000],
               "total_debt": [30000000000, 25000000000, 20000000000, 15000000000, 10000000000],
               "shares_outstanding": [3000000000, 3100000000, 3200000000, 3300000000, 3400000000]
           },
           "assumptions": {
               "forecast_years": 10,
               "revenue_growth": [0.15, 0.12, 0.10, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03, 0.03],
               "operating_margin": [0.085, 0.090, 0.095, 0.100, 0.105, 0.105, 0.105, 0.105, 0.105, 0.105],
               "da_pct_rev": 0.031,
               "capex_pct_rev": 0.083,
               "nwc_pct_rev": 0.021,
               "tax_rate": 0.25
           },
           "wacc": {
               "rf": 0.045,
               "erp": 0.055,
               "beta": 2.0,
               "ke": 0.155,
               "kd_pre": 0.065,
               "tax": 0.25,
               "wd": 0.20,
               "we": 0.80,
               "kd_after": 0.049,
               "wacc": 0.133
           },
           "terminal": {
               "method": "perpetuity",
               "g": 0.03
           },
           "flags": ["demo_data_used"]
       },
       "AMZN": {
           "ticker": "AMZN",
           "company_name": "Amazon.com, Inc.",
           "currency": "USD",
           "provenance": {
               "revenue": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "op_margin": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "capex": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "nwc": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "price": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "beta": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "rf": {"source": "Demo_Data_UST10Y", "as_of": datetime.now().strftime("%Y-%m-%d")}
           },
           "historicals": {
               "years": [2024, 2023, 2022, 2021, 2020],
               "revenue": [574785000000, 514004000000, 469822000000, 386064000000, 386064000000],
               "operating_income": [30000000000, 25000000000, 20000000000, 15000000000, 10000000000],
               "op_margin": [0.052, 0.049, 0.043, 0.039, 0.026],
               "da": [20000000000, 18000000000, 16000000000, 14000000000, 12000000000],
               "capex": [40000000000, 35000000000, 30000000000, 25000000000, 20000000000],
               "delta_nwc": [5000000000, 4000000000, 3000000000, 2000000000, 1000000000],
               "tax_expense": [8000000000, 6000000000, 4000000000, 3000000000, 2000000000],
               "pretax_income": [30000000000, 25000000000, 20000000000, 15000000000, 10000000000],
               "interest_expense": [2000000000, 1500000000, 1000000000, 800000000, 500000000],
               "total_debt": [80000000000, 70000000000, 60000000000, 50000000000, 40000000000],
               "shares_outstanding": [10000000000, 10100000000, 10200000000, 10300000000, 10400000000]
           },
           "assumptions": {
               "forecast_years": 10,
               "revenue_growth": [0.12, 0.10, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03, 0.03, 0.03],
               "operating_margin": [0.055, 0.060, 0.065, 0.070, 0.075, 0.075, 0.075, 0.075, 0.075, 0.075],
               "da_pct_rev": 0.035,
               "capex_pct_rev": 0.070,
               "nwc_pct_rev": 0.009,
               "tax_rate": 0.25
           },
           "wacc": {
               "rf": 0.045,
               "erp": 0.055,
               "beta": 1.3,
               "ke": 0.117,
               "kd_pre": 0.060,
               "tax": 0.25,
               "wd": 0.15,
               "we": 0.85,
               "kd_after": 0.045,
               "wacc": 0.105
           },
           "terminal": {
               "method": "perpetuity",
               "g": 0.03
           },
           "flags": ["demo_data_used"]
       },
       "META": {
           "ticker": "META",
           "company_name": "Meta Platforms, Inc.",
           "currency": "USD",
           "provenance": {
               "revenue": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "op_margin": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "capex": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "nwc": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "price": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "beta": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "rf": {"source": "Demo_Data_UST10Y", "as_of": datetime.now().strftime("%Y-%m-%d")}
           },
           "historicals": {
               "years": [2024, 2023, 2022, 2021, 2020],
               "revenue": [134902000000, 116609000000, 116609000000, 85965000000, 85965000000],
               "operating_income": [46000000000, 32000000000, 32000000000, 20000000000, 20000000000],
               "op_margin": [0.341, 0.274, 0.274, 0.233, 0.233],
               "da": [12000000000, 10000000000, 10000000000, 8000000000, 8000000000],
               "capex": [25000000000, 20000000000, 20000000000, 15000000000, 15000000000],
               "delta_nwc": [3000000000, 2000000000, 2000000000, 1000000000, 1000000000],
               "tax_expense": [10000000000, 7000000000, 7000000000, 4000000000, 4000000000],
               "pretax_income": [46000000000, 32000000000, 32000000000, 20000000000, 20000000000],
               "interest_expense": [1000000000, 800000000, 800000000, 500000000, 500000000],
               "total_debt": [20000000000, 15000000000, 15000000000, 10000000000, 10000000000],
               "shares_outstanding": [2500000000, 2600000000, 2700000000, 2800000000, 2900000000]
           },
           "assumptions": {
               "forecast_years": 10,
               "revenue_growth": [0.12, 0.10, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03, 0.03, 0.03],
               "operating_margin": [0.345, 0.350, 0.355, 0.360, 0.365, 0.365, 0.365, 0.365, 0.365, 0.365],
               "da_pct_rev": 0.089,
               "capex_pct_rev": 0.185,
               "nwc_pct_rev": 0.022,
               "tax_rate": 0.22
           },
           "wacc": {
               "rf": 0.045,
               "erp": 0.055,
               "beta": 1.4,
               "ke": 0.122,
               "kd_pre": 0.060,
               "tax": 0.22,
               "wd": 0.10,
               "we": 0.90,
               "kd_after": 0.047,
               "wacc": 0.115
           },
           "terminal": {
               "method": "perpetuity",
               "g": 0.03
           },
           "flags": ["demo_data_used"]
       },
       "NFLX": {
           "ticker": "NFLX",
           "company_name": "Netflix, Inc.",
           "currency": "USD",
           "provenance": {
               "revenue": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "op_margin": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "capex": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "nwc": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "price": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "beta": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "rf": {"source": "Demo_Data_UST10Y", "as_of": datetime.now().strftime("%Y-%m-%d")}
           },
           "historicals": {
               "years": [2024, 2023, 2022, 2021, 2020],
               "revenue": [33723000000, 31697000000, 31697000000, 24961000000, 24961000000],
               "operating_income": [7000000000, 5000000000, 5000000000, 3000000000, 3000000000],
               "op_margin": [0.208, 0.158, 0.158, 0.120, 0.120],
               "da": [2000000000, 1500000000, 1500000000, 1000000000, 1000000000],
               "capex": [1000000000, 800000000, 800000000, 500000000, 500000000],
               "delta_nwc": [500000000, 300000000, 300000000, 200000000, 200000000],
               "tax_expense": [1500000000, 1000000000, 1000000000, 600000000, 600000000],
               "pretax_income": [7000000000, 5000000000, 5000000000, 3000000000, 3000000000],
               "interest_expense": [800000000, 600000000, 600000000, 400000000, 400000000],
               "total_debt": [15000000000, 12000000000, 12000000000, 8000000000, 8000000000],
               "shares_outstanding": [450000000, 460000000, 470000000, 480000000, 490000000]
           },
           "assumptions": {
               "forecast_years": 10,
               "revenue_growth": [0.08, 0.06, 0.05, 0.04, 0.03, 0.03, 0.03, 0.03, 0.03, 0.03],
               "operating_margin": [0.210, 0.215, 0.220, 0.225, 0.230, 0.230, 0.230, 0.230, 0.230, 0.230],
               "da_pct_rev": 0.059,
               "capex_pct_rev": 0.030,
               "nwc_pct_rev": 0.015,
               "tax_rate": 0.21
           },
           "wacc": {
               "rf": 0.045,
               "erp": 0.055,
               "beta": 1.2,
               "ke": 0.111,
               "kd_pre": 0.060,
               "tax": 0.21,
               "wd": 0.15,
               "we": 0.85,
               "kd_after": 0.047,
               "wacc": 0.102
           },
           "terminal": {
               "method": "perpetuity",
               "g": 0.03
           },
           "flags": ["demo_data_used"]
       },
       "NVDA": {
           "ticker": "NVDA",
           "company_name": "NVIDIA Corporation",
           "currency": "USD",
           "provenance": {
               "revenue": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "op_margin": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "capex": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "nwc": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "price": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "beta": {"source": "Demo_Data", "as_of": datetime.now().strftime("%Y-%m-%d")},
               "rf": {"source": "Demo_Data_UST10Y", "as_of": datetime.now().strftime("%Y-%m-%d")}
           },
           "historicals": {
               "years": [2024, 2023, 2022, 2021, 2020],
               "revenue": [60922000000, 26914000000, 26914000000, 16675000000, 16675000000],
               "operating_income": [35000000000, 10000000000, 10000000000, 5000000000, 5000000000],
               "op_margin": [0.575, 0.372, 0.372, 0.300, 0.300],
               "da": [2000000000, 1000000000, 1000000000, 500000000, 500000000],
               "capex": [3000000000, 2000000000, 2000000000, 1000000000, 1000000000],
               "delta_nwc": [2000000000, 1000000000, 1000000000, 500000000, 500000000],
               "tax_expense": [8000000000, 2000000000, 2000000000, 1000000000, 1000000000],
               "pretax_income": [35000000000, 10000000000, 10000000000, 5000000000, 5000000000],
               "interest_expense": [200000000, 100000000, 100000000, 50000000, 50000000],
               "total_debt": [5000000000, 3000000000, 3000000000, 2000000000, 2000000000],
               "shares_outstanding": [2500000000, 2600000000, 2700000000, 2800000000, 2900000000]
           },
           "assumptions": {
               "forecast_years": 10,
               "revenue_growth": [0.25, 0.20, 0.15, 0.10, 0.08, 0.06, 0.05, 0.04, 0.03, 0.03],
               "operating_margin": [0.580, 0.585, 0.590, 0.595, 0.600, 0.600, 0.600, 0.600, 0.600, 0.600],
               "da_pct_rev": 0.033,
               "capex_pct_rev": 0.049,
               "nwc_pct_rev": 0.033,
               "tax_rate": 0.23
           },
           "wacc": {
               "rf": 0.045,
               "erp": 0.055,
               "beta": 1.8,
               "ke": 0.144,
               "kd_pre": 0.065,
               "tax": 0.23,
               "wd": 0.05,
               "we": 0.95,
               "kd_after": 0.050,
               "wacc": 0.139
           },
           "terminal": {
               "method": "perpetuity",
               "g": 0.03
           },
           "flags": ["demo_data_used"]
       }
   }

def get_demo_data(ticker: str) -> dict:
    """Get demo data for a ticker if available."""
    ticker = ticker.upper()
    
    # First try comprehensive data
    if ticker in COMPREHENSIVE_DATA:
        return COMPREHENSIVE_DATA[ticker]
    
    # Fallback to original demo data
    if ticker in DEMO_DATA:
        return DEMO_DATA[ticker]
    
    return None

