"""
Configuration for the financial data layer.
"""
import os
from typing import Dict, List, Optional
from dataclasses import dataclass


@dataclass
class DataConfig:
    """Configuration for data layer operations."""
    
    # Environment (required global switches)
    data_mode: str = os.getenv("DATA_MODE", "production")  # production (default)
    staleness_max_minutes: int = int(os.getenv("DATA_STALENESS_MAX_MIN", "30"))
    
    # Provider API Keys (optional - if present, provider is enabled)
    finnhub_api_key: Optional[str] = os.getenv("FINNHUB_API_KEY")
    alphavantage_api_key: Optional[str] = os.getenv("ALPHAVANTAGE_API_KEY")
    fmp_api_key: Optional[str] = os.getenv("FMP_API_KEY")
    fred_api_key: Optional[str] = os.getenv("FRED_API_KEY")
    polygon_api_key: Optional[str] = os.getenv("POLYGON_API_KEY")
    
    # Cache TTL settings (in minutes)
    fundamentals_ttl: int = 24 * 60  # 24 hours
    quotes_ttl: int = 15  # 15 minutes
    charts_ttl: int = 15  # 15 minutes
    meta_ttl: int = 7 * 24 * 60  # 7 days
    risk_free_ttl: int = 24 * 60  # 24 hours
    
    # Batch processing
    quote_batch_size: int = 100
    max_retries: int = 3
    retry_delay: float = 1.0
    
    # Data validation
    market_cap_tolerance: float = 0.15  # 15% tolerance for market cap consistency
    
    # Provider priority (fixed order)
    fundamentals_priority: List[str] = ["edgar", "fmp", "finnhub", "alphavantage"]
    quotes_priority: List[str] = ["yahoo", "finnhub", "alphavantage", "fmp"]
    charts_priority: List[str] = ["yahoo", "finnhub", "fmp"]
    meta_priority: List[str] = ["finnhub", "fmp", "alphavantage", "yahoo"]
    risk_free_priority: List[str] = ["fred"]
    
    @property
    def is_production(self) -> bool:
        """Check if running in production mode."""
        return self.data_mode.lower() == "production"
    
    @property
    def enabled_providers(self) -> List[str]:
        """Get list of enabled providers based on available API keys."""
        providers = ["edgar", "yahoo"]  # Always enabled (no keys required)
        
        if self.finnhub_api_key:
            providers.append("finnhub")
        if self.alphavantage_api_key:
            providers.append("alphavantage")
        if self.fmp_api_key:
            providers.append("fmp")
        if self.fred_api_key:
            providers.append("fred")
        if self.polygon_api_key:
            providers.append("polygon")
            
        return providers
    
    def get_provider_config(self, provider: str) -> Dict:
        """Get configuration for a specific provider."""
        configs = {
            "finnhub": {
                "api_key": self.finnhub_api_key,
                "base_url": "https://finnhub.io/api/v1",
                "rate_limit": 60,  # requests per minute
            },
            "alphavantage": {
                "api_key": self.alphavantage_api_key,
                "base_url": "https://www.alphavantage.co/query",
                "rate_limit": 5,  # requests per minute (free tier)
            },
            "fmp": {
                "api_key": self.fmp_api_key,
                "base_url": "https://financialmodelingprep.com/api/v3",
                "rate_limit": 250,  # requests per minute
            },
            "fred": {
                "api_key": self.fred_api_key,
                "base_url": "https://api.stlouisfed.org/fred",
                "rate_limit": 120,  # requests per minute
            },
            "polygon": {
                "api_key": self.polygon_api_key,
                "base_url": "https://api.polygon.io",
                "rate_limit": 1000,  # requests per minute
            },
            "edgar": {
                "base_url": "https://data.sec.gov/api/xbrl/companyfacts",
                "rate_limit": 10,  # requests per second
            },
            "yahoo": {
                "base_url": "https://query1.finance.yahoo.com/v8/finance/chart",
                "rate_limit": 100,  # requests per minute
            }
        }
        
        return configs.get(provider, {})


# Global config instance
config = DataConfig()