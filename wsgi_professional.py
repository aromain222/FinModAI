#!/usr/bin/env python3
"""
WSGI entry point for Professional IB Modeling App
Compatible with Gunicorn and Render deployment
"""

import os
import sys
from pathlib import Path

# Add current directory to Python path
current_dir = Path(__file__).parent
sys.path.insert(0, str(current_dir))

# Import the FastAPI app
from simple_professional_app import app

# This is the WSGI application that Gunicorn will use
application = app

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
