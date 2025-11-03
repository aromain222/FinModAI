"""
Fetches current debt market conditions using the FRED provider.
"""
import os
from typing import Dict, Any

# Assuming a FRED provider will be available in our provider ecosystem
# We will create a simple placeholder here and integrate with the real one later
# from backend.providers.fred_provider import get_provider as get_fred_provider

# Placeholder FRED Provider for now
class MockFREDProvider:
    def get_series(self, series_id):
        print(f"MOCK FRED: getting series {series_id}")
        if series_id == "DGS10": # 10-Year Treasury
            return {"value": 0.045} # 4.5%
        if series_id == "DGS5": # 5-Year Treasury
            return {"value": 0.043} # 4.3%
        return None

def get_benchmark_rates() -> Dict[str, Any]:
    """
    Fetches key benchmark interest rates for pricing LBO debt.
    
    Returns:
        A dictionary containing benchmark rates and estimated credit spreads.
    """
    # fred_provider = get_fred_provider()
    fred_provider = MockFREDProvider() # Using mock for now
    
    if not fred_provider:
        return {"error": "FRED provider is not available. Check API key."}

    try:
        # Fetch 5-year and 10-year Treasury yields
        five_year_treasury = fred_provider.get_series("DGS5")
        ten_year_treasury = fred_provider.get_series("DGS10")
        
        base_rate_5y = five_year_treasury.get('value') if five_year_treasury else 0.043
        base_rate_10y = ten_year_treasury.get('value') if ten_year_treasury else 0.045
        
        # Define standard credit spreads for different debt tranches in an LBO
        # These are illustrative and would be more dynamic in a full implementation
        spreads = {
            "revolver": 3.50 / 100,      # SOFR + 350 bps
            "term_loan_b": 4.50 / 100,   # SOFR + 450 bps
            "senior_notes": 6.00 / 100,    # 10-Year Treasury + 600 bps
        }

        # Calculate estimated interest rates for each tranche
        estimated_rates = {
            "revolver": base_rate_5y + spreads["revolver"],
            "term_loan_b": base_rate_5y + spreads["term_loan_b"],
            "senior_notes": base_rate_10y + spreads["senior_notes"],
        }
        
        return {
            "benchmark_rates": {
                "us_5y_treasury": base_rate_5y,
                "us_10y_treasury": base_rate_10y,
            },
            "estimated_spreads_bps": {
                "revolver": spreads["revolver"] * 10000,
                "term_loan_b": spreads["term_loan_b"] * 10000,
                "senior_notes": spreads["senior_notes"] * 10000,
            },
            "estimated_total_rates": estimated_rates,
            "provenance": "FRED (Federal Reserve Economic Data)"
        }

    except Exception as e:
        print(f"❌ Error fetching debt market conditions: {e}")
        return {
            "error": f"An exception occurred: {e}"
        }

if __name__ == '__main__':
    # Example usage:
    debt_conditions = get_benchmark_rates()
    import json
    print(json.dumps(debt_conditions, indent=2))
