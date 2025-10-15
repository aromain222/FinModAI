#!/bin/bash
"""
Production build script with CI enforcement.
"""
set -e  # Exit on any error

echo "🚀 Starting production build with CI enforcement..."

# Check if we're in production mode
if [ "${DATA_MODE:-production}" != "production" ]; then
    echo "⚠️  WARNING: Not in production mode (DATA_MODE=${DATA_MODE:-production})"
fi

# Step 1: Run CI enforcement checks
echo "📋 Running CI enforcement checks..."
python3 ci_enforcement.py
if [ $? -ne 0 ]; then
    echo "❌ CI enforcement failed - build aborted"
    exit 1
fi

# Step 2: Check for blocked imports
echo "🔍 Checking for blocked imports..."
if python3 -c "
import sys
import os
sys.path.append('.')
from production_enforcement import check_imports_on_startup
if not check_imports_on_startup():
    print('❌ Blocked imports detected')
    sys.exit(1)
print('✅ Import check passed')
"; then
    echo "✅ Import validation passed"
else
    echo "❌ Import validation failed"
    exit 1
fi

# Step 3: Validate environment variables
echo "🔧 Validating environment variables..."
if [ "${DATA_MODE:-production}" = "production" ]; then
    if [ "${DEBUG:-false}" = "true" ] || [ "${DEVELOPMENT:-false}" = "true" ]; then
        echo "❌ Development flags detected in production mode"
        exit 1
    fi
    echo "✅ Production environment validated"
fi

# Step 4: Install dependencies
echo "📦 Installing dependencies..."
pip install -r requirements.txt

# Step 5: Run tests (if available)
if [ -f "test_data_layer.py" ]; then
    echo "🧪 Running tests..."
    python3 test_data_layer.py
fi

# Step 6: Start the application
echo "🎯 Starting application..."
python3 main.py

echo "✅ Production build completed successfully!"
