"""
Sector and Industry Registry
"""

import logging
from typing import Dict, Optional

logger = logging.getLogger(__name__)


# GICS Sectors (11 standard sectors)
GICS_SECTORS = [
    "Technology",
    "Healthcare",
    "Financial Services",
    "Consumer Discretionary",
    "Communication Services",
    "Industrials",
    "Consumer Staples",
    "Energy",
    "Utilities",
    "Real Estate",
    "Materials",
]


class SectorRegistry:
    """Manage sector and industry mappings for tickers"""

    def __init__(self):
        # Hard-coded mappings (can be extended or loaded from file)
        self.sector_map: Dict[str, str] = {}
        self.industry_map: Dict[str, str] = {}
        self._load_default_mappings()

    def _load_default_mappings(self) -> None:
        """Load default sector mappings for common tickers"""
        # Technology
        tech_tickers = [
            "AAPL",
            "MSFT",
            "GOOGL",
            "GOOG",
            "META",
            "NVDA",
            "ORCL",
            "CSCO",
            "INTC",
            "AMD",
            "CRM",
            "ADBE",
            "AVGO",
            "TXN",
            "QCOM",
        ]
        for t in tech_tickers:
            self.sector_map[t] = "Technology"

        # Healthcare
        healthcare_tickers = [
            "UNH",
            "JNJ",
            "LLY",
            "ABBV",
            "PFE",
            "MRK",
            "TMO",
            "ABT",
            "DHR",
            "BMY",
            "AMGN",
            "CVS",
            "CI",
        ]
        for t in healthcare_tickers:
            self.sector_map[t] = "Healthcare"

        # Financial Services
        financial_tickers = [
            "JPM",
            "BAC",
            "WFC",
            "GS",
            "MS",
            "BLK",
            "C",
            "USB",
            "PNC",
            "TFC",
            "COF",
            "AXP",
            "SCHW",
            "BK",
            "STT",
        ]
        for t in financial_tickers:
            self.sector_map[t] = "Financial Services"

        # Consumer Discretionary
        consumer_disc_tickers = [
            "AMZN",
            "TSLA",
            "HD",
            "MCD",
            "NKE",
            "LOW",
            "SBUX",
            "TJX",
            "BKNG",
            "CMG",
            "TGT",
            "F",
            "GM",
        ]
        for t in consumer_disc_tickers:
            self.sector_map[t] = "Consumer Discretionary"

        # Communication Services
        comm_tickers = ["META", "GOOGL", "GOOG", "NFLX", "DIS", "CMCSA", "VZ", "T"]
        for t in comm_tickers:
            self.sector_map[t] = "Communication Services"

        # Industrials
        industrial_tickers = [
            "BA",
            "UNP",
            "HON",
            "UPS",
            "RTX",
            "CAT",
            "DE",
            "LMT",
            "GE",
            "MMM",
            "GD",
            "EMR",
        ]
        for t in industrial_tickers:
            self.sector_map[t] = "Industrials"

        # Consumer Staples
        staples_tickers = [
            "WMT",
            "PG",
            "KO",
            "PEP",
            "COST",
            "PM",
            "MO",
            "CL",
            "MDLZ",
            "KMB",
            "GIS",
            "KHC",
        ]
        for t in staples_tickers:
            self.sector_map[t] = "Consumer Staples"

        # Energy
        energy_tickers = [
            "XOM",
            "CVX",
            "COP",
            "SLB",
            "EOG",
            "MPC",
            "PSX",
            "VLO",
            "OXY",
            "HES",
            "KMI",
            "WMB",
        ]
        for t in energy_tickers:
            self.sector_map[t] = "Energy"

        # Utilities
        utility_tickers = [
            "NEE",
            "DUK",
            "SO",
            "D",
            "AEP",
            "EXC",
            "SRE",
            "XEL",
            "WEC",
            "ED",
            "ES",
            "PEG",
        ]
        for t in utility_tickers:
            self.sector_map[t] = "Utilities"

        # Real Estate
        realestate_tickers = [
            "AMT",
            "PLD",
            "CCI",
            "EQIX",
            "PSA",
            "SPG",
            "DLR",
            "O",
            "WELL",
            "AVB",
            "EQR",
            "VICI",
        ]
        for t in realestate_tickers:
            self.sector_map[t] = "Real Estate"

        # Materials
        materials_tickers = [
            "LIN",
            "APD",
            "SHW",
            "ECL",
            "DD",
            "NEM",
            "FCX",
            "DOW",
            "NUE",
            "VMC",
            "MLM",
        ]
        for t in materials_tickers:
            self.sector_map[t] = "Materials"

        logger.info(f"Loaded {len(self.sector_map)} default sector mappings")

    def get_sector(self, ticker: str) -> str:
        """Get sector for a ticker, returns 'Unknown' if not mapped"""
        return self.sector_map.get(ticker.upper(), "Unknown")

    def get_industry(self, ticker: str) -> Optional[str]:
        """Get industry for a ticker"""
        return self.industry_map.get(ticker.upper())

    def set_sector(self, ticker: str, sector: str) -> None:
        """Set sector for a ticker (from Yahoo enrichment)"""
        self.sector_map[ticker.upper()] = sector

    def set_industry(self, ticker: str, industry: str) -> None:
        """Set industry for a ticker (from Yahoo enrichment)"""
        self.industry_map[ticker.upper()] = industry

    def get_tickers_by_sector(self, sector: str) -> list:
        """Get all tickers in a sector"""
        return [t for t, s in self.sector_map.items() if s == sector]


# Global instance
sector_registry = SectorRegistry()
