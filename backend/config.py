"""
Configuration for Market Overview API
"""
import os
from pathlib import Path


class Config:
    """Application configuration"""
    
    # Cache settings
    SNAPSHOT_TTL_MIN: int = int(os.getenv("SNAPSHOT_TTL_MIN", "15"))
    REFRESH_INTERVAL_MIN: int = int(os.getenv("REFRESH_INTERVAL_MIN", "15"))
    
    # Yahoo Finance settings
    YAHOO_BATCH_SIZE: int = int(os.getenv("YAHOO_BATCH_SIZE", "100"))
    YAHOO_REQUEST_TIMEOUT: float = float(os.getenv("YAHOO_REQUEST_TIMEOUT", "4.0"))
    YAHOO_MAX_RETRIES: int = 3
    YAHOO_RETRY_BACKOFF: float = 2.0  # Exponential backoff multiplier
    
    # Data paths
    BASE_DIR = Path(__file__).parent.parent
    DATASET_DIR = BASE_DIR / "dataset"
    EDGAR_FUNDAMENTALS_PATH = DATASET_DIR / "edgar_fundamentals.parquet"
    EDGAR_FUNDAMENTALS_CSV = DATASET_DIR / "edgar_fundamentals.csv"
    
    # Limits
    MAX_TICKERS: int = int(os.getenv("MAX_TICKERS", "1200"))
    MAX_SNAPSHOT_LIMIT: int = 500
    DEFAULT_SNAPSHOT_LIMIT: int = 100
    MAX_LEADERS_LIMIT: int = 10
    DEFAULT_LEADERS_LIMIT: int = 3
    
    # Sparkline settings
    SPARKLINE_TOP_N: int = 100  # Only prefetch sparklines for top N by market cap
    
    # CORS
    CORS_ORIGINS: list = [
        "http://localhost:5000",
        "http://localhost:8000",
        "https://finmodai-z9qvtg.fly.dev"
    ]
    
    # API settings
    API_VERSION: str = "v1"
    
    @classmethod
    def validate(cls):
        """Validate configuration and data files"""
        if not cls.EDGAR_FUNDAMENTALS_PATH.exists() and not cls.EDGAR_FUNDAMENTALS_CSV.exists():
            raise FileNotFoundError(
                f"EDGAR fundamentals not found at {cls.EDGAR_FUNDAMENTALS_PATH} or {cls.EDGAR_FUNDAMENTALS_CSV}"
            )


config = Config()

