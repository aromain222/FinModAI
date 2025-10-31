"""
FinModAI Backend - FastAPI Application Entry Point
This is the main entry point for Gunicorn to load the FastAPI app
"""

import logging
import os
import sys

# Configure logging to stdout for Fly.io
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
)
logger = logging.getLogger(__name__)

# Import the app from app.py
try:
    from app import app
    logger.info("Successfully imported app from app.py")
except ImportError as e:
    logger.error(f"Failed to import app from app.py: {e}")
    raise

# Add a simple health check function if it doesn't exist
if not any(route.path == "/healthz" for route in app.routes):
    from fastapi import FastAPI
    
    @app.get("/healthz")
    async def healthz():
        """Health check endpoint for Fly.io"""
        return {"status": "ok"}
    
    logger.info("Added /healthz endpoint")

# Log startup information
logger.info(f"App ready to serve on 0.0.0.0:{os.environ.get('PORT', 8080)}")
