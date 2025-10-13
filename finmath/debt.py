"""
Debt mathematics for LBO and leveraged finance models.

This module provides:
- Amortization schedules
- Interest calculations (cash and PIK)
- Revolver sweep logic
- Covenant checks (leverage, coverage ratios)
"""

import pandas as pd
import numpy as np
from finmath.core import InvalidInputError, safe_divide, validate_positive


def amortize(principal: float, rate: float, years: int,
             payments_per_year: int = 1) -> pd.DataFrame:
    """
    Generate amortization schedule for a loan.
    
    Args:
        principal: Initial loan amount
        rate: Annual interest rate (decimal)
        years: Loan term in years
        payments_per_year: Payment frequency (default: 1 = annual)
    
    Returns:
        DataFrame with columns: period, payment, interest, principal, balance
    
    Raises:
        InvalidInputError: If invalid parameters
    
    Example:
        >>> df = amortize(1000, 0.06, 3, payments_per_year=1)
        >>> df[['period', 'payment', 'balance']].round(2)
           period  payment  balance
        0       1   374.11   685.89
        1       2   374.11   353.14
        2       3   374.11     0.00
    """
    validate_positive(principal, "Principal")
    
    if years <= 0:
        raise InvalidInputError("Years must be positive")
    
    if payments_per_year <= 0:
        raise InvalidInputError("Payments per year must be positive")
    
    n_payments = years * payments_per_year
    period_rate = rate / payments_per_year
    
    # Calculate payment amount using annuity formula
    if abs(period_rate) < 1e-10:
        # Zero rate: equal principal payments
        payment = principal / n_payments
    else:
        # Standard annuity formula
        payment = principal * (period_rate * (1 + period_rate)**n_payments) / \
                  ((1 + period_rate)**n_payments - 1)
    
    schedule = []
    balance = principal
    
    for period in range(1, int(n_payments) + 1):
        interest = balance * period_rate
        principal_payment = payment - interest
        balance = max(0, balance - principal_payment)  # Avoid negative due to rounding
        
        schedule.append({
            'period': period,
            'payment': payment,
            'interest': interest,
            'principal': principal_payment,
            'balance': balance
        })
    
    return pd.DataFrame(schedule)


def interest_expense(avg_balance: float, rate: float, period_fraction: float = 1.0) -> float:
    """
    Calculate interest expense for a period.
    
    Args:
        avg_balance: Average outstanding balance during period
        rate: Annual interest rate (decimal)
        period_fraction: Fraction of year (default: 1.0 for full year)
    
    Returns:
        Interest expense
    
    Example:
        >>> interest_expense(1000, 0.06)
        60.0
        >>> interest_expense(500, 0.08, 0.5)  # Half year
        20.0
    """
    return avg_balance * rate * period_fraction


def pik_interest(balance: float, pik_rate: float) -> float:
    """
    Calculate Payment-In-Kind (PIK) interest.
    
    PIK interest is added to principal rather than paid in cash.
    
    Args:
        balance: Current outstanding balance
        pik_rate: PIK interest rate (decimal)
    
    Returns:
        PIK interest amount (to be added to balance)
    
    Example:
        >>> pik_interest(1000, 0.12)
        120.0
        >>> # New balance would be 1120
    """
    return balance * pik_rate


def revolver_sweep(excess_fcf: float, revolver_balance: float,
                   sweep_percentage: float = 1.0,
                   max_paydown: float = None) -> tuple:
    """
    Apply cash sweep to revolver paydown.
    
    Common in LBO models: excess cash pays down revolver first.
    
    Args:
        excess_fcf: Excess free cash flow available
        revolver_balance: Current revolver balance
        sweep_percentage: % of excess cash to apply (default: 1.0 = 100%)
        max_paydown: Maximum paydown allowed (optional cap)
    
    Returns:
        Tuple of (remaining_fcf, new_revolver_balance)
    
    Example:
        >>> revolver_sweep(100, 300)
        (0.0, 200.0)  # All 100 pays down revolver
        
        >>> revolver_sweep(400, 300)
        (100.0, 0.0)  # Revolver paid off, 100 remains
        
        >>> revolver_sweep(150, 300, sweep_percentage=0.5)
        (75.0, 225.0)  # Only 50% swept (75 paydown)
    """
    if excess_fcf < 0:
        raise InvalidInputError("Excess FCF cannot be negative for sweep")
    
    if revolver_balance < 0:
        raise InvalidInputError("Revolver balance cannot be negative")
    
    if not 0 <= sweep_percentage <= 1:
        raise InvalidInputError("Sweep percentage must be between 0 and 1")
    
    # Calculate amount available for paydown
    available_for_sweep = excess_fcf * sweep_percentage
    
    # Apply max paydown cap if specified
    if max_paydown is not None:
        available_for_sweep = min(available_for_sweep, max_paydown)
    
    # Paydown limited by revolver balance
    actual_paydown = min(available_for_sweep, revolver_balance)
    
    remaining_fcf = excess_fcf - actual_paydown
    new_revolver_balance = revolver_balance - actual_paydown
    
    return (remaining_fcf, new_revolver_balance)


# ============================================================================
# Covenant Checks
# ============================================================================

def net_debt_to_ebitda(total_debt: float, cash: float, ebitda: float) -> float:
    """
    Calculate Net Debt / EBITDA leverage ratio.
    
    Common covenant in credit agreements.
    
    Args:
        total_debt: Total debt outstanding
        cash: Cash and cash equivalents
        ebitda: EBITDA (Earnings Before Interest, Taxes, D&A)
    
    Returns:
        Leverage ratio (returns np.nan if EBITDA <= 0)
    
    Example:
        >>> net_debt_to_ebitda(1000, 200, 250)
        3.2  # 3.2x levered
        >>> net_debt_to_ebitda(500, 100, 200)
        2.0
    """
    net_debt = total_debt - cash
    return safe_divide(net_debt, ebitda)


def interest_coverage(ebitda: float, cash_interest: float) -> float:
    """
    Calculate Interest Coverage Ratio (EBITDA / Interest).
    
    Measures ability to service interest with operating cash flow.
    
    Args:
        ebitda: EBITDA
        cash_interest: Cash interest expense
    
    Returns:
        Coverage ratio (returns np.nan if interest <= 0)
    
    Example:
        >>> interest_coverage(300, 50)
        6.0  # 6.0x covered
        >>> interest_coverage(200, 40)
        5.0
    """
    return safe_divide(ebitda, cash_interest)


def fixed_charge_coverage(ebitda: float, cash_interest: float,
                         required_amortization: float, capex: float = 0) -> float:
    """
    Calculate Fixed Charge Coverage Ratio.
    
    Formula: (EBITDA - CapEx) / (Interest + Amortization)
    
    More stringent than interest coverage as it includes principal payments.
    
    Args:
        ebitda: EBITDA
        cash_interest: Cash interest expense
        required_amortization: Mandatory principal repayment
        capex: Maintenance capital expenditure (default: 0)
    
    Returns:
        Coverage ratio
    
    Example:
        >>> fixed_charge_coverage(300, 40, 60, 50)
        2.5  # (300-50)/(40+60) = 2.5x
    """
    numerator = ebitda - capex
    denominator = cash_interest + required_amortization
    return safe_divide(numerator, denominator)


def debt_service_coverage(operating_cash_flow: float, debt_service: float) -> float:
    """
    Calculate Debt Service Coverage Ratio.
    
    DSCR = Operating Cash Flow / Total Debt Service (Interest + Principal)
    
    Args:
        operating_cash_flow: Cash flow from operations
        debt_service: Total debt service (interest + principal payments)
    
    Returns:
        DSCR ratio
    
    Example:
        >>> debt_service_coverage(500, 400)
        1.25
    """
    return safe_divide(operating_cash_flow, debt_service)


def total_debt_to_capital(total_debt: float, total_equity: float) -> float:
    """
    Calculate Total Debt / Total Capital ratio.
    
    Args:
        total_debt: Total debt outstanding
        total_equity: Book or market value of equity
    
    Returns:
        Debt-to-capital ratio (decimal)
    
    Example:
        >>> total_debt_to_capital(300, 700)
        0.3  # 30% debt
    """
    total_capital = total_debt + total_equity
    return safe_divide(total_debt, total_capital)


def debt_yield(noi: float, loan_amount: float) -> float:
    """
    Calculate Debt Yield (common in real estate finance).
    
    Debt Yield = NOI / Loan Amount
    
    Args:
        noi: Net Operating Income
        loan_amount: Total loan amount
    
    Returns:
        Debt yield as decimal
    
    Example:
        >>> debt_yield(100, 1000)
        0.1  # 10% debt yield
    """
    return safe_divide(noi, loan_amount)


def ltv(loan_amount: float, property_value: float) -> float:
    """
    Calculate Loan-to-Value ratio.
    
    Args:
        loan_amount: Loan amount
        property_value: Property or asset value
    
    Returns:
        LTV as decimal
    
    Example:
        >>> ltv(800, 1000)
        0.8  # 80% LTV
    """
    return safe_divide(loan_amount, property_value)

