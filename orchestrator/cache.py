"""
In-memory TTL cache with optional disk snapshots for financial data.
"""
import asyncio
import logging
import pickle
import os
from typing import Dict, Optional, Any
from datetime import datetime, timedelta
from dataclasses import dataclass
from providers.base import ProviderResult
from config import config


@dataclass
class CacheEntry:
    """Cache entry with TTL and metadata."""
    data: Dict[str, Any]
    provider: str
    as_of: datetime
    ttl_minutes: int
    data_type: str
    
    @property
    def is_expired(self) -> bool:
        """Check if cache entry is expired."""
        return datetime.utcnow() - self.as_of > timedelta(minutes=self.ttl_minutes)
    
    @property
    def is_stale(self) -> bool:
        """Check if data is stale based on global staleness threshold."""
        return datetime.utcnow() - self.as_of > timedelta(minutes=config.staleness_max_minutes)


class CacheManager:
    """In-memory TTL cache manager for financial data."""
    
    def __init__(self):
        self.logger = logging.getLogger("orchestrator.cache")
        self._cache: Dict[str, CacheEntry] = {}
        self._lock = asyncio.Lock()
        self._snapshot_dir = "cache_snapshots"
        self._snapshot_file = os.path.join(self._snapshot_dir, "cache.pkl")
        
        # Ensure snapshot directory exists
        os.makedirs(self._snapshot_dir, exist_ok=True)
        
        # Load snapshot on startup
        asyncio.create_task(self._load_snapshot())
    
    def _get_cache_key(self, ticker: str, data_type: str) -> str:
        """Generate cache key for ticker and data type."""
        return f"{ticker.upper()}:{data_type}"
    
    def _get_ttl(self, data_type: str) -> int:
        """Get TTL in minutes for data type."""
        ttl_map = {
            "fundamentals": config.fundamentals_ttl,
            "quotes": config.quotes_ttl,
            "charts": config.charts_ttl,
            "metadata": config.meta_ttl,
            "risk_free": config.risk_free_ttl
        }
        return ttl_map.get(data_type, config.quotes_ttl)
    
    async def get(self, ticker: str, data_type: str) -> Optional[ProviderResult]:
        """Get cached data for ticker and data type."""
        async with self._lock:
            key = self._get_cache_key(ticker, data_type)
            entry = self._cache.get(key)
            
            if entry is None:
                return None
            
            if entry.is_expired:
                # Remove expired entry
                del self._cache[key]
                self.logger.debug(f"Cache entry expired for {ticker}:{data_type}")
                return None
            
            self.logger.debug(f"Cache hit for {ticker}:{data_type}")
            return ProviderResult(
                success=True,
                data=entry.data,
                provider=entry.provider,
                as_of=entry.as_of
            )
    
    async def set(self, ticker: str, data_type: str, result: ProviderResult) -> None:
        """Cache data for ticker and data type."""
        if not result.success or not result.data:
            return
        
        async with self._lock:
            key = self._get_cache_key(ticker, data_type)
            ttl = self._get_ttl(data_type)
            
            entry = CacheEntry(
                data=result.data,
                provider=result.provider or "unknown",
                as_of=result.as_of or datetime.utcnow(),
                ttl_minutes=ttl,
                data_type=data_type
            )
            
            self._cache[key] = entry
            self.logger.debug(f"Cached {ticker}:{data_type} from {result.provider}")
    
    async def invalidate(self, ticker: str, data_type: str = None) -> None:
        """Invalidate cache for ticker (optionally specific data type)."""
        async with self._lock:
            if data_type:
                key = self._get_cache_key(ticker, data_type)
                if key in self._cache:
                    del self._cache[key]
                    self.logger.debug(f"Invalidated cache for {ticker}:{data_type}")
            else:
                # Remove all entries for this ticker
                keys_to_remove = [k for k in self._cache.keys() if k.startswith(f"{ticker.upper()}:")]
                for key in keys_to_remove:
                    del self._cache[key]
                self.logger.debug(f"Invalidated all cache for {ticker}")
    
    async def clear(self) -> None:
        """Clear all cached data."""
        async with self._lock:
            self._cache.clear()
            self.logger.info("Cache cleared")
    
    async def cleanup_expired(self) -> int:
        """Remove expired entries from cache."""
        async with self._lock:
            expired_keys = [k for k, v in self._cache.items() if v.is_expired]
            for key in expired_keys:
                del self._cache[key]
            
            if expired_keys:
                self.logger.info(f"Cleaned up {len(expired_keys)} expired cache entries")
            
            return len(expired_keys)
    
    async def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        async with self._lock:
            total_entries = len(self._cache)
            expired_entries = sum(1 for entry in self._cache.values() if entry.is_expired)
            stale_entries = sum(1 for entry in self._cache.values() if entry.is_stale)
            
            # Count by data type
            by_type = {}
            for entry in self._cache.values():
                if entry.data_type not in by_type:
                    by_type[entry.data_type] = 0
                by_type[entry.data_type] += 1
            
            # Count by provider
            by_provider = {}
            for entry in self._cache.values():
                if entry.provider not in by_provider:
                    by_provider[entry.provider] = 0
                by_provider[entry.provider] += 1
            
            return {
                "total_entries": total_entries,
                "expired_entries": expired_entries,
                "stale_entries": stale_entries,
                "by_data_type": by_type,
                "by_provider": by_provider,
                "cache_size_mb": self._estimate_cache_size()
            }
    
    def _estimate_cache_size(self) -> float:
        """Estimate cache size in MB."""
        try:
            import sys
            total_size = 0
            for entry in self._cache.values():
                total_size += sys.getsizeof(entry.data)
            return total_size / (1024 * 1024)  # Convert to MB
        except Exception:
            return 0.0
    
    async def save_snapshot(self) -> bool:
        """Save cache snapshot to disk."""
        try:
            async with self._lock:
                # Only save non-expired entries
                snapshot_data = {
                    "timestamp": datetime.utcnow(),
                    "entries": {}
                }
                
                for key, entry in self._cache.items():
                    if not entry.is_expired:
                        snapshot_data["entries"][key] = {
                            "data": entry.data,
                            "provider": entry.provider,
                            "as_of": entry.as_of,
                            "ttl_minutes": entry.ttl_minutes,
                            "data_type": entry.data_type
                        }
                
                with open(self._snapshot_file, 'wb') as f:
                    pickle.dump(snapshot_data, f)
                
                self.logger.info(f"Cache snapshot saved with {len(snapshot_data['entries'])} entries")
                return True
                
        except Exception as e:
            self.logger.error(f"Failed to save cache snapshot: {e}")
            return False
    
    async def _load_snapshot(self) -> None:
        """Load cache snapshot from disk."""
        try:
            if not os.path.exists(self._snapshot_file):
                self.logger.info("No cache snapshot found")
                return
            
            with open(self._snapshot_file, 'rb') as f:
                snapshot_data = pickle.load(f)
            
            # Check if snapshot is too old (more than 24 hours)
            snapshot_age = datetime.utcnow() - snapshot_data["timestamp"]
            if snapshot_age > timedelta(hours=24):
                self.logger.info("Cache snapshot too old, not loading")
                return
            
            async with self._lock:
                loaded_count = 0
                for key, entry_data in snapshot_data["entries"].items():
                    entry = CacheEntry(
                        data=entry_data["data"],
                        provider=entry_data["provider"],
                        as_of=entry_data["as_of"],
                        ttl_minutes=entry_data["ttl_minutes"],
                        data_type=entry_data["data_type"]
                    )
                    
                    # Only load if not expired
                    if not entry.is_expired:
                        self._cache[key] = entry
                        loaded_count += 1
                
                self.logger.info(f"Loaded {loaded_count} entries from cache snapshot")
                
        except Exception as e:
            self.logger.error(f"Failed to load cache snapshot: {e}")
    
    async def get_ticker_cache_status(self, ticker: str) -> Dict[str, Any]:
        """Get cache status for a specific ticker."""
        async with self._lock:
            ticker_key_prefix = f"{ticker.upper()}:"
            status = {}
            
            for key, entry in self._cache.items():
                if key.startswith(ticker_key_prefix):
                    data_type = key.split(":", 1)[1]
                    status[data_type] = {
                        "cached": True,
                        "provider": entry.provider,
                        "as_of": entry.as_of.isoformat(),
                        "expired": entry.is_expired,
                        "stale": entry.is_stale,
                        "ttl_minutes": entry.ttl_minutes
                    }
            
            return status


# Global cache manager instance
cache_manager = CacheManager()
