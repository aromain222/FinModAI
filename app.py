#!/usr/bin/env python3
"""
Production Flask application with robust startup and health checks.
"""
import os
import sys
import logging
import traceback
from datetime import datetime
from pathlib import Path
from flask import Flask, jsonify, request

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def validate_environment():
    """Validate required environment variables and exit with code 1 if missing."""
    required_env_vars = [
        'FLASK_ENV',  # Should be 'production' on Render
    ]
    
    optional_env_vars = [
        'OPENAI_API_KEY',
        'ANTHROPIC_API_KEY', 
        'DATABASE_URL',
    ]
    
    missing_vars = []
    for var in required_env_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        logger.error(f"Missing required environment variables: {', '.join(missing_vars)}")
        logger.error("Application cannot start without required configuration.")
        logger.info("Available environment variables:")
        for var in os.environ:
            if var.startswith(('FLASK_', 'PORT', 'RENDER_')):
                logger.info(f"  {var}={os.getenv(var)}")
        
        logger.error("Exiting with code 1 due to missing configuration.")
        sys.exit(1)
    
    logger.info("Environment validation passed")
    logger.info(f"Required env vars present: {', '.join(required_env_vars)}")
    logger.info(f"Optional env vars present: {', '.join([var for var in optional_env_vars if os.getenv(var)])}")

def validate_dependencies():
    """Validate critical dependencies and exit with code 1 if missing."""
    critical_deps = [
        ('openpyxl', 'openpyxl'),
        ('pandas', 'pandas'),
        ('numpy', 'numpy'),
        ('yfinance', 'yfinance'),
        ('requests', 'requests'),
    ]
    
    missing_deps = []
    for dep_name, import_name in critical_deps:
        try:
            __import__(import_name)
            logger.info(f"✓ {dep_name} imported successfully")
        except ImportError as e:
            logger.error(f"✗ Failed to import {dep_name}: {e}")
            missing_deps.append(dep_name)
    
    if missing_deps:
        logger.error(f"Missing critical dependencies: {', '.join(missing_deps)}")
        logger.error("Application cannot start without required dependencies.")
        logger.error("Please ensure all dependencies are installed:")
        logger.error("  pip install -r requirements_production.txt")
        logger.error("Exiting with code 1 due to missing dependencies.")
        sys.exit(1)
    
    logger.info("All critical dependencies validated successfully")

def create_app():
    """Create and configure Flask application."""
    app = Flask(__name__)
    
    # Basic configuration
    app.config['SECRET_KEY'] = os.getenv('FLASK_SECRET_KEY', 'dev-key-change-in-production')
    app.config['FLASK_ENV'] = os.getenv('FLASK_ENV', 'development')
    
    # Health check endpoint
    @app.route('/healthz')
    def health_check():
        """Health check endpoint for load balancers."""
        return jsonify({
            'status': 'ok',
            'timestamp': datetime.utcnow().isoformat(),
            'version': '1.0.0'
        }), 200
    
    # Root endpoint - safe fallback
    @app.route('/')
    def index():
        """Safe root endpoint that won't crash."""
        return jsonify({
            'message': 'FinModAI Financial Modeling Service',
            'status': 'running',
            'health_check': '/healthz',
            'version': '1.0.0'
        }), 200
    
    # Basic financial model endpoint
    @app.route('/generate-model', methods=['POST'])
    def generate_model():
        """Generate financial model endpoint."""
        try:
            # Basic validation
            data = request.get_json() or {}
            ticker = data.get('ticker', '').strip().upper()
            
            if not ticker:
                return jsonify({'error': 'Ticker symbol required'}), 400
            
            # Return mock model for now
            model_result = {
                'ticker': ticker,
                'company_name': f"{ticker} Corporation",
                'enterprise_value': 2500000000,
                'equity_value': 2000000000,
                'implied_price': 25.00,
                'current_price': 20.00,
                'upside_downside': 25.0,
                'model_type': 'dcf',
                'generated_at': datetime.utcnow().isoformat()
            }
            
            return jsonify(model_result), 200
            
        except Exception as e:
            logger.error(f"Error generating model: {str(e)}")
            return jsonify({'error': 'Internal server error'}), 500
    
    # Global error handler
    @app.errorhandler(Exception)
    def handle_exception(e):
        """Global exception handler with proper logging."""
        logger.error(f"Unhandled exception: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({'error': 'Internal server error'}), 500
    
    return app

def main():
    """Main application entry point with proper startup sequence."""
    try:
        # Log startup information
        logger.info("=" * 60)
        logger.info("FinModAI Financial Modeling Service - Starting Up")
        logger.info("=" * 60)
        logger.info(f"Python version: {sys.version}")
        logger.info(f"Working directory: {os.getcwd()}")
        logger.info(f"Script location: {Path(__file__).parent.absolute()}")
        
        # Get and validate port configuration
        port_str = os.getenv('PORT', '8000')
        try:
            port = int(port_str)
            if port <= 0 or port > 65535:
                raise ValueError(f"Port {port} out of valid range (1-65535)")
            logger.info(f"Using port: {port} (from PORT env var: {port_str})")
        except (ValueError, TypeError) as e:
            logger.error(f"Invalid PORT environment variable: {port_str}")
            logger.error(f"Error: {e}")
            logger.error("PORT must be a valid integer between 1-65535")
            sys.exit(1)
        
        # Validate environment
        validate_environment()
        
        # Validate dependencies
        validate_dependencies()
        
        # Create application
        app = create_app()
        
        # Server configuration
        host = '0.0.0.0'
        
        logger.info(f"Server will bind to: {host}:{port}")
        logger.info(f"Health check URL: http://{host}:{port}/healthz")
        logger.info(f"Flask environment: {app.config['FLASK_ENV']}")
        logger.info("Starting production server...")
        
        # Start server
        app.run(
            host=host,
            port=port,
            debug=False,
            threaded=True,
            use_reloader=False  # Disable reloader in production
        )
        
    except KeyboardInterrupt:
        logger.info("Received interrupt signal, shutting down gracefully...")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal startup error: {str(e)}")
        logger.error(traceback.format_exc())
        sys.exit(1)

if __name__ == '__main__':
    main()
