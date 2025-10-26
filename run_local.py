#!/usr/bin/env python3
"""
Local development server for FinModAI
This script runs the FastAPI app locally for testing
"""

import os
import sys
import logging
import socket
import uvicorn

# Configure logging
logging.basicConfig(
    level=logging.DEBUG,  # Changed to DEBUG for more information
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# Set environment variables for local testing
os.environ["PORT"] = "8080"  # Changed port to 8080
os.environ["DATA_MODE"] = "test"
os.environ["DATA_STALENESS_MAX_MIN"] = "30"
os.environ["REQUIRE_MIN_FUND_YEARS"] = "3"
os.environ["JWT_SECRET"] = "local-dev-secret-key-for-testing-only"
os.environ["DATABASE_URL"] = "sqlite:///./finmodai_local.db"

# Add the current directory to the Python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

def check_port_available(port):
    """Check if the port is available"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex(('localhost', port)) != 0

def create_minimal_app():
    """Create a minimal FastAPI app for testing"""
    from fastapi import FastAPI
    
    minimal_app = FastAPI(title="FinModAI Minimal")
    
    @minimal_app.get("/")
    def read_root():
        return {"message": "FinModAI Minimal App is running"}
    
    @minimal_app.get("/healthz")
    def healthz():
        return {"status": "ok"}
    
    return minimal_app

def main():
    """Run the FastAPI app locally"""
    port = int(os.environ.get("PORT", 8080))
    
    # Check if port is available
    if not check_port_available(port):
        logger.error(f"Port {port} is already in use. Try a different port.")
        sys.exit(1)
    
    try:
        logger.info("Attempting to import app from backend/app.py...")
        
        # First try to import the real app
        try:
            from backend.app import app
            logger.info("Successfully imported app from backend/app.py")
        except ImportError as e:
            logger.warning(f"Could not import app from backend/app.py: {e}")
            logger.warning("Creating minimal app for testing instead")
            app = create_minimal_app()
        
        # Run the app with uvicorn
        logger.info(f"Starting local server on http://localhost:{port}")
        logger.info(f"Visit http://localhost:{port}/healthz to test the health check")
        logger.info(f"Visit http://localhost:{port}/docs for API documentation")
        
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=port,
            log_level="debug",  # Changed to debug for more information
            reload=True,  # Enable auto-reload for development
        )
    except Exception as e:
        logger.error(f"Error starting server: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()
