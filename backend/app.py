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
from datetime import datetime

from config import settings, validate_settings

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan context manager for startup/shutdown"""
    # Startup
    logger.info("🚀 Starting FinModAI Backend...")
    logger.info(f"  Version: {settings.APP_VERSION}")
    logger.info(f"  Data Mode: {settings.DATA_MODE}")
    logger.info(f"  Database: {settings.DATABASE_URL}")
    
    # Validate settings
    try:
        validate_settings()
        logger.info("✅ Configuration validated")
    except ValueError as e:
        logger.error(f"❌ Configuration error: {e}")
        raise
    
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
            "request_id": request.headers.get("X-Request-ID", "unknown")
        }
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
            "request_id": request.headers.get("X-Request-ID", "unknown")
        }
    )


# Health Check
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": settings.APP_VERSION,
        "data_mode": settings.DATA_MODE
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "message": f"Welcome to {settings.APP_NAME}",
        "version": settings.APP_VERSION,
        "docs": "/api/docs" if settings.DEBUG else "disabled in production"
    }


# Include routers
from api.v1 import auth_router, models_router
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(models_router, prefix="/api/v1/models", tags=["models"])


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="info"
    )
