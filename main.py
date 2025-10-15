"""
Main FastAPI application for the financial data layer.
"""
import logging
import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from api.v1.model_inputs import router as model_inputs_router
from api.v1.market import router as market_router
from orchestrator.cache import cache_manager
from orchestrator.registry import registry
from config import config


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("main")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("Starting FinModAI Data Layer")
    logger.info(f"Data mode: {config.data_mode}")
    logger.info(f"Enabled providers: {config.enabled_providers}")
    
    # Initialize cache and providers
    await cache_manager._load_snapshot()
    health_status = await registry.health_check()
    logger.info(f"Provider health: {health_status}")
    
    # Start background refresh task
    refresh_task = asyncio.create_task(background_refresh_loop())
    
    yield
    
    # Shutdown
    logger.info("Shutting down FinModAI Data Layer")
    refresh_task.cancel()
    await cache_manager.save_snapshot()


# Create FastAPI app
app = FastAPI(
    title="FinModAI Data Layer",
    description="Provider-agnostic financial data layer for DCF, LBO, Comps, and Merger models",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(model_inputs_router)
app.include_router(market_router)


@app.get("/")
async def root():
    """Root endpoint with system status."""
    try:
        cache_stats = await cache_manager.get_stats()
        provider_status = registry.get_provider_status()
        health_status = await registry.health_check()
        
        return {
            "service": "FinModAI Data Layer",
            "version": "1.0.0",
            "status": "operational",
            "data_mode": config.data_mode,
            "enabled_providers": config.enabled_providers,
            "cache_stats": cache_stats,
            "provider_health": health_status,
            "endpoints": {
                "model_inputs": "/api/v1/model-inputs",
                "market_data": "/api/v1/market",
                "provenance": "/api/v1/model-inputs/provenance"
            }
        }
    except Exception as e:
        logger.error(f"Root endpoint error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        cache_stats = await cache_manager.get_stats()
        provider_health = await registry.health_check()
        
        # Determine overall health
        healthy_providers = sum(1 for healthy in provider_health.values() if healthy)
        total_providers = len(provider_health)
        
        overall_health = "healthy" if healthy_providers > 0 else "degraded"
        
        return {
            "status": overall_health,
            "providers": {
                "total": total_providers,
                "healthy": healthy_providers,
                "status": provider_health
            },
            "cache": {
                "total_entries": cache_stats["total_entries"],
                "stale_entries": cache_stats["stale_entries"]
            },
            "data_mode": config.data_mode
        }
    except Exception as e:
        logger.error(f"Health check error: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "error": str(e)}
        )


async def background_refresh_loop():
    """Background task to refresh data caches."""
    logger.info("Starting background refresh loop")
    
    while True:
        try:
            # Wait 15 minutes between refreshes
            await asyncio.sleep(15 * 60)
            
            logger.info("Running background data refresh")
            
            # Get list of tracked tickers (would come from EDGAR universe)
            tracked_tickers = [
                "AAPL", "MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA",
                "NFLX", "ADBE", "CRM", "ORCL", "INTC", "IBM", "CSCO"
            ]
            
            # Refresh quotes for tracked tickers
            from orchestrator.fetch import data_fetcher, FetchRequest
            
            quote_requests = [
                FetchRequest(ticker=ticker, data_type="quotes", force_refresh=True)
                for ticker in tracked_tickers
            ]
            
            # Process in batches to avoid overwhelming providers
            batch_size = config.quote_batch_size
            for i in range(0, len(quote_requests), batch_size):
                batch = quote_requests[i:i + batch_size]
                results = await data_fetcher.fetch_batch(batch)
                
                successful = sum(1 for r in results.values() if r.success)
                logger.info(f"Refreshed quotes for {successful}/{len(batch)} tickers")
                
                # Small delay between batches
                await asyncio.sleep(1)
            
            # Clean up expired cache entries
            expired_count = await cache_manager.cleanup_expired()
            if expired_count > 0:
                logger.info(f"Cleaned up {expired_count} expired cache entries")
            
            # Save cache snapshot periodically
            await cache_manager.save_snapshot()
            
        except asyncio.CancelledError:
            logger.info("Background refresh loop cancelled")
            break
        except Exception as e:
            logger.error(f"Background refresh error: {e}")
            # Continue the loop even if there's an error
            await asyncio.sleep(60)  # Wait 1 minute before retrying


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
