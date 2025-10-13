"""
Return and growth metrics calculations.

This module provides:
- CAGR: Compound Annual Growth Rate
- MOIC: Multiple on Invested Capital
- Payback Period calculations
"""

import numpy as np
from finmath.core import CashFlows, InvalidInputError, validate_cash_flows, safe_divide


def cagr(begin_value: float, end_value: float, years: float) -> float:
    """
    Calculate Compound Annual Growth Rate.
    
    Formula: CAGR = (End/Begin)^(1/Years) - 1
    
    Args:
        begin_value: Starting value
        end_value: Ending value
        years: Time period in years
    
    Returns:
        CAGR as decimal
    
    Raises:
        InvalidInputError: If values not positive or years <= 0
    
    Example:
        >>> cagr(100, 150, 3)
        0.14470765004608706
        >>> cagr(1000, 2000, 5)  # Doubled in 5 years
        0.14869835499703946
    """
    if begin_value <= 0 or end_value <= 0:
        raise InvalidInputError(
            f"Values must be positive. Got begin={begin_value}, end={end_value}"
        )
    
    if years <= 0:
        raise InvalidInputError(f"Years must be positive. Got {years}")
    
    return float((end_value / begin_value) ** (1 / years) - 1)


def moic(distributions: float, invested: float) -> float:
    """
    Calculate Multiple on Invested Capital.
    
    MOIC = Total Distributions / Total Invested
    
    Args:
        distributions: Total distributions/proceeds received
        invested: Total capital invested
    
    Returns:
        MOIC multiple, or np.nan if invested <= 0
    
    Example:
        >>> moic(2500, 1000)
        2.5
        >>> moic(1800, 1000)
        1.8
    """
    return safe_divide(distributions, invested)


def payback_period(cash_flows: CashFlows) -> float:
    """
    Calculate payback period in fractional years.
    
    Finds when cumulative cash flows turn positive.
    Uses linear interpolation within the payback year.
    
    Args:
        cash_flows: Cash flow series (CF[0] at t=0, typically negative investment)
    
    Returns:
        Years to recover initial investment, or np.inf if never recovers
    
    Example:
        >>> payback_period([-100, 30, 40, 50])
        2.6000000000000005  # Recovers between years 2 and 3
        >>> payback_period([-100, 120])
        1.0  # Recovers in year 1
        >>> payback_period([-100, 10, 10])
        inf  # Never recovers
    """
    cfs = validate_cash_flows(cash_flows)
    cumulative = np.cumsum(cfs)
    
    # Check if ever recovers
    if cumulative[-1] < 0:
        return np.inf
    
    # Find first positive cumulative
    positive_idx = np.where(cumulative >= 0)[0]
    
    if len(positive_idx) == 0:
        return np.inf
    
    first_positive = positive_idx[0]
    
    # If positive at t=0 (no initial investment), return 0
    if first_positive == 0:
        return 0.0
    
    # Linear interpolation between last negative and first positive
    cf_before = cumulative[first_positive - 1]  # Still negative
    cf_current = cfs[first_positive]  # Cash flow in recovery period
    
    # Fraction of the period needed
    fraction = abs(cf_before) / cf_current
    
    return float(first_positive + fraction)


def dpi(distributions: float, invested: float) -> float:
    """
    Calculate DPI (Distributions to Paid-In capital).
    
    DPI = Cumulative Distributions / Cumulative Invested
    
    Args:
        distributions: Cumulative distributions
        invested: Cumulative capital called/invested
    
    Returns:
        DPI ratio
    """
    return safe_divide(distributions, invested)


def rvpi(residual_value: float, invested: float) -> float:
    """
    Calculate RVPI (Residual Value to Paid-In capital).
    
    RVPI = Current NAV / Cumulative Invested
    
    Args:
        residual_value: Current net asset value (unrealized value)
        invested: Cumulative capital called/invested
    
    Returns:
        RVPI ratio
    """
    return safe_divide(residual_value, invested)


def tvpi(distributions: float, residual_value: float, invested: float) -> float:
    """
    Calculate TVPI (Total Value to Paid-In capital).
    
    TVPI = (Distributions + Residual Value) / Invested = DPI + RVPI
    
    Args:
        distributions: Cumulative distributions
        residual_value: Current unrealized value
        invested: Cumulative capital invested
    
    Returns:
        TVPI ratio
    
    Example:
        >>> tvpi(500, 1500, 1000)  # $500 distributed, $1500 unrealized, $1000 invested
        2.0
    """
    return safe_divide(distributions + residual_value, invested)


def compound_return(rate: float, periods: int) -> float:
    """
    Calculate compound return over multiple periods.
    
    Args:
        rate: Per-period return (decimal)
        periods: Number of periods
    
    Returns:
        Total compound return
    
    Example:
        >>> compound_return(0.10, 5)  # 10% for 5 years
        0.6105100000000001  # 61.05% total return
    """
    return float((1 + rate) ** periods - 1)


def annualize_return(total_return: float, years: float) -> float:
    """
    Convert total return to annualized return.
    
    Args:
        total_return: Total return over period (decimal)
        years: Time period in years
    
    Returns:
        Annualized return
    
    Example:
        >>> annualize_return(0.50, 3)  # 50% over 3 years
        0.14470765004608706  # 14.47% per year
    """
    if years <= 0:
        raise InvalidInputError("Years must be positive")
    
    return float((1 + total_return) ** (1 / years) - 1)

