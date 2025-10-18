"""
Flask API endpoints for AI Investment Advisor Chatbot
"""

from flask import Blueprint, request, jsonify
import asyncio
import os
from ai_investment_advisor import (
    AIInvestmentAdvisor,
    ask_investment_question,
    explain_financial_concept,
    analyze_company,
    interpret_model,
    get_market_insights
)

# Create Blueprint for AI chatbot routes
ai_chatbot_bp = Blueprint('ai_chatbot', __name__)


@ai_chatbot_bp.route('/api/v1/ai-chatbot/ask', methods=['POST'])
def ai_chatbot_ask():
    """
    AI Investment Advisor - Ask any investment question.
    
    Request body:
    {
        "question": "Which tech companies are performing well?",
        "type": "investment"  # optional: investment, concept, company, model, market
    }
    
    Response:
    {
        "success": true,
        "response": "Based on current market data...",
        "type": "investment",
        "timestamp": "2024-01-01T00:00:00Z"
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'question' not in data:
            return jsonify({
                'success': False,
                'error': 'Question is required'
            }), 400
        
        question = data['question']
        question_type = data.get('type', 'investment')
        
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
        
        # Run the AI advisor
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            advisor = AIInvestmentAdvisor()
            
            if question_type == 'concept':
                response_text = loop.run_until_complete(
                    advisor.explain_financial_concept(question)
                )
            elif question_type == 'company':
                response_text = loop.run_until_complete(
                    advisor.analyze_company_performance(question)
                )
            elif question_type == 'model':
                output_data = data.get('output_data', {})
                model_type = data.get('model_type', 'DCF')
                response_text = loop.run_until_complete(
                    advisor.interpret_model_output(model_type, output_data)
                )
            elif question_type == 'market':
                response_text = loop.run_until_complete(
                    advisor.get_market_insights()
                )
            else:
                response_text = loop.run_until_complete(
                    advisor.ask_investment_question(question)
                )
            
            return jsonify({
                'success': True,
                'response': response_text,
                'type': question_type,
                'timestamp': datetime.now().isoformat() + 'Z'
            })
        finally:
            loop.close()
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@ai_chatbot_bp.route('/api/v1/ai-chatbot/explain', methods=['POST'])
def ai_chatbot_explain():
    """
    Explain a financial concept or metric.
    
    Request body:
    {
        "concept": "CapEx"
    }
    
    Response:
    {
        "success": true,
        "response": "CapEx (Capital Expenditures) refers to...",
        "concept": "CapEx"
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'concept' not in data:
            return jsonify({
                'success': False,
                'error': 'Concept is required'
            }), 400
        
        concept = data['concept']
        
        # Run the AI advisor
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            response_text = loop.run_until_complete(
                explain_financial_concept(concept)
            )
            
            return jsonify({
                'success': True,
                'response': response_text,
                'concept': concept
            })
        finally:
            loop.close()
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@ai_chatbot_bp.route('/api/v1/ai-chatbot/analyze/<ticker>', methods=['GET'])
def ai_chatbot_analyze(ticker):
    """
    Analyze a company's performance.
    
    Args:
        ticker: Stock ticker (e.g., 'AAPL', 'TSLA')
    
    Response:
    {
        "success": true,
        "response": "AAPL is currently trading at...",
        "ticker": "AAPL"
    }
    """
    try:
        # Run the AI advisor
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            response_text = loop.run_until_complete(
                analyze_company(ticker.upper())
            )
            
            return jsonify({
                'success': True,
                'response': response_text,
                'ticker': ticker.upper()
            })
        finally:
            loop.close()
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@ai_chatbot_bp.route('/api/v1/ai-chatbot/interpret', methods=['POST'])
def ai_chatbot_interpret():
    """
    Interpret financial model output.
    
    Request body:
    {
        "model_type": "DCF",
        "output_data": {
            "ev": 1000000,
            "equity_value": 800000,
            "implied_price": 150
        }
    }
    
    Response:
    {
        "success": true,
        "response": "This DCF model shows...",
        "model_type": "DCF"
    }
    """
    try:
        data = request.get_json()
        
        if not data or 'model_type' not in data or 'output_data' not in data:
            return jsonify({
                'success': False,
                'error': 'model_type and output_data are required'
            }), 400
        
        model_type = data['model_type']
        output_data = data['output_data']
        
        # Run the AI advisor
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            response_text = loop.run_until_complete(
                interpret_model(model_type, output_data)
            )
            
            return jsonify({
                'success': True,
                'response': response_text,
                'model_type': model_type
            })
        finally:
            loop.close()
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@ai_chatbot_bp.route('/api/v1/ai-chatbot/market-insights', methods=['GET'])
def ai_chatbot_market_insights():
    """
    Get current market insights and trends.
    
    Response:
    {
        "success": true,
        "response": "Current market conditions show...",
        "timestamp": "2024-01-01T00:00:00Z"
    }
    """
    try:
        # Run the AI advisor
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            response_text = loop.run_until_complete(
                get_market_insights()
            )
            
            return jsonify({
                'success': True,
                'response': response_text,
                'timestamp': datetime.now().isoformat() + 'Z'
            })
        finally:
            loop.close()
        
    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@ai_chatbot_bp.route('/api/v1/ai-chatbot/health', methods=['GET'])
def ai_chatbot_health():
    """Health check for AI chatbot service."""
    polygon_key = os.getenv('POLYGON_API_KEY')
    anthropic_key = os.getenv('ANTHROPIC_API_KEY')
    
    return jsonify({
        'status': 'healthy' if (polygon_key and anthropic_key) else 'degraded',
        'polygon_configured': bool(polygon_key),
        'anthropic_configured': bool(anthropic_key),
        'service': 'AI Investment Advisor Chatbot',
        'model': 'claude-4-sonnet-20250514',
        'features': [
            'investment_advice',
            'financial_concepts',
            'company_analysis',
            'model_interpretation',
            'market_insights'
        ]
    })

