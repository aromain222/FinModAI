"""
Simple server script to run the FinModAI backend
"""
import uvicorn
from backend.app import app

if __name__ == "__main__":
    print("Starting FinModAI server on http://localhost:8082")
    print("Press Ctrl+C to stop")
    uvicorn.run("backend.app:app", host="0.0.0.0", port=8082, reload=True)
