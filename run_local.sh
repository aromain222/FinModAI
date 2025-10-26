#!/bin/bash
# Run the FinModAI app locally for testing

# Check if virtual environment exists and activate it
if [ -d ".venv" ]; then
  echo "Activating virtual environment..."
  source .venv/bin/activate
elif [ -d "venv" ]; then
  echo "Activating virtual environment..."
  source venv/bin/activate
else
  echo "No virtual environment found. Running with system Python..."
fi

# Run the local development server
python run_local.py
