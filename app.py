#!/usr/bin/env python3
"""
Production IB Modeling API - Main Application
FastAPI backend for DCF, LBO, Trading Comps, and Merger models
"""

import os
import uuid
import logging
import traceback
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, validator
import structlog

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    wrapper_class=structlog.stdlib.BoundLogger,
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()

# Import our modules
from api.providers import ProviderManager
from api.assumptions import AssumptionEngine
from api.models import ModelCalculator
from api.excel import ExcelGenerator
from api.cache import CacheManager
from api.validation import TickerValidator

# Global instances
provider_manager: Optional[ProviderManager] = None
assumption_engine: Optional[AssumptionEngine] = None
model_calculator: Optional[ModelCalculator] = None
excel_generator: Optional[ExcelGenerator] = None
cache_manager: Optional[CacheManager] = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan management"""
    global provider_manager, assumption_engine, model_calculator, excel_generator, cache_manager
    
    logger.info("Starting IB Modeling API", version="1.0.0")
    
    # Initialize components
    try:
        cache_manager = CacheManager()
        provider_manager = ProviderManager()
        assumption_engine = AssumptionEngine()
        model_calculator = ModelCalculator()
        excel_generator = ExcelGenerator()
        
        # Verify providers are available
        active_providers = provider_manager.get_active_providers()
        if not active_providers:
            logger.error("No data providers available", providers=active_providers)
            raise RuntimeError("No data providers available")
        
        logger.info("API initialized successfully", 
                   active_providers=active_providers,
                   cache_enabled=cache_manager.is_enabled())
        
    except Exception as e:
        logger.error("Failed to initialize API", error=str(e), traceback=traceback.format_exc())
        raise
    
    yield
    
    logger.info("Shutting down IB Modeling API")

# Create FastAPI app
app = FastAPI(
    title="IB Modeling API",
    description="Production-ready API for Investment Banking financial models",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.getenv("APP_ORIGIN", "http://localhost:3000")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Static files for generated Excel files
os.makedirs("generated_models", exist_ok=True)
app.mount("/generated_models", StaticFiles(directory="generated_models"), name="generated_models")

# Request models
class ModelGenerateRequest(BaseModel):
    ticker: str = Field(..., min_length=1, max_length=15)
    model: str = Field(..., regex="^(dcf|lbo|comps|merger)$")
    overrides: Optional[Dict[str, Any]] = Field(default_factory=dict)
    
    @validator('ticker')
    def validate_ticker(cls, v):
        if not TickerValidator.is_valid(v):
            raise ValueError("Invalid ticker format")
        return v.upper()

# Response models
class ProvenanceInfo(BaseModel):
    source: str
    as_of: str

class HistoricalData(BaseModel):
    years: List[int]
    revenue: List[float]
    operating_income: List[float]
    op_margin: List[float]
    da: List[float]
    capex: List[float]
    delta_nwc: List[float]

class AssumptionsData(BaseModel):
    forecast_years: int
    revenue_growth: List[float]
    operating_margin: List[float]
    da_pct_rev: float
    capex_pct_rev: float
    nwc_pct_rev: float
    tax_rate: float

class WACCData(BaseModel):
    rf: float
    erp: float
    beta: float
    ke: float
    kd_pre: float
    tax: float
    wd: float
    we: float
    kd_after: float
    wacc: float

class TerminalData(BaseModel):
    method: str
    g: float

class AssumptionsResponse(BaseModel):
    ticker: str
    company_name: str
    currency: str
    provenance: Dict[str, ProvenanceInfo]
    historicals: HistoricalData
    assumptions: AssumptionsData
    wacc: WACCData
    terminal: TerminalData
    flags: List[str]

class ErrorResponse(BaseModel):
    error: str
    message: str
    missing: Optional[List[str]] = None
    provider_attempts: Optional[List[str]] = None
    trace_id: Optional[str] = None

class ModelPreview(BaseModel):
    dcf: Optional[Dict[str, Any]] = None
    lbo: Optional[Dict[str, Any]] = None
    comps: Optional[Dict[str, Any]] = None
    merger: Optional[Dict[str, Any]] = None

class ModelGenerateResponse(BaseModel):
    job_id: str
    assumptions: Dict[str, Any]
    preview: ModelPreview
    file: Dict[str, str]
    warnings: List[str]

# Middleware for request logging
@app.middleware("http")
async def log_requests(request: Request, call_next):
    trace_id = str(uuid.uuid4())
    start_time = datetime.now()
    
    logger.info("Request started", 
               trace_id=trace_id,
               method=request.method,
               url=str(request.url),
               client_ip=request.client.host)
    
    response = await call_next(request)
    
    process_time = (datetime.now() - start_time).total_seconds()
    logger.info("Request completed",
               trace_id=trace_id,
               status_code=response.status_code,
               process_time=process_time)
    
    return response
    
    # Health check endpoint
@app.get("/healthz")
async def health_check():
    """Health check endpoint for Render"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

# Assumptions endpoint
@app.get("/assumptions", response_model=Union[AssumptionsResponse, ErrorResponse])
async def get_assumptions(ticker: str, model: str):
    """Get company-specific assumptions and historicals"""
    trace_id = str(uuid.uuid4())
    
    try:
        # Validate inputs
        if not TickerValidator.is_valid(ticker):
            raise HTTPException(status_code=400, detail={
                "error": "invalid_ticker",
                "message": "Invalid ticker format",
                "trace_id": trace_id
            })
        
        if model not in ["dcf", "lbo", "comps", "merger"]:
            raise HTTPException(status_code=400, detail={
                "error": "invalid_model",
                "message": "Model must be dcf, lbo, comps, or merger",
                "trace_id": trace_id
            })
        
        ticker = ticker.upper()
        
        logger.info("Fetching assumptions", trace_id=trace_id, ticker=ticker, model=model)
        
        # Check cache first
        cache_key = f"assumptions:{ticker}:{model}"
        cached_result = cache_manager.get(cache_key) if cache_manager else None
        
        if cached_result:
            logger.info("Returning cached assumptions", trace_id=trace_id, ticker=ticker)
            return cached_result
        
        # Fetch data from providers
        financial_data = await provider_manager.get_financial_data(ticker)
        
        if not financial_data or len(financial_data.historicals.years) < 3:
            missing_fields = []
            if not financial_data or not financial_data.historicals.revenue:
                missing_fields.append("revenue")
            if not financial_data or not financial_data.historicals.operating_income:
                missing_fields.append("operating_income")
            
            raise HTTPException(status_code=422, detail={
                "error": "insufficient_historicals",
                "message": "Need ≥ 3 years of revenue & EBIT to build assumptions",
                "missing": missing_fields,
                "provider_attempts": provider_manager.get_attempted_providers(),
                "trace_id": trace_id
            })
        
        # Generate assumptions
        assumptions_result = assumption_engine.generate_assumptions(financial_data, model)
        
        # Cache the result
        if cache_manager:
            cache_manager.set(cache_key, assumptions_result, ttl=3600)  # 1 hour
        
        logger.info("Assumptions generated successfully", 
                   trace_id=trace_id, 
                   ticker=ticker,
                   flags=assumptions_result.flags)
        
        return assumptions_result
        
    except HTTPException:
        raise
        except Exception as e:
        logger.error("Error fetching assumptions", 
                   trace_id=trace_id, 
                   ticker=ticker, 
                   error=str(e),
                   traceback=traceback.format_exc())
        
        raise HTTPException(status_code=500, detail={
            "error": "internal_error",
            "message": "Internal server error",
            "trace_id": trace_id
        })

# Model generation endpoint
@app.post("/models/generate", response_model=Union[ModelGenerateResponse, ErrorResponse])
async def generate_model(request: ModelGenerateRequest):
    """Generate a financial model with preview and Excel file"""
    trace_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())
    
    try:
        logger.info("Generating model", 
                   trace_id=trace_id, 
                   job_id=job_id,
                   ticker=request.ticker, 
                   model=request.model)
        
        # Get assumptions (with caching)
        assumptions_response = await get_assumptions(request.ticker, request.model)
        
        if isinstance(assumptions_response, ErrorResponse):
            return assumptions_response
        
        # Apply overrides
        final_assumptions = assumption_engine.apply_overrides(assumptions_response, request.overrides)
        
        # Calculate model preview
        preview = model_calculator.calculate_model(request.model, final_assumptions)
        
        # Generate Excel file
        filename = f"{request.ticker}_{request.model.upper()}_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"
        file_path = excel_generator.generate_workbook(request.model, final_assumptions, preview, filename)
        
        logger.info("Model generated successfully",
                   trace_id=trace_id,
                   job_id=job_id,
                   ticker=request.ticker,
                   model=request.model,
                   file_size=os.path.getsize(file_path))
        
        return ModelGenerateResponse(
            job_id=job_id,
            assumptions=final_assumptions.dict(),
            preview=preview,
            file={
                "filename": filename,
                "download_url": f"/download/{filename}"
            },
            warnings=[]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error generating model",
                   trace_id=trace_id,
                   job_id=job_id,
                   ticker=request.ticker,
                   error=str(e),
                   traceback=traceback.format_exc())
        
        raise HTTPException(status_code=500, detail={
            "error": "internal_error",
            "message": "Internal server error",
            "trace_id": trace_id
        })

# Download endpoint
@app.get("/download/{filename}")
async def download_file(filename: str):
    """Download generated Excel file"""
    file_path = f"generated_models/{filename}"
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail={
            "error": "not_found",
            "message": "File not found"
        })
    
    return FileResponse(
        path=file_path,
        filename=filename,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

if __name__ == "__main__":
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=int(os.getenv("PORT", 8000)),
        reload=False,
        log_level="info"
    )