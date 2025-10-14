"""
Pydantic models for API v1
"""
from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class SortField(str, Enum):
    """Valid sort fields for snapshot endpoint"""
    MARKET_CAP = "market_cap"
    EV = "ev"
    PE = "pe"
    EV_TO_EBITDA = "ev_to_ebitda"
    EV_TO_REVENUE = "ev_to_revenue"
    PRICE = "price"
    CHANGE_PCT = "change1d_pct"


class SortOrder(str, Enum):
    """Sort order"""
    ASC = "asc"
    DESC = "desc"


class SnapshotRow(BaseModel):
    """Single market snapshot row"""
    ticker: str
    name: Optional[str] = None
    sector: Optional[str] = None
    industry: Optional[str] = None
    price: Optional[float] = None
    change1d_pct: Optional[float] = None
    market_cap: Optional[float] = None
    ev: Optional[float] = None
    ev_to_ebitda: Optional[float] = None
    ev_to_revenue: Optional[float] = None
    pe: Optional[float] = None
    beta: Optional[float] = None
    currency: Optional[str] = "USD"
    as_of_quotes: Optional[datetime] = None
    as_of_fundamentals: Optional[datetime] = None
    stale: bool = False
    
    class Config:
        json_schema_extra = {
            "example": {
                "ticker": "AAPL",
                "name": "Apple Inc.",
                "sector": "Technology",
                "price": 178.72,
                "change1d_pct": 1.23,
                "market_cap": 2800000000000,
                "ev": 2850000000000,
                "ev_to_ebitda": 22.1,
                "ev_to_revenue": 7.3,
                "pe": 29.5,
                "beta": 1.25,
                "currency": "USD",
                "stale": False
            }
        }


class SnapshotResponse(BaseModel):
    """Response for market snapshot endpoint"""
    data: List[SnapshotRow]
    total: int
    limit: int
    offset: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "data": [{"ticker": "AAPL", "name": "Apple Inc."}],
                "total": 500,
                "limit": 100,
                "offset": 0
            }
        }


class LeadersResponse(BaseModel):
    """Response for sector leaders endpoint"""
    sector: str
    leaders: List[SnapshotRow]
    limit: int
    
    class Config:
        json_schema_extra = {
            "example": {
                "sector": "Technology",
                "leaders": [{"ticker": "AAPL", "name": "Apple Inc."}],
                "limit": 3
            }
        }


class AllSectorLeadersResponse(BaseModel):
    """Response for all-sectors leaders endpoint"""
    sectors: List[LeadersResponse]
    
    class Config:
        json_schema_extra = {
            "example": {
                "sectors": [
                    {
                        "sector": "Technology",
                        "leaders": [{"ticker": "AAPL"}],
                        "limit": 3
                    }
                ]
            }
        }


class CompanyDetail(BaseModel):
    """Detailed company data for model prefill"""
    ticker: str
    name: Optional[str] = None
    sector: Optional[str] = None
    
    # Current quote
    price: Optional[float] = None
    market_cap: Optional[float] = None
    beta: Optional[float] = None
    pe: Optional[float] = None
    
    # Latest fundamentals (in millions)
    fiscal_year: Optional[int] = None
    revenue: Optional[float] = None
    ebit: Optional[float] = None
    ebitda: Optional[float] = None
    net_income: Optional[float] = None
    d_and_a: Optional[float] = None
    capex: Optional[float] = None
    net_debt: Optional[float] = None
    gross_debt: Optional[float] = None
    cash: Optional[float] = None
    shares_outstanding: Optional[float] = None
    nwc: Optional[float] = None
    delta_nwc: Optional[float] = None
    effective_tax_rate: Optional[float] = None
    
    # Derived
    ev: Optional[float] = None
    ev_to_ebitda: Optional[float] = None
    ev_to_revenue: Optional[float] = None
    
    # Optional sparkline
    sparkline: Optional[List[float]] = None
    
    # Timestamps
    as_of_quotes: Optional[datetime] = None
    as_of_fundamentals: Optional[datetime] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "ticker": "AAPL",
                "name": "Apple Inc.",
                "sector": "Technology",
                "price": 178.72,
                "market_cap": 2800000000000,
                "revenue": 394328.0,
                "ebitda": 129956.0
            }
        }


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    timestamp: datetime
    cache_stats: Optional[dict] = None
    last_refresh: Optional[datetime] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "status": "ok",
                "timestamp": "2025-10-14T12:00:00Z",
                "cache_stats": {"snapshot_count": 500}
            }
        }


class RefreshResponse(BaseModel):
    """Refresh trigger response"""
    success: bool
    message: str
    stats: Optional[dict] = None
    
    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "message": "Refresh completed",
                "stats": {"snapshots_merged": 500, "duration_sec": 45.2}
            }
        }

