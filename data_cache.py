#!/usr/bin/env python3
"""
Flexible data caching system for financial data
Supports multiple backends (file, memory, Redis) with TTL and invalidation
"""

import os
import json
import time
import hashlib
import logging
from typing import Any, Dict, Optional, Union
from datetime import datetime, timedelta
import threading
from pathlib import Path

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("data_cache")

class DataCache:
    """
    Flexible caching system for financial data with TTL support
    Can use filesystem, memory, or Redis backends
    """
    
    BACKENDS = ["file", "memory", "redis"]
    DEFAULT_TTL = 3600  # 1 hour default TTL
    
    def __init__(self, backend="file", base_dir="cache", redis_url=None):
        """
        Initialize the cache with the specified backend
        
        Args:
            backend: Cache backend ("file", "memory", or "redis")
            base_dir: Base directory for file cache
            redis_url: Redis connection URL (only needed for redis backend)
        """
        self.backend = backend.lower()
        if self.backend not in self.BACKENDS:
            logger.warning(f"Invalid backend '{backend}', falling back to 'file'")
            self.backend = "file"
        
        # Setup backend-specific storage
        if self.backend == "file":
            self.base_dir = Path(base_dir)
            self.base_dir.mkdir(exist_ok=True, parents=True)
            logger.info(f"Using file cache at {self.base_dir}")
        elif self.backend == "memory":
            self.cache = {}
            self.metadata = {}
            logger.info("Using in-memory cache")
        elif self.backend == "redis":
            try:
                import redis
                self.redis = redis.from_url(redis_url or os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
                logger.info("Using Redis cache")
            except (ImportError, Exception) as e:
                logger.error(f"Failed to initialize Redis cache: {e}")
                logger.info("Falling back to file cache")
                self.backend = "file"
                self.base_dir = Path(base_dir)
                self.base_dir.mkdir(exist_ok=True, parents=True)
        
        # Cache statistics
        self.stats = {
            "hits": 0,
            "misses": 0,
            "expired": 0,
            "sets": 0,
            "errors": 0,
            "last_reset": datetime.now().isoformat()
        }
        
        # Lock for thread safety
        self._lock = threading.RLock()
    
    def _generate_key(self, key_parts) -> str:
        """Generate a consistent cache key from various parts"""
        if isinstance(key_parts, str):
            key = key_parts
        elif isinstance(key_parts, (list, tuple)):
            key = "_".join(str(part) for part in key_parts)
        else:
            key = str(key_parts)
        
        # Hash long keys to keep filenames manageable
        if len(key) > 64:
            return hashlib.md5(key.encode()).hexdigest()
        return key
    
    def get(self, key_parts, default=None) -> Any:
        """
        Get a value from the cache
        
        Args:
            key_parts: String or list of strings/objects to form the cache key
            default: Default value to return if key not found
            
        Returns:
            Cached value or default if not found
        """
        key = self._generate_key(key_parts)
        
        with self._lock:
            try:
                if self.backend == "file":
                    return self._get_file(key, default)
                elif self.backend == "memory":
                    return self._get_memory(key, default)
                elif self.backend == "redis":
                    return self._get_redis(key, default)
            except Exception as e:
                logger.error(f"Cache get error for {key}: {e}")
                self.stats["errors"] += 1
                return default
    
    def _get_file(self, key, default):
        """Get from file cache"""
        cache_file = self.base_dir / f"{key}.json"
        meta_file = self.base_dir / f"{key}.meta"
        
        if not cache_file.exists() or not meta_file.exists():
            self.stats["misses"] += 1
            return default
        
        try:
            # Check expiration
            with open(meta_file, 'r') as f:
                metadata = json.load(f)
            
            expires_at = metadata.get("expires_at", 0)
            if expires_at < time.time():
                self.stats["expired"] += 1
                return default
            
            # Load data
            with open(cache_file, 'r') as f:
                data = json.load(f)
            
            self.stats["hits"] += 1
            return data
        except Exception as e:
            logger.error(f"Error reading cache file {cache_file}: {e}")
            self.stats["errors"] += 1
            return default
    
    def _get_memory(self, key, default):
        """Get from memory cache"""
        if key not in self.cache:
            self.stats["misses"] += 1
            return default
        
        # Check expiration
        metadata = self.metadata.get(key, {})
        expires_at = metadata.get("expires_at", 0)
        if expires_at < time.time():
            self.stats["expired"] += 1
            return default
        
        self.stats["hits"] += 1
        return self.cache[key]
    
    def _get_redis(self, key, default):
        """Get from Redis cache"""
        try:
            # Check if key exists
            if not self.redis.exists(key):
                self.stats["misses"] += 1
                return default
            
            # Get data and metadata
            data = self.redis.get(key)
            ttl = self.redis.ttl(key)
            
            if ttl <= 0:
                self.stats["expired"] += 1
                return default
            
            self.stats["hits"] += 1
            return json.loads(data)
        except Exception as e:
            logger.error(f"Redis error: {e}")
            self.stats["errors"] += 1
            return default
    
    def set(self, key_parts, value, ttl=None) -> bool:
        """
        Store a value in the cache with TTL
        
        Args:
            key_parts: String or list of strings/objects to form the cache key
            value: Value to store (must be JSON serializable)
            ttl: Time-to-live in seconds (None for default)
            
        Returns:
            True if successful, False otherwise
        """
        key = self._generate_key(key_parts)
        ttl = ttl if ttl is not None else self.DEFAULT_TTL
        expires_at = time.time() + ttl
        
        with self._lock:
            try:
                if self.backend == "file":
                    result = self._set_file(key, value, expires_at)
                elif self.backend == "memory":
                    result = self._set_memory(key, value, expires_at)
                elif self.backend == "redis":
                    result = self._set_redis(key, value, ttl)
                
                if result:
                    self.stats["sets"] += 1
                return result
            except Exception as e:
                logger.error(f"Cache set error for {key}: {e}")
                self.stats["errors"] += 1
                return False
    
    def _set_file(self, key, value, expires_at):
        """Set in file cache"""
        cache_file = self.base_dir / f"{key}.json"
        meta_file = self.base_dir / f"{key}.meta"
        
        try:
            # Write data
            with open(cache_file, 'w') as f:
                json.dump(value, f)
            
            # Write metadata
            metadata = {
                "expires_at": expires_at,
                "created_at": time.time()
            }
            with open(meta_file, 'w') as f:
                json.dump(metadata, f)
            
            return True
        except Exception as e:
            logger.error(f"Error writing cache file {cache_file}: {e}")
            return False
    
    def _set_memory(self, key, value, expires_at):
        """Set in memory cache"""
        self.cache[key] = value
        self.metadata[key] = {
            "expires_at": expires_at,
            "created_at": time.time()
        }
        return True
    
    def _set_redis(self, key, value, ttl):
        """Set in Redis cache"""
        try:
            serialized = json.dumps(value)
            self.redis.setex(key, ttl, serialized)
            return True
        except Exception as e:
            logger.error(f"Redis error: {e}")
            return False
    
    def delete(self, key_parts) -> bool:
        """
        Delete a key from the cache
        
        Args:
            key_parts: String or list of strings/objects to form the cache key
            
        Returns:
            True if successful, False otherwise
        """
        key = self._generate_key(key_parts)
        
        with self._lock:
            try:
                if self.backend == "file":
                    return self._delete_file(key)
                elif self.backend == "memory":
                    return self._delete_memory(key)
                elif self.backend == "redis":
                    return self._delete_redis(key)
            except Exception as e:
                logger.error(f"Cache delete error for {key}: {e}")
                self.stats["errors"] += 1
                return False
    
    def _delete_file(self, key):
        """Delete from file cache"""
        cache_file = self.base_dir / f"{key}.json"
        meta_file = self.base_dir / f"{key}.meta"
        
        try:
            if cache_file.exists():
                cache_file.unlink()
            if meta_file.exists():
                meta_file.unlink()
            return True
        except Exception as e:
            logger.error(f"Error deleting cache file {cache_file}: {e}")
            return False
    
    def _delete_memory(self, key):
        """Delete from memory cache"""
        if key in self.cache:
            del self.cache[key]
        if key in self.metadata:
            del self.metadata[key]
        return True
    
    def _delete_redis(self, key):
        """Delete from Redis cache"""
        try:
            self.redis.delete(key)
            return True
        except Exception as e:
            logger.error(f"Redis error: {e}")
            return False
    
    def clear(self) -> bool:
        """
        Clear all cached data
        
        Returns:
            True if successful, False otherwise
        """
        with self._lock:
            try:
                if self.backend == "file":
                    return self._clear_file()
                elif self.backend == "memory":
                    return self._clear_memory()
                elif self.backend == "redis":
                    return self._clear_redis()
            except Exception as e:
                logger.error(f"Cache clear error: {e}")
                self.stats["errors"] += 1
                return False
    
    def _clear_file(self):
        """Clear file cache"""
        try:
            for file_path in self.base_dir.glob("*.json"):
                file_path.unlink()
            for file_path in self.base_dir.glob("*.meta"):
                file_path.unlink()
            return True
        except Exception as e:
            logger.error(f"Error clearing file cache: {e}")
            return False
    
    def _clear_memory(self):
        """Clear memory cache"""
        self.cache = {}
        self.metadata = {}
        return True
    
    def _clear_redis(self):
        """Clear Redis cache"""
        try:
            self.redis.flushdb()
            return True
        except Exception as e:
            logger.error(f"Redis error: {e}")
            return False
    
    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        with self._lock:
            stats = self.stats.copy()
            stats["backend"] = self.backend
            stats["hit_ratio"] = self._calculate_hit_ratio()
            return stats
    
    def _calculate_hit_ratio(self) -> float:
        """Calculate cache hit ratio"""
        total = self.stats["hits"] + self.stats["misses"]
        if total == 0:
            return 0.0
        return round(self.stats["hits"] / total, 2)
    
    def reset_stats(self) -> None:
        """Reset cache statistics"""
        with self._lock:
            self.stats = {
                "hits": 0,
                "misses": 0,
                "expired": 0,
                "sets": 0,
                "errors": 0,
                "last_reset": datetime.now().isoformat()
            }
    
    def get_keys(self) -> list:
        """Get all cache keys"""
        with self._lock:
            try:
                if self.backend == "file":
                    return [f.stem for f in self.base_dir.glob("*.json")]
                elif self.backend == "memory":
                    return list(self.cache.keys())
                elif self.backend == "redis":
                    return [k.decode() for k in self.redis.keys("*")]
            except Exception as e:
                logger.error(f"Error getting keys: {e}")
                return []


# Create a global cache instance
# This will auto-select the appropriate backend based on environment
def get_cache_instance():
    """Get or create a global cache instance"""
    backend = os.environ.get("CACHE_BACKEND", "file").lower()
    
    # For production environments, prefer Redis if available
    if os.environ.get("REDIS_URL") and backend != "file":
        backend = "redis"
        redis_url = os.environ.get("REDIS_URL")
    else:
        redis_url = None
    
    # Determine cache directory
    if os.environ.get("CACHE_DIR"):
        cache_dir = os.environ.get("CACHE_DIR")
    else:
        cache_dir = "cache"
    
    return DataCache(backend=backend, base_dir=cache_dir, redis_url=redis_url)


# Global cache instance
cache = get_cache_instance()


# Convenience functions
def cache_get(key, default=None):
    """Get a value from the cache"""
    return cache.get(key, default)

def cache_set(key, value, ttl=None):
    """Set a value in the cache"""
    return cache.set(key, value, ttl)

def cache_delete(key):
    """Delete a value from the cache"""
    return cache.delete(key)

def get_cache_stats():
    """Get cache statistics"""
    return cache.get_stats()


if __name__ == "__main__":
    # Simple test
    print("Testing cache functionality...")
    
    # Test set and get
    cache_set("test_key", {"value": "test_value"}, ttl=5)
    result = cache_get("test_key")
    print(f"Set and get test: {'PASS' if result and result.get('value') == 'test_value' else 'FAIL'}")
    
    # Test expiration
    cache_set("expire_test", {"value": "should_expire"}, ttl=1)
    print("Waiting for expiration...")
    time.sleep(2)
    result = cache_get("expire_test")
    print(f"Expiration test: {'PASS' if result is None else 'FAIL'}")
    
    # Test stats
    stats = get_cache_stats()
    print(f"Cache stats: {stats}")
    print(f"Cache backend: {stats['backend']}")
