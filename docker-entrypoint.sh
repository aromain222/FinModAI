#!/bin/bash
# Use PORT from environment or default to 10000
PORT="${PORT:-10000}"
echo "Starting server on port $PORT"
exec gunicorn --bind "0.0.0.0:$PORT" --workers 1 --timeout 120 minimal_app:app