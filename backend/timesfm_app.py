"""Minimal FastAPI app for the deployed TimesFM forecast service.

The full backend imports PDF analysis, model generation, and persistence modules
that are not needed for forecasting and can slow or break small Fly machines.
This app keeps the forecast service isolated for Vercel's PYTHON_BACKEND_URL.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.v1.timesfm import router as timesfm_router

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="CapitalBase TimesFM API",
    description="Isolated TimesFM forecasting service for CapitalBase.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(timesfm_router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    return {"status": "ok"}
