"""
Yahoo Finance Public JSON Provider: Open, no-key price & market cap fallback.
"""
import requests
import time
from typing import Optional, Dict, Any
from backend.providers.base_provider import BaseProvider, Quote

YAHOO_QUOTE_SUMMARY_URL = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}?modules=price,financialData,defaultKeyStatistics"
YAHOO_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{ticker}?range=1d&interval=1m"

MAX_RETRIES = 2
TIMEOUT = 12

class YahooPublicProvider(BaseProvider):
    def __init__(self):
        super().__init__("yahoo-public")

    def get_quote(self, ticker: str) -> Optional[Quote]:
        ticker = ticker.upper()
        err = None
        for i in range(MAX_RETRIES+1):
            try:
                r = requests.get(YAHOO_QUOTE_SUMMARY_URL.format(ticker=ticker), timeout=TIMEOUT, headers={"User-Agent": "Mozilla/5.0"})
                r.raise_for_status()
                data = r.json()
                p = data["quoteSummary"]["result"][0]["price"]
                fd = data["quoteSummary"]["result"][0].get("financialData", {})
                stats = data["quoteSummary"]["result"][0].get("defaultKeyStatistics", {})
                price = p.get("regularMarketPrice",{}).get("raw")
                currency = p.get("currency", "USD")
                market_cap = p.get("marketCap",{}).get("raw")
                enterprise_value = fd.get("enterpriseValue",{}).get("raw") or stats.get("enterpriseValue",{}).get("raw")
                as_of = fd.get("financialCurrency", "") or time.strftime("%Y-%m-%dT%H:%M:%SZ")
                # Provenance info
                prov = {
                    "provider": "YahooFinance",
                    "endpoint": r.url,
                    "as_of": as_of,
                    "scraped": False
                }
                if price is None:
                    raise ValueError("No market price in Yahoo quoteSummary")
                return Quote(price=price, market_cap=market_cap, enterprise_value=enterprise_value, currency=currency, as_of=as_of, provenance=prov)
            except Exception as e:
                err = e
                time.sleep(2 ** i + 0.2 * (i != 0)) # simple backoff
        raise RuntimeError(f"Yahoo quote fetch failed for {ticker}: {err}")

    def get_fundamentals(self, ticker: str, period: str = "annual", years: int = 5):
        # Yahoo public endpoints do not expose detailed, trustworthy US fundamentals for modeling (use for price/EV only!)
        raise NotImplementedError("Yahoo fundamentals not supported. Use for price/marketcap/EV gapfill only.")

    def get_filings(self, ticker: str):
        raise NotImplementedError("Yahoo does not support filings metadata.")

    def health_check(self):
        try:
            test = self.get_quote("AAPL")
            return {"status": "OK", "quote": test.price, "currency": test.currency, "http_status": 200}
        except Exception as e:
            return {"status": "FAIL", "error": str(e)}

def get_provider():
    return YahooPublicProvider()
