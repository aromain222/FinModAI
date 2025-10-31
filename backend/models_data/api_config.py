"""
API Configuration and Client Management
"""

import os
from dataclasses import dataclass
from typing import Optional
import httpx
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

@dataclass
class APIConfig:
    """API configuration and rate limits"""
    name: str
    base_url: str
    api_key: str
    calls_per_minute: int
    calls_per_day: int
    retry_count: int = 3
    timeout: float = 10.0
    
    def __post_init__(self):
        self.last_call = datetime.min
        self.calls_today = 0
        self.calls_this_minute = 0
        self.minute_start = datetime.now()

class APIManager:
    """Manages API clients and rate limits"""
    
    def __init__(self):
        self.configs = {
            "polygon": APIConfig(
                name="Polygon.io",
                base_url="https://api.polygon.io/v2",
                api_key=os.getenv("POLYGON_API_KEY", ""),
                calls_per_minute=30,
                calls_per_day=5000
            ),
            "alpha_vantage": APIConfig(
                name="Alpha Vantage",
                base_url="https://www.alphavantage.co/query",
                api_key=os.getenv("ALPHAVANTAGE_API_KEY", ""),
                calls_per_minute=5,
                calls_per_day=500
            ),
            "finnhub": APIConfig(
                name="Finnhub",
                base_url="https://finnhub.io/api/v1",
                api_key=os.getenv("FINNHUB_API_KEY", ""),
                calls_per_minute=30,
                calls_per_day=60000
            )
        }
        
        self.clients = {}
        self._initialize_clients()
        
    def _initialize_clients(self):
        """Initialize HTTP clients for each API"""
        for name, config in self.configs.items():
            if not config.api_key:
                logger.warning(f"{config.name} API key not found")
                continue
                
            if name == "polygon":
                self.clients[name] = httpx.AsyncClient(
                    base_url=config.base_url,
                    headers={"Authorization": f"Bearer {config.api_key}"},
                    timeout=config.timeout
                )
            elif name == "alpha_vantage":
                self.clients[name] = httpx.AsyncClient(
                    base_url=config.base_url,
                    params={"apikey": config.api_key},
                    timeout=config.timeout
                )
            elif name == "finnhub":
                self.clients[name] = httpx.AsyncClient(
                    base_url=config.base_url,
                    headers={"X-Finnhub-Token": config.api_key},
                    timeout=config.timeout
                )
    
    async def close(self):
        """Close all API clients"""
        for client in self.clients.values():
            await client.aclose()
    
    def _check_rate_limits(self, config: APIConfig) -> bool:
        """Check if within rate limits"""
        now = datetime.now()
        
        # Reset daily counter at midnight
        if now.date() > config.last_call.date():
            config.calls_today = 0
        
        # Reset minute counter after 60 seconds
        if (now - config.minute_start).total_seconds() >= 60:
            config.calls_this_minute = 0
            config.minute_start = now
        
        # Check limits
        if config.calls_today >= config.calls_per_day:
            logger.warning(f"{config.name} daily limit reached")
            return False
        
        if config.calls_this_minute >= config.calls_per_minute:
            logger.warning(f"{config.name} rate limit reached")
            return False
        
        return True
    
    def _update_rate_limits(self, config: APIConfig):
        """Update rate limit counters"""
        now = datetime.now()
        config.last_call = now
        config.calls_today += 1
        config.calls_this_minute += 1
    
    async def call_api(self, 
                      provider: str, 
                      endpoint: str, 
                      method: str = "GET", 
                      **kwargs) -> Optional[dict]:
        """
        Make an API call with rate limiting and retries
        
        Args:
            provider: API provider name
            endpoint: API endpoint
            method: HTTP method
            **kwargs: Additional arguments for httpx
        
        Returns:
            API response data or None on failure
        """
        if provider not in self.configs or provider not in self.clients:
            logger.error(f"Unknown provider: {provider}")
            return None
        
        config = self.configs[provider]
        client = self.clients[provider]
        
        if not self._check_rate_limits(config):
            return None
        
        for attempt in range(config.retry_count):
            try:
                response = await client.request(method, endpoint, **kwargs)
                response.raise_for_status()
                
                self._update_rate_limits(config)
                return response.json()
                
            except httpx.HTTPError as e:
                logger.warning(f"{config.name} API call failed (attempt {attempt + 1}): {str(e)}")
                if attempt == config.retry_count - 1:
                    return None
                await httpx.AsyncClient.sleep(1)  # Wait before retry
                
            except Exception as e:
                logger.error(f"Unexpected error calling {config.name} API: {str(e)}")
                return None
    
    def get_usage_stats(self) -> dict:
        """Get API usage statistics"""
        stats = {}
        for name, config in self.configs.items():
            stats[name] = {
                "calls_today": config.calls_today,
                "calls_this_minute": config.calls_this_minute,
                "daily_limit": config.calls_per_day,
                "minute_limit": config.calls_per_minute,
                "last_call": config.last_call.isoformat() if config.last_call else None
            }
        return stats
