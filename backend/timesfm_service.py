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
from dataclasses import dataclass
from typing import Callable, Optional

import numpy as np

logger = logging.getLogger(__name__)

_lock = threading.Lock()
_model: Optional["LoadedTimesFmModel"] = None
_model_load_error: Optional[str] = None


@dataclass
class LoadedTimesFmModel:
    name: str
    max_context: int
    infer: Callable[[list[float], int, int], dict]


def _load_model():
    global _model, _model_load_error
    try:
        import timesfm  # type: ignore

        if hasattr(timesfm, "TimesFM_2p5_200M_torch"):
            logger.info("[timesfm] loading torch model google/timesfm-2.5-200m-pytorch …")
            try:
                import torch  # type: ignore

                torch.set_float32_matmul_precision("high")
            except Exception as exc:
                logger.warning("[timesfm] torch precision setup skipped: %s", exc)

            model = timesfm.TimesFM_2p5_200M_torch.from_pretrained(
                "google/timesfm-2.5-200m-pytorch"
            )
            model.compile(
                timesfm.ForecastConfig(
                    max_context=1024,
                    max_horizon=256,
                    normalize_inputs=True,
                    use_continuous_quantile_head=True,
                    force_flip_invariance=True,
                    infer_is_positive=True,
                    fix_quantile_crossing=True,
                )
            )

            def infer_torch(series: list[float], horizon: int, freq: int) -> dict:
                del freq
                context = np.array(series, dtype=np.float32)
                if len(context) > 1024:
                    context = context[-1024:]
                point_forecast, quantile_forecast = model.forecast(
                    horizon=horizon,
                    inputs=[context],
                )
                h = min(horizon, point_forecast.shape[1])
                pf = point_forecast[0, :h].tolist()
                # TimesFM 2.5 quantiles: mean plus 10th through 90th percentile.
                lower = quantile_forecast[0, :h, 1].tolist()
                upper = quantile_forecast[0, :h, -1].tolist()
                return {"forecast": pf, "lower": lower, "upper": upper}

            _model = LoadedTimesFmModel(
                name="google/timesfm-2.5-200m-pytorch",
                max_context=1024,
                infer=infer_torch,
            )
            logger.info("[timesfm] torch model ready")
            return

        raise RuntimeError(
            "Installed timesfm package does not expose TimesFM_2p5_200M_torch. "
            "Install from google-research/timesfm with torch extras."
        )
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
    return model.infer(series, horizon, freq)


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
