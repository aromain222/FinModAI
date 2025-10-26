#!/usr/bin/env python3
"""
Minimal standalone FastAPI app for testing
This doesn't depend on any other modules in the project
"""

import uvicorn
from fastapi import FastAPI

# Create a minimal FastAPI app
app = FastAPI(title="FinModAI Minimal Test")

@app.get("/")
def read_root():
    return {"message": "FinModAI Minimal Test App is running"}

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

@app.get("/test")
def test():
    return {
        "status": "success",
        "message": "Test endpoint is working",
        "data": {
            "app_name": "FinModAI Minimal Test",
            "version": "1.0.0"
        }
    }

if __name__ == "__main__":
    print("Starting minimal test app on http://localhost:8080")
    print("Visit http://localhost:8080/healthz to test the health check")
    print("Visit http://localhost:8080/docs for API documentation")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8080,
        log_level="info"
    )
