"""
FRED Provider - Risk-Free Rate (10Y Treasury)
"""

import requests
from typing import Optional
from datetime import datetime, timedelta


class FREDProvider:
    """Federal Reserve Economic Data provider for risk-free rate."""
    
    BASE_URL = "https://api.stlouisfed.org/fred/series/observations"
    SERIES_ID = "DGS10"  # 10-Year Treasury Constant Maturity Rate
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key
        self.name = "FRED"
    
    def get_risk_free_rate(self) -> tuple[Optional[float], Optional[str]]:
        """
        Get current 10Y Treasury rate.
        Returns: (rate_decimal, as_of_date) or (None, None)
        """
        # If no API key, use a reasonable default
        if not self.api_key:
            print("FRED API key not provided, using default 4.5%")
            return 0.045, datetime.now().strftime("%Y-%m-%d")
        
        try:
            # Get last 10 observations to find most recent non-null value
            params = {
                "series_id": self.SERIES_ID,
                "api_key": self.api_key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 10
            }
            
            response = requests.get(self.BASE_URL, params=params, timeout=10)
            response.raise_for_status()
            data = response.json()
            
            observations = data.get("observations", [])
            
            for obs in observations:
                value = obs.get("value")
                date = obs.get("date")
                
                if value and value != ".":
                    try:
                        # FRED returns percentage (e.g., 4.5 for 4.5%)
                        rate = float(value) / 100.0
                        return rate, date
                    except ValueError:
                        continue
            
            # Fallback
            return 0.045, datetime.now().strftime("%Y-%m-%d")
            
        except Exception as e:
            print(f"FRED fetch error: {e}")
            return 0.045, datetime.now().strftime("%Y-%m-%d")

