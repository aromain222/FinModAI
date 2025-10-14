#!/bin/bash
# FinModAI Market Overview API - Quick Start Script

echo "🚀 Starting FinModAI Market Overview API..."

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
source venv/bin/activate

# Install/upgrade dependencies
echo "📚 Installing dependencies..."
pip install -q -r backend/requirements.txt

# Check if EDGAR data exists
if [ ! -f "dataset/edgar_fundamentals.parquet" ] && [ ! -f "dataset/edgar_fundamentals.csv" ]; then
    echo "❌ ERROR: EDGAR fundamentals data not found!"
    echo "   Please run the edgar_bulk_ingestion.py script first:"
    echo "   python edgar_bulk_ingestion.py --max-tickers 1000 --concurrency 3 --jitter 1.0"
    exit 1
fi

echo "✅ Data found"
echo ""
echo "Starting API server on http://localhost:8000"
echo "  - API Docs:    http://localhost:8000/docs"
echo "  - Health Check: http://localhost:8000/healthz"
echo ""
echo "Press Ctrl+C to stop"
echo ""

# Start the server
cd backend && python app.py
