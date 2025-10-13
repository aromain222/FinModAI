"""
Core types, exceptions, and validation utilities for finmath library.

This module provides the foundational components used across all finmath modules:
- Custom exception hierarchy for finance-specific errors
- Type aliases for better type hints
- Validation helpers for common input checks
"""

from typing import Union, List
import numpy as np


# ============================================================================
# Custom Exceptions
# ============================================================================

class FinMathError(Exception):
    """Base exception for all finmath library errors."""
    pass


class NoSignChangeError(FinMathError):
    """
    Raised when IRR calculation requires at least one sign change but none found.
    
    IRR/XIRR calculations require cash flows to change sign (e.g., negative
    initial investment followed by positive returns) to have a meaningful solution.
    """
    pass


class NonConvergenceError(FinMathError):
    """
    Raised when an iterative numerical method fails to converge.
    
    This typically occurs in IRR/XIRR calculations when the Newton-Raphson
    or bisection methods cannot find a solution within the maximum iterations.
    """
    pass


class InvalidInputError(FinMathError):
    """
    Raised when input validation fails.
    
    This includes scenarios like:
    - Negative values where positive required
    - Array length mismatches
    - Out-of-range parameters
    - NaN or infinite values where not allowed
    """
    pass


# ============================================================================
# Type Aliases
# ============================================================================

Number = Union[int, float, np.number]
"""Numeric type that can be int, float, or numpy number."""

CashFlows = Union[List[float], np.ndarray]
"""Cash flow series as list or numpy array."""


# ============================================================================
# Validation Helpers
# ============================================================================

def validate_rate(rate: float, min_rate: float = -0.99) -> None:
    """
    Ensure discount rate is valid (must be > -1 for mathematical stability).
    
    Args:
        rate: Discount rate to validate (decimal, e.g., 0.10 for 10%)
        min_rate: Minimum allowed rate (default: -0.99, i.e., -99%)
    
    Raises:
        InvalidInputError: If rate <= min_rate
    
    Example:
        >>> validate_rate(0.10)  # OK
        >>> validate_rate(-0.95)  # OK
        >>> validate_rate(-1.0)  # Raises InvalidInputError
    """
    if rate <= min_rate:
        raise InvalidInputError(
            f"Rate {rate:.4f} must be > {min_rate:.4f}. "
            f"Rates <= -1 cause division by zero in discount calculations."
        )


def validate_cash_flows(cfs: CashFlows, min_length: int = 2) -> np.ndarray:
    """
    Convert and validate cash flow array.
    
    Args:
        cfs: Cash flows as list or array
        min_length: Minimum required number of cash flows
    
    Returns:
        Validated numpy array of cash flows
    
    Raises:
        InvalidInputError: If validation fails
    
    Example:
        >>> cfs = validate_cash_flows([-100, 50, 60])
        >>> cfs
        array([-100.,   50.,   60.])
    """
    cfs_array = np.asarray(cfs, dtype=float)
    
    if len(cfs_array) < min_length:
        raise InvalidInputError(
            f"Need at least {min_length} cash flows, got {len(cfs_array)}"
        )
    
    if np.any(np.isnan(cfs_array)):
        raise InvalidInputError(
            "Cash flows cannot contain NaN values"
        )
    
    if np.any(np.isinf(cfs_array)):
        raise InvalidInputError(
            "Cash flows cannot contain infinite values"
        )
    
    return cfs_array


def has_sign_change(cfs: np.ndarray) -> bool:
    """
    Check if cash flows have at least one sign change.
    
    This is required for IRR calculations to have a meaningful solution.
    Ignores zero values in the check.
    
    Args:
        cfs: Cash flow array
    
    Returns:
        True if at least one sign change exists, False otherwise
    
    Example:
        >>> has_sign_change(np.array([-100, 50, 60]))
        True
        >>> has_sign_change(np.array([100, 50, 60]))
        False
        >>> has_sign_change(np.array([-100, 0, -50]))
        False
    """
    # Filter out zeros
    non_zero = cfs[cfs != 0]
    
    if len(non_zero) < 2:
        return False
    
    signs = np.sign(non_zero)
    
    # Check if all signs are the same
    return not np.all(signs == signs[0])


def safe_divide(num: float, denom: float, default: float = np.nan) -> float:
    """
    Division with safe handling of zero or negative denominators.
    
    Used for calculating multiples where denominator might be zero or negative
    (e.g., EV/EBITDA when EBITDA is negative).
    
    Args:
        num: Numerator
        denom: Denominator
        default: Value to return if denom <= 0 (default: np.nan)
    
    Returns:
        num / denom if denom > 0, else default
    
    Example:
        >>> safe_divide(100, 10)
        10.0
        >>> safe_divide(100, 0)
        nan
        >>> safe_divide(100, -5)
        nan
        >>> safe_divide(100, 0, default=0.0)
        0.0
    """
    if denom <= 0:
        return default
    return num / denom


def validate_positive(value: float, name: str = "value") -> None:
    """
    Ensure value is positive (> 0).
    
    Args:
        value: Value to check
        name: Name of value for error message
    
    Raises:
        InvalidInputError: If value <= 0
    """
    if value <= 0:
        raise InvalidInputError(f"{name} must be positive, got {value}")


def validate_in_range(value: float, min_val: float, max_val: float, 
                      name: str = "value") -> None:
    """
    Ensure value is within specified range [min_val, max_val].
    
    Args:
        value: Value to check
        min_val: Minimum allowed value (inclusive)
        max_val: Maximum allowed value (inclusive)
        name: Name of value for error message
    
    Raises:
        InvalidInputError: If value outside range
    """
    if not min_val <= value <= max_val:
        raise InvalidInputError(
            f"{name} must be in range [{min_val}, {max_val}], got {value}"
        )


# ============================================================================
# Numerical Utilities
# ============================================================================

def is_close_to_zero(value: float, tolerance: float = 1e-10) -> bool:
    """
    Check if value is close to zero within tolerance.
    
    Useful for handling near-zero rates in financial calculations.
    
    Args:
        value: Value to check
        tolerance: Absolute tolerance (default: 1e-10)
    
    Returns:
        True if |value| < tolerance
    """
    return abs(value) < tolerance


def round_to_bps(rate: float) -> float:
    """
    Round rate to basis points (4 decimal places).
    
    Args:
        rate: Rate in decimal form (e.g., 0.1234 for 12.34%)
    
    Returns:
        Rate rounded to 4 decimal places
    
    Example:
        >>> round_to_bps(0.12345678)
        0.1235
    """
    return round(rate, 4)

