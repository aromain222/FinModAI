"""
Tests for merge logic and derived metrics
"""
import pytest
from datetime import datetime

from backend.market.merge import compute_derived_metrics


def test_compute_ev():
    """Test EV calculation: EV = market_cap + net_debt"""
    quote = {
        "symbol": "TEST",
        "market_cap": 1_000_000_000,  # $1B
        "as_of": datetime.utcnow(),
    }

    fundamentals = {"net_debt": 100, "fiscal_year": 2023}  # $100M (in millions)

    result = compute_derived_metrics(quote, fundamentals)

    # EV = 1B + (100M) = 1.1B
    assert result["ev"] == 1_100_000_000
    assert result["ticker"] == "TEST"


def test_compute_ev_to_ebitda():
    """Test EV/EBITDA calculation with positive denominator"""
    quote = {
        "symbol": "TEST",
        "market_cap": 2_000_000_000,  # $2B
        "as_of": datetime.utcnow(),
    }

    fundamentals = {
        "net_debt": 500,  # $500M
        "ebitda": 250,  # $250M
        "fiscal_year": 2023,
    }

    result = compute_derived_metrics(quote, fundamentals)

    # EV = 2B + 500M = 2.5B
    # EV/EBITDA = 2.5B / 250M = 10.0x
    assert result["ev"] == 2_500_000_000
    assert result["ev_to_ebitda"] == pytest.approx(10.0, rel=0.01)


def test_ev_to_ebitda_zero_denominator():
    """Test EV/EBITDA returns None for zero/negative EBITDA"""
    quote = {"symbol": "TEST", "market_cap": 1_000_000_000, "as_of": datetime.utcnow()}

    fundamentals = {"net_debt": 100, "ebitda": 0, "fiscal_year": 2023}  # Zero EBITDA

    result = compute_derived_metrics(quote, fundamentals)

    assert result["ev"] is not None
    assert result["ev_to_ebitda"] is None  # Should not divide by zero


def test_pe_from_trailing_pe():
    """Test P/E uses trailing_pe from Yahoo if available"""
    quote = {
        "symbol": "TEST",
        "market_cap": 1_000_000_000,
        "trailing_pe": 25.5,
        "as_of": datetime.utcnow(),
    }

    fundamentals = {
        "net_income": 50,  # Would give P/E of 20 if calculated
        "fiscal_year": 2023,
    }

    result = compute_derived_metrics(quote, fundamentals)

    # Should use trailing_pe from Yahoo, not calculate
    assert result["pe"] == 25.5


def test_pe_calculated_from_net_income():
    """Test P/E calculated from market_cap / net_income"""
    quote = {
        "symbol": "TEST",
        "market_cap": 1_000_000_000,  # $1B
        # No trailing_pe
        "as_of": datetime.utcnow(),
    }

    fundamentals = {"net_income": 50, "fiscal_year": 2023}  # $50M

    result = compute_derived_metrics(quote, fundamentals)

    # P/E = 1B / 50M = 20.0
    assert result["pe"] == pytest.approx(20.0, rel=0.01)


def test_pe_negative_net_income():
    """Test P/E returns None for negative net income"""
    quote = {"symbol": "TEST", "market_cap": 1_000_000_000, "as_of": datetime.utcnow()}

    fundamentals = {"net_income": -10, "fiscal_year": 2023}  # Negative

    result = compute_derived_metrics(quote, fundamentals)

    assert result["pe"] is None


def test_no_fundamentals():
    """Test merge works with no fundamentals available"""
    quote = {
        "symbol": "TEST",
        "short_name": "Test Company",
        "market_cap": 1_000_000_000,
        "price": 50.0,
        "change_pct": 1.5,
        "as_of": datetime.utcnow(),
    }

    result = compute_derived_metrics(quote, None)

    assert result["ticker"] == "TEST"
    assert result["name"] == "Test Company"
    assert result["price"] == 50.0
    assert result["ev"] is None
    assert result["ev_to_ebitda"] is None
    assert result["pe"] is None


def test_missing_fields_handled():
    """Test that missing fields don't cause errors"""
    quote = {
        "symbol": "TEST",
        # Missing market_cap
        "as_of": datetime.utcnow(),
    }

    fundamentals = {"ebitda": 100, "fiscal_year": 2023}

    result = compute_derived_metrics(quote, fundamentals)

    # Should not crash, just return None for derived metrics
    assert result["ticker"] == "TEST"
    assert result["ev"] is None
    assert result["ev_to_ebitda"] is None


def test_ev_to_revenue():
    """Test EV/Revenue calculation"""
    quote = {
        "symbol": "TEST",
        "market_cap": 3_000_000_000,  # $3B
        "as_of": datetime.utcnow(),
    }

    fundamentals = {
        "net_debt": 500,  # $500M
        "revenue": 1000,  # $1B
        "fiscal_year": 2023,
    }

    result = compute_derived_metrics(quote, fundamentals)

    # EV = 3B + 500M = 3.5B
    # EV/Revenue = 3.5B / 1B = 3.5x
    assert result["ev"] == 3_500_000_000
    assert result["ev_to_revenue"] == pytest.approx(3.5, rel=0.01)
