"""
Production-ready FastAPI endpoints for model input generation.
Primary endpoints for DCF, LBO, Comps, and Merger models with strict enforcement.
"""
from fastapi import APIRouter, HTTPException, Query, status
from typing import Optional, List, Dict, Any
import httpx
from datetime import datetime, timedelta
from models_data.bundles import (
    DCFBundle, LBOBundle, CompsBundle, MergerBundle
)
from orchestrator.fetch import data_fetcher
from orchestrator.reconcile import data_reconciler
from orchestrator.cache import cache_manager
from config import config
from production_enforcement import validate_production_data, enforcement
import logging

router = APIRouter()
logger = logging.getLogger(__name__)


class ProductionModelInputResponse(BaseModel):
    """Production response model with required footer."""
    # Model-specific data will be included here
    stale: bool
    as_of_quotes: str
    as_of_fundamentals: str
    source: Dict[str, List[str]] = {
        "fundamentals": ["edgar", "fmp", "finnhub", "alphavantage"],
        "quotes": ["yahoo", "finnhub", "alphavantage", "fmp"],
        "chart": ["yahoo", "finnhub", "fmp"],
        "rf": ["fred"]
    }


class ErrorResponse(BaseModel):
    """Error response model."""
    error: str
    fields: Optional[List[str]] = None


async def check_data_freshness(data: Dict[str, Any]) -> tuple[bool, str]:
    """Check if data meets freshness requirements."""
    if data.get("stale", False):
        return False, "Data marked as stale"
    
    quotes_as_of = data.get("as_of_quotes")
    if quotes_as_of:
        try:
            if isinstance(quotes_as_of, str):
                quote_time = datetime.fromisoformat(quotes_as_of.replace('Z', '+00:00'))
            else:
                quote_time = quotes_as_of
            
            age = datetime.now(quote_time.tzinfo) - quote_time
            max_age = timedelta(minutes=config.staleness_max_minutes)
            
            if age > max_age:
                return False, f"Quotes too old: {age.total_seconds()/60:.1f} minutes"
        except (ValueError, TypeError):
            return False, "Invalid quote timestamp format"
    
    return True, ""


async def validate_model_requirements(ticker: str, model_type: str, data: Dict[str, Any]) -> tuple[bool, str]:
    """Validate model-specific requirements."""
    if model_type == "dcf":
        # Check for minimum historical data
        historicals = data.get("historicals", {})
        if isinstance(historicals, dict):
            revenue = historicals.get("revenue", [])
            if isinstance(revenue, list) and len(revenue) < 3:
                return False, "DCF requires ≥3 years of revenue data"
        
        # Check required fields
        required = ["historicals", "market", "capital", "wacc_inputs"]
        missing = [field for field in required if field not in data]
        if missing:
            return False, f"Missing required fields: {missing}"
    
    elif model_type == "lbo":
        required = ["starting", "market", "cap_structure_hints"]
        missing = [field for field in required if field not in data]
        if missing:
            return False, f"Missing required fields: {missing}"
    
    elif model_type == "comps":
        peer_rows = data.get("peer_rows", [])
        if isinstance(peer_rows, list) and len(peer_rows) < 8:
            return False, "Comps requires ≥8 peer companies"
    
    elif model_type == "merger":
        required = ["acquirer", "target", "shared"]
        missing = [field for field in required if field not in data]
        if missing:
            return False, f"Missing required fields: {missing}"
    
    return True, ""


@router.get("/dcf", response_model=Union[DCFBundle, ErrorResponse])
async def get_dcf_inputs(
    ticker: str = Query(..., description="Company ticker symbol"),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    Generate DCF model inputs with production enforcement.
    
    Returns:
    - 200: DCF bundle with real data
    - 422: Missing required fields for DCF model
    - 503: Data stale or unavailable
    """
    try:
        logger.info(f"Generating DCF inputs for {ticker}")
        
        # Fetch data using orchestrator
        fetch_request = FetchRequest(
            ticker=ticker,
            data_types=["fundamentals", "quotes", "market_data", "risk_free"]
        )
        
        raw_data = await data_fetcher.fetch_data(fetch_request)
        
        # Reconcile data
        reconciled_data = data_reconciler.reconcile_data(raw_data)
        
        # Check production requirements
        is_valid, errors = validate_production_data(reconciled_data, ticker, "dcf")
        if not is_valid:
            logger.error(f"Production validation failed for {ticker}: {errors}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "missing_fields",
                    "fields": errors
                }
            )
        
        # Check freshness
        is_fresh, freshness_error = await check_data_freshness(reconciled_data)
        if not is_fresh:
            logger.error(f"Data freshness check failed for {ticker}: {freshness_error}")
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "error": "data_stale",
                    "message": freshness_error
                }
            )
        
        # Validate model requirements
        is_valid, model_error = await validate_model_requirements(ticker, "dcf", reconciled_data)
        if not is_valid:
            logger.error(f"Model validation failed for {ticker}: {model_error}")
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "error": "missing_fields",
                    "fields": [model_error]
                }
            )
        
        # Build DCF bundle
        dcf_bundle = DCFBundle(**reconciled_data)
        
        # Trigger background refresh if data is getting stale
        if not reconciled_data.get("stale", False):
            background_tasks.add_task(refresh_ticker_data, ticker)
        
        logger.info(f"Successfully generated DCF inputs for {ticker}")
        return dcf_bundle
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating DCF inputs for {ticker}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "data_unavailable",
                "message": f"Failed to fetch data for {ticker}: {str(e)}"
            }
        )


@router.get("/lbo", response_model=Union[LBOBundle, ErrorResponse])
async def get_lbo_inputs(
    ticker: str = Query(..., description="Company ticker symbol"),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Generate LBO model inputs with production enforcement."""
    try:
        logger.info(f"Generating LBO inputs for {ticker}")
        
        fetch_request = FetchRequest(
            ticker=ticker,
            data_types=["fundamentals", "quotes", "market_data"]
        )
        
        raw_data = await data_fetcher.fetch_data(fetch_request)
        reconciled_data = data_reconciler.reconcile_data(raw_data)
        
        # Production validation
        is_valid, errors = validate_production_data(reconciled_data, ticker, "lbo")
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": "missing_fields", "fields": errors}
            )
        
        # Freshness check
        is_fresh, freshness_error = await check_data_freshness(reconciled_data)
        if not is_fresh:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": "data_stale", "message": freshness_error}
            )
        
        # Model validation
        is_valid, model_error = await validate_model_requirements(ticker, "lbo", reconciled_data)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": "missing_fields", "fields": [model_error]}
            )
        
        lbo_bundle = LBOBundle(**reconciled_data)
        background_tasks.add_task(refresh_ticker_data, ticker)
        
        return lbo_bundle
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating LBO inputs for {ticker}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "data_unavailable", "message": str(e)}
        )


@router.get("/comps", response_model=Union[CompsBundle, ErrorResponse])
async def get_comps_inputs(
    ticker: str = Query(..., description="Company ticker symbol"),
    peers: Optional[str] = Query(None, description="Comma-separated list of peer tickers"),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Generate Comps model inputs with production enforcement."""
    try:
        logger.info(f"Generating Comps inputs for {ticker}")
        
        # Determine peer list
        if peers:
            peer_list = [p.strip().upper() for p in peers.split(",")]
        else:
            # Auto-determine peers (simplified)
            peer_list = await get_sector_peers(ticker)
        
        # Fetch data for target and peers
        all_tickers = [ticker] + peer_list
        fetch_request = FetchRequest(
            ticker=",".join(all_tickers),
            data_types=["fundamentals", "quotes", "market_data"]
        )
        
        raw_data = await data_fetcher.fetch_data(fetch_request)
        reconciled_data = data_reconciler.reconcile_data(raw_data)
        
        # Production validation
        is_valid, errors = validate_production_data(reconciled_data, ticker, "comps")
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": "missing_fields", "fields": errors}
            )
        
        # Freshness check
        is_fresh, freshness_error = await check_data_freshness(reconciled_data)
        if not is_fresh:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": "data_stale", "message": freshness_error}
            )
        
        # Model validation
        is_valid, model_error = await validate_model_requirements(ticker, "comps", reconciled_data)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": "missing_fields", "fields": [model_error]}
            )
        
        comps_bundle = CompsBundle(**reconciled_data)
        background_tasks.add_task(refresh_ticker_data, ticker)
        
        return comps_bundle
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating Comps inputs for {ticker}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "data_unavailable", "message": str(e)}
        )


@router.get("/merger", response_model=Union[MergerBundle, ErrorResponse])
async def get_merger_inputs(
    acquirer: str = Query(..., description="Acquirer ticker symbol"),
    target: str = Query(..., description="Target ticker symbol"),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Generate Merger model inputs with production enforcement."""
    try:
        logger.info(f"Generating Merger inputs for {acquirer} -> {target}")
        
        # Fetch data for both companies
        fetch_request = FetchRequest(
            ticker=f"{acquirer},{target}",
            data_types=["fundamentals", "quotes", "market_data"]
        )
        
        raw_data = await data_fetcher.fetch_data(fetch_request)
        reconciled_data = data_reconciler.reconcile_data(raw_data)
        
        # Production validation
        is_valid, errors = validate_production_data(reconciled_data, acquirer, "merger")
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": "missing_fields", "fields": errors}
            )
        
        # Freshness check
        is_fresh, freshness_error = await check_data_freshness(reconciled_data)
        if not is_fresh:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"error": "data_stale", "message": freshness_error}
            )
        
        # Model validation
        is_valid, model_error = await validate_model_requirements(acquirer, "merger", reconciled_data)
        if not is_valid:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": "missing_fields", "fields": [model_error]}
            )
        
        merger_bundle = MergerBundle(**reconciled_data)
        background_tasks.add_task(refresh_ticker_data, acquirer)
        background_tasks.add_task(refresh_ticker_data, target)
        
        return merger_bundle
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating Merger inputs for {acquirer}->{target}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"error": "data_unavailable", "message": str(e)}
        )


async def refresh_ticker_data(ticker: str):
    """Background task to refresh data for a ticker."""
    try:
        fetch_request = FetchRequest(
            ticker=ticker,
            data_types=["quotes", "market_data"]
        )
        await data_fetcher.fetch_data(fetch_request)
        logger.info(f"Background refresh completed for {ticker}")
    except Exception as e:
        logger.error(f"Background refresh failed for {ticker}: {str(e)}")


async def get_sector_peers(ticker: str) -> List[str]:
    """Get sector peers for a ticker (simplified implementation)."""
    # This would be implemented with actual sector classification
    # For now, return a default set
    sector_peers = {
        "AAPL": ["MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "ORCL", "CRM"],
        "MSFT": ["AAPL", "GOOGL", "AMZN", "META", "ORCL", "CRM", "ADBE", "INTC"],
        # Add more mappings as needed
    }
    return sector_peers.get(ticker.upper(), ["MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "ORCL", "CRM"])


@router.get("/_provenance")
async def get_provenance_info():
    """Get data provenance and health information."""
    try:
        # Get cache statistics
        cache_stats = cache_manager.get_stats()
        
        # Get provider status
        enabled_providers = config.enabled_providers
        
        return {
            "enabled_providers": enabled_providers,
            "cache_stats": cache_stats,
            "data_mode": config.data_mode,
            "staleness_threshold_minutes": config.staleness_max_minutes,
            "last_refresh": datetime.now().isoformat()
        }
    except Exception as e:
        logger.error(f"Error getting provenance info: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "provenance_unavailable", "message": str(e)}
        )
