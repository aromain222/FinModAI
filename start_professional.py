#!/usr/bin/env python3
"""
Professional IB Modeling App Startup Script
Banker-grade financial modeling platform with DCF, LBO, Trading Comps, and Merger models.
"""

import os
import sys
import uvicorn
from pathlib import Path

def main():
    """Start the professional financial modeling app."""
    print("🏦 Starting FinModAI Professional - Banker-Grade Financial Modeling Platform")
    print("=" * 80)
    
    # Add current directory to Python path
    current_dir = Path(__file__).parent
    sys.path.insert(0, str(current_dir))
    
    # Check if we're in the right directory
    if not (current_dir / "professional_app.py").exists():
        print("❌ Error: professional_app.py not found in current directory")
        print("   Please run this script from the project root directory")
        sys.exit(1)
    
    # Check critical dependencies
    try:
        import fastapi
        import uvicorn
        import openpyxl
        print("✅ Core dependencies verified")
    except ImportError as e:
        print(f"❌ Missing dependency: {e}")
        print("   Please install requirements: pip install -r requirements_professional.txt")
        sys.exit(1)
    
    # Check if models directory exists
    models_dir = current_dir / "models"
    if not models_dir.exists():
        print("❌ Error: models directory not found")
        print("   Please ensure all model files are in place")
        sys.exit(1)
    
    # Check if LBO and financial_data modules exist
    lbo_dir = current_dir / "lbo_model"
    financial_data_dir = current_dir / "financial_data"
    
    if not lbo_dir.exists():
        print("❌ Error: lbo_model directory not found")
        print("   Please ensure the LBO model is properly set up")
        sys.exit(1)
    
    if not financial_data_dir.exists():
        print("❌ Error: financial_data directory not found")
        print("   Please ensure the financial data engine is properly set up")
        sys.exit(1)
    
    print("✅ All modules verified")
    
    # Get port from environment or use default
    port = int(os.environ.get("PORT", 8000))
    
    print(f"🚀 Starting server on port {port}")
    print(f"📊 Dashboard: http://localhost:{port}")
    print(f"🔍 Health Check: http://localhost:{port}/healthz")
    print("=" * 80)
    
    # Start the server
    try:
        uvicorn.run(
            "professional_app:app",
            host="0.0.0.0",
            port=port,
            reload=False,  # Disable reload in production
            log_level="info"
        )
    except KeyboardInterrupt:
        print("\n👋 Shutting down FinModAI Professional...")
    except Exception as e:
        print(f"❌ Error starting server: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
