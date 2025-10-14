"""
Provider Health Check and Status Tracking System
Performs startup preflight checks and tracks provider availability
"""

import os
import time
import requests
from typing import Dict, Optional, List, Tuple
from datetime import datetime
from dataclasses import dataclass, field
from enum import Enum
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)


class ProviderStatus(Enum):
    """Provider health status"""
    UP = "up"
    DOWN = "down"
    RATE_LIMITED = "rate_limited"
    INVALID_KEY = "invalid_key"
    UNTESTED = "untested"


class ErrorType(Enum):
    """Standardized error types"""
    INVALID_API_KEY = "invalid_api_key"
    RATE_LIMITED = "rate_limited"
    PROVIDER_UNAVAILABLE = "provider_unavailable"
    TIMEOUT = "timeout"
    UNKNOWN = "unknown"


@dataclass
class ProviderHealth:
    """Health status of a single provider"""
    name: str
    status: ProviderStatus
    last_check: datetime
    error_type: Optional[ErrorType] = None
    error_message: Optional[str] = None
    response_time_ms: Optional[int] = None
    
    def to_log_string(self) -> str:
        """Format for logging"""
        if self.status == ProviderStatus.UP:
            return f"PROVIDER_OK {self.name} as_of={self.last_check.strftime('%Y-%m-%d %H:%M:%S')} response_time={self.response_time_ms}ms"
        else:
            return f"PROVIDER_FAIL {self.name} status={self.status.value} reason={self.error_type.value if self.error_type else 'unknown'} message={self.error_message}"


class ProviderHealthChecker:
    """
    Performs startup preflight checks and maintains provider status.
    Does not block app start if providers fail.
    """
    
    # Timeout for health checks (2 seconds as specified)
    HEALTH_CHECK_TIMEOUT = 2.0
    
    # Provider test endpoints and param names
    PROVIDERS = {
        "Finnhub": {
            "url": "https://finnhub.io/api/v1/stock/profile2",
            "params": {"symbol": "AAPL", "token": "FINNHUB_API_KEY"},
            "param_name": "token",
            "env_var": "FINNHUB_API_KEY",
            "success_field": "name"  # Response should have company name
        },
        "AlphaVantage": {
            "url": "https://www.alphavantage.co/query",
            "params": {"function": "GLOBAL_QUOTE", "symbol": "AAPL", "apikey": "ALPHAVANTAGE_API_KEY"},
            "param_name": "apikey",
            "env_var": "ALPHAVANTAGE_API_KEY",
            "error_field": "Note"  # Alpha Vantage returns "Note" for rate limits
        },
        "FMP": {
            "url": "https://financialmodelingprep.com/api/v3/profile/AAPL",
            "params": {"apikey": "FMP_API_KEY"},
            "param_name": "apikey",
            "env_var": "FMP_API_KEY",
            "success_field": "symbol"
        },
        "FRED": {
            "url": "https://api.stlouisfed.org/fred/series",
            "params": {"series_id": "DGS10", "api_key": "FRED_API_KEY", "file_type": "json"},
            "param_name": "api_key",
            "env_var": "FRED_API_KEY",
            "success_field": "seriess"
        }
    }
    
    def __init__(self):
        self.provider_status: Dict[str, ProviderHealth] = {}
        self.invalid_keys: set = set()  # Track invalid keys to fail-fast
        
    def check_all_providers(self) -> Dict[str, ProviderHealth]:
        """
        Run preflight checks on all providers with API keys.
        Does not block - marks providers as down if they fail.
        """
        logger.info("=" * 60)
        logger.info("STARTUP PREFLIGHT: Checking data providers...")
        logger.info("=" * 60)
        
        for provider_name, config in self.PROVIDERS.items():
            env_var = config["env_var"]
            api_key = os.getenv(env_var)
            
            if not api_key:
                logger.info(f"⊘ {provider_name}: No API key configured ({env_var} not set)")
                self.provider_status[provider_name] = ProviderHealth(
                    name=provider_name,
                    status=ProviderStatus.DOWN,
                    last_check=datetime.now(),
                    error_type=ErrorType.INVALID_API_KEY,
                    error_message="API key not configured"
                )
                continue
            
            # Perform health check
            health = self._test_provider(provider_name, api_key, config)
            self.provider_status[provider_name] = health
            logger.info(health.to_log_string())
            
            # Track invalid keys for fail-fast
            if health.error_type == ErrorType.INVALID_API_KEY:
                self.invalid_keys.add(provider_name)
        
        logger.info("=" * 60)
        active = sum(1 for h in self.provider_status.values() if h.status == ProviderStatus.UP)
        logger.info(f"Provider summary: {active}/{len(self.provider_status)} active")
        logger.info("=" * 60)
        
        return self.provider_status
    
    def _test_provider(self, name: str, api_key: str, config: Dict) -> ProviderHealth:
        """Test a single provider with lightweight request"""
        start_time = time.time()
        
        try:
            # Build request params
            params = config["params"].copy()
            param_name = config["param_name"]
            params[param_name] = api_key
            
            # Make request with timeout
            response = requests.get(
                config["url"],
                params=params,
                timeout=self.HEALTH_CHECK_TIMEOUT
            )
            
            response_time_ms = int((time.time() - start_time) * 1000)
            
            # Check response status
            if response.status_code == 200:
                data = response.json()
                
                # Check for provider-specific error indicators
                if "error_field" in config and config["error_field"] in data:
                    # Alpha Vantage rate limit case
                    return ProviderHealth(
                        name=name,
                        status=ProviderStatus.RATE_LIMITED,
                        last_check=datetime.now(),
                        error_type=ErrorType.RATE_LIMITED,
                        error_message=str(data.get(config["error_field"])),
                        response_time_ms=response_time_ms
                    )
                
                # Verify success field exists
                success_field = config.get("success_field")
                if success_field and success_field in data:
                    return ProviderHealth(
                        name=name,
                        status=ProviderStatus.UP,
                        last_check=datetime.now(),
                        response_time_ms=response_time_ms
                    )
                
                # Success but unexpected format
                return ProviderHealth(
                    name=name,
                    status=ProviderStatus.UP,
                    last_check=datetime.now(),
                    response_time_ms=response_time_ms
                )
            
            # Map HTTP errors
            error_type, error_msg = self._map_http_error(response.status_code, response.text)
            return ProviderHealth(
                name=name,
                status=ProviderStatus.DOWN,
                last_check=datetime.now(),
                error_type=error_type,
                error_message=error_msg,
                response_time_ms=response_time_ms
            )
        
        except requests.Timeout:
            return ProviderHealth(
                name=name,
                status=ProviderStatus.DOWN,
                last_check=datetime.now(),
                error_type=ErrorType.TIMEOUT,
                error_message=f"Request timeout ({self.HEALTH_CHECK_TIMEOUT}s)"
            )
        
        except Exception as e:
            return ProviderHealth(
                name=name,
                status=ProviderStatus.DOWN,
                last_check=datetime.now(),
                error_type=ErrorType.UNKNOWN,
                error_message=str(e)
            )
    
    def _map_http_error(self, status_code: int, response_text: str) -> Tuple[ErrorType, str]:
        """Map HTTP status codes to standardized error types"""
        if status_code in (401, 403):
            return ErrorType.INVALID_API_KEY, f"{status_code} Invalid API key"
        elif status_code == 429:
            return ErrorType.RATE_LIMITED, "429 Rate limit exceeded"
        elif status_code >= 500:
            return ErrorType.PROVIDER_UNAVAILABLE, f"{status_code} Server error"
        else:
            return ErrorType.UNKNOWN, f"{status_code} {response_text[:100]}"
    
    def is_provider_available(self, provider_name: str) -> bool:
        """Check if provider is available for use"""
        health = self.provider_status.get(provider_name)
        if not health:
            return False
        return health.status == ProviderStatus.UP
    
    def should_skip_provider(self, provider_name: str) -> bool:
        """Check if provider should be skipped (fail-fast for invalid keys)"""
        return provider_name in self.invalid_keys
    
    def get_status_summary(self) -> Dict:
        """Get summary for API responses"""
        return {
            provider: {
                "status": health.status.value,
                "last_check": health.last_check.isoformat(),
                "response_time_ms": health.response_time_ms
            }
            for provider, health in self.provider_status.items()
        }


# Global instance
_health_checker = None


def get_health_checker() -> ProviderHealthChecker:
    """Get or create global health checker instance"""
    global _health_checker
    if _health_checker is None:
        _health_checker = ProviderHealthChecker()
        _health_checker.check_all_providers()
    return _health_checker


def run_startup_checks():
    """Run startup preflight checks - call this when app starts"""
    return get_health_checker()

