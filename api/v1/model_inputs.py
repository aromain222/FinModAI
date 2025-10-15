"""
FastAPI endpoints for model input bundles (DCF, LBO, Comps, Merger).
"""
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, BackgroundTasks
from pydantic import BaseModel

from models_data.bundles import bundle_builder, DCFBundle, LBOBundle, CompsBundle, MergerBundle
from orchestrator.cache import cache_manager
from orchestrator.registry import registry
from config import config


# Response models
class ModelInputResponse(BaseModel):
    """Base response model for model inputs."""
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    source: Dict[str, List[str]] = None
    as_of_quotes: Optional[datetime] = None
    as_of_fundamentals: Optional[datetime] = None
    stale: bool = False


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str
    missing_fields: Optional[List[str]] = None
    attempted_providers: Optional[List[str]] = None
    reasons: Optional[Dict[str, str]] = None


# Router
router = APIRouter(prefix="/api/v1/model-inputs", tags=["Model Inputs"])
logger = logging.getLogger("api.v1.model_inputs")


@router.get("/dcf", response_model=ModelInputResponse)
async def get_dcf_bundle(
    ticker: str = Query(..., description="Stock ticker symbol"),
    force_refresh: bool = Query(False, description="Force refresh from providers")
) -> ModelInputResponse:
    """
    Get DCF model input bundle for a ticker.
    
    Returns fundamental data, historicals (≥3 years), current metrics,
    capital structure, market data, and WACC inputs.
    """
    try:
        logger.info(f"Building DCF bundle for {ticker}")
        
        # Check if we're in production and enforce data requirements
        if config.is_production:
            await _validate_production_requirements(ticker)
        
        # Build the bundle
        bundle = await bundle_builder.build_dcf_bundle(ticker, force_refresh)
        
        # Check for stale data
        stale = _check_stale_data(bundle.as_of_quotes, bundle.as_of_fundamentals)
        
        # Get source information
        source_info = _get_source_info()
        
        return ModelInputResponse(
            success=True,
            data=bundle.dict(),
            source=source_info,
            as_of_quotes=bundle.as_of_quotes,
            as_of_fundamentals=bundle.as_of_fundamentals,
            stale=stale
        )
        
    except ValueError as e:
        # Missing required fields
        logger.warning(f"DCF bundle validation failed for {ticker}: {e}")
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Missing required fields for DCF model",
                "missing_fields": [str(e)]
            }
        )
    except Exception as e:
        logger.error(f"DCF bundle error for {ticker}: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Data unavailable",
                "attempted_providers": registry.get_enabled_providers(),
                "reasons": {provider: str(e) for provider in registry.get_enabled_providers()}
            }
        )


@router.get("/lbo", response_model=ModelInputResponse)
async def get_lbo_bundle(
    ticker: str = Query(..., description="Stock ticker symbol"),
    force_refresh: bool = Query(False, description="Force refresh from providers")
) -> ModelInputResponse:
    """
    Get LBO model input bundle for a ticker.
    
    Returns starting financials, market data, and capital structure hints.
    """
    try:
        logger.info(f"Building LBO bundle for {ticker}")
        
        if config.is_production:
            await _validate_production_requirements(ticker)
        
        bundle = await bundle_builder.build_lbo_bundle(ticker, force_refresh)
        stale = _check_stale_data(bundle.as_of)
        
        return ModelInputResponse(
            success=True,
            data=bundle.dict(),
            source=_get_source_info(),
            as_of_quotes=bundle.as_of,
            stale=stale
        )
        
    except ValueError as e:
        logger.warning(f"LBO bundle validation failed for {ticker}: {e}")
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Missing required fields for LBO model",
                "missing_fields": [str(e)]
            }
        )
    except Exception as e:
        logger.error(f"LBO bundle error for {ticker}: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Data unavailable",
                "attempted_providers": registry.get_enabled_providers(),
                "reasons": {provider: str(e) for provider in registry.get_enabled_providers()}
            }
        )


@router.get("/comps", response_model=ModelInputResponse)
async def get_comps_bundle(
    ticker: str = Query(..., description="Stock ticker symbol"),
    peers: Optional[str] = Query(None, description="Comma-separated list of peer tickers"),
    force_refresh: bool = Query(False, description="Force refresh from providers")
) -> ModelInputResponse:
    """
    Get Comps model input bundle for a ticker and peers.
    
    Returns peer company data with financial metrics and ratios.
    """
    try:
        logger.info(f"Building Comps bundle for {ticker}")
        
        if config.is_production:
            await _validate_production_requirements(ticker)
        
        # Parse peers
        peer_list = []
        if peers:
            peer_list = [p.strip().upper() for p in peers.split(",") if p.strip()]
        
        bundle = await bundle_builder.build_comps_bundle(ticker, peer_list, force_refresh)
        
        # Get latest timestamps from peer data
        latest_quotes = max([p.as_of_quotes for p in bundle.peer_rows if p.as_of_quotes], default=None)
        latest_fundamentals = max([p.as_of_fundamentals for p in bundle.peer_rows if p.as_of_fundamentals], default=None)
        
        stale = _check_stale_data(latest_quotes, latest_fundamentals)
        
        return ModelInputResponse(
            success=True,
            data=bundle.dict(),
            source=_get_source_info(),
            as_of_quotes=latest_quotes,
            as_of_fundamentals=latest_fundamentals,
            stale=stale
        )
        
    except ValueError as e:
        logger.warning(f"Comps bundle validation failed for {ticker}: {e}")
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Missing required fields for Comps model",
                "missing_fields": [str(e)]
            }
        )
    except Exception as e:
        logger.error(f"Comps bundle error for {ticker}: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Data unavailable",
                "attempted_providers": registry.get_enabled_providers(),
                "reasons": {provider: str(e) for provider in registry.get_enabled_providers()}
            }
        )


@router.get("/merger", response_model=ModelInputResponse)
async def get_merger_bundle(
    acquirer: str = Query(..., description="Acquirer ticker symbol"),
    target: str = Query(..., description="Target ticker symbol"),
    force_refresh: bool = Query(False, description="Force refresh from providers")
) -> ModelInputResponse:
    """
    Get Merger model input bundle for acquirer and target.
    
    Returns DCF bundles for both companies plus shared analysis data.
    """
    try:
        logger.info(f"Building Merger bundle: {acquirer} + {target}")
        
        if config.is_production:
            await _validate_production_requirements(acquirer)
            await _validate_production_requirements(target)
        
        bundle = await bundle_builder.build_merger_bundle(acquirer, target, force_refresh)
        
        # Get latest timestamps from both companies
        acquirer_quotes = bundle.acquirer.as_of_quotes
        acquirer_fundamentals = bundle.acquirer.as_of_fundamentals
        target_quotes = bundle.target.as_of_quotes
        target_fundamentals = bundle.target.as_of_fundamentals
        
        latest_quotes = max([t for t in [acquirer_quotes, target_quotes] if t], default=None)
        latest_fundamentals = max([t for t in [acquirer_fundamentals, target_fundamentals] if t], default=None)
        
        stale = _check_stale_data(latest_quotes, latest_fundamentals)
        
        return ModelInputResponse(
            success=True,
            data=bundle.dict(),
            source=_get_source_info(),
            as_of_quotes=latest_quotes,
            as_of_fundamentals=latest_fundamentals,
            stale=stale
        )
        
    except ValueError as e:
        logger.warning(f"Merger bundle validation failed for {acquirer}+{target}: {e}")
        raise HTTPException(
            status_code=422,
            detail={
                "error": "Missing required fields for Merger model",
                "missing_fields": [str(e)]
            }
        )
    except Exception as e:
        logger.error(f"Merger bundle error for {acquirer}+{target}: {e}")
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Data unavailable",
                "attempted_providers": registry.get_enabled_providers(),
                "reasons": {provider: str(e) for provider in registry.get_enabled_providers()}
            }
        )


@router.get("/provenance")
async def get_provenance_info():
    """
    Get data provenance and system status information.
    
    Returns counts of tickers with fresh data, last refresh times, and provider matrix.
    """
    try:
        # Get cache statistics
        cache_stats = await cache_manager.get_stats()
        
        # Get provider status
        provider_status = registry.get_provider_status()
        
        # Get health check results
        health_status = await registry.health_check()
        
        # Get data source information
        source_info = _get_source_info()
        
        return {
            "cache_stats": cache_stats,
            "provider_status": provider_status,
            "health_status": health_status,
            "source_info": source_info,
            "config": {
                "data_mode": config.data_mode,
                "staleness_max_minutes": config.staleness_max_minutes,
                "enabled_providers": config.enabled_providers
            }
        }
        
    except Exception as e:
        logger.error(f"Provenance info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# Helper functions
async def _validate_production_requirements(ticker: str) -> None:
    """Validate that production requirements are met."""
    if not config.is_production:
        return
    
    # Check cache status for the ticker
    cache_status = await cache_manager.get_ticker_cache_status(ticker)
    
    # Ensure we have recent quotes
    quotes_status = cache_status.get("quotes", {})
    if not quotes_status.get("cached") or quotes_status.get("stale"):
        raise HTTPException(
            status_code=503,
            detail={
                "error": "data_stale",
                "message": f"Quotes for {ticker} are stale (older than {config.staleness_max_minutes} minutes)",
                "minutes_old": _get_minutes_old(quotes_status.get("as_of"))
            }
        )


def _check_stale_data(quotes_time: Optional[datetime], fundamentals_time: Optional[datetime] = None) -> bool:
    """Check if data is stale based on configuration."""
    if quotes_time:
        quotes_age = datetime.utcnow() - quotes_time
        if quotes_age.total_seconds() / 60 > config.staleness_max_minutes:
            return True
    
    return False


def _get_source_info() -> Dict[str, List[str]]:
    """Get information about data sources by type."""
    return registry.get_data_source_info()


def _get_minutes_old(as_of_str: Optional[str]) -> Optional[int]:
    """Calculate minutes old from ISO timestamp string."""
    if not as_of_str:
        return None
    
    try:
        as_of = datetime.fromisoformat(as_of_str.replace('Z', '+00:00'))
        age = datetime.utcnow() - as_of
        return int(age.total_seconds() / 60)
    except Exception:
        return None
