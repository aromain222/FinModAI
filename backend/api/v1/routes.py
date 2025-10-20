"""
API v1 Routes
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from backend.api.v1.models import (
    SnapshotResponse,
    SnapshotRow,
    LeadersResponse,
    AllSectorLeadersResponse,
    CompanyDetail,
    SortField,
    SortOrder,
)
from backend.config import config
from backend.data.loader import fundamentals_loader
from backend.data.sectors import GICS_SECTORS
from backend.market.cache import market_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1")


@router.get("/market/snapshot", response_model=SnapshotResponse)
async def get_market_snapshot(
    sector: Optional[str] = Query(
        None, description="Filter by sector (e.g., Technology)"
    ),
    industry: Optional[str] = Query(None, description="Filter by industry"),
    limit: int = Query(
        config.DEFAULT_SNAPSHOT_LIMIT, ge=1, le=config.MAX_SNAPSHOT_LIMIT
    ),
    offset: int = Query(0, ge=0),
    sort: SortField = Query(SortField.MARKET_CAP, description="Sort field"),
    order: SortOrder = Query(SortOrder.DESC, description="Sort order"),
):
    """
    Get market snapshot with pagination, filtering, and sorting

    Returns array of companies with current quotes + fundamentals
    """
    # Get all snapshots from cache
    all_snapshots = market_cache.get_all_snapshots()

    if not all_snapshots:
        raise HTTPException(
            status_code=503,
            detail="Market data not available yet. Try again in a moment.",
        )

    # Convert to list
    snapshots_list = list(all_snapshots.values())

    # Filter by sector
    if sector:
        snapshots_list = [s for s in snapshots_list if s.get("sector") == sector]

    # Filter by industry
    if industry:
        snapshots_list = [s for s in snapshots_list if s.get("industry") == industry]

    # Sort
    sort_field = sort.value
    reverse = order == SortOrder.DESC

    # Handle None values in sorting
    snapshots_list.sort(
        key=lambda x: x.get(sort_field)
        if x.get(sort_field) is not None
        else (float("-inf") if reverse else float("inf")),
        reverse=reverse,
    )

    # Pagination
    total = len(snapshots_list)
    snapshots_page = snapshots_list[offset : offset + limit]

    # Convert to Pydantic models
    rows = [SnapshotRow(**s) for s in snapshots_page]

    return SnapshotResponse(data=rows, total=total, limit=limit, offset=offset)


@router.get("/market/leaders")
async def get_sector_leaders(
    sector: Optional[str] = Query(None, description="Sector name (e.g., Technology)"),
    limit: int = Query(config.DEFAULT_LEADERS_LIMIT, ge=1, le=config.MAX_LEADERS_LIMIT),
):
    """
    Get top N companies by market cap for a sector

    If sector is not specified, returns top 3 for each sector
    """
    if sector:
        # Single sector leaders
        leaders = market_cache.get_leaders(sector)

        if leaders is None:
            raise HTTPException(
                status_code=404, detail=f"No leaders found for sector: {sector}"
            )

        # Limit to requested amount
        leaders = leaders[:limit]

        return LeadersResponse(
            sector=sector, leaders=[SnapshotRow(**leader) for leader in leaders], limit=limit
        )

    else:
        # All sectors leaders
        all_leaders = []

        for sec in GICS_SECTORS:
            leaders = market_cache.get_leaders(sec)
            if leaders:
                all_leaders.append(
                    LeadersResponse(
                        sector=sec,
                        leaders=[SnapshotRow(**leader) for leader in leaders[:limit]],
                        limit=limit,
                    )
                )

        return AllSectorLeadersResponse(sectors=all_leaders)


@router.get("/company/{ticker}", response_model=CompanyDetail)
async def get_company_detail(ticker: str):
    """
    Get detailed company data for model prefill

    Returns current quote + latest fundamentals + sparkline
    """
    ticker = ticker.upper()

    # Get snapshot from cache
    snapshot = market_cache.get_snapshot(ticker)

    if not snapshot:
        raise HTTPException(status_code=404, detail=f"Company not found: {ticker}")

    # Get fundamentals
    fundamentals = fundamentals_loader.get_latest(ticker)

    # Get sparkline
    sparkline = market_cache.get_sparkline(ticker)

    # Build detailed response
    detail = {
        # Identity
        "ticker": ticker,
        "name": snapshot.get("name"),
        "sector": snapshot.get("sector"),
        # Quote
        "price": snapshot.get("price"),
        "market_cap": snapshot.get("market_cap"),
        "beta": snapshot.get("beta"),
        "pe": snapshot.get("pe"),
        # Derived
        "ev": snapshot.get("ev"),
        "ev_to_ebitda": snapshot.get("ev_to_ebitda"),
        "ev_to_revenue": snapshot.get("ev_to_revenue"),
        # Sparkline
        "sparkline": sparkline,
        # Timestamps
        "as_of_quotes": snapshot.get("as_of_quotes"),
        "as_of_fundamentals": snapshot.get("as_of_fundamentals"),
    }

    # Add fundamentals if available
    if fundamentals:
        detail.update(
            {
                "fiscal_year": fundamentals.get("fiscal_year"),
                "revenue": fundamentals.get("revenue"),
                "ebit": fundamentals.get("ebit"),
                "ebitda": fundamentals.get("ebitda"),
                "net_income": fundamentals.get("net_income"),
                "d_and_a": fundamentals.get("d_and_a"),
                "capex": fundamentals.get("capex"),
                "net_debt": fundamentals.get("net_debt"),
                "gross_debt": fundamentals.get("gross_debt"),
                "cash": fundamentals.get("cash"),
                "shares_outstanding": fundamentals.get("shares_outstanding"),
                "nwc": fundamentals.get("nwc"),
                "delta_nwc": fundamentals.get("delta_nwc"),
                "effective_tax_rate": fundamentals.get("effective_tax_rate"),
            }
        )

    return CompanyDetail(**detail)
