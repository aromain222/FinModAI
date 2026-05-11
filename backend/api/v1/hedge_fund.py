import asyncio
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/hedge-fund", tags=["hedge-fund"])

# Display names matching ai-hedge-fund's ANALYST_CONFIG keys
ANALYST_META: dict[str, dict] = {
    "warren_buffett":        {"name": "Warren Buffett",       "group": "persona"},
    "ben_graham":            {"name": "Ben Graham",           "group": "persona"},
    "charlie_munger":        {"name": "Charlie Munger",       "group": "persona"},
    "peter_lynch":           {"name": "Peter Lynch",          "group": "persona"},
    "phil_fisher":           {"name": "Phil Fisher",          "group": "persona"},
    "bill_ackman":           {"name": "Bill Ackman",          "group": "persona"},
    "cathie_wood":           {"name": "Cathie Wood",          "group": "persona"},
    "michael_burry":         {"name": "Michael Burry",        "group": "persona"},
    "mohnish_pabrai":        {"name": "Mohnish Pabrai",       "group": "persona"},
    "nassim_taleb":          {"name": "Nassim Taleb",         "group": "persona"},
    "aswath_damodaran":      {"name": "Aswath Damodaran",     "group": "persona"},
    "stanley_druckenmiller": {"name": "Stanley Druckenmiller","group": "persona"},
    "rakesh_jhunjhunwala":   {"name": "Rakesh Jhunjhunwala",  "group": "persona"},
    "technical_analyst":     {"name": "Technical Analyst",    "group": "quant"},
    "fundamentals_analyst":  {"name": "Fundamentals Analyst", "group": "quant"},
    "growth_analyst":        {"name": "Growth Analyst",       "group": "quant"},
    "valuation_analyst":     {"name": "Valuation Analyst",    "group": "quant"},
    "sentiment_analyst":     {"name": "Sentiment Analyst",    "group": "quant"},
    "news_sentiment_analyst":{"name": "News Sentiment",       "group": "quant"},
}


class AnalyzeRequest(BaseModel):
    ticker: str
    start_date: Optional[str] = None
    end_date:   Optional[str] = None
    analysts:   Optional[list[str]] = None  # subset of ANALYST_META keys; None = all
    model_name:     str = "gpt-4o"
    model_provider: str = "OpenAI"


class SignalItem(BaseModel):
    key:        str
    name:       str
    group:      str
    signal:     str   # bullish | bearish | neutral
    confidence: int
    reasoning:  str


class Consensus(BaseModel):
    bullish: int
    bearish: int
    neutral: int


class DecisionItem(BaseModel):
    action:     str
    quantity:   int
    confidence: int
    reasoning:  str


class AnalyzeResponse(BaseModel):
    ticker:    str
    date:      str
    decision:  Optional[DecisionItem]
    signals:   list[SignalItem]
    consensus: Consensus


def _run(
    ticker: str,
    start_date: str,
    end_date: str,
    analysts: list[str],
    model_name: str,
    model_provider: str,
) -> dict:
    from src.main import run_hedge_fund  # type: ignore[import]

    portfolio: dict = {
        "cash": 100_000.0,
        "margin_requirement": 0.5,
        "margin_used": 0.0,
        "positions": {
            ticker: {
                "long": 0, "short": 0,
                "long_cost_basis": 0.0, "short_cost_basis": 0.0,
                "short_margin_used": 0.0,
            },
        },
        "realized_gains": {ticker: {"long": 0.0, "short": 0.0}},
    }

    return run_hedge_fund(
        tickers=[ticker],
        start_date=start_date,
        end_date=end_date,
        portfolio=portfolio,
        show_reasoning=False,
        selected_analysts=analysts,
        model_name=model_name,
        model_provider=model_provider,
    )


def _parse_result(ticker: str, end_date: str, raw: dict) -> AnalyzeResponse:
    # Build signal list from analyst_signals
    signals: list[SignalItem] = []
    for agent_key, ticker_signals in (raw.get("analyst_signals") or {}).items():
        # strip _agent suffix
        key = agent_key.replace("_agent", "").lower()
        if key in ("risk_management", "portfolio_management"):
            continue
        meta = ANALYST_META.get(key, {"name": key.replace("_", " ").title(), "group": "quant"})
        data = ticker_signals.get(ticker) or {}
        signals.append(SignalItem(
            key=key,
            name=meta["name"],
            group=meta["group"],
            signal=str(data.get("signal", "neutral")).lower(),
            confidence=int(data.get("confidence") or 50),
            reasoning=str(data.get("reasoning") or ""),
        ))

    # Sort: highest confidence first
    signals.sort(key=lambda s: s.confidence, reverse=True)

    consensus = Consensus(
        bullish=sum(1 for s in signals if s.signal == "bullish"),
        bearish=sum(1 for s in signals if s.signal == "bearish"),
        neutral=sum(1 for s in signals if s.signal == "neutral"),
    )

    raw_decision = (raw.get("decisions") or {}).get(ticker)
    decision: Optional[DecisionItem] = None
    if raw_decision:
        decision = DecisionItem(
            action=str(raw_decision.get("action", "hold")).lower(),
            quantity=int(raw_decision.get("quantity") or 0),
            confidence=int(raw_decision.get("confidence") or 50),
            reasoning=str(raw_decision.get("reasoning") or ""),
        )

    return AnalyzeResponse(
        ticker=ticker,
        date=end_date,
        decision=decision,
        signals=signals,
        consensus=consensus,
    )


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    try:
        import src.main  # noqa: F401
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail=(
                "ai-hedge-fund is not installed. "
                "Clone https://github.com/virattt/ai-hedge-fund and run `poetry install`, "
                "then ensure its src/ is on PYTHONPATH."
            ),
        )

    ticker     = req.ticker.upper()
    end_date   = req.end_date   or datetime.now().strftime("%Y-%m-%d")
    start_date = req.start_date or (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")
    analysts   = req.analysts   or []

    try:
        loop = asyncio.get_event_loop()
        raw = await loop.run_in_executor(
            None, _run, ticker, start_date, end_date, analysts,
            req.model_name, req.model_provider,
        )
    except Exception as exc:
        logger.exception("ai-hedge-fund analysis failed for %s", ticker)
        raise HTTPException(status_code=500, detail=str(exc))

    return _parse_result(ticker, end_date, raw)
