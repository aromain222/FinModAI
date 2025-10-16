"""
Flask API endpoint for AI Financial Analyst
Integrates with existing FinModAI platform
"""

from flask import Blueprint, request, jsonify
import asyncio
from ai_financial_analyst import create_agent, single_query
import os

# Create Blueprint for AI analyst routes
ai_analyst_bp = Blueprint('ai_analyst', __name__)


@ai_analyst_bp.route('/api/v1/ai-analyst/query', methods=['POST'])
def ai_analyst_query():
    """
    AI Financial Analyst query endpoint.
    
    Request body:
    {
        "query": "How is AAPL performing compared to AMZN?",
        "include_history": false  # optional
    }
    
    Response:
    {
        "success": true,
        "response": "Based on the latest market data...",
        "model": "claude-4-sonnet-20250514",
        "sources": ["polygon.io"]
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'query' not in data:
            return jsonify({
                'success': False,
                'error': 'Query is required'
            }), 400
        
        query = data['query']
        include_history = data.get('include_history', False)
        
        # Check API keys
        if not os.getenv('POLYGON_API_KEY'):
            return jsonify({
                'success': False,
                'error': 'Polygon.io API key not configured'
            }), 503
        
        if not os.getenv('ANTHROPIC_API_KEY'):
            return jsonify({
                'success': False,
                'error': 'Anthropic API key not configured'
            }), 503
        
        # Run the AI analyst query
        # Use asyncio to run the async function
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            response_text = loop.run_until_complete(single_query(query))
            
            return jsonify({
                'success': True,
                'response': response_text,
                'model': 'claude-4-sonnet-20250514',
                'sources': ['polygon.io'],
                'query': query
            })
        finally:
            loop.close()
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@ai_analyst_bp.route('/api/v1/ai-analyst/health', methods=['GET'])
def ai_analyst_health():
    """Health check for AI analyst service."""
    polygon_key = os.getenv('POLYGON_API_KEY')
    anthropic_key = os.getenv('ANTHROPIC_API_KEY')
    
    return jsonify({
        'status': 'healthy' if (polygon_key and anthropic_key) else 'degraded',
        'polygon_configured': bool(polygon_key),
        'anthropic_configured': bool(anthropic_key),
        'service': 'AI Financial Analyst',
        'model': 'claude-4-sonnet-20250514'
    })

