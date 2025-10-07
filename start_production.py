#!/usr/bin/env python3
"""
Production startup script with preflight checks and robust error handling.
"""
import os
import sys
import time
import logging
import traceback
from pathlib import Path

# Configure logging before any other imports
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def log_startup_info():
    """Log comprehensive startup information."""
    logger.info("=" * 80)
    logger.info("FinModAI Production Startup")
    logger.info("=" * 80)
    logger.info(f"Python version: {sys.version}")
    logger.info(f"Python executable: {sys.executable}")
    logger.info(f"Working directory: {os.getcwd()}")
    logger.info(f"Script location: {Path(__file__).parent.absolute()}")
    logger.info(f"User: {os.getenv('USER', 'unknown')}")
    
    # Log environment variables (redacted)
    env_vars = ['PORT', 'FLASK_ENV', 'PYTHONPATH', 'RENDER']
    logger.info("Environment variables:")
    for var in env_vars:
        value = os.getenv(var, 'NOT_SET')
        if 'KEY' in var or 'SECRET' in var:
            value = 'REDACTED' if value != 'NOT_SET' else 'NOT_SET'
        logger.info(f"  {var}={value}")

def validate_environment():
    """Validate required environment variables."""
    required_vars = ['FLASK_ENV']
    optional_vars = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DATABASE_URL']
    
    missing = []
    for var in required_vars:
        if not os.getenv(var):
            missing.append(var)
    
    if missing:
        logger.error("CRITICAL: Missing required environment variables:")
        for var in missing:
            logger.error(f"  - {var}")
        logger.error("Application cannot start without required configuration.")
        
        # Log available env vars for debugging
        logger.info("Available environment variables:")
        for key in sorted(os.environ.keys()):
            if any(prefix in key.upper() for prefix in ['FLASK_', 'PORT', 'RENDER_', 'PYTHON']):
                value = os.environ[key]
                if 'KEY' in key or 'SECRET' in key:
                    value = 'REDACTED'
                logger.info(f"  {key}={value}")
        
        logger.error("Sleeping 10 seconds before exit...")
        time.sleep(10)
        logger.error("Exiting with code 1 due to missing configuration.")
        sys.exit(1)
    
    logger.info("Environment validation passed")
    present_optional = [var for var in optional_vars if os.getenv(var)]
    logger.info(f"Optional env vars present: {', '.join(present_optional) if present_optional else 'None'}")

def get_port():
    """Get port from environment with fallback."""
    port = os.getenv('PORT', '8000')
    try:
        port = int(port)
        if port <= 0 or port > 65535:
            raise ValueError(f"Port {port} out of range")
        logger.info(f"Using port: {port}")
        return port
    except (ValueError, TypeError) as e:
        logger.error(f"Invalid PORT environment variable: {port}")
        logger.error(f"Error: {e}")
        logger.error("PORT must be a valid integer between 1-65535")
        sys.exit(1)

def start_server():
    """Start the production server with proper configuration."""
    try:
        # Import here to avoid import-time issues
        from app import create_app
        
        # Create application
        app = create_app()
        
        # Get configuration
        port = get_port()
        host = '0.0.0.0'
        
        logger.info(f"Starting production server on {host}:{port}")
        logger.info(f"Health check URL: http://{host}:{port}/healthz")
        logger.info(f"Flask environment: {app.config['FLASK_ENV']}")
        logger.info("Server configuration:")
        logger.info(f"  - Host: {host}")
        logger.info(f"  - Port: {port}")
        logger.info(f"  - Debug: {app.debug}")
        logger.info(f"  - Threaded: True")
        
        # Start server
        app.run(
            host=host,
            port=port,
            debug=False,
            threaded=True,
            use_reloader=False  # Disable reloader in production
        )
        
    except ImportError as e:
        logger.error(f"Failed to import application: {e}")
        logger.error("Make sure app.py exists and is properly configured.")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        logger.error(traceback.format_exc())
        sys.exit(1)

def main():
    """Main entry point with comprehensive error handling."""
    try:
        # Log startup information
        log_startup_info()
        
        # Validate environment
        validate_environment()
        
        # Start server
        start_server()
        
    except KeyboardInterrupt:
        logger.info("Received interrupt signal, shutting down gracefully...")
        sys.exit(0)
    except Exception as e:
        logger.error(f"Fatal startup error: {e}")
        logger.error(traceback.format_exc())
        logger.error("Exiting with code 1 due to fatal error.")
        sys.exit(1)

if __name__ == '__main__':
    main()
