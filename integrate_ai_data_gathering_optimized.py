"""
Optimized AI Data Gathering Integration
Uses cost optimization features to minimize AI costs
"""

import asyncio
import os
from typing import Dict, Any, Optional
from ai_enhanced_data_gatherer import (
    AIEnhancedDataGatherer,
    gather_company_data_ai,
    validate_data_ai,
    fill_missing_data_ai,
    get_peer_comparison_ai
)
from ai_cost_optimizer import (
    ai_cost_optimizer,
    optimize_ai_usage,
    get_optimization_config,
    print_optimization_stats
)


class OptimizedAIDataIntegration:
    """
    Optimized integration layer with cost optimization.
    """
    
    def __init__(self):
        self.gatherer = AIEnhancedDataGatherer()
        self._use_ai_enhanced = os.getenv('USE_AI_DATA_ENHANCEMENT', 'false').lower() == 'true'
        self.cache_enabled = os.getenv('AI_CACHE_ENABLED', 'true').lower() == 'true'
    
    def enable_ai_enhanced(self):
        """Enable AI-enhanced data gathering."""
        self._use_ai_enhanced = True
        print("✅ AI enhancement enabled")
    
    def disable_ai_enhanced(self):
        """Disable AI-enhanced data gathering."""
        self._use_ai_enhanced = False
        print("❌ AI enhancement disabled")
    
    def get_cache_stats(self):
        """Get cache statistics."""
        return ai_cost_optimizer.get_cache_stats()
    
    def clear_cache(self):
        """Clear cache."""
        ai_cost_optimizer.clear_cache()
    
    def get_company_data_with_ai(self, ticker: str, existing_data: Optional[Dict] = None) -> Optional[Dict[str, Any]]:
        """
        Get company data using AI-enhanced methods with optimization.
        
        Args:
            ticker: Stock ticker symbol
            existing_data: Existing data to assess quality
            
        Returns:
            Enhanced company data or None if skipped
        """
        if not self._use_ai_enhanced:
            return None
        
        # Assess data quality
        data_quality_score = 100
        if existing_data:
            # Simple quality assessment
            has_market_data = bool(existing_data.get('market', {}).get('price', 0))
            has_historicals = bool(existing_data.get('historicals'))
            has_capital = bool(existing_data.get('capital', {}).get('cash', 0))
            
            if not has_market_data:
                data_quality_score -= 30
            if not has_historicals:
                data_quality_score -= 30
            if not has_capital:
                data_quality_score -= 20
        
        # Check if AI should be used
        if not ai_cost_optimizer.should_use_ai(data_quality_score):
            return None
        
        try:
            # Check cache first
            if self.cache_enabled:
                cached_result = ai_cost_optimizer.optimize_request(
                    ticker=ticker,
                    query_type='data_gathering',
                    data_quality_score=data_quality_score
                )
                if cached_result:
                    print(f"✅ Using cached AI data for {ticker}")
                    return cached_result
            
            # Run async function in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                data = loop.run_until_complete(
                    self.gatherer.gather_company_data(ticker)
                )
                
                # Cache result
                if self.cache_enabled and data:
                    ai_cost_optimizer.cache_result(ticker, 'data_gathering', data)
                    ai_cost_optimizer.track_query(was_cached=False)
                
                return data
            finally:
                loop.close()
                
        except Exception as e:
            print(f"⚠️ AI-enhanced data gathering failed for {ticker}: {e}")
            return None
    
    def validate_data_with_ai(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate data using AI with optimization.
        
        Args:
            data: Company data dictionary
            
        Returns:
            Validation results
        """
        if not self._use_ai_enhanced:
            return {'data_quality_score': 0, 'ai_validation': False}
        
        try:
            # Check cache
            ticker = data.get('ticker', 'UNKNOWN')
            if self.cache_enabled:
                cached_result = ai_cost_optimizer.optimize_request(
                    ticker=ticker,
                    query_type='validation',
                    data_quality_score=50
                )
                if cached_result:
                    return cached_result
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                validation = loop.run_until_complete(
                    self.gatherer.validate_data_completeness(data)
                )
                validation['ai_validation'] = True
                
                # Cache result
                if self.cache_enabled:
                    ai_cost_optimizer.cache_result(ticker, 'validation', validation)
                    ai_cost_optimizer.track_query(was_cached=False)
                
                return validation
            finally:
                loop.close()
                
        except Exception as e:
            print(f"⚠️ AI validation failed: {e}")
            return {'data_quality_score': 0, 'ai_validation': False}
    
    def fill_missing_data_with_ai(self, data: Dict[str, Any], ticker: str) -> Dict[str, Any]:
        """
        Fill missing data using AI with optimization.
        
        Args:
            data: Partial company data
            ticker: Stock ticker
            
        Returns:
            Enhanced data with missing fields filled
        """
        if not self._use_ai_enhanced:
            return data
        
        try:
            # Check cache
            if self.cache_enabled:
                cached_result = ai_cost_optimizer.optimize_request(
                    ticker=ticker,
                    query_type='fill_missing',
                    data_quality_score=50
                )
                if cached_result:
                    return cached_result
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                enhanced = loop.run_until_complete(
                    self.gatherer.fill_missing_data(data, ticker)
                )
                
                # Cache result
                if self.cache_enabled:
                    ai_cost_optimizer.cache_result(ticker, 'fill_missing', enhanced)
                    ai_cost_optimizer.track_query(was_cached=False)
                
                return enhanced
            finally:
                loop.close()
                
        except Exception as e:
            print(f"⚠️ AI data filling failed for {ticker}: {e}")
            return data
    
    def get_peer_comparison_with_ai(self, ticker: str, peers: list) -> Dict[str, Any]:
        """
        Get peer comparison using AI with optimization.
        
        Args:
            ticker: Target ticker
            peers: List of peer tickers
            
        Returns:
            Comparison data
        """
        if not self._use_ai_enhanced:
            return {}
        
        try:
            # Check cache
            if self.cache_enabled:
                cached_result = ai_cost_optimizer.optimize_request(
                    ticker=ticker,
                    query_type='peer_comparison',
                    params={'peers': peers}
                )
                if cached_result:
                    return cached_result
            
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                comparison = loop.run_until_complete(
                    self.gatherer.get_peer_comparison(ticker, peers)
                )
                
                # Cache result
                if self.cache_enabled:
                    ai_cost_optimizer.cache_result(
                        ticker, 'peer_comparison', comparison, 
                        params={'peers': peers}
                    )
                    ai_cost_optimizer.track_query(was_cached=False)
                
                return comparison
            finally:
                loop.close()
                
        except Exception as e:
            print(f"⚠️ AI peer comparison failed for {ticker}: {e}")
            return {}


# Global instance
optimized_ai_integration = OptimizedAIDataIntegration()


def enhance_company_data_optimized(ticker: str, existing_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Optimized version of enhance_company_data_with_ai.
    
    This function:
    1. Assesses data quality
    2. Only uses AI if quality is low
    3. Uses caching to avoid redundant queries
    4. Tracks costs and statistics
    
    Args:
        ticker: Stock ticker
        existing_data: Data from traditional sources
        
    Returns:
        Enhanced data dictionary
    """
    print(f"🤖 Optimized AI Enhancement: Checking data quality for {ticker}...")
    
    # Get AI-enhanced data (with optimization)
    ai_data = optimized_ai_integration.get_company_data_with_ai(ticker, existing_data)
    
    if not ai_data:
        print(f"ℹ️ AI enhancement skipped for {ticker} (quality sufficient or disabled)")
        return existing_data
    
    # Merge data intelligently
    enhanced = existing_data.copy()
    
    # Fill in missing market data
    if not enhanced.get('market', {}).get('price') and ai_data.get('market', {}).get('price'):
        print(f"✅ AI Enhancement: Added market price ${ai_data['market']['price']:.2f}")
        enhanced['market'].update(ai_data['market'])
    
    # Fill in missing historicals
    if not enhanced.get('historicals') and ai_data.get('historicals'):
        print(f"✅ AI Enhancement: Added {len(ai_data['historicals'])} years of historicals")
        enhanced['historicals'] = ai_data['historicals']
    
    # Fill in missing capital structure
    if not enhanced.get('capital', {}).get('cash') and ai_data.get('capital', {}).get('cash'):
        print(f"✅ AI Enhancement: Added capital structure data")
        enhanced['capital'].update(ai_data['capital'])
    
    # Add validation metadata
    enhanced['ai_enhanced'] = True
    enhanced['optimization_used'] = True
    
    print(f"✅ Optimized AI Enhancement complete for {ticker}")
    
    return enhanced


# Example usage
if __name__ == "__main__":
    print("Testing Optimized AI Data Integration...\n")
    
    # Print configuration
    config = get_optimization_config()
    print("Configuration:")
    for key, value in config.items():
        print(f"  {key}: {value}")
    print()
    
    # Test with AAPL
    test_data = {
        'ticker': 'AAPL',
        'name': 'Apple Inc.',
        'market': {
            'price': 0,  # Missing price - should trigger AI
        },
        'historicals': [],
        'capital': {},
    }
    
    print("1. First request (should use AI):")
    enhanced1 = enhance_company_data_optimized('AAPL', test_data)
    print(f"   Enhanced: {enhanced1.get('ai_enhanced', False)}\n")
    
    print("2. Second request (should hit cache):")
    enhanced2 = enhance_company_data_optimized('AAPL', test_data)
    print(f"   Enhanced: {enhanced2.get('ai_enhanced', False)}\n")
    
    print("3. High quality data (should skip AI):")
    high_quality_data = {
        'ticker': 'AAPL',
        'market': {'price': 249.75},
        'historicals': [{'year': 2024, 'revenue': 383285000000}],
        'capital': {'cash': 29000000000},
    }
    enhanced3 = enhance_company_data_optimized('AAPL', high_quality_data)
    print(f"   Enhanced: {enhanced3.get('ai_enhanced', False)}\n")
    
    # Print stats
    print_optimization_stats()

