"""
LBO Model Input Validator and Data Quality Framework
Ensures accurate, validated data and realistic assumptions for LBO models
"""

from dataclasses import dataclass
from typing import Dict, Any, Optional, List, Tuple
import pandas as pd
import numpy as np
from datetime import datetime
import logging
import json

logger = logging.getLogger(__name__)

@dataclass
class CompanyMetrics:
    """Core company financial metrics with validation"""
    ticker: str
    revenue_ltm: float
    ebitda_ltm: float
    total_debt: float
    cash: float
    market_cap: float
    current_price: float
    shares_outstanding: float
    
    # Historical metrics for trend validation
    revenue_growth_3yr: Optional[float] = None
    ebitda_margin_3yr_avg: Optional[float] = None
    
    # Industry metrics for peer comparison
    industry_revenue_growth: Optional[float] = None
    industry_ebitda_margin: Optional[float] = None
    industry_ev_ebitda: Optional[float] = None
    
    def __post_init__(self):
        """Validate metrics after initialization"""
        self._validate_basic_metrics()
        self._validate_derived_metrics()
        
    def _validate_basic_metrics(self):
        """Ensure basic metrics are valid"""
        if self.revenue_ltm <= 0:
            raise ValueError(f"Invalid revenue: {self.revenue_ltm}")
        if self.ebitda_ltm <= 0:
            raise ValueError(f"Invalid EBITDA: {self.ebitda_ltm}")
        if self.total_debt < 0:
            raise ValueError(f"Invalid total debt: {self.total_debt}")
        if self.cash < 0:
            raise ValueError(f"Invalid cash: {self.cash}")
        if self.market_cap <= 0:
            raise ValueError(f"Invalid market cap: {self.market_cap}")
        if self.current_price <= 0:
            raise ValueError(f"Invalid stock price: {self.current_price}")
        if self.shares_outstanding <= 0:
            raise ValueError(f"Invalid shares outstanding: {self.shares_outstanding}")
            
    def _validate_derived_metrics(self):
        """Validate derived metrics for consistency"""
        # Check market cap vs price * shares
        calc_market_cap = self.current_price * self.shares_outstanding
        if not np.isclose(self.market_cap, calc_market_cap, rtol=0.05):
            raise ValueError(f"Market cap inconsistent: {self.market_cap} vs calc {calc_market_cap}")
            
        # Check EBITDA margin is realistic
        ebitda_margin = self.ebitda_ltm / self.revenue_ltm
        if not (0 < ebitda_margin < 0.5):  # Most businesses are between 0-50% margin
            raise ValueError(f"Unusual EBITDA margin: {ebitda_margin:.1%}")

@dataclass
class MarketConditions:
    """Current market conditions affecting LBO assumptions"""
    risk_free_rate: float
    market_risk_premium: float
    high_yield_spread: float
    leverage_loan_spread: float
    typical_leverage: float
    typical_equity_portion: float
    
    def __post_init__(self):
        """Validate market conditions"""
        if not (0 < self.risk_free_rate < 0.15):
            raise ValueError(f"Unusual risk-free rate: {self.risk_free_rate}")
        if not (0.04 < self.market_risk_premium < 0.12):
            raise ValueError(f"Unusual market risk premium: {self.market_risk_premium}")
        if not (0.02 < self.high_yield_spread < 0.15):
            raise ValueError(f"Unusual high yield spread: {self.high_yield_spread}")
        if not (0.02 < self.leverage_loan_spread < 0.10):
            raise ValueError(f"Unusual leverage loan spread: {self.leverage_loan_spread}")
        if not (3 < self.typical_leverage < 7):
            raise ValueError(f"Unusual typical leverage: {self.typical_leverage}")
        if not (0.3 < self.typical_equity_portion < 0.7):
            raise ValueError(f"Unusual equity portion: {self.typical_equity_portion}")

class LBOAssumptionValidator:
    """Validates and suggests realistic LBO assumptions"""
    
    def __init__(self, company: CompanyMetrics, market: MarketConditions):
        self.company = company
        self.market = market
        
    def validate_purchase_multiple(self, multiple: float) -> Tuple[bool, str]:
        """Validate purchase multiple against market data"""
        current_multiple = (self.company.market_cap + self.company.total_debt - self.company.cash) / self.company.ebitda_ltm
        
        # Check if multiple is realistic
        if multiple > current_multiple * 1.2:
            return False, f"Purchase multiple ({multiple:.1f}x) too high vs current ({current_multiple:.1f}x)"
        if multiple < current_multiple * 0.6:
            return False, f"Purchase multiple ({multiple:.1f}x) too low vs current ({current_multiple:.1f}x)"
            
        # Compare to industry
        if self.company.industry_ev_ebitda:
            if multiple > self.company.industry_ev_ebitda * 1.3:
                return False, f"Multiple ({multiple:.1f}x) too high vs industry ({self.company.industry_ev_ebitda:.1f}x)"
                
        return True, "Purchase multiple within reasonable range"
        
    def validate_growth_assumptions(self, growth_rate: float) -> Tuple[bool, str]:
        """Validate revenue growth assumptions"""
        # Check against historical growth
        if self.company.revenue_growth_3yr:
            if growth_rate > self.company.revenue_growth_3yr * 1.5:
                return False, f"Growth ({growth_rate:.1%}) too high vs historical ({self.company.revenue_growth_3yr:.1%})"
                
        # Check against industry
        if self.company.industry_revenue_growth:
            if growth_rate > self.company.industry_revenue_growth * 1.5:
                return False, f"Growth ({growth_rate:.1%}) too high vs industry ({self.company.industry_revenue_growth:.1%})"
                
        # General reasonableness check
        if growth_rate > 0.15:  # Very few businesses grow >15% consistently
            return False, f"Growth rate ({growth_rate:.1%}) appears unrealistic"
            
        return True, "Growth assumptions within reasonable range"
        
    def validate_margin_assumptions(self, target_margin: float) -> Tuple[bool, str]:
        """Validate EBITDA margin assumptions"""
        current_margin = self.company.ebitda_ltm / self.company.revenue_ltm
        
        # Check improvement magnitude
        if target_margin > current_margin * 1.75:
            return False, f"Target margin ({target_margin:.1%}) too high vs current ({current_margin:.1%})"
            
        # Check against industry
        if self.company.industry_ebitda_margin:
            if target_margin > self.company.industry_ebitda_margin * 1.3:
                return False, f"Margin ({target_margin:.1%}) too high vs industry ({self.company.industry_ebitda_margin:.1%})"
                
        return True, "Margin assumptions within reasonable range"
        
    def validate_leverage_assumptions(self, initial_leverage: float) -> Tuple[bool, str]:
        """Validate leverage assumptions"""
        if initial_leverage > self.market.typical_leverage * 1.2:
            return False, f"Initial leverage ({initial_leverage:.1f}x) too high vs market ({self.market.typical_leverage:.1f}x)"
            
        # Check debt service capacity
        interest_rate = self.market.risk_free_rate + self.market.leverage_loan_spread
        interest_coverage = self.company.ebitda_ltm / (initial_leverage * self.company.ebitda_ltm * interest_rate)
        if interest_coverage < 1.5:
            return False, f"Interest coverage ({interest_coverage:.1f}x) too low"
            
        return True, "Leverage assumptions within reasonable range"
        
    def suggest_realistic_assumptions(self) -> Dict[str, Any]:
        """Suggest realistic LBO assumptions based on company and market data"""
        current_multiple = (self.company.market_cap + self.company.total_debt - self.company.cash) / self.company.ebitda_ltm
        
        suggestions = {
            "purchase_multiple": min(current_multiple * 0.9, self.company.industry_ev_ebitda or current_multiple * 0.85),
            "exit_multiple": min(current_multiple * 0.85, self.company.industry_ev_ebitda or current_multiple * 0.8),
            "revenue_growth": min(
                self.company.revenue_growth_3yr or 0.06,
                self.company.industry_revenue_growth or 0.05
            ),
            "target_margin": min(
                self.company.ebitda_margin_3yr_avg * 1.2 if self.company.ebitda_margin_3yr_avg else 0.12,
                self.company.industry_ebitda_margin * 1.1 if self.company.industry_ebitda_margin else 0.11
            ),
            "initial_leverage": min(6.0, self.market.typical_leverage * 1.1),
            "equity_portion": max(0.4, self.market.typical_equity_portion),
            "debt_assumptions": {
                "term_loan_spread": self.market.leverage_loan_spread,
                "revolver_spread": self.market.leverage_loan_spread - 0.005,
                "base_rate": self.market.risk_free_rate
            }
        }
        
        return suggestions

def validate_lbo_model(
    company: CompanyMetrics,
    market: MarketConditions,
    assumptions: Dict[str, Any]
) -> Tuple[bool, List[str], Dict[str, Any]]:
    """
    Validate entire LBO model assumptions and suggest improvements
    
    Returns:
    - bool: Whether the model is valid
    - List[str]: List of validation messages/warnings
    - Dict: Suggested improvements
    """
    validator = LBOAssumptionValidator(company, market)
    messages = []
    is_valid = True
    
    # Validate each major assumption
    purchase_valid, purchase_msg = validator.validate_purchase_multiple(assumptions["purchase_multiple"])
    if not purchase_valid:
        is_valid = False
        messages.append(purchase_msg)
        
    growth_valid, growth_msg = validator.validate_growth_assumptions(assumptions["revenue_growth"])
    if not growth_valid:
        is_valid = False
        messages.append(growth_msg)
        
    margin_valid, margin_msg = validator.validate_margin_assumptions(assumptions["ebitda_margin"])
    if not margin_valid:
        is_valid = False
        messages.append(margin_msg)
        
    leverage_valid, leverage_msg = validator.validate_leverage_assumptions(
        assumptions.get("initial_leverage", 
                       assumptions.get("total_debt", 0) / company.ebitda_ltm)
    )
    if not leverage_valid:
        is_valid = False
        messages.append(leverage_msg)
        
    # Get suggestions if model isn't valid
    suggestions = validator.suggest_realistic_assumptions() if not is_valid else {}
    
    return is_valid, messages, suggestions

def load_market_conditions() -> MarketConditions:
    """Load current market conditions from financial APIs"""
    # TODO: Implement real API calls
    return MarketConditions(
        risk_free_rate=0.0525,  # 5.25% treasury
        market_risk_premium=0.06,  # 6% equity premium
        high_yield_spread=0.05,  # 500bps spread
        leverage_loan_spread=0.0425,  # 425bps spread
        typical_leverage=4.5,  # 4.5x EBITDA
        typical_equity_portion=0.45  # 45% equity
    )

def save_model_audit(
    company: CompanyMetrics,
    assumptions: Dict[str, Any],
    validation_results: Tuple[bool, List[str], Dict[str, Any]]
) -> None:
    """Save model assumptions and validation for audit purposes"""
    audit_data = {
        "timestamp": datetime.now().isoformat(),
        "company": {
            "ticker": company.ticker,
            "revenue": company.revenue_ltm,
            "ebitda": company.ebitda_ltm,
            "market_cap": company.market_cap
        },
        "assumptions": assumptions,
        "validation": {
            "is_valid": validation_results[0],
            "messages": validation_results[1],
            "suggestions": validation_results[2]
        }
    }
    
    # Save to audit log
    with open(f"model_audits/{company.ticker}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json", "w") as f:
        json.dump(audit_data, f, indent=2)
