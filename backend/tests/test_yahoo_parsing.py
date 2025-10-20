"""
Tests for Yahoo Finance response parsing
"""
from backend.market.yahoo import YahooFinanceClient


def test_parse_quote_complete():
    """Test parsing a complete Yahoo quote response"""
    client = YahooFinanceClient()

    raw_quote = {
        "symbol": "AAPL",
        "shortName": "Apple Inc.",
        "longName": "Apple Inc.",
        "regularMarketPrice": 178.72,
        "regularMarketChangePercent": 1.23,
        "marketCap": 2800000000000,
        "trailingPE": 29.5,
        "forwardPE": 27.3,
        "beta": 1.25,
        "currency": "USD",
        "fiftyTwoWeekHigh": 199.62,
        "fiftyTwoWeekLow": 164.08,
    }

    parsed = client._parse_quote(raw_quote)

    assert parsed["symbol"] == "AAPL"
    assert parsed["short_name"] == "Apple Inc."
    assert parsed["long_name"] == "Apple Inc."
    assert parsed["price"] == 178.72
    assert parsed["change_pct"] == 1.23
    assert parsed["market_cap"] == 2800000000000
    assert parsed["trailing_pe"] == 29.5
    assert parsed["forward_pe"] == 27.3
    assert parsed["beta"] == 1.25
    assert parsed["currency"] == "USD"
    assert parsed["fifty_two_week_high"] == 199.62
    assert parsed["fifty_two_week_low"] == 164.08
    assert "as_of" in parsed


def test_parse_quote_missing_fields():
    """Test parsing quote with missing optional fields"""
    client = YahooFinanceClient()

    raw_quote = {
        "symbol": "TEST",
        # Missing many optional fields
        "regularMarketPrice": 50.0,
    }

    parsed = client._parse_quote(raw_quote)

    assert parsed["symbol"] == "TEST"
    assert parsed["price"] == 50.0
    assert parsed["short_name"] is None
    assert parsed["market_cap"] is None
    assert parsed["trailing_pe"] is None
    assert parsed["currency"] == "USD"  # Default


def test_parse_quote_null_values():
    """Test parsing quote where fields exist but are null"""
    client = YahooFinanceClient()

    raw_quote = {
        "symbol": "TEST",
        "shortName": None,
        "regularMarketPrice": None,
        "marketCap": None,
        "trailingPE": None,
    }

    parsed = client._parse_quote(raw_quote)

    assert parsed["symbol"] == "TEST"
    assert parsed["short_name"] is None
    assert parsed["price"] is None
    assert parsed["market_cap"] is None
    assert parsed["trailing_pe"] is None


def test_parse_quote_non_usd():
    """Test parsing quote with non-USD currency"""
    client = YahooFinanceClient()

    raw_quote = {"symbol": "ASML", "regularMarketPrice": 650.0, "currency": "EUR"}

    parsed = client._parse_quote(raw_quote)

    assert parsed["currency"] == "EUR"
