"""
FinMath - Production Finance Mathematics Library

Pure functions for valuation, time-value, returns, WACC, and financial modeling.

All functions are:
- Pure (no side effects, no I/O)
- Unit-aware (accept/return same scale)
- Vectorized with NumPy where applicable
- Deterministic
- Well-documented with examples

Usage:
    from finmath import npv, irr, wacc, enterprise_value
    
    # DCF calculation
    cash_flows = [-1000, 200, 250, 300, 350]
    discount_rate = 0.10
    
    pv = npv(discount_rate, cash_flows)
    deal_irr = irr(cash_flows)
"""

__version__ = "0.1.0"

# Core exceptions and types
from finmath.core import (
    FinMathError,
    NoSignChangeError,
    NonConvergenceError,
    InvalidInputError,
)

# Time Value functions
from finmath.timevalue import (
    npv,
    pv_series,
    irr,
    all_irr,
    xirr,
    mirr,
    pv_annuity,
    fv_annuity,
    pv_annuity_due,
    fv_annuity_due,
)

# Valuation functions
from finmath.valuation import (
    perpetuity_pv,
    tv_perpetuity,
    tv_exit_multiple,
    enterprise_value,
    equity_value,
    net_debt,
    ev_to_ebitda,
    ev_to_revenue,
    ev_to_ebit,
    ev_to_fcf,
    p_to_e,
    p_to_b,
    p_to_s,
    ev_from_market_cap,
    implied_growth_rate,
)

# Returns & Growth
from finmath.returns import (
    cagr,
    moic,
    payback_period,
    dpi,
    rvpi,
    tvpi,
    compound_return,
    annualize_return,
)

# WACC & Cost of Capital
from finmath.wacc import (
    cost_of_equity_capm,
    after_tax_cost_of_debt,
    weights_from_de,
    wacc,
    unlevered_beta,
    levered_beta,
    unlevered_cost_of_equity,
)

# Operating Working Capital & FCF
from finmath.ops_wc import (
    operating_nwc,
    delta_nwc,
    ufcf,
    levered_fcf,
    nopat,
    invested_capital,
    roic,
)

# Debt functions
from finmath.debt import (
    amortize,
    interest_expense,
    pik_interest,
    revolver_sweep,
    net_debt_to_ebitda,
    interest_coverage,
    fixed_charge_coverage,
    debt_service_coverage,
    total_debt_to_capital,
    debt_yield,
    ltv,
)

# Equity & Dilution
from finmath.equity import (
    treasury_stock_method,
    diluted_shares,
    diluted_eps,
    basic_eps,
    if_converted_method,
    weighted_average_shares,
    payout_ratio,
    retention_ratio,
    book_value_per_share,
)

# Statistics
from finmath.stats import (
    beta_ols,
    winsorize_array,
    z_score,
    correlation,
    covariance,
    sharpe_ratio,
    sortino_ratio,
    max_drawdown,
    information_ratio,
    tracking_error,
    var_historical,
    cvar_historical,
)

# Registry
from finmath.registry import (
    get_formula,
    list_formulas,
    describe,
    list_categories,
    get_formulas_by_category,
    search,
    generate_reference,
    export_json,
)

# Auto-register all modules
from finmath import registry
import finmath.timevalue as _tv
import finmath.valuation as _val
import finmath.returns as _ret
import finmath.wacc as _wacc
import finmath.ops_wc as _ops
import finmath.debt as _debt
import finmath.equity as _eq
import finmath.stats as _stats

# Register modules
registry.auto_register_module(_tv, 'timevalue')
registry.auto_register_module(_val, 'valuation')
registry.auto_register_module(_ret, 'returns')
registry.auto_register_module(_wacc, 'wacc')
registry.auto_register_module(_ops, 'ops_wc')
registry.auto_register_module(_debt, 'debt')
registry.auto_register_module(_eq, 'equity')
registry.auto_register_module(_stats, 'stats')

# Public API
__all__ = [
    # Version
    "__version__",
    
    # Exceptions
    "FinMathError",
    "NoSignChangeError",
    "NonConvergenceError",
    "InvalidInputError",
    
    # Time Value
    "npv",
    "pv_series",
    "irr",
    "all_irr",
    "xirr",
    "mirr",
    "pv_annuity",
    "fv_annuity",
    "pv_annuity_due",
    "fv_annuity_due",
    
    # Valuation
    "perpetuity_pv",
    "tv_perpetuity",
    "tv_exit_multiple",
    "enterprise_value",
    "equity_value",
    "net_debt",
    "ev_to_ebitda",
    "ev_to_revenue",
    "ev_to_ebit",
    "ev_to_fcf",
    "p_to_e",
    "p_to_b",
    "p_to_s",
    "ev_from_market_cap",
    "implied_growth_rate",
    
    # Returns
    "cagr",
    "moic",
    "payback_period",
    "dpi",
    "rvpi",
    "tvpi",
    "compound_return",
    "annualize_return",
    
    # WACC
    "cost_of_equity_capm",
    "after_tax_cost_of_debt",
    "weights_from_de",
    "wacc",
    "unlevered_beta",
    "levered_beta",
    "unlevered_cost_of_equity",
    
    # Operating
    "operating_nwc",
    "delta_nwc",
    "ufcf",
    "levered_fcf",
    "nopat",
    "invested_capital",
    "roic",
    
    # Debt
    "amortize",
    "interest_expense",
    "pik_interest",
    "revolver_sweep",
    "net_debt_to_ebitda",
    "interest_coverage",
    "fixed_charge_coverage",
    "debt_service_coverage",
    "total_debt_to_capital",
    "debt_yield",
    "ltv",
    
    # Equity
    "treasury_stock_method",
    "diluted_shares",
    "diluted_eps",
    "basic_eps",
    "if_converted_method",
    "weighted_average_shares",
    "payout_ratio",
    "retention_ratio",
    "book_value_per_share",
    
    # Stats
    "beta_ols",
    "winsorize_array",
    "z_score",
    "correlation",
    "covariance",
    "sharpe_ratio",
    "sortino_ratio",
    "max_drawdown",
    "information_ratio",
    "tracking_error",
    "var_historical",
    "cvar_historical",
    
    # Registry
    "get_formula",
    "list_formulas",
    "describe",
    "list_categories",
    "get_formulas_by_category",
    "search",
    "generate_reference",
    "export_json",
]

