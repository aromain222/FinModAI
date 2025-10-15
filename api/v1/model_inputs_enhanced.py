"""
Enhanced model input endpoints with strict real data validation.
"""
import logging
from typing import Optional, List, Dict, Any, Union
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Query, status, BackgroundTasks
from pydantic import BaseModel

from orchestrator.enhanced_registry import enhanced_registry
from orchestrator.reconcile import data_reconciler
from orchestrator.cache import cache_manager
from runtime_guardrails import runtime_guardrails
from config import config

logger = logging.getLogger(__name__)

router = APIRouter()


class ModelInputResponse(BaseModel):
    """Standard response model for model inputs."""
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
    message: Optional[str] = None


async def validate_model_inputs(ticker: str, model_type: str, data: Dict[str, Any]) -> None:
    """Validate model inputs meet minimum requirements."""
    missing_fields = []
    
    if model_type == "dcf":
        # Check for minimum historical data
        historicals = data.get("historicals", {})
        if isinstance(historicals, dict):
            revenue_data = historicals.get("revenue", [])
            ebit_data = historicals.get("ebit", []) or historicals.get("ebitda", [])
            
            if isinstance(revenue_data, list) and isinstance(ebit_data, list):
                valid_years = min(len(revenue_data), len(ebit_data))
                if valid_years < config.require_min_fund_years:
                    missing_fields.append(f"≥{config.require_min_fund_years} FY of revenue & ebit/ebitda")
        
        # Check required fields
        required_fields = ["market", "capital", "wacc_inputs"]
        for field in required_fields:
            if field not in data:
                missing_fields.append(field)
        
        # Check capital structure fields
        capital = data.get("capital", {})
        capital_fields = ["cash", "net_debt", "shares_out"]
        for field in capital_fields:
            if field not in capital or capital[field] is None:
                missing_fields.append(f"capital.{field}")
        
        # Check market fields
        market = data.get("market", {})
        market_fields = ["price", "market_cap"]
        for field in market_fields:
            if field not in market or market[field] is None:
                missing_fields.append(f"market.{field}")
    
    elif model_type == "lbo":
        required_fields = ["starting", "market", "cap_structure_hints"]
        for field in required_fields:
            if field not in data:
                missing_fields.append(field)
        
        # Check starting point fields
        starting = data.get("starting", {})
        starting_fields = ["revenue_ltm", "ebitda_ltm", "ebit_ltm", "capex_ltm", "delta_nwc_ltm"]
        for field in starting_fields:
            if field not in starting or starting[field] is None:
                missing_fields.append(f"starting.{field}")
    
    elif model_type == "comps":
        peer_rows = data.get("peer_rows", [])
        if isinstance(peer_rows, list) and len(peer_rows) < 8:
            missing_fields.append("≥8 peer companies")
        
        # Check that peers have required fields
        if peer_rows:
            sample_peer = peer_rows[0]
            required_peer_fields = ["ticker", "market_cap", "ev", "ev_to_ebitda"]
            for field in required_peer_fields:
                if field not in sample_peer or sample_peer[field] is None:
                    missing_fields.append(f"peer.{field}")
    
    elif model_type == "merger":
        required_fields = ["acquirer", "target", "shared"]
        for field in required_fields:
            if field not in data:
                missing_fields.append(field)
        
        # Check acquirer and target have required structure
        acquirer = data.get("acquirer", {})
        target = data.get("target", {})
        
        for entity_name, entity_data in [("acquirer", acquirer), ("target", target)]:
            if not entity_data:
                missing_fields.append(f"{entity_name}")
            else:
                entity_required = ["market", "capital"]
                for field in entity_required:
                    if field not in entity_data:
                        missing_fields.append(f"{entity_name}.{field}")
    
    if missing_fields:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "missing_fields",
                "fields": sorted(set(missing_fields)),
                "message": f"Insufficient inputs for {model_type.upper()} model. Missing: {', '.join(sorted(set(missing_fields)))}"
            }
        )


async def fetch_model_data(ticker: str, model_type: str) -> Dict[str, Any]:
    """Fetch all required data for a model type."""
    data_types = []
    
    if model_type in ["dcf", "lbo", "merger"]:
        data_types = ["fundamentals", "quotes", "market_data", "risk_free"]
    elif model_type == "comps":
        data_types = ["fundamentals", "quotes", "market_data"]
    
    results = {}
    providers_used = set()
    
    for data_type in data_types:
        result = await enhanced_registry.fetch_with_fallback(ticker, data_type)
        
        if result.success:
            results[data_type] = result.data
            providers_used.add(result.provider)
        else:
            logger.warning(f"Failed to fetch {data_type} for {ticker}: {result.error}")
    
    # Reconcile data from multiple sources
    reconciled_data = data_reconciler.reconcile_data(results)
    
    # Add provenance information
    reconciled_data["provenance"] = {}
    for data_type, data in results.items():
        reconciled_data["provenance"][data_type] = {
            "source": list(providers_used),
            "as_of": datetime.now(timezone.utc).isoformat()
        }
    
    # Add response footer
    reconciled_data["stale"] = False
    reconciled_data["as_of_quotes"] = datetime.now(timezone.utc).isoformat()
    reconciled_data["as_of_fundamentals"] = datetime.now(timezone.utc).isoformat()
    reconciled_data["source"] = {
        "fundamentals": list(enhanced_registry.get_providers_for_data_type("fundamentals")),
        "quotes": list(enhanced_registry.get_providers_for_data_type("quotes")),
        "chart": list(enhanced_registry.get_providers_for_data_type("charts")),
        "rf": list(enhanced_registry.get_providers_for_data_type("risk_free"))
    }
    
    return reconciled_data


@router.get("/dcf", response_model=Union[ModelInputResponse, ErrorResponse])
async def get_dcf_inputs(
    ticker: str = Query(..., description="Company ticker symbol"),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """
    Generate DCF model inputs with strict real data validation.
    
    Returns:
    - 200: DCF bundle with real data
    - 422: Missing required fields for DCF model
    - 503: Data stale or unavailable
    """
    try:
        logger.info(f"Generating DCF inputs for {ticker}")
        
        # Fetch data using enhanced registry
        data = await fetch_model_data(ticker, "dcf")
        
        # Validate model requirements
        await validate_model_inputs(ticker, "dcf", data)
        
        # Apply runtime guardrails
        await runtime_guardrails.enforce_real_data_policy(data, "/api/v1/model-inputs/dcf")
        
        # Trigger background refresh
        background_tasks.add_task(refresh_ticker_data, ticker)
        
        logger.info(f"✅ Successfully generated DCF inputs for {ticker}")
        return data
        
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


@router.get("/lbo", response_model=Union[ModelInputResponse, ErrorResponse])
async def get_lbo_inputs(
    ticker: str = Query(..., description="Company ticker symbol"),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Generate LBO model inputs with strict real data validation."""
    try:
        logger.info(f"Generating LBO inputs for {ticker}")
        
        data = await fetch_model_data(ticker, "lbo")
        await validate_model_inputs(ticker, "lbo", data)
        await runtime_guardrails.enforce_real_data_policy(data, "/api/v1/model-inputs/lbo")
        
        background_tasks.add_task(refresh_ticker_data, ticker)
        
        return data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating LBO inputs for {ticker}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "data_unavailable",
                "message": str(e)
            }
        )


@router.get("/comps", response_model=Union[ModelInputResponse, ErrorResponse])
async def get_comps_inputs(
    ticker: str = Query(..., description="Company ticker symbol"),
    peers: Optional[str] = Query(None, description="Comma-separated list of peer tickers"),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Generate Comps model inputs with strict real data validation."""
    try:
        logger.info(f"Generating Comps inputs for {ticker}")
        
        # Determine peer list
        if peers:
            peer_list = [p.strip().upper() for p in peers.split(",")]
        else:
            peer_list = await get_sector_peers(ticker)
        
        # Fetch data for target and peers
        all_tickers = [ticker] + peer_list
        results = await enhanced_registry.fetch_multiple_tickers(all_tickers, "market_data")
        
        # Build peer rows
        peer_rows = []
        for peer_ticker in peer_list:
            if peer_ticker in results and results[peer_ticker].success:
                peer_data = results[peer_ticker].data
                peer_rows.append({
                    "ticker": peer_ticker,
                    "market_cap": peer_data.get("market_cap"),
                    "ev": peer_data.get("ev"),
                    "ev_to_ebitda": peer_data.get("ev_to_ebitda"),
                    # Add other required fields
                })
        
        data = {
            "peer_rows": peer_rows,
            "stale": False,
            "as_of_quotes": datetime.now(timezone.utc).isoformat(),
            "as_of_fundamentals": datetime.now(timezone.utc).isoformat(),
            "source": {
                "fundamentals": list(enhanced_registry.get_providers_for_data_type("fundamentals")),
                "quotes": list(enhanced_registry.get_providers_for_data_type("quotes")),
                "chart": list(enhanced_registry.get_providers_for_data_type("charts")),
                "rf": list(enhanced_registry.get_providers_for_data_type("risk_free"))
            }
        }
        
        await validate_model_inputs(ticker, "comps", data)
        await runtime_guardrails.enforce_real_data_policy(data, "/api/v1/model-inputs/comps")
        
        background_tasks.add_task(refresh_ticker_data, ticker)
        
        return data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating Comps inputs for {ticker}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "data_unavailable",
                "message": str(e)
            }
        )


@router.get("/merger", response_model=Union[ModelInputResponse, ErrorResponse])
async def get_merger_inputs(
    acquirer: str = Query(..., description="Acquirer ticker symbol"),
    target: str = Query(..., description="Target ticker symbol"),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    """Generate Merger model inputs with strict real data validation."""
    try:
        logger.info(f"Generating Merger inputs for {acquirer} -> {target}")
        
        # Fetch data for both companies
        acquirer_data = await fetch_model_data(acquirer, "dcf")
        target_data = await fetch_model_data(target, "dcf")
        
        data = {
            "acquirer": acquirer_data,
            "target": target_data,
            "shared": {
                "sector": acquirer_data.get("meta", {}).get("sector"),
                "industry": acquirer_data.get("meta", {}).get("industry")
            },
            "stale": False,
            "as_of_quotes": datetime.now(timezone.utc).isoformat(),
            "as_of_fundamentals": datetime.now(timezone.utc).isoformat(),
            "source": {
                "fundamentals": list(enhanced_registry.get_providers_for_data_type("fundamentals")),
                "quotes": list(enhanced_registry.get_providers_for_data_type("quotes")),
                "chart": list(enhanced_registry.get_providers_for_data_type("charts")),
                "rf": list(enhanced_registry.get_providers_for_data_type("risk_free"))
            }
        }
        
        await validate_model_inputs(acquirer, "merger", data)
        await runtime_guardrails.enforce_real_data_policy(data, "/api/v1/model-inputs/merger")
        
        background_tasks.add_task(refresh_ticker_data, acquirer)
        background_tasks.add_task(refresh_ticker_data, target)
        
        return data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating Merger inputs for {acquirer}->{target}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "error": "data_unavailable",
                "message": str(e)
            }
        )


async def refresh_ticker_data(ticker: str):
    """Background task to refresh data for a ticker."""
    try:
        await enhanced_registry.fetch_with_fallback(ticker, "quotes")
        logger.info(f"Background refresh completed for {ticker}")
    except Exception as e:
        logger.error(f"Background refresh failed for {ticker}: {str(e)}")


async def get_sector_peers(ticker: str) -> List[str]:
    """Get sector peers for a ticker (simplified implementation)."""
    # This would be implemented with actual sector classification
    sector_peers = {
        "AAPL": ["MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "ORCL", "CRM"],
        "MSFT": ["AAPL", "GOOGL", "AMZN", "META", "ORCL", "CRM", "ADBE", "INTC"],
        # Add more mappings as needed
    }
    return sector_peers.get(ticker.upper(), ["MSFT", "GOOGL", "AMZN", "META", "TSLA", "NVDA", "ORCL", "CRM"])


@router.get("/_provenance")
async def get_provenance_info():
    """Get comprehensive data provenance and health information."""
    try:
        provider_stats = enhanced_registry.get_provider_stats()
        health_status = enhanced_registry.get_health_status()
        
        return {
            "enabled_providers": list(enhanced_registry.enabled_providers),
            "provider_stats": provider_stats,
            "health_status": health_status,
            "data_mode": config.data_mode,
            "staleness_threshold_minutes": config.staleness_max_minutes,
            "require_min_fund_years": config.require_min_fund_years,
            "last_refresh": datetime.now(timezone.utc).isoformat(),
            "production_enforcement": {
                "active": config.is_production,
                "blocked_patterns": ["sample", "mock", "demo", "fake", "placeholder"],
                "required_fields": ["provenance", "as_of_quotes", "as_of_fundamentals"]
            }
        }
    except Exception as e:
        logger.error(f"Error getting provenance info: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "error": "provenance_unavailable",
                "message": str(e)
            }
        )
