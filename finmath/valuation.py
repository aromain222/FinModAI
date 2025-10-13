"""
Valuation functions for DCF, multiples, and enterprise/equity value calculations.

This module provides:
- Perpetuity and terminal value calculations
- Enterprise and equity value bridge
- Valuation multiples (EV/EBITDA, EV/Revenue, P/E, etc.)
"""

import numpy as np
from finmath.core import InvalidInputError, safe_divide, validate_positive


# ============================================================================
# Perpetuity & Terminal Value
# ============================================================================

def perpetuity_pv(cf_next: float, discount_rate: float, growth_rate: float = 0) -> float:
    """
    Calculate present value of a perpetuity with constant growth.
    
    Gordon Growth Model: PV = CF_1 / (r - g)
    
    Args:
        cf_next: Cash flow in next period (period 1)
        discount_rate: Required return (decimal)
        growth_rate: Perpetual growth rate (decimal, default: 0)
    
    Returns:
        Present value of perpetuity
    
    Raises:
        InvalidInputError: If growth_rate >= discount_rate
    
    Example:
        >>> perpetuity_pv(100, 0.10, 0.02)
        1250.0
        >>> perpetuity_pv(50, 0.08, 0)  # No growth
        625.0
    """
    if growth_rate >= discount_rate:
        raise InvalidInputError(
            f"Growth rate ({growth_rate:.2%}) must be < discount rate ({discount_rate:.2%}). "
            "Otherwise, perpetuity value would be infinite."
        )
    
    return cf_next / (discount_rate - growth_rate)


def tv_perpetuity(ufcf_next: float, wacc: float, g: float) -> float:
    """
    Calculate terminal value using perpetuity growth method.
    
    This is an alias for perpetuity_pv with naming specific to DCF models.
    
    Args:
        ufcf_next: Unlevered FCF in first year after explicit forecast
        wacc: Weighted average cost of capital
        g: Terminal growth rate
    
    Returns:
        Terminal value
    
    Example:
        >>> tv_perpetuity(200, 0.10, 0.02)
        2500.0
    """
    return perpetuity_pv(ufcf_next, wacc, g)


def tv_exit_multiple(metric: float, multiple: float) -> float:
    """
    Calculate terminal value using exit multiple method.
    
    Args:
        metric: Financial metric in terminal year (e.g., EBITDA, Revenue)
        multiple: Exit multiple to apply (e.g., 10x EBITDA)
    
    Returns:
        Terminal value
    
    Example:
        >>> tv_exit_multiple(150, 10.0)  # 10x EBITDA
        1500.0
        >>> tv_exit_multiple(1000, 2.5)  # 2.5x Revenue
        2500.0
    """
    return metric * multiple


# ============================================================================
# Enterprise & Equity Value
# ============================================================================

def enterprise_value(pv_explicit: float, pv_terminal: float) -> float:
    """
    Calculate enterprise value from DCF components.
    
    EV = PV(explicit forecast period) + PV(terminal value)
    
    Args:
        pv_explicit: Present value of explicit forecast cash flows
        pv_terminal: Present value of terminal value
    
    Returns:
        Enterprise value
    
    Example:
        >>> enterprise_value(500, 2000)
        2500.0
    """
    return pv_explicit + pv_terminal


def equity_value(ev: float, net_debt: float, minorities: float = 0, 
                 preferred: float = 0, nonoperating_assets: float = 0) -> float:
    """
    Calculate equity value from enterprise value.
    
    Equity Value = EV - Net Debt - Minorities - Preferred + Non-operating Assets
    
    Args:
        ev: Enterprise value
        net_debt: Net debt (Total Debt - Cash)
        minorities: Minority interests (default: 0)
        preferred: Preferred stock (default: 0)
        nonoperating_assets: Non-operating assets to add back (default: 0)
    
    Returns:
        Equity value
    
    Example:
        >>> equity_value(2500, 500)
        2000.0
        >>> equity_value(2500, 500, minorities=50, preferred=100)
        1850.0
    """
    return ev - net_debt - minorities - preferred + nonoperating_assets


def net_debt(total_debt: float, cash: float) -> float:
    """
    Calculate net debt.
    
    Net Debt = Total Debt - Cash & Equivalents
    
    Args:
        total_debt: Total debt (short-term + long-term)
        cash: Cash and cash equivalents
    
    Returns:
        Net debt (can be negative if cash > debt)
    """
    return total_debt - cash


# ============================================================================
# Valuation Multiples
# ============================================================================

def ev_to_ebitda(ev: float, ebitda: float) -> float:
    """
    Calculate EV/EBITDA multiple.
    
    Returns np.nan if EBITDA <= 0 (negative EBITDA makes multiple meaningless).
    
    Args:
        ev: Enterprise value
        ebitda: EBITDA (trailing or forward)
    
    Returns:
        EV/EBITDA multiple, or np.nan if invalid
    
    Example:
        >>> ev_to_ebitda(2500, 250)
        10.0
        >>> ev_to_ebitda(2500, -50)  # Negative EBITDA
        nan
    """
    return safe_divide(ev, ebitda)


def ev_to_revenue(ev: float, revenue: float) -> float:
    """
    Calculate EV/Revenue multiple.
    
    Args:
        ev: Enterprise value
        revenue: Revenue (trailing or forward)
    
    Returns:
        EV/Revenue multiple, or np.nan if revenue <= 0
    
    Example:
        >>> ev_to_revenue(2500, 1000)
        2.5
    """
    return safe_divide(ev, revenue)


def ev_to_ebit(ev: float, ebit: float) -> float:
    """
    Calculate EV/EBIT multiple.
    
    Args:
        ev: Enterprise value
        ebit: EBIT (trailing or forward)
    
    Returns:
        EV/EBIT multiple, or np.nan if EBIT <= 0
    """
    return safe_divide(ev, ebit)


def p_to_e(price: float, eps: float) -> float:
    """
    Calculate Price-to-Earnings (P/E) ratio.
    
    Can be calculated as:
    - Stock Price / Earnings Per Share, or
    - Market Cap / Net Income
    
    Args:
        price: Stock price or market cap
        eps: Earnings per share or net income
    
    Returns:
        P/E ratio, or np.nan if earnings <= 0
    
    Example:
        >>> p_to_e(50, 2.5)
        20.0
        >>> p_to_e(2000000000, 100000000)  # Using market cap / net income
        20.0
    """
    return safe_divide(price, eps)


def p_to_b(price: float, book_value: float) -> float:
    """
    Calculate Price-to-Book (P/B) ratio.
    
    Args:
        price: Stock price or market cap
        book_value: Book value per share or total equity
    
    Returns:
        P/B ratio, or np.nan if book value <= 0
    """
    return safe_divide(price, book_value)


def p_to_s(price: float, sales: float) -> float:
    """
    Calculate Price-to-Sales (P/S) ratio.
    
    Args:
        price: Stock price or market cap
        sales: Sales per share or total revenue
    
    Returns:
        P/S ratio, or np.nan if sales <= 0
    """
    return safe_divide(price, sales)


def ev_to_fcf(ev: float, fcf: float) -> float:
    """
    Calculate EV/FCF multiple.
    
    Args:
        ev: Enterprise value
        fcf: Free cash flow (unlevered)
    
    Returns:
        EV/FCF multiple, or np.nan if FCF <= 0
    """
    return safe_divide(ev, fcf)


# ============================================================================
# Valuation Ratios & Metrics
# ============================================================================

def ev_from_market_cap(market_cap: float, total_debt: float, cash: float,
                       minorities: float = 0, preferred: float = 0) -> float:
    """
    Calculate enterprise value from market cap.
    
    EV = Market Cap + Total Debt - Cash + Minorities + Preferred
    
    Args:
        market_cap: Market capitalization
        total_debt: Total debt
        cash: Cash and equivalents
        minorities: Minority interests
        preferred: Preferred stock
    
    Returns:
        Enterprise value
    
    Example:
        >>> ev_from_market_cap(2000, 800, 300)
        2500.0
    """
    return market_cap + total_debt - cash + minorities + preferred


def implied_growth_rate(current_price: float, fcf_next: float, 
                       discount_rate: float) -> float:
    """
    Calculate implied perpetual growth rate from current valuation.
    
    Solves for g in: Price = FCF_1 / (r - g)
    
    Args:
        current_price: Current stock price or equity value
        fcf_next: Expected free cash flow next period
        discount_rate: Required return
    
    Returns:
        Implied growth rate
    
    Raises:
        InvalidInputError: If calculation results in g >= r
    
    Example:
        >>> implied_growth_rate(1250, 100, 0.10)
        0.02
    """
    if current_price <= 0 or fcf_next <= 0:
        raise InvalidInputError("Price and FCF must be positive")
    
    # Rearrange: g = r - (FCF_1 / Price)
    g = discount_rate - (fcf_next / current_price)
    
    if g >= discount_rate:
        raise InvalidInputError(
            f"Implied growth rate ({g:.2%}) >= discount rate ({discount_rate:.2%}). "
            "This suggests overvaluation or incorrect inputs."
        )
    
    return g


def reverse_dcf(current_ev: float, wacc: float, initial_fcf: float,
                years: int = 10) -> float:
    """
    Reverse DCF to find implied FCF growth rate.
    
    Assuming constant growth over forecast period, what growth rate
    is implied by the current valuation?
    
    Args:
        current_ev: Current enterprise value
        wacc: Weighted average cost of capital
        initial_fcf: Current or next year's FCF
        years: Forecast period in years
    
    Returns:
        Implied annual FCF growth rate
    """
    # This is a simplified version - more complex with explicit + terminal
    # Would need numerical solver for precise answer
    # Placeholder for now
    raise NotImplementedError("Reverse DCF requires numerical optimization")

