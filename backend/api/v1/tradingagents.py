import asyncio
import logging
import re
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/tradingagents", tags=["tradingagents"])


class AnalyzeRequest(BaseModel):
    ticker: str
    date: Optional[str] = None
    analysts: Optional[list[str]] = None
    timeout_seconds: Optional[int] = 40


class AnalystReports(BaseModel):
    market: Optional[str] = None
    fundamentals: Optional[str] = None
    sentiment: Optional[str] = None
    news: Optional[str] = None


class AnalyzeResponse(BaseModel):
    ticker: str
    date: str
    decision: str
    summary: Optional[str] = None
    thesis: Optional[str] = None
    price_target: Optional[float] = None
    time_horizon: Optional[str] = None
    reports: AnalystReports


def _parse_final_decision(text: str) -> dict:
    summary = None
    thesis = None
    price_target = None
    time_horizon = None

    # Collect multi-line values by scanning for bold labels
    lines = text.split("\n")
    current_key = None
    current_val: list[str] = []

    def flush():
        nonlocal summary, thesis, price_target, time_horizon
        if current_key == "summary":
            summary = " ".join(current_val).strip()
        elif current_key == "thesis":
            thesis = " ".join(current_val).strip()
        elif current_key == "price_target":
            raw = " ".join(current_val).strip().lstrip("$")
            m = re.search(r"[\d,]+(?:\.\d+)?", raw.replace(",", ""))
            if m:
                try:
                    price_target = float(m.group())
                except ValueError:
                    pass
        elif current_key == "time_horizon":
            time_horizon = " ".join(current_val).strip()

    for line in lines:
        stripped = line.strip().rstrip("*")
        lower = stripped.lower()
        if re.match(r"\*?\*?executive summary\*?\*?:", stripped, re.IGNORECASE):
            flush(); current_key = "summary"
            current_val = [re.split(r":", stripped, maxsplit=1)[-1].strip().strip("*")]
        elif re.match(r"\*?\*?investment thesis\*?\*?:", stripped, re.IGNORECASE):
            flush(); current_key = "thesis"
            current_val = [re.split(r":", stripped, maxsplit=1)[-1].strip().strip("*")]
        elif re.match(r"\*?\*?price target\*?\*?:", stripped, re.IGNORECASE):
            flush(); current_key = "price_target"
            current_val = [re.split(r":", stripped, maxsplit=1)[-1].strip().strip("*")]
        elif re.match(r"\*?\*?time horizon\*?\*?:", stripped, re.IGNORECASE):
            flush(); current_key = "time_horizon"
            current_val = [re.split(r":", stripped, maxsplit=1)[-1].strip().strip("*")]
        elif current_key and stripped and not re.match(r"\*?\*?\w.*\*?\*?:", stripped):
            current_val.append(stripped)

    flush()
    return {
        "summary": summary,
        "thesis": thesis,
        "price_target": price_target,
        "time_horizon": time_horizon,
    }


def _run_analysis(ticker: str, date_str: str, analysts: list[str]) -> tuple:
    from tradingagents.graph.trading_graph import TradingAgentsGraph  # type: ignore[import]
    from tradingagents.default_config import DEFAULT_CONFIG  # type: ignore[import]

    config = DEFAULT_CONFIG.copy()
    ta = TradingAgentsGraph(
        selected_analysts=analysts,
        debug=False,
        config=config,
    )
    return ta.propagate(ticker, date_str)


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(req: AnalyzeRequest) -> AnalyzeResponse:
    try:
        import tradingagents  # noqa: F401 — check availability
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail=(
                "TradingAgents is not installed. "
                "Install with: pip install git+https://github.com/TauricResearch/TradingAgents.git"
            ),
        )

    analysts = req.analysts or ["market", "social", "news", "fundamentals"]
    date_str = req.date or datetime.now().strftime("%Y-%m-%d")
    ticker = req.ticker.upper()

    try:
        loop = asyncio.get_event_loop()
        state, decision = await asyncio.wait_for(
            loop.run_in_executor(None, _run_analysis, ticker, date_str, analysts),
            timeout=max(10, min(req.timeout_seconds or 40, 120)),
        )
    except asyncio.TimeoutError:
        raise HTTPException(
            status_code=504,
            detail="TradingAgents analysis timed out. Use fewer analysts or run as an async/background job.",
        )
    except Exception as exc:
        logger.exception("TradingAgents analysis failed for %s", ticker)
        raise HTTPException(status_code=500, detail=str(exc))

    final_text = state.get("final_trade_decision", "")
    parsed = _parse_final_decision(final_text)

    return AnalyzeResponse(
        ticker=ticker,
        date=date_str,
        decision=decision or "Hold",
        summary=parsed["summary"],
        thesis=parsed["thesis"],
        price_target=parsed["price_target"],
        time_horizon=parsed["time_horizon"],
        reports=AnalystReports(
            market=state.get("market_report"),
            fundamentals=state.get("fundamentals_report"),
            sentiment=state.get("sentiment_report"),
            news=state.get("news_report"),
        ),
    )
