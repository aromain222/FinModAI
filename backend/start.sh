#!/bin/bash
# Start FinModAI Backend Server

echo "🚀 Starting FinModAI Backend..."
echo ""

# Activate virtual environment if it exists
if [ -d "venv" ]; then
    echo "🔧 Activating virtual environment..."
    source venv/bin/activate
    echo "✅ Virtual environment activated"
    echo ""
fi

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found"
    echo "   Run setup.sh first to create .env file"
    echo ""
fi

# Start server
echo "🌐 Starting server on http://localhost:8000"
echo "📚 API docs: http://localhost:8000/api/docs"
echo "❤️  Health: http://localhost:8000/health"
echo ""
echo "Press Ctrl+C to stop"
echo ""

python app.py

