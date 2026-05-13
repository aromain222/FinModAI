"""
Isolated AI agent backend.

This keeps TradingAgents and ai-hedge-fund callable without importing the
full modeling/PDF backend, which has heavier optional dependencies.
"""

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(REPO_ROOT / ".env")
load_dotenv(REPO_ROOT / "finmodai-next" / ".env.local", override=False)

for external_repo in ("TradingAgents", "ai-hedge-fund"):
    path = REPO_ROOT / external_repo
    if path.exists():
        sys.path.insert(0, str(path))

from backend.api.v1.hedge_fund import router as hedge_fund_router
from backend.api.v1.tradingagents import router as tradingagents_router


app = FastAPI(
    title="CapitalBase Agent Backend",
    description="Lightweight backend for external agent repos.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(tradingagents_router)
app.include_router(hedge_fund_router)


@app.get("/healthz")
async def healthz():
    return {"status": "ok", "service": "agents"}
