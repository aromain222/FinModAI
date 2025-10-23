"""
Background refresh loop for market data
"""

import asyncio
import logging
from datetime import datetime
from typing import Dict, List

from backend.config import config
from backend.data.loader import fundamentals_loader
from backend.data.sectors import GICS_SECTORS
from backend.market.yahoo import YahooFinanceClient
from backend.market.merge import merge_all_quotes
from backend.market.cache import market_cache

logger = logging.getLogger(__name__)


class MarketRefreshService:
    """Background service for refreshing market data"""

    def __init__(self):
        self.running = False
        self.last_refresh: datetime = None
        self.refresh_count = 0

    async def refresh_all_data(self) -> Dict:
        """
        Refresh all market data from Yahoo Finance

        Returns:
            Stats dict with refresh metrics
        """
        start_time = datetime.utcnow()
        logger.info("Starting market data refresh...")

        try:
            # Get all tickers from fundamentals
            all_tickers = fundamentals_loader.get_all_tickers()

            if not all_tickers:
                logger.warning("No tickers to refresh")
                return {"success": False, "error": "No tickers loaded"}

            logger.info(f"Refreshing {len(all_tickers)} tickers")

            # Fetch quotes from Yahoo
            async with YahooFinanceClient() as client:
                quotes = await client.fetch_quotes_all_batches(all_tickers)

            if not quotes:
                logger.error("Failed to fetch any quotes")
                return {"success": False, "error": "No quotes fetched"}

            # Merge with fundamentals
            snapshots = merge_all_quotes(quotes)

            # Update cache
            market_cache.set_all_snapshots(snapshots)

            # Compute and cache sector leaders
            self._compute_sector_leaders(snapshots)

            # Optionally prefetch sparklines for top N by market cap
            top_tickers = self._get_top_tickers_by_market_cap(snapshots, config.SPARKLINE_TOP_N)
            if top_tickers:
                await self._prefetch_sparklines(top_tickers, client)

            duration_sec = (datetime.utcnow() - start_time).total_seconds()
            self.last_refresh = datetime.utcnow()
            self.refresh_count += 1

            stats = {
                "success": True,
                "tickers_requested": len(all_tickers),
                "quotes_fetched": len(quotes),
                "snapshots_merged": len(snapshots),
                "duration_sec": duration_sec,
                "timestamp": self.last_refresh.isoformat(),
            }

            logger.info(
                f"Refresh complete: {len(snapshots)} snapshots in {duration_sec:.1f}s "
                f"({len(quotes)}/{len(all_tickers)} quotes)"
            )

            return stats

        except Exception as e:
            logger.error(f"Refresh failed: {e}", exc_info=True)
            return {"success": False, "error": str(e)}

    def _compute_sector_leaders(self, snapshots: Dict[str, Dict]) -> None:
        """Compute and cache top leaders for each sector"""
        for sector in GICS_SECTORS:
            # Filter snapshots by sector
            sector_snapshots = [
                s
                for s in snapshots.values()
                if s.get("sector") == sector and s.get("market_cap") is not None
            ]

            # Sort by market cap descending
            sector_snapshots.sort(key=lambda x: x.get("market_cap", 0), reverse=True)

            # Take top 10 (cache more than default limit)
            leaders = sector_snapshots[:10]

            if leaders:
                market_cache.set_leaders(sector, leaders)
                logger.debug(f"Cached {len(leaders)} leaders for {sector}")

    def _get_top_tickers_by_market_cap(self, snapshots: Dict[str, Dict], n: int) -> List[str]:
        """Get top N tickers by market cap"""
        sorted_snapshots = sorted(
            snapshots.values(), key=lambda x: x.get("market_cap", 0), reverse=True
        )

        return [s["ticker"] for s in sorted_snapshots[:n] if s.get("ticker")]

    async def _prefetch_sparklines(self, tickers: List[str], client: YahooFinanceClient) -> None:
        """Prefetch sparklines for top tickers"""
        logger.info(f"Prefetching sparklines for {len(tickers)} tickers...")

        tasks = [client.fetch_sparkline(ticker) for ticker in tickers]
        sparklines = await asyncio.gather(*tasks, return_exceptions=True)

        success_count = 0
        for ticker, sparkline in zip(tickers, sparklines):
            if sparkline and not isinstance(sparkline, Exception):
                market_cache.set_sparkline(ticker, sparkline)
                success_count += 1

        logger.info(f"Prefetched {success_count}/{len(tickers)} sparklines")

    async def run_periodic_refresh(self) -> None:
        """Run refresh loop periodically"""
        self.running = True
        logger.info(f"Starting periodic refresh (interval: {config.REFRESH_INTERVAL_MIN} minutes)")

        # Initial refresh on startup
        await self.refresh_all_data()

        # Periodic refresh
        while self.running:
            await asyncio.sleep(config.REFRESH_INTERVAL_MIN * 60)

            if self.running:
                await self.refresh_all_data()

    def stop(self) -> None:
        """Stop the refresh loop"""
        self.running = False
        logger.info("Stopping periodic refresh")


# Global instance
refresh_service = MarketRefreshService()
