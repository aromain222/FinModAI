"""
Cost of Capital and WACC calculations.

This module provides:
- CAPM cost of equity
- After-tax cost of debt
- Capital structure weights
- WACC calculation with validation
"""

import numpy as np
from finmath.core import InvalidInputError, validate_in_range


def cost_of_equity_capm(rf: float, beta: float, erp: float) -> float:
    """
    Calculate cost of equity using Capital Asset Pricing Model (CAPM).
    
    Formula: Ke = Rf + β × ERP
    
    Args:
        rf: Risk-free rate (decimal, e.g., 0.03 for 3%)
        beta: Asset beta coefficient
        erp: Equity risk premium (decimal, e.g., 0.06 for 6%)
    
    Returns:
        Cost of equity as decimal
    
    Example:
        >>> cost_of_equity_capm(0.03, 1.2, 0.06)
        0.102  # 10.2%
        >>> cost_of_equity_capm(0.025, 0.8, 0.055)
        0.069  # 6.9%
    """
    return rf + beta * erp


def after_tax_cost_of_debt(kd_pre_tax: float, tax_rate: float) -> float:
    """
    Calculate after-tax cost of debt.
    
    Formula: Kd(1 - T)
    
    Debt interest is tax-deductible, so after-tax cost is lower.
    
    Args:
        kd_pre_tax: Pre-tax cost of debt (decimal)
        tax_rate: Corporate tax rate (decimal, 0 to 1)
    
    Returns:
        After-tax cost of debt
    
    Raises:
        InvalidInputError: If tax_rate not in [0, 1]
    
    Example:
        >>> after_tax_cost_of_debt(0.06, 0.25)
        0.045  # 4.5%
        >>> after_tax_cost_of_debt(0.08, 0.21)
        0.0632  # 6.32%
    """
    validate_in_range(tax_rate, 0.0, 1.0, "Tax rate")
    return kd_pre_tax * (1 - tax_rate)


def weights_from_de(equity_value: float, net_debt: float) -> tuple:
    """
    Calculate capital structure weights from equity and debt values.
    
    Args:
        equity_value: Market value of equity
        net_debt: Net debt (Total Debt - Cash)
    
    Returns:
        Tuple of (weight_equity, weight_debt)
    
    Raises:
        InvalidInputError: If equity value negative or total capital <= 0
    
    Example:
        >>> weights_from_de(800, 200)
        (0.8, 0.2)
        >>> weights_from_de(2000, 500)
        (0.8, 0.2)
    """
    if equity_value < 0:
        raise InvalidInputError(
            f"Equity value cannot be negative. Got {equity_value}"
        )
    
    total_capital = equity_value + net_debt
    
    if total_capital <= 0:
        raise InvalidInputError(
            f"Total capital must be positive. Equity={equity_value}, Debt={net_debt}"
        )
    
    we = equity_value / total_capital
    wd = net_debt / total_capital
    
    return (we, wd)


def wacc(ke: float, kd_after_tax: float, we: float, wd: float) -> float:
    """
    Calculate Weighted Average Cost of Capital.
    
    Formula: WACC = We × Ke + Wd × Kd(1-T)
    
    Args:
        ke: Cost of equity (decimal)
        kd_after_tax: After-tax cost of debt (decimal)
        we: Weight of equity in capital structure
        wd: Weight of debt in capital structure
    
    Returns:
        WACC as decimal
    
    Raises:
        InvalidInputError: If weights don't sum to ~1 or rates out of range
    
    Example:
        >>> wacc(0.12, 0.045, 0.7, 0.3)
        0.0975  # 9.75%
        >>> wacc(0.10, 0.04, 0.8, 0.2)
        0.088  # 8.8%
    """
    # Validate weights sum to 1
    if not np.isclose(we + wd, 1.0, atol=0.01):
        raise InvalidInputError(
            f"Weights must sum to 1.0 (got {we + wd:.4f}). "
            f"We={we:.4f}, Wd={wd:.4f}"
        )
    
    # Validate cost of equity is reasonable
    if not 0 <= ke <= 1:
        raise InvalidInputError(
            f"Cost of equity {ke:.2%} is out of reasonable range [0%, 100%]"
        )
    
    # Calculate WACC
    result = we * ke + wd * kd_after_tax
    
    # Sanity check result
    if not 0 <= result <= 1:
        raise InvalidInputError(
            f"WACC {result:.2%} is out of reasonable range [0%, 100%]"
        )
    
    return result


def unlevered_beta(levered_beta: float, tax_rate: float, debt_to_equity: float) -> float:
    """
    Calculate unlevered (asset) beta from levered (equity) beta.
    
    Formula: βu = βl / [1 + (1-T) × D/E]
    
    Args:
        levered_beta: Levered (equity) beta
        tax_rate: Corporate tax rate (decimal)
        debt_to_equity: Debt-to-equity ratio
    
    Returns:
        Unlevered beta
    
    Example:
        >>> unlevered_beta(1.2, 0.25, 0.5)
        0.9230769230769231
    """
    validate_in_range(tax_rate, 0.0, 1.0, "Tax rate")
    
    if debt_to_equity < 0:
        raise InvalidInputError("Debt-to-equity ratio cannot be negative")
    
    return levered_beta / (1 + (1 - tax_rate) * debt_to_equity)


def levered_beta(unlevered_beta: float, tax_rate: float, debt_to_equity: float) -> float:
    """
    Calculate levered (equity) beta from unlevered (asset) beta.
    
    Formula: βl = βu × [1 + (1-T) × D/E]
    
    Args:
        unlevered_beta: Unlevered (asset) beta
        tax_rate: Corporate tax rate (decimal)
        debt_to_equity: Debt-to-equity ratio
    
    Returns:
        Levered beta
    
    Example:
        >>> levered_beta(1.0, 0.25, 0.5)
        1.375
    """
    validate_in_range(tax_rate, 0.0, 1.0, "Tax rate")
    
    if debt_to_equity < 0:
        raise InvalidInputError("Debt-to-equity ratio cannot be negative")
    
    return unlevered_beta * (1 + (1 - tax_rate) * debt_to_equity)


def unlevered_cost_of_equity(wacc: float, kd_after_tax: float, we: float, wd: float) -> float:
    """
    Back out unlevered cost of equity from WACC components.
    
    Useful for consistency checks in models.
    
    Args:
        wacc: Weighted average cost of capital
        kd_after_tax: After-tax cost of debt
        we: Weight of equity
        wd: Weight of debt
    
    Returns:
        Implied cost of equity
    
    Example:
        >>> unlevered_cost_of_equity(0.10, 0.05, 0.7, 0.3)
        0.12142857142857143
    """
    if we <= 0:
        raise InvalidInputError("Weight of equity must be positive")
    
    # Rearrange: WACC = We × Ke + Wd × Kd
    # So: Ke = (WACC - Wd × Kd) / We
    return (wacc - wd * kd_after_tax) / we

