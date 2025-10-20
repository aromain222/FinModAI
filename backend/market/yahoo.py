"""
Yahoo Finance Data Client (async, no API keys)
"""
import asyncio
import logging
from datetime import datetime
from typing import Dict, List, Optional

import httpx

from backend.config import config

logger = logging.getLogger(__name__)


class YahooFinanceClient:
    """Async client for Yahoo Finance public APIs"""

    BASE_QUOTE_URL = "https://query1.finance.yahoo.com/v7/finance/quote"
    BASE_CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart"

    def __init__(self):
        self.client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self):
        """Async context manager entry"""
        self.client = httpx.AsyncClient(
            timeout=config.YAHOO_REQUEST_TIMEOUT,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit"""
        if self.client:
            await self.client.aclose()

    async def fetch_quotes_batch(self, tickers: List[str]) -> Dict[str, Dict]:
        """
        Fetch quotes for multiple tickers in one request

        Args:
            tickers: List of ticker symbols (max 100-150 recommended)

        Returns:
            Dict mapping ticker -> quote data
        """
        if not tickers:
            return {}

        # Batch limit
        if len(tickers) > config.YAHOO_BATCH_SIZE:
            logger.warning(
                f"Batch size {len(tickers)} exceeds recommended {config.YAHOO_BATCH_SIZE}"
            )

        symbols_csv = ",".join(tickers)
        params = {"symbols": symbols_csv}

        for attempt in range(config.YAHOO_MAX_RETRIES):
            try:
                response = await self.client.get(self.BASE_QUOTE_URL, params=params)
                response.raise_for_status()

                data = response.json()
                result = data.get("quoteResponse", {}).get("result", [])

                # Parse and map by symbol
                quotes = {}
                for quote in result:
                    symbol = quote.get("symbol")
                    if symbol:
                        quotes[symbol] = self._parse_quote(quote)

                logger.info(
                    f"Fetched {len(quotes)}/{len(tickers)} quotes (attempt {attempt + 1})"
                )
                return quotes

            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    wait_time = config.YAHOO_RETRY_BACKOFF**attempt
                    logger.warning(
                        f"Rate limited (429), waiting {wait_time}s before retry"
                    )
                    await asyncio.sleep(wait_time)
                else:
                    logger.error(f"HTTP error {e.response.status_code}: {e}")
                    return {}

            except Exception as e:
                logger.error(f"Failed to fetch quotes (attempt {attempt + 1}): {e}")
                if attempt < config.YAHOO_MAX_RETRIES - 1:
                    await asyncio.sleep(config.YAHOO_RETRY_BACKOFF**attempt)

        logger.error(
            f"Failed to fetch quotes after {config.YAHOO_MAX_RETRIES} attempts"
        )
        return {}

    def _parse_quote(self, quote: dict) -> dict:
        """Parse a single quote object from Yahoo"""
        return {
            "symbol": quote.get("symbol"),
            "short_name": quote.get("shortName"),
            "long_name": quote.get("longName"),
            "price": quote.get("regularMarketPrice"),
            "change_pct": quote.get("regularMarketChangePercent"),
            "market_cap": quote.get("marketCap"),
            "trailing_pe": quote.get("trailingPE"),
            "forward_pe": quote.get("forwardPE"),
            "beta": quote.get("beta"),
            "currency": quote.get("currency", "USD"),
            "fifty_two_week_high": quote.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low": quote.get("fiftyTwoWeekLow"),
            "as_of": datetime.utcnow(),
        }

    async def fetch_sparkline(self, ticker: str) -> Optional[List[float]]:
        """
        Fetch 1-month daily sparkline for a ticker

        Args:
            ticker: Single ticker symbol

        Returns:
            List of closing prices (normalized 0-1) or None if failed
        """
        url = f"{self.BASE_CHART_URL}/{ticker}"
        params = {
            "range": "1mo",
            "interval": "1d",
            "includePrePost": "false",
            "events": "history",
        }

        try:
            response = await self.client.get(url, params=params)
            response.raise_for_status()

            data = response.json()
            result = data.get("chart", {}).get("result", [])

            if not result:
                return None

            timestamps = result[0].get("timestamp", [])
            quotes = result[0].get("indicators", {}).get("quote", [])

            if not quotes or not timestamps:
                return None

            closes = quotes[0].get("close", [])

            # Filter out None values
            valid_closes = [c for c in closes if c is not None]

            if not valid_closes:
                return None

            # Normalize to 0-1 range
            min_close = min(valid_closes)
            max_close = max(valid_closes)

            if max_close == min_close:
                return [0.5] * len(valid_closes)

            normalized = [
                (c - min_close) / (max_close - min_close) for c in valid_closes
            ]

            return normalized

        except Exception as e:
            logger.debug(f"Failed to fetch sparkline for {ticker}: {e}")
            return None

    async def fetch_quotes_all_batches(self, all_tickers: List[str]) -> Dict[str, Dict]:
        """
        Fetch quotes for all tickers in batches

        Args:
            all_tickers: Complete list of tickers

        Returns:
            Combined dict of all quotes
        """
        all_quotes = {}

        # Split into batches
        batch_size = config.YAHOO_BATCH_SIZE
        batches = [
            all_tickers[i : i + batch_size]
            for i in range(0, len(all_tickers), batch_size)
        ]

        logger.info(f"Fetching {len(all_tickers)} tickers in {len(batches)} batches")

        # Fetch batches with some delay between them
        for i, batch in enumerate(batches):
            logger.info(f"Fetching batch {i + 1}/{len(batches)} ({len(batch)} tickers)")

            batch_quotes = await self.fetch_quotes_batch(batch)
            all_quotes.update(batch_quotes)

            # Small delay between batches to be polite
            if i < len(batches) - 1:
                await asyncio.sleep(0.5)

        return all_quotes


# Convenience function for single-shot usage
async def fetch_yahoo_quotes(tickers: List[str]) -> Dict[str, Dict]:
    """
    Fetch Yahoo quotes (convenience wrapper)

    Args:
        tickers: List of ticker symbols

    Returns:
        Dict mapping ticker -> quote data
    """
    async with YahooFinanceClient() as client:
        return await client.fetch_quotes_all_batches(tickers)
