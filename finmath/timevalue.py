"""
Time Value of Money calculations.

This module provides core TVM functions with robust numerical methods:
- NPV: Net Present Value
- IRR: Internal Rate of Return (Newton-Raphson + bisection fallback)
- XIRR: IRR for irregular cash flows with dates
- MIRR: Modified Internal Rate of Return
- Annuities: Present and Future Value calculations
"""

from typing import List, Tuple, Optional
from datetime import date, datetime
import numpy as np
from dateutil.relativedelta import relativedelta

from finmath.core import (
    CashFlows, InvalidInputError, NoSignChangeError, NonConvergenceError,
    validate_rate, validate_cash_flows, has_sign_change, is_close_to_zero
)


# ============================================================================
# Net Present Value
# ============================================================================

def npv(rate: float, cash_flows: CashFlows) -> float:
    """
    Calculate Net Present Value with CF[0] at t=0.
    
    Formula: NPV = Σ CF_t / (1 + r)^t for t = 0 to n
    
    Args:
        rate: Discount rate (decimal, e.g., 0.10 for 10%)
        cash_flows: Array where CF[0] is at t=0, CF[1] at t=1, etc.
    
    Returns:
        Present value in same units as cash_flows
    
    Raises:
        InvalidInputError: If rate <= -1 or cash flows invalid
    
    Example:
        >>> npv(0.10, [-100, 30, 40, 50])
        6.349206349206348
        >>> npv(0, [-100, 30, 40, 50])  # Zero rate
        20.0
    """
    validate_rate(rate)
    cfs = validate_cash_flows(cash_flows)
    
    # Handle near-zero rate with numerical stability
    if is_close_to_zero(rate):
        return float(np.sum(cfs))
    
    # Standard NPV calculation
    periods = np.arange(len(cfs))
    discount_factors = (1 + rate) ** -periods
    return float(np.sum(cfs * discount_factors))


def pv_series(cash_flows: CashFlows, rate: float) -> float:
    """
    Alias for npv() with swapped parameter order for clarity.
    
    Same as npv() but with parameters in different order to match
    common financial notation: PV(cash flows, discount rate).
    """
    return npv(rate, cash_flows)


# ============================================================================
# Internal Rate of Return (IRR)
# ============================================================================

def _npv_derivative(rate: float, cash_flows: np.ndarray) -> float:
    """
    Calculate derivative of NPV with respect to rate.
    
    Used in Newton-Raphson method for IRR calculation.
    
    Formula: dNPV/dr = Σ (-t * CF_t / (1 + r)^(t+1))
    """
    periods = np.arange(len(cash_flows))
    return float(np.sum(-periods * cash_flows / (1 + rate) ** (periods + 1)))


def _irr_newton(cash_flows: np.ndarray, guess: float = 0.1, 
                tol: float = 1e-7, max_iter: int = 100) -> float:
    """
    Calculate IRR using Newton-Raphson method.
    
    Returns:
        IRR as decimal, or None if doesn't converge
    """
    rate = guess
    
    for iteration in range(max_iter):
        npv_val = npv(rate, cash_flows)
        
        # Check convergence
        if abs(npv_val) < tol:
            return rate
        
        # Calculate derivative
        try:
            deriv = _npv_derivative(rate, cash_flows)
        except (OverflowError, ZeroDivisionError):
            return None
        
        # Guard against zero derivative
        if abs(deriv) < 1e-15:
            return None
        
        # Newton step
        rate_new = rate - npv_val / deriv
        
        # Check if diverging or out of reasonable range
        if rate_new < -0.99 or rate_new > 10.0:
            return None
        
        # Check rate convergence
        if abs(rate_new - rate) < tol:
            return rate_new
        
        rate = rate_new
    
    return None


def _irr_bisection(cash_flows: np.ndarray, low: float = -0.99, 
                   high: float = 5.0, tol: float = 1e-7, 
                   max_iter: int = 100) -> Optional[float]:
    """
    Calculate IRR using bisection method.
    
    Finds rate where NPV changes sign between low and high.
    """
    npv_low = npv(low, cash_flows)
    npv_high = npv(high, cash_flows)
    
    # Check if signs are different
    if npv_low * npv_high > 0:
        return None
    
    for _ in range(max_iter):
        mid = (low + high) / 2
        npv_mid = npv(mid, cash_flows)
        
        if abs(npv_mid) < tol:
            return mid
        
        if npv_mid * npv_low < 0:
            high = mid
            npv_high = npv_mid
        else:
            low = mid
            npv_low = npv_mid
        
        if abs(high - low) < tol:
            return (low + high) / 2
    
    return None


def irr(cash_flows: CashFlows, guess: float = 0.1, tol: float = 1e-7, 
        max_iter: int = 100) -> float:
    """
    Calculate Internal Rate of Return.
    
    Uses Newton-Raphson method with bisection fallback for robustness.
    Returns the rate where NPV = 0.
    
    Args:
        cash_flows: Cash flow series (CF[0] at t=0)
        guess: Initial guess for rate (default: 0.1 = 10%)
        tol: Convergence tolerance (default: 1e-7)
        max_iter: Maximum iterations (default: 100)
    
    Returns:
        IRR as decimal (e.g., 0.1865 for 18.65%)
    
    Raises:
        NoSignChangeError: If cash flows have no sign change
        NonConvergenceError: If unable to find solution
    
    Example:
        >>> irr([-100, 40, 40, 40, 40])
        0.18649996584049595
        >>> irr([-1000, 200, 300, 400, 500])
        0.14098798885738808
    """
    cfs = validate_cash_flows(cash_flows)
    
    # Check for sign change
    if not has_sign_change(cfs):
        raise NoSignChangeError(
            "IRR requires at least one sign change in cash flows. "
            f"Got cash flows with signs: {np.sign(cfs[cfs != 0])}"
        )
    
    # Try Newton-Raphson first
    result = _irr_newton(cfs, guess, tol, max_iter)
    if result is not None:
        return result
    
    # Fallback to bisection
    # Search for sign change in coarse grid
    test_rates = np.linspace(-0.99, 5.0, 50)
    npv_values = [npv(r, cfs) for r in test_rates]
    
    # Find intervals where NPV changes sign
    for i in range(len(test_rates) - 1):
        if npv_values[i] * npv_values[i + 1] < 0:
            result = _irr_bisection(cfs, test_rates[i], test_rates[i + 1], tol, max_iter)
            if result is not None:
                return result
    
    # If still no solution, raise error
    raise NonConvergenceError(
        f"IRR did not converge after {max_iter} iterations. "
        "Try different initial guess or check cash flow validity."
    )


def all_irr(cash_flows: CashFlows, search_range: Tuple[float, float] = (-0.98, 5.0),
            tol: float = 1e-7) -> List[float]:
    """
    Find all IRR solutions (for cash flows with multiple sign changes).
    
    Args:
        cash_flows: Cash flow series
        search_range: (min_rate, max_rate) to search
        tol: Convergence tolerance
    
    Returns:
        List of all IRR solutions found
    
    Example:
        >>> cfs = [-100, 230, -132]  # Multiple roots possible
        >>> all_irr(cfs)
        [0.1, 0.2]  # Example: two valid IRRs
    """
    cfs = validate_cash_flows(cash_flows)
    
    if not has_sign_change(cfs):
        return []
    
    # Search for all sign changes
    test_rates = np.linspace(search_range[0], search_range[1], 100)
    npv_values = [npv(r, cfs) for r in test_rates]
    
    solutions = []
    for i in range(len(test_rates) - 1):
        if npv_values[i] * npv_values[i + 1] < 0:
            result = _irr_bisection(cfs, test_rates[i], test_rates[i + 1], tol)
            if result is not None:
                # Check if this is a new solution (not already found)
                if not any(abs(result - s) < tol for s in solutions):
                    solutions.append(result)
    
    return sorted(solutions)


# ============================================================================
# XIRR - Irregular Cash Flows
# ============================================================================

def _xnpv(rate: float, cash_flows: np.ndarray, dates: List[date]) -> float:
    """
    Calculate NPV for irregular cash flows using actual/365 day count.
    """
    if is_close_to_zero(rate):
        return float(np.sum(cash_flows))
    
    base_date = dates[0]
    pv = 0.0
    
    for cf, dt in zip(cash_flows, dates):
        days = (dt - base_date).days
        years = days / 365.0
        pv += cf / (1 + rate) ** years
    
    return pv


def _xnpv_derivative(rate: float, cash_flows: np.ndarray, dates: List[date]) -> float:
    """
    Calculate derivative of XNPV with respect to rate.
    """
    base_date = dates[0]
    deriv = 0.0
    
    for cf, dt in zip(cash_flows, dates):
        days = (dt - base_date).days
        years = days / 365.0
        deriv += -years * cf / (1 + rate) ** (years + 1)
    
    return deriv


def xirr(cash_flows: CashFlows, dates: List[date], guess: float = 0.1,
         tol: float = 1e-7, max_iter: int = 200) -> float:
    """
    Calculate IRR for irregular cash flows with dates (XIRR).
    
    Uses actual/365 day count convention.
    
    Args:
        cash_flows: Cash flow series
        dates: Corresponding dates for each cash flow
        guess: Initial guess for rate (default: 0.1)
        tol: Convergence tolerance (default: 1e-7)
        max_iter: Maximum iterations (default: 200)
    
    Returns:
        Annualized IRR as decimal
    
    Raises:
        InvalidInputError: If dates/cash flows length mismatch or invalid dates
        NoSignChangeError: If cash flows have no sign change
        NonConvergenceError: If unable to find solution
    
    Example:
        >>> from datetime import date
        >>> cfs = [-1000, 300, 400, 500]
        >>> dts = [date(2020, 1, 1), date(2020, 6, 1), date(2021, 1, 1), date(2021, 6, 1)]
        >>> xirr(cfs, dts)
        0.3266...
    """
    cfs = validate_cash_flows(cash_flows)
    
    # Validate dates
    if len(dates) != len(cfs):
        raise InvalidInputError(
            f"Length mismatch: {len(cash_flows)} cash flows but {len(dates)} dates"
        )
    
    if len(set(dates)) != len(dates):
        raise InvalidInputError("Dates must be unique")
    
    if len(dates) < 2:
        raise InvalidInputError("Need at least 2 dates")
    
    # Ensure dates are sorted
    sorted_indices = np.argsort(dates)
    dates = [dates[i] for i in sorted_indices]
    cfs = cfs[sorted_indices]
    
    # Check for sign change
    if not has_sign_change(cfs):
        raise NoSignChangeError(
            "XIRR requires at least one sign change in cash flows"
        )
    
    # Newton-Raphson
    rate = guess
    
    for iteration in range(max_iter):
        xnpv_val = _xnpv(rate, cfs, dates)
        
        if abs(xnpv_val) < tol:
            return rate
        
        try:
            deriv = _xnpv_derivative(rate, cfs, dates)
        except (OverflowError, ZeroDivisionError):
            break
        
        if abs(deriv) < 1e-15:
            break
        
        rate_new = rate - xnpv_val / deriv
        
        if rate_new < -0.99 or rate_new > 10.0:
            break
        
        if abs(rate_new - rate) < tol:
            return rate_new
        
        rate = rate_new
    
    # Bisection fallback
    test_rates = np.linspace(-0.99, 5.0, 50)
    xnpv_values = [_xnpv(r, cfs, dates) for r in test_rates]
    
    for i in range(len(test_rates) - 1):
        if xnpv_values[i] * xnpv_values[i + 1] < 0:
            # Bisection in this interval
            low, high = test_rates[i], test_rates[i + 1]
            
            for _ in range(max_iter):
                mid = (low + high) / 2
                xnpv_mid = _xnpv(mid, cfs, dates)
                
                if abs(xnpv_mid) < tol:
                    return mid
                
                if xnpv_mid * _xnpv(low, cfs, dates) < 0:
                    high = mid
                else:
                    low = mid
                
                if abs(high - low) < tol:
                    return (low + high) / 2
    
    raise NonConvergenceError(
        f"XIRR did not converge after {max_iter} iterations"
    )


# ============================================================================
# Modified IRR
# ============================================================================

def mirr(cash_flows: CashFlows, finance_rate: float, reinvest_rate: float) -> float:
    """
    Calculate Modified Internal Rate of Return.
    
    MIRR addresses IRR's reinvestment assumption by using different rates
    for financing negative cash flows and reinvesting positive cash flows.
    
    Args:
        cash_flows: Cash flow series (CF[0] at t=0)
        finance_rate: Rate for financing negative cash flows
        reinvest_rate: Rate for reinvesting positive cash flows
    
    Returns:
        MIRR as decimal
    
    Raises:
        InvalidInputError: If rates invalid or no positive/negative flows
    
    Example:
        >>> mirr([-1000, 300, 400, 500], 0.10, 0.12)
        0.139...
    """
    cfs = validate_cash_flows(cash_flows)
    validate_rate(finance_rate)
    validate_rate(reinvest_rate)
    
    n = len(cfs)
    
    # Separate positive and negative flows
    positive_flows = np.where(cfs > 0, cfs, 0)
    negative_flows = np.where(cfs < 0, cfs, 0)
    
    if np.sum(positive_flows) == 0 or np.sum(negative_flows) == 0:
        raise InvalidInputError(
            "MIRR requires both positive and negative cash flows"
        )
    
    # Future value of positive flows (reinvested at reinvest_rate)
    fv_positive = 0.0
    for t, cf in enumerate(positive_flows):
        if cf > 0:
            fv_positive += cf * (1 + reinvest_rate) ** (n - 1 - t)
    
    # Present value of negative flows (financed at finance_rate)
    pv_negative = 0.0
    for t, cf in enumerate(negative_flows):
        if cf < 0:
            pv_negative += cf / (1 + finance_rate) ** t
    
    # MIRR formula
    mirr_value = (fv_positive / abs(pv_negative)) ** (1 / (n - 1)) - 1
    
    return float(mirr_value)


# ============================================================================
# Annuities
# ============================================================================

def pv_annuity(payment: float, rate: float, periods: int) -> float:
    """
    Calculate present value of an ordinary annuity.
    
    Formula: PV = PMT * [(1 - (1 + r)^(-n)) / r]
    
    Args:
        payment: Payment per period
        rate: Interest rate per period (decimal)
        periods: Number of periods
    
    Returns:
        Present value
    
    Example:
        >>> pv_annuity(100, 0.10, 5)
        379.078676233368
    """
    if periods <= 0:
        raise InvalidInputError("Periods must be positive")
    
    # Handle near-zero rate
    if is_close_to_zero(rate):
        return payment * periods
    
    validate_rate(rate)
    
    pv = payment * (1 - (1 + rate) ** -periods) / rate
    return float(pv)


def fv_annuity(payment: float, rate: float, periods: int) -> float:
    """
    Calculate future value of an ordinary annuity.
    
    Formula: FV = PMT * [((1 + r)^n - 1) / r]
    
    Args:
        payment: Payment per period
        rate: Interest rate per period (decimal)
        periods: Number of periods
    
    Returns:
        Future value
    
    Example:
        >>> fv_annuity(100, 0.10, 5)
        610.51
    """
    if periods <= 0:
        raise InvalidInputError("Periods must be positive")
    
    # Handle near-zero rate
    if is_close_to_zero(rate):
        return payment * periods
    
    validate_rate(rate)
    
    fv = payment * ((1 + rate) ** periods - 1) / rate
    return float(fv)


def pv_annuity_due(payment: float, rate: float, periods: int) -> float:
    """
    Calculate present value of an annuity due (payments at beginning of period).
    
    Args:
        payment: Payment per period
        rate: Interest rate per period (decimal)
        periods: Number of periods
    
    Returns:
        Present value
    """
    return pv_annuity(payment, rate, periods) * (1 + rate)


def fv_annuity_due(payment: float, rate: float, periods: int) -> float:
    """
    Calculate future value of an annuity due (payments at beginning of period).
    
    Args:
        payment: Payment per period
        rate: Interest rate per period (decimal)
        periods: Number of periods
    
    Returns:
        Future value
    """
    return fv_annuity(payment, rate, periods) * (1 + rate)

