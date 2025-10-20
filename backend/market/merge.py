"""
Merge Yahoo quotes with EDGAR fundamentals and compute derived metrics
"""
import logging
from datetime import datetime
from typing import Dict, Optional

from backend.data.loader import fundamentals_loader
from backend.data.sectors import sector_registry

logger = logging.getLogger(__name__)


def compute_derived_metrics(quote: Dict, fundamentals: Optional[Dict]) -> Dict:
    """
    Compute derived financial metrics from quote + fundamentals

    Args:
        quote: Yahoo quote data
        fundamentals: Latest EDGAR fundamentals row

    Returns:
        Dict with all merged data + derived metrics
    """
    result = {
        # Identity
        "ticker": quote.get("symbol"),
        "name": quote.get("short_name") or quote.get("long_name"),
        # Sector/Industry
        "sector": sector_registry.get_sector(quote.get("symbol", "")),
        "industry": sector_registry.get_industry(quote.get("symbol", "")),
        # Quote data
        "price": quote.get("price"),
        "change1d_pct": quote.get("change_pct"),
        "market_cap": quote.get("market_cap"),
        "beta": quote.get("beta"),
        "currency": quote.get("currency", "USD"),
        "fifty_two_week_high": quote.get("fifty_two_week_high"),
        "fifty_two_week_low": quote.get("fifty_two_week_low"),
        # Timestamps
        "as_of_quotes": quote.get("as_of"),
        "as_of_fundamentals": None,
        # Initialized to None (will compute if fundamentals available)
        "ev": None,
        "ev_to_ebitda": None,
        "ev_to_revenue": None,
        "pe": None,
        # Flag for stale data
        "stale": False,
    }

    # If no fundamentals, return early
    if not fundamentals:
        return result

    # Add fundamentals timestamp
    fiscal_year = fundamentals.get("fiscal_year")
    if fiscal_year:
        result["as_of_fundamentals"] = datetime(fiscal_year, 12, 31)  # Assume FY end

    # Extract fundamentals
    market_cap = quote.get("market_cap")
    net_debt = fundamentals.get("net_debt")
    ebitda = fundamentals.get("ebitda")
    revenue = fundamentals.get("revenue")
    net_income = fundamentals.get("net_income")

    # Compute EV = market_cap + net_debt
    if market_cap is not None and net_debt is not None:
        result["ev"] = market_cap + (
            net_debt * 1_000_000
        )  # Convert net_debt from millions

    # Compute EV/EBITDA
    if result["ev"] is not None and ebitda is not None and ebitda > 0:
        result["ev_to_ebitda"] = result["ev"] / (ebitda * 1_000_000)

    # Compute EV/Revenue
    if result["ev"] is not None and revenue is not None and revenue > 0:
        result["ev_to_revenue"] = result["ev"] / (revenue * 1_000_000)

    # Compute P/E
    # Priority: trailing_pe from Yahoo, else market_cap / net_income
    if quote.get("trailing_pe") is not None:
        result["pe"] = quote.get("trailing_pe")
    elif market_cap is not None and net_income is not None and net_income > 0:
        result["pe"] = market_cap / (net_income * 1_000_000)

    return result


def merge_quote_with_fundamentals(ticker: str, quote: Dict) -> Dict:
    """
    Merge a single quote with its fundamentals

    Args:
        ticker: Ticker symbol
        quote: Yahoo quote data

    Returns:
        Merged snapshot row
    """
    fundamentals = fundamentals_loader.get_latest(ticker)
    return compute_derived_metrics(quote, fundamentals)


def merge_all_quotes(quotes: Dict[str, Dict]) -> Dict[str, Dict]:
    """
    Merge all quotes with their fundamentals

    Args:
        quotes: Dict of ticker -> quote data

    Returns:
        Dict of ticker -> merged snapshot
    """
    snapshots = {}

    for ticker, quote in quotes.items():
        try:
            snapshot = merge_quote_with_fundamentals(ticker, quote)
            snapshots[ticker] = snapshot
        except Exception as e:
            logger.error(f"Failed to merge {ticker}: {e}")

    logger.info(f"Merged {len(snapshots)}/{len(quotes)} snapshots")
    return snapshots
