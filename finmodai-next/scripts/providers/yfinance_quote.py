#!/usr/bin/env python3
import json
import sys

try:
    import yfinance as yf
except Exception:
    print("null")
    sys.exit(0)


def safe_number(value):
    try:
        if value is None:
            return None
        number = float(value)
        if number != number:
            return None
        return number
    except Exception:
        return None


def main():
    if len(sys.argv) < 2:
        print("null")
        return

    ticker = sys.argv[1].strip().upper()
    if not ticker:
        print("null")
        return

    try:
        security = yf.Ticker(ticker)
        info = security.info or {}
        fast_info = getattr(security, "fast_info", {}) or {}

        price = (
            safe_number(fast_info.get("lastPrice"))
            or safe_number(info.get("currentPrice"))
            or safe_number(info.get("regularMarketPrice"))
            or safe_number(info.get("previousClose"))
        )
        market_cap = safe_number(info.get("marketCap"))
        shares_outstanding = safe_number(info.get("sharesOutstanding"))
        currency = info.get("currency")
        company_name = info.get("longName") or info.get("shortName")
        sector = info.get("sector")
        industry = info.get("industry")
        country = info.get("country")
        exchange = info.get("exchange")

        payload = {
            "ticker": ticker,
            "companyName": company_name,
            "sector": sector,
            "industry": industry,
            "country": country,
            "exchange": exchange,
            "currency": currency,
            "price": price,
            "marketCap": market_cap,
            "sharesOutstanding": shares_outstanding,
        }
        print(json.dumps(payload))
    except Exception:
        print("null")


if __name__ == "__main__":
    main()
