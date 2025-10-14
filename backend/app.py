"""
FinModAI Market Overview API
FastAPI backend serving live market data merged with EDGAR fundamentals
"""
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import config
from backend.data.loader import fundamentals_loader
from backend.market.refresh import refresh_service
from backend.market.cache import market_cache
from backend.api.v1.routes import router as v1_router
from backend.api.v1.models import HealthResponse, RefreshResponse

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)


# Startup/Shutdown
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    logger.info("Starting FinModAI Market API...")
    
    # Validate config
    try:
        config.validate()
    except FileNotFoundError as e:
        logger.error(f"Configuration validation failed: {e}")
        raise
    
    # Load EDGAR fundamentals
    try:
        fundamentals_loader.load()
        logger.info(f"Loaded fundamentals for {len(fundamentals_loader.tickers)} tickers")
    except Exception as e:
        logger.error(f"Failed to load fundamentals: {e}")
        raise
    
    # Start background refresh task
    refresh_task = asyncio.create_task(refresh_service.run_periodic_refresh())
    
    logger.info("API startup complete")
    
    yield
    
    # Shutdown
    logger.info("Shutting down...")
    refresh_service.stop()
    refresh_task.cancel()
    try:
        await refresh_task
    except asyncio.CancelledError:
        pass
    logger.info("Shutdown complete")


# Create app
app = FastAPI(
    title="FinModAI Market Overview API",
    description="Live market data merged with SEC EDGAR fundamentals",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(v1_router)


# Health endpoint
@app.get("/healthz", response_model=HealthResponse)
async def healthz():
    """Health check endpoint"""
    return HealthResponse(
        status="ok",
        timestamp=datetime.utcnow(),
        cache_stats=market_cache.get_stats(),
        last_refresh=refresh_service.last_refresh
    )


# Admin refresh endpoint
@app.post("/api/v1/_refresh", response_model=RefreshResponse)
async def trigger_refresh():
    """
    Admin endpoint to force refresh market data
    
    Note: In production, this should be protected with authentication
    """
    logger.info("Manual refresh triggered")
    
    try:
        stats = await refresh_service.refresh_all_data()
        
        if stats.get('success'):
            return RefreshResponse(
                success=True,
                message="Refresh completed successfully",
                stats=stats
            )
        else:
            return RefreshResponse(
                success=False,
                message=f"Refresh failed: {stats.get('error')}",
                stats=stats
            )
    
    except Exception as e:
        logger.error(f"Manual refresh failed: {e}")
        return RefreshResponse(
            success=False,
            message=f"Refresh failed: {str(e)}"
        )


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API info"""
    return {
        "name": "FinModAI Market Overview API",
        "version": "1.0.0",
        "status": "operational",
        "endpoints": {
            "health": "/healthz",
            "market_snapshot": "/api/v1/market/snapshot",
            "sector_leaders": "/api/v1/market/leaders",
            "company_detail": "/api/v1/company/{ticker}",
            "refresh": "/api/v1/_refresh (POST)"
        },
        "docs": "/docs"
    }


# Error handlers
@app.exception_handler(404)
async def not_found_handler(request, exc):
    """Custom 404 handler"""
    return JSONResponse(
        status_code=404,
        content={"detail": "Endpoint not found"}
    )


@app.exception_handler(500)
async def internal_error_handler(request, exc):
    """Custom 500 handler"""
    logger.error(f"Internal error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )

