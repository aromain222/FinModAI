"""
Optional: FMP Bulk CSV Downloader
- Fetches bulk income/balance/cash-flow statements once per day.
- Stores locally (e.g., in `var/fmp_bulk/`) for 24h.
- Reduces per-request API usage.
- Used as a secondary fallback after EDGAR.
"""
import os
import requests
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional

CACHE_DIR = "var/fmp_bulk"
CACHE_TTL_HOURS = 24
FMP_API_BASE = "https://financialmodelingprep.com/api/v3"

class FMPBulkProvider:
    def __init__(self, api_key: str):
        self.api_key = api_key
        os.makedirs(CACHE_DIR, exist_ok=True)

    def _get_bulk_data(self, endpoint: str) -> Optional[pd.DataFrame]:
        filename = f"{endpoint.replace('/', '_')}.csv"
        filepath = os.path.join(CACHE_DIR, filename)

        # Check if cache is fresh
        if os.path.exists(filepath):
            last_mod_time = datetime.fromtimestamp(os.path.getmtime(filepath))
            if datetime.now() - last_mod_time < timedelta(hours=CACHE_TTL_HOURS):
                print(f"Using cached FMP bulk data for {endpoint}")
                return pd.read_csv(filepath)

        # Fetch fresh data
        print(f"Fetching fresh FMP bulk data for {endpoint}...")
        url = f"{FMP_API_BASE}/{endpoint}?apikey={self.api_key}"
        try:
            df = pd.read_csv(url)
            df.to_csv(filepath, index=False)
            return df
        except Exception as e:
            print(f"❌ Failed to fetch FMP bulk data for {endpoint}: {e}")
            return None

    def get_income_statements(self) -> Optional[pd.DataFrame]:
        return self._get_bulk_data("income-statement-bulk")

    def get_balance_sheets(self) -> Optional[pd.DataFrame]:
        return self._get_bulk_data("balance-sheet-statement-bulk")

    def get_cash_flows(self) -> Optional[pd.DataFrame]:
        return self._get_bulk_data("cash-flow-statement-bulk")

    def get_fundamentals_for_ticker(self, ticker: str) -> dict:
        """Extracts all fundamentals for a single ticker from the bulk dataframes."""
        ticker = ticker.upper()
        data = {}
        
        income = self.get_income_statements()
        if income is not None and not income[income['symbol'] == ticker].empty:
            data['income'] = income[income['symbol'] == ticker].to_dict('records')

        balance = self.get_balance_sheets()
        if balance is not None and not balance[balance['symbol'] == ticker].empty:
            data['balance'] = balance[balance['symbol'] == ticker].to_dict('records')

        cash_flow = self.get_cash_flows()
        if cash_flow is not None and not cash_flow[cash_flow['symbol'] == ticker].empty:
            data['cash_flow'] = cash_flow[cash_flow['symbol'] == ticker].to_dict('records')
            
        return data

def get_provider():
    api_key = os.environ.get("FMP_API_KEY")
    if not api_key:
        return None
    return FMPBulkProvider(api_key)
