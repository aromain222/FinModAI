"""
LBO Model Contracts - Data structures for institutional-grade LBO modeling.
"""

from dataclasses import dataclass, field, asdict
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from enum import Enum


class DebtTrancheType(Enum):
    """Types of debt tranches in LBO structure."""
    REVOLVER = "revolver"
    TERM_LOAN_A = "term_loan_a"
    TERM_LOAN_B = "term_loan_b"
    MEZZANINE = "mezzanine"
    PIK_NOTE = "pik_note"
    SUBORDINATED = "subordinated"


class ScenarioType(Enum):
    """Scenario types for sensitivity analysis."""
    BASE = "base"
    UPSIDE = "upside"
    DOWNSIDE = "downside"
    STRESS = "stress"


@dataclass
class DebtTranche:
    """Individual debt tranche with terms and schedule."""
    name: str
    tranche_type: DebtTrancheType
    initial_amount: float
    interest_rate: float  # Annual rate
    amortization_schedule: List[float]  # Principal payments by year
    interest_only_periods: int = 0  # Years of IO
    bullet_payment_year: Optional[int] = None
    is_pik: bool = False  # Payment-in-kind interest
    covenants: Dict[str, float] = field(default_factory=dict)
    
    # Dynamic fields (calculated)
    outstanding_balance: List[float] = field(default_factory=list)
    interest_expense: List[float] = field(default_factory=list)
    principal_payments: List[float] = field(default_factory=list)
    cash_sweep_payments: List[float] = field(default_factory=list)


@dataclass
class LBOAssumptions:
    """Core LBO assumptions and drivers."""
    # Entry assumptions
    entry_year: int
    entry_ebitda: float
    entry_multiple: float
    existing_debt: float
    existing_cash: float
    
    # Exit assumptions
    exit_year: int
    exit_multiple: float
    holding_period: int
    
    # Leverage structure
    senior_debt_multiple: float
    mezzanine_debt_multiple: float
    sponsor_equity_multiple: float
    
    # Interest rates
    senior_debt_rate: float
    mezzanine_debt_rate: float
    revolver_rate: float
    
    # Transaction costs
    advisory_fees: float
    financing_fees: float
    other_fees: float
    
    # Operating assumptions
    revenue_growth: List[float]
    ebitda_margin: List[float]
    capex_pct_revenue: float
    nwc_pct_revenue: float
    tax_rate: float
    depreciation_rate: float
    
    # Management & rollover
    management_rollover_pct: float
    management_incentive_pct: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "entry_year": self.entry_year,
            "entry_ebitda": self.entry_ebitda,
            "entry_multiple": self.entry_multiple,
            "existing_debt": self.existing_debt,
            "existing_cash": self.existing_cash,
            "exit_year": self.exit_year,
            "exit_multiple": self.exit_multiple,
            "holding_period": self.holding_period,
            "senior_debt_multiple": self.senior_debt_multiple,
            "mezzanine_debt_multiple": self.mezzanine_debt_multiple,
            "sponsor_equity_multiple": self.sponsor_equity_multiple,
            "senior_debt_rate": self.senior_debt_rate,
            "mezzanine_debt_rate": self.mezzanine_debt_rate,
            "revolver_rate": self.revolver_rate,
            "advisory_fees": self.advisory_fees,
            "financing_fees": self.financing_fees,
            "other_fees": self.other_fees,
            "revenue_growth": self.revenue_growth,
            "ebitda_margin": self.ebitda_margin,
            "capex_pct_revenue": self.capex_pct_revenue,
            "nwc_pct_revenue": self.nwc_pct_revenue,
            "tax_rate": self.tax_rate,
            "depreciation_rate": self.depreciation_rate,
            "management_rollover_pct": self.management_rollover_pct,
            "management_incentive_pct": self.management_incentive_pct
        }


@dataclass
class SourcesUses:
    """Sources and Uses of Funds calculation."""
    # Sources
    senior_debt: float
    mezzanine_debt: float
    revolver: float
    sponsor_equity: float
    management_rollover: float
    
    # Uses
    equity_purchase_price: float
    debt_repayment: float
    transaction_fees: float
    cash_to_balance_sheet: float
    
    # Validation
    sources_total: float
    uses_total: float
    balance_check: float  # Should be 0
    
    def validate(self) -> Tuple[bool, str]:
        """Validate that sources = uses."""
        if abs(self.balance_check) > 0.01:  # Allow small rounding differences
            return False, f"Sources ({self.sources_total:.2f}) ≠ Uses ({self.uses_total:.2f})"
        return True, "Sources = Uses ✓"
    
    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class PurchasePriceAllocation:
    """Purchase Price Allocation and adjusted balance sheet."""
    # Purchase price components
    enterprise_value: float
    equity_purchase_price: float
    net_debt_adjustment: float
    
    # Balance sheet adjustments
    goodwill: float
    intangible_assets: float
    deferred_tax_liability: float
    
    # Adjusted balance sheet
    adjusted_cash: float
    adjusted_debt: float
    adjusted_equity: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "enterprise_value": self.enterprise_value,
            "equity_purchase_price": self.equity_purchase_price,
            "net_debt_adjustment": self.net_debt_adjustment,
            "goodwill": self.goodwill,
            "intangible_assets": self.intangible_assets,
            "deferred_tax_liability": self.deferred_tax_liability,
            "adjusted_cash": self.adjusted_cash,
            "adjusted_debt": self.adjusted_debt,
            "adjusted_equity": self.adjusted_equity
        }


@dataclass
class ProFormaFinancials:
    """Pro forma financial statements for holding period."""
    years: List[int]
    
    # Income Statement
    revenue: List[float]
    ebitda: List[float]
    ebit: List[float]
    interest_expense: List[float]
    pretax_income: List[float]
    tax_expense: List[float]
    net_income: List[float]
    
    # Balance Sheet
    cash: List[float]
    working_capital: List[float]
    ppe: List[float]
    goodwill: List[float]
    total_assets: List[float]
    
    total_debt: List[float]
    equity: List[float]
    total_liabilities_equity: List[float]
    
    # Cash Flow Statement
    operating_cash_flow: List[float]
    capex: List[float]
    free_cash_flow: List[float]
    debt_repayments: List[float]
    net_change_in_cash: List[float]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "years": self.years,
            "revenue": self.revenue,
            "ebitda": self.ebitda,
            "ebit": self.ebit,
            "interest_expense": self.interest_expense,
            "pretax_income": self.pretax_income,
            "tax_expense": self.tax_expense,
            "net_income": self.net_income,
            "cash": self.cash,
            "working_capital": self.working_capital,
            "ppe": self.ppe,
            "goodwill": self.goodwill,
            "total_assets": self.total_assets,
            "total_debt": self.total_debt,
            "equity": self.equity,
            "total_liabilities_equity": self.total_liabilities_equity,
            "operating_cash_flow": self.operating_cash_flow,
            "capex": self.capex,
            "free_cash_flow": self.free_cash_flow,
            "debt_repayments": self.debt_repayments,
            "net_change_in_cash": self.net_change_in_cash
        }


@dataclass
class ReturnsAnalysis:
    """Returns analysis and exit valuation."""
    # Exit valuation
    exit_ebitda: float
    exit_multiple: float
    exit_enterprise_value: float
    exit_net_debt: float
    exit_equity_value: float
    
    # Returns metrics
    sponsor_equity_invested: float
    sponsor_equity_exit_value: float
    sponsor_moic: float
    sponsor_irr: float
    
    # Debt returns
    debt_irr_by_tranche: Dict[str, float]
    weighted_average_debt_irr: float
    
    # Management returns
    management_equity_value: float
    management_moic: float
    management_irr: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "exit_ebitda": self.exit_ebitda,
            "exit_multiple": self.exit_multiple,
            "exit_enterprise_value": self.exit_enterprise_value,
            "exit_net_debt": self.exit_net_debt,
            "exit_equity_value": self.exit_equity_value,
            "sponsor_equity_invested": self.sponsor_equity_invested,
            "sponsor_equity_exit_value": self.sponsor_equity_exit_value,
            "sponsor_moic": self.sponsor_moic,
            "sponsor_irr": self.sponsor_irr,
            "debt_irr_by_tranche": self.debt_irr_by_tranche,
            "weighted_average_debt_irr": self.weighted_average_debt_irr,
            "management_equity_value": self.management_equity_value,
            "management_moic": self.management_moic,
            "management_irr": self.management_irr
        }


@dataclass
class CovenantMetrics:
    """Covenant and credit metrics by year."""
    years: List[int]
    
    # Leverage ratios
    debt_to_ebitda: List[float]
    senior_debt_to_ebitda: List[float]
    
    # Coverage ratios
    interest_coverage: List[float]
    ebitda_coverage: List[float]
    fixed_charge_coverage: List[float]
    
    # Covenant thresholds
    max_leverage_covenant: float
    min_interest_coverage_covenant: float
    
    # Breach flags
    leverage_breach: List[bool]
    coverage_breach: List[bool]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "years": self.years,
            "debt_to_ebitda": self.debt_to_ebitda,
            "senior_debt_to_ebitda": self.senior_debt_to_ebitda,
            "interest_coverage": self.interest_coverage,
            "ebitda_coverage": self.ebitda_coverage,
            "fixed_charge_coverage": self.fixed_charge_coverage,
            "max_leverage_covenant": self.max_leverage_covenant,
            "min_interest_coverage_covenant": self.min_interest_coverage_covenant,
            "leverage_breach": self.leverage_breach,
            "coverage_breach": self.coverage_breach
        }


@dataclass
class SensitivityMatrix:
    """2D sensitivity analysis results."""
    x_axis_label: str
    y_axis_label: str
    x_values: List[float]
    y_values: List[float]
    irr_matrix: List[List[float]]
    moic_matrix: List[List[float]]
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "x_axis_label": self.x_axis_label,
            "y_axis_label": self.y_axis_label,
            "x_values": self.x_values,
            "y_values": self.y_values,
            "irr_matrix": self.irr_matrix,
            "moic_matrix": self.moic_matrix
        }


@dataclass
class ScenarioAnalysis:
    """Scenario analysis results."""
    scenario_type: ScenarioType
    assumptions: LBOAssumptions
    returns: ReturnsAnalysis
    covenant_metrics: CovenantMetrics
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "scenario_type": self.scenario_type.value,
            "assumptions": self.assumptions.to_dict(),
            "returns": self.returns.to_dict(),
            "covenant_metrics": self.covenant_metrics.to_dict()
        }


@dataclass
class EquityWaterfall:
    """Equity waterfall and distribution analysis."""
    # Ownership structure
    sponsor_ownership_pct: float
    management_ownership_pct: float
    rollover_ownership_pct: float
    
    # Exit distributions
    total_exit_proceeds: float
    sponsor_proceeds: float
    management_proceeds: float
    rollover_proceeds: float
    
    # Management incentives
    management_carry_pct: float
    management_carry_value: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "sponsor_ownership_pct": self.sponsor_ownership_pct,
            "management_ownership_pct": self.management_ownership_pct,
            "rollover_ownership_pct": self.rollover_ownership_pct,
            "total_exit_proceeds": self.total_exit_proceeds,
            "sponsor_proceeds": self.sponsor_proceeds,
            "management_proceeds": self.management_proceeds,
            "rollover_proceeds": self.rollover_proceeds,
            "management_carry_pct": self.management_carry_pct,
            "management_carry_value": self.management_carry_value
        }


@dataclass
class LBOModel:
    """Complete LBO model with all modules."""
    # Core modules
    assumptions: LBOAssumptions
    sources_uses: SourcesUses
    purchase_price_allocation: PurchasePriceAllocation
    proforma_financials: ProFormaFinancials
    debt_schedule: List[DebtTranche]
    returns_analysis: ReturnsAnalysis
    covenant_metrics: CovenantMetrics
    equity_waterfall: EquityWaterfall
    
    # Analysis modules
    sensitivity_matrices: List[SensitivityMatrix]
    scenario_analyses: List[ScenarioAnalysis]
    
    # Validation
    validation_checks: Dict[str, bool]
    validation_messages: List[str]
    
    # Metadata
    created_at: str
    model_version: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "assumptions": self.assumptions.to_dict(),
            "sources_uses": self.sources_uses.to_dict(),
            "purchase_price_allocation": self.purchase_price_allocation.to_dict(),
            "proforma_financials": self.proforma_financials.to_dict(),
            "debt_schedule": [tranche.__dict__ for tranche in self.debt_schedule],
            "returns_analysis": self.returns_analysis.to_dict(),
            "covenant_metrics": self.covenant_metrics.to_dict(),
            "equity_waterfall": self.equity_waterfall.to_dict(),
            "sensitivity_matrices": [matrix.to_dict() for matrix in self.sensitivity_matrices],
            "scenario_analyses": [scenario.to_dict() for scenario in self.scenario_analyses],
            "validation_checks": self.validation_checks,
            "validation_messages": self.validation_messages,
            "created_at": self.created_at,
            "model_version": self.model_version
        }
