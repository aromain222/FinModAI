#!/bin/bash
# A robust script to build the frontend and run the backend server for local testing.

# Exit immediately if a command exits with a non-zero status.
set -e

echo "--- 1. Checking for required tools ---"

# Check for Node.js/npm
if ! command -v npm &> /dev/null
then
    echo "❌ Error: npm is not installed. npm is required to build the frontend."
    echo "Please install Node.js (which includes npm). If you're on a Mac, you can run: brew install node"
    exit 1
fi
echo "✅ npm found."

# Check for Python 3
if ! command -v python3 &> /dev/null
then
    echo "❌ Error: python3 is not installed."
    echo "Please make sure you have Python 3 installed and available in your PATH."
    exit 1
fi
echo "✅ python3 found."

echo ""
echo "--- 2. Building Frontend ---"
# Navigate to the frontend directory
cd frontend

# Install dependencies if they're not already installed
if [ ! -d "node_modules" ]; then
  echo "Node modules not found. Running npm install..."
  npm install
fi

# Run the build process
npm run build

# Navigate back to the root directory
cd ..

echo ""
echo "--- 3. Starting Backend Server ---"
echo "The server will now start in this terminal."
echo "You will see live logs here. To stop the server, press Ctrl+C."
echo "You can now open your browser and go to: http://localhost:10000"
echo "-----------------------------------"

# Start the Python backend server in the FOREGROUND to see all output
python3 minimal_app.py