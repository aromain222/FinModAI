"""
Statistical functions for finance.

This module provides:
- OLS beta regression against market returns
- Winsorization for outlier handling
- Z-scores and statistical metrics
"""

import numpy as np
from scipy import stats
from finmath.core import InvalidInputError


def beta_ols(asset_returns: np.ndarray, market_returns: np.ndarray,
             winsorize: bool = True, min_observations: int = 52) -> float:
    """
    Calculate beta via Ordinary Least Squares regression.
    
    Beta measures systematic risk: sensitivity of asset returns to market returns.
    Typically uses 2-5 years of weekly or monthly returns.
    
    Args:
        asset_returns: Asset return series (e.g., weekly stock returns)
        market_returns: Market return series (e.g., S&P 500 returns)
        winsorize: Apply 1%/99% winsorization to handle outliers (default: True)
        min_observations: Minimum required observations (default: 52 for weekly)
    
    Returns:
        Beta coefficient (slope of regression line)
    
    Raises:
        InvalidInputError: If insufficient observations or length mismatch
    
    Example:
        >>> asset = np.array([0.02, -0.01, 0.03, 0.01, -0.02, 0.04] * 10)
        >>> market = np.array([0.015, -0.005, 0.025, 0.008, -0.015, 0.03] * 10)
        >>> beta_ols(asset, market)
        1.18...  # Beta around 1.2 (more volatile than market)
    """
    # Validate inputs
    if len(asset_returns) < min_observations:
        raise InvalidInputError(
            f"Need at least {min_observations} observations for beta calculation. "
            f"Got {len(asset_returns)}"
        )
    
    if len(asset_returns) != len(market_returns):
        raise InvalidInputError(
            f"Return series must have same length. "
            f"Asset: {len(asset_returns)}, Market: {len(market_returns)}"
        )
    
    # Remove NaN values
    valid_mask = ~(np.isnan(asset_returns) | np.isnan(market_returns))
    asset_clean = asset_returns[valid_mask]
    market_clean = market_returns[valid_mask]
    
    if len(asset_clean) < min_observations:
        raise InvalidInputError(
            f"After removing NaN, only {len(asset_clean)} observations remain. "
            f"Need at least {min_observations}"
        )
    
    # Winsorize outliers
    if winsorize:
        asset_clean = winsorize_array(asset_clean, (0.01, 0.99))
        market_clean = winsorize_array(market_clean, (0.01, 0.99))
    
    # OLS regression: asset_returns = alpha + beta * market_returns + epsilon
    slope, intercept, r_value, p_value, std_err = \
        stats.linregress(market_clean, asset_clean)
    
    return slope


def winsorize_array(data: np.ndarray, limits: tuple = (0.01, 0.99)) -> np.ndarray:
    """
    Winsorize data at specified percentile limits.
    
    Replaces extreme values with the values at the percentile thresholds.
    More robust than truncation as it preserves sample size.
    
    Args:
        data: Input array
        limits: Tuple of (lower_percentile, upper_percentile) as decimals
    
    Returns:
        Winsorized array
    
    Example:
        >>> data = np.array([1, 2, 3, 4, 5, 100])  # 100 is outlier
        >>> winsorize_array(data, (0.1, 0.9))
        array([ 1.5,  2. ,  3. ,  4. ,  5. , 14.5])  # 100 → 14.5 (90th percentile)
    """
    lower_pct = limits[0] * 100
    upper_pct = limits[1] * 100
    
    lower_val = np.percentile(data, lower_pct)
    upper_val = np.percentile(data, upper_pct)
    
    return np.clip(data, lower_val, upper_val)


def z_score(value: float, mean: float, std: float) -> float:
    """
    Calculate z-score (standardized score).
    
    Formula: z = (x - μ) / σ
    
    Measures how many standard deviations a value is from the mean.
    
    Args:
        value: Value to standardize
        mean: Population or sample mean
        std: Standard deviation
    
    Returns:
        Z-score
    
    Raises:
        InvalidInputError: If std <= 0
    
    Example:
        >>> z_score(110, 100, 10)
        1.0  # 1 std dev above mean
        >>> z_score(85, 100, 15)
        -1.0  # 1 std dev below mean
    """
    if std <= 0:
        raise InvalidInputError(f"Standard deviation must be positive. Got {std}")
    
    return (value - mean) / std


def correlation(x: np.ndarray, y: np.ndarray) -> float:
    """
    Calculate Pearson correlation coefficient.
    
    Args:
        x: First variable
        y: Second variable
    
    Returns:
        Correlation coefficient [-1, 1]
    
    Example:
        >>> x = np.array([1, 2, 3, 4, 5])
        >>> y = np.array([2, 4, 6, 8, 10])
        >>> correlation(x, y)
        1.0  # Perfect positive correlation
    """
    if len(x) != len(y):
        raise InvalidInputError("Arrays must have same length")
    
    return float(np.corrcoef(x, y)[0, 1])


def covariance(x: np.ndarray, y: np.ndarray) -> float:
    """
    Calculate covariance between two return series.
    
    Args:
        x: First return series
        y: Second return series
    
    Returns:
        Covariance
    
    Example:
        >>> x = np.array([0.01, 0.02, -0.01])
        >>> y = np.array([0.015, 0.025, -0.005])
        >>> covariance(x, y)
        0.000225
    """
    if len(x) != len(y):
        raise InvalidInputError("Arrays must have same length")
    
    return float(np.cov(x, y)[0, 1])


def sharpe_ratio(returns: np.ndarray, risk_free_rate: float = 0) -> float:
    """
    Calculate Sharpe ratio.
    
    Formula: Sharpe = (Mean Return - Rf) / Std Dev of Returns
    
    Measures risk-adjusted return.
    
    Args:
        returns: Return series
        risk_free_rate: Risk-free rate (default: 0)
    
    Returns:
        Sharpe ratio
    
    Example:
        >>> returns = np.array([0.10, 0.15, 0.08, 0.12, 0.11])
        >>> sharpe_ratio(returns, 0.02)
        3.2...
    """
    mean_return = np.mean(returns)
    std_return = np.std(returns, ddof=1)  # Sample std dev
    
    if std_return == 0:
        return np.inf if mean_return > risk_free_rate else 0.0
    
    return (mean_return - risk_free_rate) / std_return


def sortino_ratio(returns: np.ndarray, target_return: float = 0) -> float:
    """
    Calculate Sortino ratio.
    
    Similar to Sharpe but only penalizes downside volatility.
    
    Args:
        returns: Return series
        target_return: Target or minimum acceptable return (default: 0)
    
    Returns:
        Sortino ratio
    
    Example:
        >>> returns = np.array([0.10, 0.15, -0.05, 0.12, 0.11])
        >>> sortino_ratio(returns, 0)
        3.5...
    """
    mean_return = np.mean(returns)
    
    # Downside deviation: only consider returns below target
    downside_returns = returns[returns < target_return]
    
    if len(downside_returns) == 0:
        return np.inf
    
    downside_std = np.std(downside_returns, ddof=1)
    
    if downside_std == 0:
        return np.inf if mean_return > target_return else 0.0
    
    return (mean_return - target_return) / downside_std


def max_drawdown(cumulative_returns: np.ndarray) -> float:
    """
    Calculate maximum drawdown from peak.
    
    Args:
        cumulative_returns: Cumulative return series (e.g., [1.0, 1.1, 1.05, 1.15])
    
    Returns:
        Maximum drawdown as positive decimal
    
    Example:
        >>> cum_returns = np.array([1.0, 1.2, 1.1, 1.3, 0.9, 1.0])
        >>> max_drawdown(cum_returns)
        0.3076923076923077  # ~30.8% drawdown from peak of 1.3 to 0.9
    """
    running_max = np.maximum.accumulate(cumulative_returns)
    drawdowns = (cumulative_returns - running_max) / running_max
    return float(abs(np.min(drawdowns)))


def information_ratio(portfolio_returns: np.ndarray, benchmark_returns: np.ndarray) -> float:
    """
    Calculate Information Ratio.
    
    IR = Mean(Active Returns) / Std(Active Returns)
    
    Measures risk-adjusted active return vs. benchmark.
    
    Args:
        portfolio_returns: Portfolio return series
        benchmark_returns: Benchmark return series
    
    Returns:
        Information ratio
    
    Example:
        >>> portfolio = np.array([0.10, 0.12, 0.09, 0.11])
        >>> benchmark = np.array([0.08, 0.10, 0.08, 0.09])
        >>> information_ratio(portfolio, benchmark)
        2.0
    """
    if len(portfolio_returns) != len(benchmark_returns):
        raise InvalidInputError("Return series must have same length")
    
    active_returns = portfolio_returns - benchmark_returns
    mean_active = np.mean(active_returns)
    std_active = np.std(active_returns, ddof=1)
    
    if std_active == 0:
        return np.inf if mean_active > 0 else 0.0
    
    return mean_active / std_active


def tracking_error(portfolio_returns: np.ndarray, benchmark_returns: np.ndarray) -> float:
    """
    Calculate tracking error (volatility of active returns).
    
    Args:
        portfolio_returns: Portfolio return series
        benchmark_returns: Benchmark return series
    
    Returns:
        Tracking error (annualized if using annual returns)
    
    Example:
        >>> portfolio = np.array([0.10, 0.12, 0.09, 0.11])
        >>> benchmark = np.array([0.08, 0.10, 0.08, 0.09])
        >>> tracking_error(portfolio, benchmark)
        0.01...
    """
    if len(portfolio_returns) != len(benchmark_returns):
        raise InvalidInputError("Return series must have same length")
    
    active_returns = portfolio_returns - benchmark_returns
    return float(np.std(active_returns, ddof=1))


def var_historical(returns: np.ndarray, confidence: float = 0.95) -> float:
    """
    Calculate Value at Risk using historical method.
    
    VaR is the maximum expected loss at a given confidence level.
    
    Args:
        returns: Historical return series
        confidence: Confidence level (default: 0.95 for 95%)
    
    Returns:
        VaR as positive number (loss)
    
    Example:
        >>> returns = np.array([0.02, -0.01, 0.03, -0.05, 0.01, -0.02])
        >>> var_historical(returns, 0.95)
        0.05  # 5% max loss at 95% confidence
    """
    if not 0 < confidence < 1:
        raise InvalidInputError(f"Confidence must be between 0 and 1. Got {confidence}")
    
    percentile = (1 - confidence) * 100
    var = np.percentile(returns, percentile)
    
    return float(abs(var))


def cvar_historical(returns: np.ndarray, confidence: float = 0.95) -> float:
    """
    Calculate Conditional VaR (Expected Shortfall).
    
    CVaR is the expected loss given that VaR threshold is breached.
    
    Args:
        returns: Historical return series
        confidence: Confidence level (default: 0.95)
    
    Returns:
        CVaR as positive number (expected loss in tail)
    
    Example:
        >>> returns = np.array([0.02, -0.01, 0.03, -0.08, 0.01, -0.05, -0.06])
        >>> cvar_historical(returns, 0.95)
        0.063...  # Expected loss in worst 5% scenarios
    """
    var = var_historical(returns, confidence)
    
    # Find returns worse than VaR threshold
    tail_returns = returns[returns <= -var]
    
    if len(tail_returns) == 0:
        return float(var)
    
    return float(abs(np.mean(tail_returns)))

