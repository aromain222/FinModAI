#!/bin/bash
export PORT=8080
python3 -m uvicorn backend.app:app --host 0.0.0.0 --port $PORT --reload