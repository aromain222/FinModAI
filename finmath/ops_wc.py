"""
Operating Working Capital and Free Cash Flow calculations.

This module provides:
- Operating NWC (excludes cash and debt)
- Change in NWC
- Unlevered Free Cash Flow (UFCF)
"""

from finmath.core import InvalidInputError


def operating_nwc(current_assets: float, current_liabilities: float,
                  cash: float = 0, short_term_debt: float = 0) -> float:
    """
    Calculate Operating Net Working Capital.
    
    Formula: Operating NWC = (CA - Cash) - (CL - ST Debt)
    
    This excludes non-operating items (cash and short-term debt) to focus
    on working capital actually needed for operations.
    
    Args:
        current_assets: Total current assets
        current_liabilities: Total current liabilities
        cash: Cash and cash equivalents (default: 0)
        short_term_debt: Short-term debt portion (default: 0)
    
    Returns:
        Operating net working capital
    
    Example:
        >>> operating_nwc(500, 300, 100, 50)
        150.0
        >>> operating_nwc(1000, 600, 200, 100)
        300.0
    """
    operating_ca = current_assets - cash
    operating_cl = current_liabilities - short_term_debt
    return operating_ca - operating_cl


def delta_nwc(nwc_current: float, nwc_prior: float) -> float:
    """
    Calculate change in Net Working Capital.
    
    Formula: ΔNWC = NWC_t - NWC_{t-1}
    
    Note: An increase in NWC is a use of cash (negative for FCF).
    
    Args:
        nwc_current: NWC in current period
        nwc_prior: NWC in prior period
    
    Returns:
        Change in NWC (positive = increase = cash outflow)
    
    Example:
        >>> delta_nwc(150, 100)
        50.0  # NWC increased by 50 (cash outflow)
        >>> delta_nwc(80, 100)
        -20.0  # NWC decreased by 20 (cash inflow)
    """
    return nwc_current - nwc_prior


def ufcf(ebit: float, tax_rate: float, d_and_a: float,
         capex: float, delta_nwc: float) -> float:
    """
    Calculate Unlevered Free Cash Flow.
    
    Formula: UFCF = EBIT(1-T) + D&A - CapEx - ΔNWC
    
    This is the cash flow available to all capital providers (debt and equity)
    before considering interest payments.
    
    Args:
        ebit: Earnings Before Interest and Taxes
        tax_rate: Effective tax rate (decimal, 0 to 1)
        d_and_a: Depreciation and Amortization (non-cash add-back)
        capex: Capital Expenditures (positive number for cash outflow)
        delta_nwc: Change in Net Working Capital (positive = use of cash)
    
    Returns:
        Unlevered Free Cash Flow
    
    Raises:
        InvalidInputError: If tax_rate not in [0, 1]
    
    Example:
        >>> ufcf(1000, 0.25, 100, 150, 50)
        650.0
        >>> # EBIT=1000, Tax=250, NOPAT=750, +D&A=100, -CapEx=150, -ΔNWC=50 → 650
        
        >>> ufcf(500, 0.21, 80, 100, 20)
        355.0
        >>> # EBIT=500, Tax=105, NOPAT=395, +D&A=80, -CapEx=100, -ΔNWC=20 → 355
    """
    if not 0 <= tax_rate <= 1:
        raise InvalidInputError(
            f"Tax rate must be between 0 and 1. Got {tax_rate}"
        )
    
    # NOPAT = Net Operating Profit After Tax
    nopat = ebit * (1 - tax_rate)
    
    # UFCF = NOPAT + D&A - CapEx - ΔNWC
    return nopat + d_and_a - capex - delta_nwc


def levered_fcf(net_income: float, d_and_a: float, capex: float,
                delta_nwc: float, net_debt_repayment: float = 0) -> float:
    """
    Calculate Levered Free Cash Flow (LFCF).
    
    Formula: LFCF = NI + D&A - CapEx - ΔNWC - Net Debt Repayment
    
    This is the cash flow available to equity holders after debt service.
    
    Args:
        net_income: Net Income (after interest and taxes)
        d_and_a: Depreciation and Amortization
        capex: Capital Expenditures
        delta_nwc: Change in Net Working Capital
        net_debt_repayment: Net debt repayment (positive = paydown)
    
    Returns:
        Levered Free Cash Flow
    
    Example:
        >>> levered_fcf(400, 100, 150, 50, 0)
        300.0
    """
    return net_income + d_and_a - capex - delta_nwc - net_debt_repayment


def nopat(ebit: float, tax_rate: float) -> float:
    """
    Calculate Net Operating Profit After Tax.
    
    Formula: NOPAT = EBIT × (1 - T)
    
    Args:
        ebit: Earnings Before Interest and Taxes
        tax_rate: Tax rate (decimal, 0 to 1)
    
    Returns:
        NOPAT
    
    Example:
        >>> nopat(1000, 0.25)
        750.0
        >>> nopat(500, 0.21)
        395.0
    """
    if not 0 <= tax_rate <= 1:
        raise InvalidInputError(f"Tax rate must be between 0 and 1. Got {tax_rate}")
    
    return ebit * (1 - tax_rate)


def invested_capital(total_assets: float, non_interest_bearing_current_liabilities: float,
                    excess_cash: float = 0) -> float:
    """
    Calculate Invested Capital.
    
    Formula: IC = Total Assets - Non-interest Bearing CL - Excess Cash
    
    This represents the total capital invested in the business.
    
    Args:
        total_assets: Total assets
        non_interest_bearing_current_liabilities: Current liabilities that don't bear interest
        excess_cash: Cash beyond operational needs
    
    Returns:
        Invested capital
    
    Example:
        >>> invested_capital(5000, 800, 200)
        4000.0
    """
    return total_assets - non_interest_bearing_current_liabilities - excess_cash


def roic(nopat: float, invested_capital: float) -> float:
    """
    Calculate Return on Invested Capital.
    
    Formula: ROIC = NOPAT / Invested Capital
    
    Args:
        nopat: Net Operating Profit After Tax
        invested_capital: Total invested capital
    
    Returns:
        ROIC as decimal
    
    Example:
        >>> roic(750, 4000)
        0.1875  # 18.75%
    """
    if invested_capital <= 0:
        raise InvalidInputError("Invested capital must be positive")
    
    return nopat / invested_capital

