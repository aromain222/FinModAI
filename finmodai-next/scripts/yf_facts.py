#!/usr/bin/env python3
"""
yfinance Facts Fetcher
Fetches ticker facts via yfinance and outputs JSON.

Usage:
    python scripts/yf_facts.py AAPL

Output: JSON to stdout, errors to stderr
"""

import sys
import json
from datetime import datetime

try:
    import yfinance as yf
except ImportError:
    print("ERROR: yfinance not installed. Run: pip install yfinance", file=sys.stderr)
    sys.exit(1)


def to_number_or_none(value):
    """Convert value to number or None"""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        if not (isinstance(value, float) and (value != value)):  # not NaN
            return value
    if isinstance(value, str):
        try:
            return float(value)
        except (ValueError, TypeError):
            pass
    return None


def fetch_facts(ticker: str) -> dict:
    """Fetch facts for a ticker"""
    try:
        stock = yf.Ticker(ticker)
        info = stock.info
    except Exception as e:
        print(f"ERROR: Failed to fetch yfinance data: {e}", file=sys.stderr)
        return {
            "ticker": ticker.upper(),
            "price": None,
            "sharesOutstanding": None,
            "marketCap": None,
            "currency": None,
            "exchange": None,
            "companyName": None,
            "asOf": None,
            "provider": "yfinance",
            "error": str(e),
        }

    # Extract price (current price or regularMarketPrice)
    price = to_number_or_none(
        info.get("currentPrice")
        or info.get("regularMarketPrice")
        or info.get("previousClose")
    )

    # Extract shares outstanding (in millions if needed)
    shares_raw = to_number_or_none(
        info.get("sharesOutstanding")
        or info.get("sharesOutstanding")
        or info.get("impliedSharesOutstanding")
    )
    shares_mm = None
    if shares_raw is not None:
        # yfinance returns shares, convert to millions
        shares_mm = shares_raw / 1_000_000 if shares_raw > 1_000 else shares_raw

    # Extract market cap (in millions if needed)
    market_cap_raw = to_number_or_none(
        info.get("marketCap") or info.get("enterpriseValue")
    )
    market_cap_mm = None
    if market_cap_raw is not None:
        market_cap_mm = market_cap_raw / 1_000_000 if market_cap_raw > 1_000 else market_cap_raw

    # Extract other fields
    currency = info.get("currency") or info.get("financialCurrency")
    exchange = info.get("exchange")
    company_name = info.get("longName") or info.get("shortName") or info.get("name")

    result = {
        "ticker": ticker.upper(),
        "price": price,
        "sharesOutstanding": shares_mm,
        "marketCap": market_cap_mm,
        "currency": currency,
        "exchange": exchange,
        "companyName": company_name,
        "asOf": datetime.utcnow().isoformat() + "Z",
        "provider": "yfinance",
    }

    return result


def main():
    if len(sys.argv) < 2:
        print("ERROR: Ticker required", file=sys.stderr)
        print("Usage: python scripts/yf_facts.py <TICKER>", file=sys.stderr)
        sys.exit(1)

    ticker = sys.argv[1].strip().upper()
    if not ticker:
        print("ERROR: Empty ticker", file=sys.stderr)
        sys.exit(1)

    try:
        facts = fetch_facts(ticker)
        print(json.dumps(facts, indent=None))
    except Exception as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

