"""
AI Cost Optimizer
Implements caching, selective usage, and smart routing to minimize AI costs
"""

import os
import time
import hashlib
import json
from datetime import datetime, timedelta
from typing import Dict, Any, Optional
from functools import wraps
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class AICostOptimizer:
    """
    Cost optimization for AI-enhanced data gathering.
    
    Features:
    - TTL-based caching (1 hour default)
    - Selective AI usage based on data quality
    - Request deduplication
    - Cost tracking and monitoring
    - Smart fallback to traditional methods
    """
    
    def __init__(self):
        self.cache: Dict[str, Dict[str, Any]] = {}
        self.cache_ttl = int(os.getenv('AI_CACHE_TTL', 3600))  # 1 hour default
        self.min_quality_threshold = int(os.getenv('AI_MIN_QUALITY_THRESHOLD', 70))
        self.max_daily_queries = int(os.getenv('AI_MAX_DAILY_QUERIES', 1000))
        self.cost_tracking = {
            'total_queries': 0,
            'cached_hits': 0,
            'ai_queries': 0,
            'estimated_cost': 0.0,
            'daily_queries': 0,
            'last_reset': datetime.now().date()
        }
    
    def _reset_daily_counter(self):
        """Reset daily query counter if needed."""
        today = datetime.now().date()
        if self.cost_tracking['last_reset'] != today:
            self.cost_tracking['daily_queries'] = 0
            self.cost_tracking['last_reset'] = today
            logger.info("📊 Daily AI query counter reset")
    
    def _generate_cache_key(self, ticker: str, query_type: str, params: Optional[Dict] = None) -> str:
        """Generate a unique cache key for the request."""
        key_data = {
            'ticker': ticker.upper(),
            'query_type': query_type,
            'params': params or {}
        }
        key_string = json.dumps(key_data, sort_keys=True)
        return hashlib.md5(key_string.encode()).hexdigest()
    
    def _get_cached_result(self, cache_key: str) -> Optional[Dict[str, Any]]:
        """Retrieve cached result if valid."""
        if cache_key not in self.cache:
            return None
        
        cached_data = self.cache[cache_key]
        cached_time = cached_data.get('timestamp', 0)
        age_seconds = time.time() - cached_time
        
        if age_seconds > self.cache_ttl:
            # Cache expired
            del self.cache[cache_key]
            logger.info(f"⏰ Cache expired for {cache_key} (age: {age_seconds:.0f}s)")
            return None
        
        logger.info(f"✅ Cache hit for {cache_key} (age: {age_seconds:.0f}s)")
        return cached_data.get('data')
    
    def _set_cached_result(self, cache_key: str, data: Dict[str, Any]):
        """Store result in cache."""
        self.cache[cache_key] = {
            'data': data,
            'timestamp': time.time(),
            'ttl': self.cache_ttl
        }
        logger.info(f"💾 Cached result for {cache_key}")
    
    def should_use_ai(self, data_quality_score: int = 100) -> bool:
        """
        Determine if AI enhancement should be used.
        
        Args:
            data_quality_score: Quality score of existing data (0-100)
            
        Returns:
            True if AI should be used, False otherwise
        """
        self._reset_daily_counter()
        
        # Check daily limit
        if self.cost_tracking['daily_queries'] >= self.max_daily_queries:
            logger.warning(f"⚠️ Daily AI query limit reached ({self.max_daily_queries})")
            return False
        
        # Check quality threshold
        if data_quality_score >= self.min_quality_threshold:
            logger.info(f"✅ Data quality sufficient ({data_quality_score}/100), skipping AI enhancement")
            return False
        
        logger.info(f"🤖 Data quality low ({data_quality_score}/100), using AI enhancement")
        return True
    
    def track_query(self, was_cached: bool, estimated_cost: float = 0.05):
        """Track query for cost monitoring."""
        self.cost_tracking['total_queries'] += 1
        
        if was_cached:
            self.cost_tracking['cached_hits'] += 1
            logger.info(f"💰 Cache hit - saved ${estimated_cost:.4f}")
        else:
            self.cost_tracking['ai_queries'] += 1
            self.cost_tracking['daily_queries'] += 1
            self.cost_tracking['estimated_cost'] += estimated_cost
            logger.info(f"💸 AI query - cost ${estimated_cost:.4f}")
    
    def get_cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        self._reset_daily_counter()
        
        cache_hit_rate = 0
        if self.cost_tracking['total_queries'] > 0:
            cache_hit_rate = (self.cost_tracking['cached_hits'] / 
                            self.cost_tracking['total_queries']) * 100
        
        return {
            'total_queries': self.cost_tracking['total_queries'],
            'cached_hits': self.cost_tracking['cached_hits'],
            'ai_queries': self.cost_tracking['ai_queries'],
            'cache_hit_rate': f"{cache_hit_rate:.1f}%",
            'estimated_cost': f"${self.cost_tracking['estimated_cost']:.2f}",
            'daily_queries': self.cost_tracking['daily_queries'],
            'daily_limit': self.max_daily_queries,
            'cache_size': len(self.cache),
            'cache_ttl_seconds': self.cache_ttl
        }
    
    def clear_cache(self):
        """Clear all cached data."""
        self.cache.clear()
        logger.info("🗑️ Cache cleared")
    
    def optimize_request(self, ticker: str, query_type: str, 
                        data_quality_score: int = 100,
                        params: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        """
        Optimize AI request with caching and quality checks.
        
        Args:
            ticker: Stock ticker
            query_type: Type of query (e.g., 'data_gathering', 'validation')
            data_quality_score: Quality score of existing data
            params: Additional parameters
            
        Returns:
            Cached result if available, None otherwise
        """
        # Generate cache key
        cache_key = self._generate_cache_key(ticker, query_type, params)
        
        # Check cache first
        cached_result = self._get_cached_result(cache_key)
        if cached_result:
            self.track_query(was_cached=True)
            return cached_result
        
        # Check if AI should be used
        if not self.should_use_ai(data_quality_score):
            return None
        
        # AI will be used - return None to trigger AI call
        return None
    
    def cache_result(self, ticker: str, query_type: str, 
                    result: Dict[str, Any],
                    params: Optional[Dict] = None):
        """Cache AI result."""
        cache_key = self._generate_cache_key(ticker, query_type, params)
        self._set_cached_result(cache_key, result)


# Global instance
ai_cost_optimizer = AICostOptimizer()


def optimize_ai_usage(func):
    """
    Decorator to optimize AI function calls with caching.
    
    Usage:
        @optimize_ai_usage
        async def gather_company_data_ai(ticker):
            # AI logic here
            return data
    """
    @wraps(func)
    async def wrapper(*args, **kwargs):
        ticker = args[0] if args else kwargs.get('ticker', '')
        query_type = func.__name__
        
        # Check cache
        cached_result = ai_cost_optimizer.optimize_request(
            ticker=ticker,
            query_type=query_type,
            data_quality_score=kwargs.get('data_quality_score', 100)
        )
        
        if cached_result:
            return cached_result
        
        # Call original function
        result = await func(*args, **kwargs)
        
        # Cache result
        if result:
            ai_cost_optimizer.cache_result(ticker, query_type, result)
            ai_cost_optimizer.track_query(was_cached=False)
        
        return result
    
    return wrapper


def get_optimization_config() -> Dict[str, Any]:
    """Get current optimization configuration."""
    return {
        'cache_enabled': os.getenv('AI_CACHE_ENABLED', 'true').lower() == 'true',
        'cache_ttl_seconds': int(os.getenv('AI_CACHE_TTL', 3600)),
        'min_quality_threshold': int(os.getenv('AI_MIN_QUALITY_THRESHOLD', 70)),
        'max_daily_queries': int(os.getenv('AI_MAX_DAILY_QUERIES', 1000)),
        'estimated_cost_per_query': float(os.getenv('AI_COST_PER_QUERY', 0.05)),
    }


def print_optimization_stats():
    """Print optimization statistics."""
    stats = ai_cost_optimizer.get_cache_stats()
    
    print("\n" + "="*60)
    print("💰 AI COST OPTIMIZATION STATISTICS")
    print("="*60)
    print(f"Total Queries: {stats['total_queries']}")
    print(f"Cache Hits: {stats['cached_hits']} ({stats['cache_hit_rate']})")
    print(f"AI Queries: {stats['ai_queries']}")
    print(f"Estimated Cost: {stats['estimated_cost']}")
    print(f"Daily Queries: {stats['daily_queries']}/{stats['daily_limit']}")
    print(f"Cache Size: {stats['cache_size']} entries")
    print(f"Cache TTL: {stats['cache_ttl_seconds']}s ({stats['cache_ttl_seconds']/60:.1f} min)")
    print("="*60)
    
    # Calculate savings
    if stats['total_queries'] > 0:
        savings = stats['cached_hits'] * 0.05
        print(f"\n💵 Estimated Savings: ${savings:.2f}")
        print(f"📊 Cache Hit Rate: {stats['cache_hit_rate']}")
    print()


# Example usage
if __name__ == "__main__":
    # Test optimization
    print("Testing AI Cost Optimizer...\n")
    
    # Simulate requests
    ticker = "AAPL"
    
    # First request - should use AI
    print("1. First request (no cache):")
    result = ai_cost_optimizer.optimize_request(ticker, 'data_gathering', data_quality_score=50)
    print(f"   Should use AI: {result is None}\n")
    
    # Second request - should hit cache
    print("2. Second request (should hit cache):")
    result = ai_cost_optimizer.optimize_request(ticker, 'data_gathering', data_quality_score=50)
    print(f"   Cached: {result is not None}\n")
    
    # High quality data - should skip AI
    print("3. High quality data (should skip AI):")
    result = ai_cost_optimizer.optimize_request(ticker, 'data_gathering', data_quality_score=90)
    print(f"   Should skip AI: {result is None}\n")
    
    # Print stats
    print_optimization_stats()
    
    # Test configuration
    config = get_optimization_config()
    print("Configuration:")
    for key, value in config.items():
        print(f"  {key}: {value}")

