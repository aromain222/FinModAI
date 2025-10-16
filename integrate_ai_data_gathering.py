"""
Integration module for AI-enhanced data gathering
Connects AI-enhanced data gatherer to existing minimal_app.py endpoints
"""

import asyncio
from typing import Dict, Any, Optional
from ai_enhanced_data_gatherer import (
    AIEnhancedDataGatherer,
    gather_company_data_ai,
    validate_data_ai,
    fill_missing_data_ai,
    get_peer_comparison_ai
)


class AIDataIntegration:
    """
    Integration layer between AI-enhanced data gathering and Flask app.
    Provides both sync and async interfaces for easy integration.
    """
    
    def __init__(self):
        self.gatherer = AIEnhancedDataGatherer()
        self._use_ai_enhanced = True  # Toggle for AI enhancement
    
    def enable_ai_enhanced(self):
        """Enable AI-enhanced data gathering."""
        self._use_ai_enhanced = True
    
    def disable_ai_enhanced(self):
        """Disable AI-enhanced data gathering (use traditional methods only)."""
        self._use_ai_enhanced = False
    
    def get_company_data_with_ai(self, ticker: str) -> Optional[Dict[str, Any]]:
        """
        Get company data using AI-enhanced methods (sync wrapper).
        
        Args:
            ticker: Stock ticker symbol
            
        Returns:
            Company data dictionary or None if failed
        """
        if not self._use_ai_enhanced:
            return None
        
        try:
            # Run async function in sync context
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                data = loop.run_until_complete(
                    self.gatherer.gather_company_data(ticker)
                )
                return data
            finally:
                loop.close()
                
        except Exception as e:
            print(f"⚠️ AI-enhanced data gathering failed for {ticker}: {e}")
            return None
    
    def validate_data_with_ai(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate data using AI (sync wrapper).
        
        Args:
            data: Company data dictionary
            
        Returns:
            Validation results
        """
        if not self._use_ai_enhanced:
            return {'data_quality_score': 0, 'ai_validation': False}
        
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                validation = loop.run_until_complete(
                    self.gatherer.validate_data_completeness(data)
                )
                validation['ai_validation'] = True
                return validation
            finally:
                loop.close()
                
        except Exception as e:
            print(f"⚠️ AI validation failed: {e}")
            return {'data_quality_score': 0, 'ai_validation': False}
    
    def fill_missing_data_with_ai(self, data: Dict[str, Any], ticker: str) -> Dict[str, Any]:
        """
        Fill missing data using AI (sync wrapper).
        
        Args:
            data: Partial company data
            ticker: Stock ticker
            
        Returns:
            Enhanced data with missing fields filled
        """
        if not self._use_ai_enhanced:
            return data
        
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                enhanced = loop.run_until_complete(
                    self.gatherer.fill_missing_data(data, ticker)
                )
                return enhanced
            finally:
                loop.close()
                
        except Exception as e:
            print(f"⚠️ AI data filling failed for {ticker}: {e}")
            return data
    
    def get_peer_comparison_with_ai(self, ticker: str, peers: list) -> Dict[str, Any]:
        """
        Get peer comparison using AI (sync wrapper).
        
        Args:
            ticker: Target ticker
            peers: List of peer tickers
            
        Returns:
            Comparison data
        """
        if not self._use_ai_enhanced:
            return {}
        
        try:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            try:
                comparison = loop.run_until_complete(
                    self.gatherer.get_peer_comparison(ticker, peers)
                )
                return comparison
            finally:
                loop.close()
                
        except Exception as e:
            print(f"⚠️ AI peer comparison failed for {ticker}: {e}")
            return {}


# Global instance for easy access
ai_data_integration = AIDataIntegration()


def enhance_company_data_with_ai(ticker: str, existing_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Enhance existing company data with AI-gathered information.
    
    This function:
    1. Fetches additional data using AI
    2. Validates existing data
    3. Fills in missing fields
    4. Merges results intelligently
    
    Args:
        ticker: Stock ticker
        existing_data: Data from traditional sources (SEC EDGAR, Alpha Vantage, etc.)
        
    Returns:
        Enhanced data dictionary
    """
    print(f"🤖 AI Enhancement: Gathering additional data for {ticker}...")
    
    # Step 1: Get AI-gathered data
    ai_data = ai_data_integration.get_company_data_with_ai(ticker)
    
    if not ai_data:
        print(f"⚠️ AI data gathering failed, using existing data only")
        return existing_data
    
    # Step 2: Validate existing data
    print(f"🔍 AI Validation: Checking data quality...")
    validation = ai_data_integration.validate_data_with_ai(existing_data)
    
    print(f"📊 Data Quality Score: {validation.get('data_quality_score', 0)}/100")
    
    # Step 3: Merge data intelligently
    # Priority: AI data > Existing data (for missing fields)
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
    enhanced['data_quality_score'] = validation.get('data_quality_score', 0)
    enhanced['ai_validation'] = validation
    
    print(f"✅ AI Enhancement complete for {ticker}")
    
    return enhanced


def get_peer_comparison_for_comps(ticker: str, peers: list) -> Dict[str, Any]:
    """
    Get peer comparison data for comps analysis.
    
    Args:
        ticker: Target ticker
        peers: List of peer tickers
        
    Returns:
        Comparison data including multiples and ratios
    """
    print(f"🤖 AI Enhancement: Getting peer comparison for {ticker}...")
    
    comparison = ai_data_integration.get_peer_comparison_with_ai(ticker, peers)
    
    if comparison:
        print(f"✅ AI Enhancement: Peer comparison complete")
    else:
        print(f"⚠️ AI peer comparison failed")
    
    return comparison


# Example integration with minimal_app.py
def integrate_with_minimal_app():
    """
    Example of how to integrate AI-enhanced data gathering into minimal_app.py.
    
    Replace the existing get_company_data() function with:
    
    ```python
    def get_company_data(ticker):
        # ... existing code to get data from SEC EDGAR, Alpha Vantage, etc. ...
        
        # Enhance with AI if enabled
        if os.getenv('USE_AI_DATA_ENHANCEMENT', 'false').lower() == 'true':
            company_data = enhance_company_data_with_ai(ticker, company_data)
        
        return company_data
    ```
    """
    pass


if __name__ == "__main__":
    # Example usage
    print("Testing AI-enhanced data gathering integration...")
    
    # Test with AAPL
    test_data = {
        'ticker': 'AAPL',
        'name': 'Apple Inc.',
        'market': {
            'price': 249.75,
            'market_cap': 3850000000000,
        },
        'historicals': [],
        'capital': {},
    }
    
    print("\n1. Testing data enhancement...")
    enhanced = enhance_company_data_with_ai('AAPL', test_data)
    print(f"Enhanced data keys: {list(enhanced.keys())}")
    
    print("\n2. Testing peer comparison...")
    peers = ['MSFT', 'GOOGL', 'META']
    comparison = get_peer_comparison_for_comps('AAPL', peers)
    print(f"Comparison data keys: {list(comparison.keys())}")
    
    print("\n✅ Integration test complete!")

