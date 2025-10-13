"""
Equity and dilution calculations.

This module provides:
- Treasury Stock Method (TSM) for option dilution
- Diluted EPS calculation
- Share count calculations
"""

from finmath.core import InvalidInputError, safe_divide


def treasury_stock_method(options_outstanding: float, strike_price: float,
                         current_stock_price: float,
                         shares_basic: float = None) -> float:
    """
    Calculate dilutive shares using Treasury Stock Method.
    
    TSM assumes company uses proceeds from option exercise to buy back shares
    at current market price. Net new shares = options exercised - shares repurchased.
    
    Args:
        options_outstanding: Number of options/warrants outstanding
        strike_price: Exercise/strike price per option
        current_stock_price: Current market price per share
        shares_basic: Basic shares (optional, for returning total diluted)
    
    Returns:
        Net dilutive shares (or total diluted shares if shares_basic provided)
    
    Example:
        >>> treasury_stock_method(100, 10, 20)
        50.0  # 100 options exercised, buy back 50 shares, net 50 dilutive
        
        >>> treasury_stock_method(200, 15, 30, shares_basic=1000)
        1100.0  # 1000 basic + 100 dilutive
        
        >>> treasury_stock_method(100, 25, 20)  # Out of the money
        0.0  # No dilution if strike > current price
    """
    # If options are out of the money, no dilution
    if current_stock_price <= strike_price:
        return shares_basic if shares_basic is not None else 0.0
    
    # Calculate proceeds from exercise
    proceeds = options_outstanding * strike_price
    
    # Shares that could be repurchased with proceeds
    shares_repurchased = proceeds / current_stock_price
    
    # Net new shares
    net_dilutive_shares = options_outstanding - shares_repurchased
    
    if shares_basic is not None:
        return shares_basic + net_dilutive_shares
    
    return net_dilutive_shares


def diluted_shares(shares_basic: float, options_itm: float = 0,
                  strike: float = 0, current_price: float = 0,
                  convertible_shares: float = 0) -> float:
    """
    Calculate fully diluted shares outstanding.
    
    Includes:
    - Basic shares
    - Dilution from in-the-money options (via TSM)
    - Convertible securities
    
    Args:
        shares_basic: Basic shares outstanding
        options_itm: In-the-money options
        strike: Average strike price
        current_price: Current stock price
        convertible_shares: Shares from convertible securities
    
    Returns:
        Fully diluted shares
    
    Example:
        >>> diluted_shares(1000, 100, 10, 20, 50)
        1150.0  # 1000 basic + 50 from options + 50 convertible
    """
    diluted = shares_basic
    
    # Add option dilution via TSM
    if options_itm > 0 and current_price > strike:
        option_dilution = treasury_stock_method(options_itm, strike, current_price)
        diluted += option_dilution
    
    # Add convertible dilution
    diluted += convertible_shares
    
    return diluted


def diluted_eps(net_income: float, shares_diluted: float,
               preferred_dividends: float = 0) -> float:
    """
    Calculate Diluted Earnings Per Share.
    
    Formula: Diluted EPS = (NI - Preferred Dividends) / Diluted Shares
    
    Args:
        net_income: Net income available to common shareholders
        shares_diluted: Fully diluted shares outstanding
        preferred_dividends: Preferred stock dividends (default: 0)
    
    Returns:
        Diluted EPS, or np.nan if shares_diluted <= 0
    
    Example:
        >>> diluted_eps(1000, 500)
        2.0
        >>> diluted_eps(1500, 600, preferred_dividends=100)
        2.3333333333333335
    """
    income_to_common = net_income - preferred_dividends
    return safe_divide(income_to_common, shares_diluted)


def basic_eps(net_income: float, shares_basic: float,
             preferred_dividends: float = 0) -> float:
    """
    Calculate Basic Earnings Per Share.
    
    Formula: Basic EPS = (NI - Preferred Dividends) / Basic Shares
    
    Args:
        net_income: Net income
        shares_basic: Basic shares outstanding
        preferred_dividends: Preferred stock dividends (default: 0)
    
    Returns:
        Basic EPS
    
    Example:
        >>> basic_eps(1000, 500)
        2.0
    """
    income_to_common = net_income - preferred_dividends
    return safe_divide(income_to_common, shares_basic)


def if_converted_method(convertible_debt: float, conversion_ratio: float,
                       interest_saved: float, tax_rate: float,
                       net_income: float, shares_basic: float) -> tuple:
    """
    Calculate dilution from convertible debt using if-converted method.
    
    Assumes conversion happened at start of period:
    - Add back after-tax interest saved to net income
    - Add converted shares to share count
    
    Args:
        convertible_debt: Face value of convertible debt
        conversion_ratio: Shares per $1000 of debt
        interest_saved: Interest expense saved if converted
        tax_rate: Tax rate (decimal)
        net_income: Net income
        shares_basic: Basic shares
    
    Returns:
        Tuple of (adjusted_net_income, adjusted_shares)
    
    Example:
        >>> if_converted_method(1000, 50, 60, 0.25, 1000, 500)
        (1045.0, 550.0)
        >>> # Interest saved after tax: 60 * (1-0.25) = 45
        >>> # Shares from conversion: 1000 / 1000 * 50 = 50
    """
    # After-tax interest add-back
    interest_add_back = interest_saved * (1 - tax_rate)
    adjusted_ni = net_income + interest_add_back
    
    # Shares from conversion
    bonds = convertible_debt / 1000  # Number of $1000 bonds
    converted_shares = bonds * conversion_ratio
    adjusted_shares = shares_basic + converted_shares
    
    return (adjusted_ni, adjusted_shares)


def weighted_average_shares(shares_beginning: float, shares_issued: float,
                           months_outstanding: int, total_months: int = 12) -> float:
    """
    Calculate weighted average shares for EPS calculation.
    
    Args:
        shares_beginning: Shares at beginning of period
        shares_issued: New shares issued during period
        months_outstanding: Months new shares were outstanding
        total_months: Total months in period (default: 12)
    
    Returns:
        Weighted average shares
    
    Example:
        >>> weighted_average_shares(1000, 200, 6, 12)
        1100.0  # 1000 + 200*(6/12)
    """
    if not 0 <= months_outstanding <= total_months:
        raise InvalidInputError(
            f"Months outstanding ({months_outstanding}) must be between 0 and {total_months}"
        )
    
    weight = months_outstanding / total_months
    return shares_beginning + (shares_issued * weight)


def payout_ratio(dividends: float, net_income: float) -> float:
    """
    Calculate dividend payout ratio.
    
    Payout Ratio = Dividends / Net Income
    
    Args:
        dividends: Total dividends paid
        net_income: Net income
    
    Returns:
        Payout ratio as decimal
    
    Example:
        >>> payout_ratio(300, 1000)
        0.3  # 30% payout
    """
    return safe_divide(dividends, net_income)


def retention_ratio(dividends: float, net_income: float) -> float:
    """
    Calculate earnings retention ratio.
    
    Retention Ratio = 1 - Payout Ratio = (NI - Dividends) / NI
    
    Args:
        dividends: Total dividends paid
        net_income: Net income
    
    Returns:
        Retention ratio as decimal
    
    Example:
        >>> retention_ratio(300, 1000)
        0.7  # 70% retained
    """
    return 1 - payout_ratio(dividends, net_income)


def book_value_per_share(total_equity: float, shares_outstanding: float,
                        preferred_equity: float = 0) -> float:
    """
    Calculate book value per share.
    
    BVPS = (Total Equity - Preferred Equity) / Shares Outstanding
    
    Args:
        total_equity: Total shareholders' equity
        shares_outstanding: Common shares outstanding
        preferred_equity: Preferred stock value (default: 0)
    
    Returns:
        Book value per share
    
    Example:
        >>> book_value_per_share(5000, 1000)
        5.0
        >>> book_value_per_share(5000, 1000, preferred_equity=500)
        4.5
    """
    common_equity = total_equity - preferred_equity
    return safe_divide(common_equity, shares_outstanding)

