"""
Model Input Bundles
Pydantic models for model inputs with validation
"""

from pydantic import BaseModel, Field, field_validator
from typing import Optional, List, Dict, Any
from datetime import datetime
from decimal import Decimal
from enum import Enum


class ModelType(str, Enum):
    """Model type enum"""

    DCF = "dcf"
    LBO = "lbo"
    COMPS = "comps"
    MERGER = "merger"


class Provenance(BaseModel):
    """Data provenance tracking"""

    provider: str
    timestamp: datetime
    confidence: Optional[float] = None


class HistoricalFinancial(BaseModel):
    """Historical financial data point"""

    year: int
    revenue: Optional[Decimal] = None
    ebit: Optional[Decimal] = None
    ebitda: Optional[Decimal] = None
    net_income: Optional[Decimal] = None
    free_cash_flow: Optional[Decimal] = None
    capex: Optional[Decimal] = None
    delta_nwc: Optional[Decimal] = None


class MarketData(BaseModel):
    """Market data"""

    price: Decimal
    market_cap: Decimal
    shares_outstanding: Decimal
    beta: Optional[Decimal] = None
    volume: Optional[int] = None


class CapitalStructure(BaseModel):
    """Capital structure"""

    cash: Decimal
    gross_debt: Decimal
    net_debt: Decimal
    equity: Optional[Decimal] = None


class DCFFields(BaseModel):
    """DCF model input fields"""

    # Historicals
    historicals: List[HistoricalFinancial]

    # Market data
    market: MarketData

    # Capital structure
    capital: CapitalStructure

    # Current financials
    current_revenue: Decimal
    current_ebit: Decimal
    current_ebitda: Decimal
    current_fcf: Decimal

    # Provenance
    provenance: Dict[str, Provenance]

    # Timestamps
    as_of_quotes: datetime
    as_of_fundamentals: datetime

    # Validation
    stale: bool = False

    @field_validator("historicals")
    @classmethod
    def validate_historicals(
        cls, v: List[HistoricalFinancial]
    ) -> List[HistoricalFinancial]:
        """Ensure at least 3 years of historical data"""
        if len(v) < 3:
            raise ValueError(
                "DCF requires at least 3 years of historical financial data"
            )
        return v


class LBOFields(BaseModel):
    """LBO model input fields"""

    # Historicals
    historicals: List[HistoricalFinancial]

    # Market data
    market: MarketData

    # Capital structure
    capital: CapitalStructure

    # Current financials
    current_revenue: Decimal
    current_ebitda: Decimal
    current_fcf: Decimal

    # Provenance
    provenance: Dict[str, Provenance]

    # Timestamps
    as_of_quotes: datetime
    as_of_fundamentals: datetime

    # Validation
    stale: bool = False


class CompsFields(BaseModel):
    """Comps model input fields"""

    # Target company
    ticker: str
    market: MarketData
    current_revenue: Decimal
    current_ebitda: Decimal
    current_ebit: Decimal

    # Peer companies
    peers: List[Dict[str, Any]]

    # Provenance
    provenance: Dict[str, Provenance]

    # Timestamps
    as_of_quotes: datetime
    as_of_fundamentals: datetime

    # Validation
    stale: bool = False


class MergerFields(BaseModel):
    """Merger model input fields"""

    # Acquirer
    acquirer_ticker: str
    acquirer_market: MarketData
    acquirer_revenue: Decimal
    acquirer_ebitda: Decimal
    acquirer_shares: Decimal

    # Target
    target_ticker: str
    target_market: MarketData
    target_revenue: Decimal
    target_ebitda: Decimal
    target_shares: Decimal

    # Provenance
    provenance: Dict[str, Provenance]

    # Timestamps
    as_of_quotes: datetime
    as_of_fundamentals: datetime

    # Validation
    stale: bool = False


class ModelBundle(BaseModel):
    """Complete model input bundle"""

    model_type: ModelType
    ticker: str
    target_ticker: Optional[str] = None

    # Model-specific fields
    dcf_fields: Optional[DCFFields] = None
    lbo_fields: Optional[LBOFields] = None
    comps_fields: Optional[CompsFields] = None
    merger_fields: Optional[MergerFields] = None

    # Custom assumptions
    custom_assumptions: Optional[Dict[str, Any]] = None

    # Metadata
    created_at: datetime = Field(default_factory=datetime.utcnow)

    def get_fields(self) -> Any:
        """Get model-specific fields"""
        if self.model_type == ModelType.DCF:
            return self.dcf_fields
        elif self.model_type == ModelType.LBO:
            return self.lbo_fields
        elif self.model_type == ModelType.COMPS:
            return self.comps_fields
        elif self.model_type == ModelType.MERGER:
            return self.merger_fields
        else:
            raise ValueError(f"Unknown model type: {self.model_type}")

    def is_stale(self) -> bool:
        """Check if data is stale"""
        fields = self.get_fields()
        if fields:
            return fields.stale
        return False

    def get_provenance(self) -> Dict[str, Provenance]:
        """Get data provenance"""
        fields = self.get_fields()
        if fields:
            return fields.provenance
        return {}
