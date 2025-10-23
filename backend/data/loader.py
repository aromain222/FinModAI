"""
EDGAR Fundamentals Data Loader
"""

import logging
from typing import Dict, Optional

import pandas as pd

from backend.config import config

logger = logging.getLogger(__name__)


class FundamentalsLoader:
    """Load and manage EDGAR fundamentals data"""

    def __init__(self):
        self.df: Optional[pd.DataFrame] = None
        self.latest_by_ticker: Dict[str, Dict] = {}
        self.tickers: list = []

    def load(self) -> None:
        """Load EDGAR fundamentals from Parquet or CSV"""
        logger.info("Loading EDGAR fundamentals...")

        # Try Parquet first (faster), fallback to CSV
        if config.EDGAR_FUNDAMENTALS_PATH.exists():
            self.df = pd.read_parquet(config.EDGAR_FUNDAMENTALS_PATH)
            logger.info(f"Loaded {len(self.df)} rows from Parquet")
        elif config.EDGAR_FUNDAMENTALS_CSV.exists():
            self.df = pd.read_csv(config.EDGAR_FUNDAMENTALS_CSV)
            logger.info(f"Loaded {len(self.df)} rows from CSV")
        else:
            raise FileNotFoundError("No EDGAR fundamentals file found")

        # Compute latest fiscal year per ticker
        self._compute_latest_rows()

        logger.info(f"Computed latest rows for {len(self.latest_by_ticker)} tickers")

    def _compute_latest_rows(self) -> None:
        """Extract the most recent fiscal year row for each ticker"""
        if self.df is None or self.df.empty:
            logger.warning("No data to process")
            return

        # Sort by ticker and fiscal_year descending
        df_sorted = self.df.sort_values(["ticker", "fiscal_year"], ascending=[True, False])

        # Group by ticker and take first (most recent)
        latest_df = df_sorted.groupby("ticker").first().reset_index()

        # Convert to dictionary for fast lookup
        for _, row in latest_df.iterrows():
            ticker = row["ticker"]

            # Convert row to dict, replacing NaN with None
            row_dict = row.to_dict()
            for key, value in row_dict.items():
                if pd.isna(value):
                    row_dict[key] = None

            self.latest_by_ticker[ticker] = row_dict

        self.tickers = list(self.latest_by_ticker.keys())
        logger.info(f"Tracked tickers: {len(self.tickers)}")

    def get_latest(self, ticker: str) -> Optional[Dict]:
        """Get latest fundamentals for a ticker"""
        return self.latest_by_ticker.get(ticker.upper())

    def get_all_tickers(self) -> list:
        """Get list of all available tickers"""
        return self.tickers

    def get_history(self, ticker: str, years: int = 5) -> pd.DataFrame:
        """Get historical fundamentals for a ticker"""
        if self.df is None:
            return pd.DataFrame()

        ticker_data = self.df[self.df["ticker"] == ticker.upper()]
        ticker_data = ticker_data.sort_values("fiscal_year", ascending=False).head(years)

        return ticker_data


# Global instance
fundamentals_loader = FundamentalsLoader()
