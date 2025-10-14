"""
In-memory TTL cache for market data
"""
import logging
from datetime import datetime, timedelta
from typing import Dict, Optional, List

from backend.config import config

logger = logging.getLogger(__name__)


class TTLCache:
    """Simple in-memory cache with TTL"""
    
    def __init__(self, ttl_minutes: int):
        self.ttl_minutes = ttl_minutes
        self.cache: Dict[str, tuple] = {}  # key -> (value, expires_at)
    
    def get(self, key: str) -> Optional[any]:
        """Get value from cache if not expired"""
        if key not in self.cache:
            return None
        
        value, expires_at = self.cache[key]
        
        if datetime.utcnow() > expires_at:
            # Expired, remove
            del self.cache[key]
            return None
        
        return value
    
    def set(self, key: str, value: any) -> None:
        """Set value in cache with TTL"""
        expires_at = datetime.utcnow() + timedelta(minutes=self.ttl_minutes)
        self.cache[key] = (value, expires_at)
    
    def clear(self) -> None:
        """Clear all cached values"""
        self.cache.clear()
    
    def size(self) -> int:
        """Get number of cached items"""
        return len(self.cache)
    
    def is_stale(self, key: str) -> bool:
        """Check if key exists but is stale"""
        if key not in self.cache:
            return False
        
        _, expires_at = self.cache[key]
        return datetime.utcnow() > expires_at


class MarketCache:
    """Centralized cache for market data"""
    
    def __init__(self):
        # Snapshot cache (all tickers merged data)
        self.snapshot_cache = TTLCache(config.SNAPSHOT_TTL_MIN)
        
        # Sparkline cache (per ticker)
        self.sparkline_cache = TTLCache(config.SNAPSHOT_TTL_MIN)
        
        # Leaders cache (per sector)
        self.leaders_cache = TTLCache(config.SNAPSHOT_TTL_MIN)
    
    # Snapshot methods
    def get_snapshot(self, ticker: str) -> Optional[Dict]:
        """Get snapshot for a ticker"""
        return self.snapshot_cache.get(ticker)
    
    def set_snapshot(self, ticker: str, data: Dict) -> None:
        """Set snapshot for a ticker"""
        self.snapshot_cache.set(ticker, data)
    
    def get_all_snapshots(self) -> Dict[str, Dict]:
        """Get all cached snapshots"""
        result = {}
        for ticker in self.snapshot_cache.cache.keys():
            snapshot = self.get_snapshot(ticker)
            if snapshot:
                result[ticker] = snapshot
        return result
    
    def set_all_snapshots(self, snapshots: Dict[str, Dict]) -> None:
        """Set multiple snapshots at once"""
        for ticker, data in snapshots.items():
            self.set_snapshot(ticker, data)
    
    # Sparkline methods
    def get_sparkline(self, ticker: str) -> Optional[List[float]]:
        """Get sparkline for a ticker"""
        return self.sparkline_cache.get(ticker)
    
    def set_sparkline(self, ticker: str, sparkline: List[float]) -> None:
        """Set sparkline for a ticker"""
        self.sparkline_cache.set(ticker, sparkline)
    
    # Leaders methods
    def get_leaders(self, sector: str) -> Optional[List[Dict]]:
        """Get leaders for a sector"""
        return self.leaders_cache.get(sector)
    
    def set_leaders(self, sector: str, leaders: List[Dict]) -> None:
        """Set leaders for a sector"""
        self.leaders_cache.set(sector, leaders)
    
    # Utility methods
    def clear_all(self) -> None:
        """Clear all caches"""
        self.snapshot_cache.clear()
        self.sparkline_cache.clear()
        self.leaders_cache.clear()
        logger.info("Cleared all caches")
    
    def get_stats(self) -> Dict:
        """Get cache statistics"""
        return {
            'snapshot_count': self.snapshot_cache.size(),
            'sparkline_count': self.sparkline_cache.size(),
            'leaders_count': self.leaders_cache.size()
        }


# Global cache instance
market_cache = MarketCache()

