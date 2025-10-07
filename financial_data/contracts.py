"""
Data contracts for financial data layer.
No generic defaults - fail fast if data insufficient.
"""

from dataclasses import dataclass, asdict
from typing import List, Optional, Dict, Any
from datetime import datetime
import os


@dataclass
class Provenance:
    """Track data source and timestamp for each metric."""
    source: str
    as_of: str  # YYYY-MM-DD
    
    def to_dict(self) -> Dict[str, str]:
        return {"source": self.source, "as_of": self.as_of}


@dataclass
class Historicals:
    """Historical financial data (≥3 years required)."""
    years: List[int]
    revenue: List[float]
    operating_income: List[float]
    op_margin: List[float]  # EBIT/Rev each year
    da: List[float]  # Depreciation & Amortization
    capex: List[float]
    delta_nwc: List[float]  # Change in Net Working Capital
    # Additional fields for better historical analysis
    tax_expense: List[Optional[float]]  # Tax provision/expense
    pretax_income: List[Optional[float]]  # Income before taxes
    interest_expense: List[Optional[float]]  # Interest expense
    total_debt: List[Optional[float]]  # Total debt
    shares_outstanding: List[Optional[float]]  # Shares outstanding
    
    def validate(self) -> tuple[bool, Optional[str]]:
        """Ensure we have ≥3 years of complete data."""
        if len(self.years) < 3:
            return False, f"Need ≥3 years, got {len(self.years)}"
        
        # Required fields (must match years length)
        required_fields = [
            self.revenue,
            self.operating_income,
            self.op_margin,
            self.da,
            self.capex,
            self.delta_nwc
        ]
        
        # Optional fields (can be None or match years length)
        optional_fields = [
            self.tax_expense,
            self.pretax_income,
            self.interest_expense,
            self.total_debt,
            self.shares_outstanding
        ]
        
        # Check required fields have correct length
        for field in required_fields:
            if len(field) != len(self.years):
                return False, f"Mismatched data length for required field"
        
        # Check optional fields (if not None, must match length)
        for field in optional_fields:
            if field is not None and len(field) != len(self.years):
                return False, f"Mismatched data length for optional field"
        
        # Check for critical nulls in required fields
        if any(r is None or r == 0 for r in self.revenue[:3]):
            return False, "Missing revenue in first 3 years"
        
        if any(oi is None for oi in self.operating_income[:3]):
            return False, "Missing operating income in first 3 years"
        
        return True, None
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Assumptions:
    """Company-specific forward assumptions (no generic defaults)."""
    forecast_years: int
    revenue_growth: List[float]  # Y1..Yn
    operating_margin: List[float]  # path
    da_pct_rev: float
    capex_pct_rev: float
    nwc_pct_rev: float
    tax_rate: float  # effective tax 3y avg, bounded 10-30%
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class WACC:
    """WACC components (no defaults, computed from real data)."""
    rf: float  # Risk-free rate
    erp: float  # Equity risk premium
    beta: float
    ke: float  # Cost of equity
    kd_pre: float  # Cost of debt (pre-tax)
    tax: float
    wd: float  # Weight of debt
    we: float  # Weight of equity
    kd_after: float  # Cost of debt (after-tax)
    wacc: float
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class Terminal:
    """Terminal value assumptions."""
    method: str  # "perpetuity" or "exit_multiple"
    g: float  # Growth rate for perpetuity
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class FinancialData:
    """Complete financial data response with provenance."""
    ticker: str
    company_name: str
    currency: str
    provenance: Dict[str, Provenance]
    historicals: Historicals
    assumptions: Assumptions
    wacc: WACC
    terminal: Terminal
    flags: List[str]  # Sanity warnings
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "ticker": self.ticker,
            "company_name": self.company_name,
            "currency": self.currency,
            "provenance": {k: v.to_dict() for k, v in self.provenance.items()},
            "historicals": self.historicals.to_dict(),
            "assumptions": self.assumptions.to_dict(),
            "wacc": self.wacc.to_dict(),
            "terminal": self.terminal.to_dict(),
            "flags": self.flags
        }


@dataclass
class InsufficientDataError:
    """Error response when data is insufficient."""
    error: str
    missing: List[str]
    provider_attempts: List[str]
    message: str
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


# Configuration constants
class Config:
    """Financial modeling configuration."""
    
    # API Keys (set via environment variables)
    FMP_API_KEY=REDACTED
    ALPHA_VANTAGE_API_KEY = os.getenv("ALPHAVANTAGE_API_KEY")
    FRED_API_KEY = os.getenv("FRED_API_KEY")
    POLYGON_API_KEY=REDACTED
    
    # Equity Risk Premium
    ERP = 0.055  # 5.5%
    
    # Forecast horizon
    DEFAULT_FORECAST_YEARS = 10
    FADE_YEARS = 5  # Years over which to fade growth to terminal
    
    # Bounds
    GROWTH_MIN = 0.0
    GROWTH_MAX = 0.30
    TERMINAL_GROWTH_MIN = 0.02
    TERMINAL_GROWTH_MAX = 0.04
    
    MARGIN_MIN = -0.05
    MARGIN_MAX = 0.50
    
    TAX_MIN = 0.10
    TAX_MAX = 0.30
    
    BETA_MIN = 0.5
    BETA_MAX = 2.0
    
    WACC_MIN = 0.06
    WACC_MAX = 0.14
    
    DEBT_WEIGHT_MAX = 0.70
    
    # Sanity check thresholds
    TV_DOMINANCE_THRESHOLD = 0.85  # Terminal value > 85% of EV
    MARGIN_OUTLIER_THRESHOLD = 0.10  # ±10pp from industry
    GROWTH_CONSENSUS_THRESHOLD = 0.05  # ±5pp from analyst estimates
    
    # Cache TTL
    CACHE_TTL_HOURS = 12

