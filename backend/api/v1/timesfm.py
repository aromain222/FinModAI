"""
FastAPI routes for TimesFM forecasting.

GET /api/v1/timesfm/price?ticker=AAPL&horizon=30
GET /api/v1/timesfm/revenue?ticker=AAPL&quarters=4
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/timesfm", tags=["timesfm"])


def _fetch_price_history(ticker: str, days: int = 200) -> tuple[list[str], list[float]]:
    """Fetch daily closing prices via yfinance. Returns (dates, prices)."""
    try:
        import yfinance as yf  # type: ignore

        t = yf.Ticker(ticker)
        hist = t.history(period=f"{days}d", auto_adjust=True)
        if hist.empty:
            return [], []
        hist = hist.dropna(subset=["Close"])
        dates = [d.strftime("%b %d") for d in hist.index]
        prices = hist["Close"].tolist()
        return dates, prices
    except Exception as exc:
        logger.warning("[timesfm] yfinance price fetch failed for %s: %s", ticker, exc)
        return [], []


def _fetch_quarterly_revenue(ticker: str, quarters: int = 12) -> tuple[list[str], list[float]]:
    """Fetch quarterly revenue via yfinance. Returns (labels, revenue_in_millions)."""
    try:
        import yfinance as yf  # type: ignore

        t = yf.Ticker(ticker)
        qf = t.quarterly_financials
        if qf is None or qf.empty:
            return [], []

        rev_row = None
        for key in ["Total Revenue", "Revenue", "TotalRevenue"]:
            if key in qf.index:
                rev_row = qf.loc[key].dropna()
                break
        if rev_row is None or len(rev_row) == 0:
            return [], []

        # Sort chronologically
        rev_row = rev_row.sort_index()
        labels = [d.strftime("Q%q %Y") if hasattr(d, "strftime") else str(d) for d in rev_row.index]
        values = [(v / 1e6) for v in rev_row.values]  # raw dollars → millions
        return labels[-quarters:], values[-quarters:]
    except Exception as exc:
        logger.warning("[timesfm] yfinance revenue fetch failed for %s: %s", ticker, exc)
        return [], []


def _make_forecast_dates(last_date_label: str, horizon: int, freq: str = "day") -> list[str]:
    """Generate forward-looking date labels for the forecast horizon."""
    today = date.today()
    out = []
    for i in range(1, horizon + 1):
        if freq == "quarter":
            # Approximate: each step = 3 months
            target = date(today.year + (today.month + i * 3 - 1) // 12,
                          ((today.month + i * 3 - 1) % 12) + 1, 1)
            q = (target.month - 1) // 3 + 1
            out.append(f"Q{q} {target.year}")
        else:
            target = today + timedelta(days=i)
            out.append(target.strftime("%b %d"))
    return out


@router.get("/price")
async def forecast_price(
    ticker: str = Query(..., description="Stock ticker symbol"),
    horizon: int = Query(30, ge=1, le=90, description="Forecast horizon in trading days"),
    context_days: int = Query(180, ge=32, le=400, description="Days of history to use as context"),
):
    """
    Return historical daily prices + TimesFM 30-day price forecast with confidence bands.
    Falls back to historical-only if the model is unavailable.
    """
    ticker = ticker.upper().strip()
    dates, prices = _fetch_price_history(ticker, days=context_days)
    if len(prices) < 16:
        raise HTTPException(status_code=422, detail=f"Insufficient price history for {ticker}.")

    # Show last 90 days of history in the response (chart context)
    display_dates = dates[-90:]
    display_prices = prices[-90:]

    forecast_result: Optional[dict] = None
    model_available = True
    try:
        from backend.timesfm_service import forecast_price as tfm_price  # type: ignore

        result = tfm_price(prices, horizon=horizon)
        fcast_dates = _make_forecast_dates(dates[-1] if dates else "", horizon, freq="day")
        forecast_result = {
            "dates": fcast_dates,
            "values": result["forecast"],
            "lower": result["lower"],
            "upper": result["upper"],
        }
    except Exception as exc:
        model_available = False
        logger.warning("[timesfm] price forecast failed for %s: %s", ticker, exc)

    return {
        "ticker": ticker,
        "historical": {
            "dates": display_dates,
            "prices": display_prices,
        },
        "forecast": forecast_result,
        "model_available": model_available,
        "horizon_days": horizon,
    }


@router.get("/revenue")
async def forecast_revenue(
    ticker: str = Query(..., description="Stock ticker symbol"),
    quarters: int = Query(4, ge=1, le=8, description="Quarters to forecast"),
    context_quarters: int = Query(12, ge=4, le=20, description="Quarters of history to use"),
):
    """
    Return historical quarterly revenue + TimesFM 4-quarter revenue forecast.
    """
    ticker = ticker.upper().strip()
    labels, revenue = _fetch_quarterly_revenue(ticker, quarters=context_quarters)
    if len(revenue) < 4:
        raise HTTPException(status_code=422, detail=f"Insufficient revenue history for {ticker}.")

    forecast_result: Optional[dict] = None
    model_available = True
    try:
        from backend.timesfm_service import forecast_revenue as tfm_rev  # type: ignore

        result = tfm_rev(revenue, horizon=quarters)
        fcast_labels = _make_forecast_dates("", quarters, freq="quarter")
        forecast_result = {
            "labels": fcast_labels,
            "values": result["forecast"],
            "lower": result["lower"],
            "upper": result["upper"],
        }
    except Exception as exc:
        model_available = False
        logger.warning("[timesfm] revenue forecast failed for %s: %s", ticker, exc)

    return {
        "ticker": ticker,
        "historical": {
            "labels": labels,
            "revenue": revenue,
        },
        "forecast": forecast_result,
        "model_available": model_available,
        "implied_growth_rate": _implied_growth(revenue, forecast_result),
    }


def _implied_growth(historical: list[float], forecast: Optional[dict]) -> Optional[float]:
    """Annualised revenue growth implied by the last 4 historical quarters vs next 4 forecast."""
    if not forecast or not forecast.get("values") or not historical:
        return None
    try:
        base = sum(historical[-4:])
        fwd = sum(forecast["values"][:4])
        if base <= 0:
            return None
        return round((fwd / base - 1), 4)
    except Exception:
        return None
