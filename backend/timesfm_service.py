"""
TimesFM inference service — lazy singleton, loaded on first request.

Supports:
  forecast_price(prices, horizon)   — daily close prices → 30-day forward
  forecast_revenue(revenue, horizon) — quarterly revenue → 4-quarter forward

Both return { forecast, lower, upper, historical } where lower/upper are
10th/90th percentile quantile bands from the model.
"""

from __future__ import annotations

import logging
import threading
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_model: Optional[object] = None
_model_load_error: Optional[str] = None


def _load_model():
    global _model, _model_load_error
    try:
        import timesfm  # type: ignore

        logger.info("[timesfm] loading model from google/timesfm-1.0-200m …")
        _model = timesfm.TimesFm(
            hparams=timesfm.TimesFmHparams(
                backend="cpu",
                per_core_batch_size=32,
                horizon_len=128,
                input_patch_len=32,
                output_patch_len=128,
                num_layers=20,
                model_dims=1280,
            ),
            checkpoint=timesfm.TimesFmCheckpoint(
                huggingface_repo_id="google/timesfm-1.0-200m",
            ),
        )
        logger.info("[timesfm] model ready")
    except Exception as exc:
        _model_load_error = str(exc)
        logger.error("[timesfm] failed to load model: %s", exc)
        raise


def get_model():
    global _model, _model_load_error
    if _model is not None:
        return _model
    with _lock:
        if _model is not None:
            return _model
        if _model_load_error:
            raise RuntimeError(f"TimesFM unavailable: {_model_load_error}")
        _load_model()
    return _model


def _run_inference(series: list[float], horizon: int, freq: int) -> dict:
    """Run TimesFM on a single series. freq=0 high-freq (daily), freq=1 low-freq (quarterly)."""
    model = get_model()
    context = np.array(series, dtype=np.float32)
    # Trim to model context limit (512 for timesfm-1.0-200m)
    if len(context) > 512:
        context = context[-512:]

    point_forecast, quantile_forecast = model.forecast(
        inputs=[context],
        freq=[freq],
    )
    h = min(horizon, point_forecast.shape[1])
    pf = point_forecast[0, :h].tolist()
    # quantile_forecast shape: [batch, horizon, 9] → quantiles [0.1 … 0.9]
    lower = quantile_forecast[0, :h, 0].tolist()   # 10th percentile
    upper = quantile_forecast[0, :h, -1].tolist()  # 90th percentile

    return {"forecast": pf, "lower": lower, "upper": upper}


def forecast_price(prices: list[float], horizon: int = 30) -> dict:
    """
    Forecast daily close prices.
    Returns dict with keys: forecast, lower, upper (all lists of length horizon).
    Raises if TimesFM is unavailable.
    """
    if len(prices) < 16:
        raise ValueError("Need at least 16 price points for a meaningful forecast.")
    return _run_inference(prices, horizon, freq=0)


def forecast_revenue(revenue: list[float], horizon: int = 4) -> dict:
    """
    Forecast quarterly revenue (values in millions, chronological order).
    Returns dict with keys: forecast, lower, upper (lists of length horizon).
    Raises if TimesFM is unavailable.
    """
    if len(revenue) < 4:
        raise ValueError("Need at least 4 quarters of revenue history.")
    return _run_inference(revenue, horizon, freq=1)
