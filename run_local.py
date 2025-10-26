#!/usr/bin/env python3
"""
Local development server for FinModAI
This script runs the FastAPI app locally for testing
"""

import os
import sys
import logging
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# Set environment variables for local testing
os.environ["PORT"] = "8000"
os.environ["DATA_MODE"] = "test"
os.environ["DATA_STALENESS_MAX_MIN"] = "30"
os.environ["REQUIRE_MIN_FUND_YEARS"] = "3"
os.environ["JWT_SECRET"] = "local-dev-secret-key-for-testing-only"
os.environ["DATABASE_URL"] = "sqlite:///./finmodai_local.db"

# Add the current directory to the Python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

def main():
    """Run the FastAPI app locally"""
    try:
        # Import the app from backend/app.py
        from backend.app import app
        logger.info("Successfully imported app from backend/app.py")
        
        # Run the app with uvicorn
        logger.info(f"Starting local server on http://localhost:{os.environ.get('PORT')}")
        logger.info(f"Visit http://localhost:{os.environ.get('PORT')}/healthz to test the health check")
        logger.info(f"Visit http://localhost:{os.environ.get('PORT')}/docs for API documentation")
        
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=int(os.environ.get("PORT", 8000)),
            log_level="info",
            reload=True,  # Enable auto-reload for development
        )
    except ImportError as e:
        logger.error(f"Failed to import app: {e}")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Error starting server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
