#!/usr/bin/env python3
"""
yfinance OHLCV Price Fetcher
Fetches historical OHLCV data via yfinance and outputs JSON.

Usage:
    python scripts/yf_prices.py SPY 1mo 1d

Args:
    ticker: Stock symbol (e.g., SPY)
    period: Range (1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max)
    interval: Interval (1m, 2m, 5m, 15m, 30m, 60m, 90m, 1h, 1d, 5d, 1wk, 1mo, 3mo)

Output: JSON to stdout, errors to stderr
"""

import sys
import json
from datetime import datetime, timezone

try:
    import yfinance as yf
except ImportError:
    print("ERROR: yfinance not installed. Run: pip install yfinance", file=sys.stderr)
    sys.exit(1)


def to_iso_timestamp(timestamp):
    """Convert pandas Timestamp to ISO string in UTC"""
    if hasattr(timestamp, 'to_pydatetime'):
        dt = timestamp.to_pydatetime()
    elif isinstance(timestamp, datetime):
        dt = timestamp
    else:
        return None
    
    # Ensure timezone aware (UTC)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    
    return dt.isoformat()


def fetch_prices(ticker: str, period: str = "1mo", interval: str = "1d") -> dict:
    """Fetch OHLCV data for a ticker"""
    try:
        stock = yf.Ticker(ticker)
        hist = stock.history(period=period, interval=interval)
        
        if hist.empty:
            return {
                "ticker": ticker.upper(),
                "currency": "USD",
                "tz": "UTC",
                "points": [],
                "last": None,
                "source": "yfinance",
                "error": "empty_history",
            }
        
        # Get currency from info if available
        try:
            info = stock.info
            currency = info.get("currency", "USD")
        except:
            currency = "USD"
        
        # Convert to points array
        points = []
        for idx, row in hist.iterrows():
            timestamp_iso = to_iso_timestamp(idx)
            if timestamp_iso:
                points.append({
                    "t": timestamp_iso,
                    "o": float(row["Open"]) if not row.isna()["Open"] else None,
                    "h": float(row["High"]) if not row.isna()["High"] else None,
                    "l": float(row["Low"]) if not row.isna()["Low"] else None,
                    "c": float(row["Close"]) if not row.isna()["Close"] else None,
                    "v": float(row["Volume"]) if not row.isna()["Volume"] else None,
                })
        
        # Get last close
        last_point = None
        if points:
            last = points[-1]
            if last["c"] is not None:
                last_point = {
                    "t": last["t"],
                    "c": last["c"],
                }
        
        return {
            "ticker": ticker.upper(),
            "currency": currency,
            "tz": "UTC",
            "points": points,
            "last": last_point,
            "source": "yfinance",
        }
    except Exception as e:
        return {
            "ticker": ticker.upper(),
            "currency": "USD",
            "tz": "UTC",
            "points": [],
            "last": None,
            "source": "yfinance",
            "error": str(e),
        }


def map_range_to_period(range_str: str) -> str:
    """Map UI range to yfinance period"""
    mapping = {
        "1D": "1d",
        "1W": "5d",  # Use 5d for weekly to get enough points
        "1M": "1mo",
        "3M": "3mo",
        "6M": "6mo",
        "1Y": "1y",
        "5Y": "5y",
    }
    return mapping.get(range_str.upper(), "1mo")


def map_range_to_interval(range_str: str) -> str:
    """Map UI range to yfinance interval"""
    mapping = {
        "1D": "1h",   # Hourly for 1 day
        "1W": "1d",   # Daily for 1 week
        "1M": "1d",   # Daily for 1 month
        "3M": "1d",   # Daily for 3 months
        "6M": "1d",   # Daily for 6 months
        "1Y": "1d",   # Daily for 1 year
        "5Y": "1wk",  # Weekly for 5 years
    }
    return mapping.get(range_str.upper(), "1d")


def main():
    if len(sys.argv) < 2:
        print("ERROR: Ticker required", file=sys.stderr)
        print("Usage: python scripts/yf_prices.py <TICKER> [RANGE] [INTERVAL]", file=sys.stderr)
        sys.exit(1)
    
    ticker = sys.argv[1].strip().upper()
    if not ticker:
        print("ERROR: Empty ticker", file=sys.stderr)
        sys.exit(1)
    
    # Parse range (optional)
    range_str = sys.argv[2].strip().upper() if len(sys.argv) > 2 else "1M"
    period = map_range_to_period(range_str)
    interval = map_range_to_interval(range_str)
    
    # Allow explicit interval override
    if len(sys.argv) > 3:
        interval = sys.argv[3].strip().lower()
    
    try:
        result = fetch_prices(ticker, period, interval)
        print(json.dumps(result, indent=None))
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

