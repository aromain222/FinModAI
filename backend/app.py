"""
FinModAI Backend - FastAPI Application
Main entry point for the API server
"""

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import logging
import signal
import sys
from datetime import datetime

from backend.config import settings, validate_settings

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)


# Graceful shutdown handler
def handle_sigterm(*_):
    """Handle SIGTERM signal for graceful shutdown"""
    logger.info("Received shutdown signal, exiting cleanly...")
    sys.exit(0)


# Register signal handler
signal.signal(signal.SIGTERM, handle_sigterm)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    import os
    
    logger.info("🚀 Starting FinModAI Backend with enhanced logging...")
    logger.info(f"  Version: {settings.APP_VERSION}")
    # Preflight: log critical env/state
    logger.info(
        "  Preflight: DATA_MODE=%s, DATA_STALENESS_MAX_MIN=%s, REQUIRE_MIN_FUND_YEARS=%s",
        settings.data_mode,
        str(settings.data_staleness_max_min),
        str(settings.require_min_fund_years),
    )
    logger.info(
        "  Environment: PORT=%s, PYTHONPATH=%s",
        os.environ.get("PORT"),
        os.environ.get("PYTHONPATH"),
    )
    logger.info(f"  Database: {settings.DATABASE_URL}")
    
    # Ensure database directory exists
    if settings.DATABASE_URL.startswith('sqlite:///'):
        db_path = settings.DATABASE_URL.replace('sqlite:///', '')
        if '/' in db_path:  # Only create directory if there's a path component
            os.makedirs(os.path.dirname(db_path), exist_ok=True)
            logger.info(f"  Ensured database directory exists for: {db_path}")

    # Validate settings
    try:
        validate_settings()
        logger.info("✅ Configuration validated")
    except (ValueError, RuntimeError) as e:
        # Fail loud with distinct exit code for config/env errors
        logger.error("❌ Configuration validation failed: %s", str(e))
        sys.exit(78)

    # Initialize database
    # TODO: Add database initialization

    # Initialize providers
    # TODO: Add provider initialization

    logger.info("✅ FinModAI Backend started successfully")

    yield

    # Shutdown
    logger.info("🛑 Shutting down FinModAI Backend...")
    # TODO: Add cleanup logic


# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Professional Financial Modeling Platform",
    lifespan=lifespan,
    docs_url="/api/docs" if settings.DEBUG else None,
    redoc_url="/api/redoc" if settings.DEBUG else None,
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Exception Handlers
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle validation errors"""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "error": "validation_error",
            "code": "invalid_request",
            "message": "Invalid request parameters",
            "details": exc.errors(),
            "request_id": request.headers.get("X-Request-ID", "unknown"),
        },
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions"""
    logger.error(f"Unhandled exception: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "internal_error",
            "code": "server_error",
            "message": "An internal error occurred",
            "request_id": request.headers.get("X-Request-ID", "unknown"),
        },
    )


# Health Check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.APP_VERSION,
        "data_mode": settings.data_mode,
    }


# Healthz endpoint for Fly.io health checks
@app.get("/healthz")
async def healthz():
    """Healthz endpoint for Fly.io health checks"""
    return {"status": "ok"}


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/api/docs" if settings.DEBUG else "disabled in production",
    }


# Include routers
from backend.api.v1.auth import router as auth_router  # noqa: E402
from backend.api.v1.models import router as models_router  # noqa: E402

app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(models_router, prefix="/api/v1/models", tags=["models"])


if __name__ == "__main__":
    import uvicorn
    import os

    port = int(os.environ.get("PORT", "8080"))
    uvicorn.run("backend.app:app", host="0.0.0.0", port=port, reload=settings.DEBUG, log_level="info")
