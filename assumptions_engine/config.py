"""
Configuration constants for the assumptions engine.
"""

# Default values for missing data
DEFAULT_RISK_FREE_RATE = 0.042  # 4.2%, current 10Y Treasury yield as of 2025
DEFAULT_EQUITY_RISK_PREMIUM = 0.055  # 5.5%, standard ERP for developed markets
DEFAULT_BETA = 1.0  # Default beta if calculation fails
DEFAULT_EFFECTIVE_TAX_RATE = 0.21  # US corporate tax rate
DEFAULT_PRE_TAX_COST_OF_DEBT = 0.06  # 6% pre-tax cost of debt
DEFAULT_TARGET_DEBT_WEIGHT = 0.25  # 25% debt in capital structure
DEFAULT_TERMINAL_GROWTH_RATE = 0.025  # 2.5% terminal growth rate

# Bounds and constraints
REVENUE_GROWTH_MIN = 0.0  # 0% minimum growth rate
REVENUE_GROWTH_MAX = 0.30  # 30% maximum growth rate
BETA_MIN = 0.5  # Minimum beta value
BETA_MAX = 2.0  # Maximum beta value
MARGIN_DRIFT_BPS = 300  # Maximum margin drift in basis points (3%)
TAX_RATE_MIN = 0.10  # 10% minimum tax rate
TAX_RATE_MAX = 0.30  # 30% maximum tax rate
DEBT_WEIGHT_MAX = 0.70  # Maximum debt weight in capital structure
WACC_MIN = 0.06  # 6% minimum WACC
WACC_MAX = 0.14  # 14% maximum WACC
TERMINAL_GROWTH_MIN = 0.02  # 2% minimum terminal growth rate
TERMINAL_GROWTH_MAX = 0.04  # 4% maximum terminal growth rate

# GDP growth rates by region (for terminal growth rates)
GDP_GROWTH_RATES = {
    "US": 0.025,  # 2.5% US GDP growth
    "EU": 0.018,  # 1.8% EU GDP growth
    "UK": 0.020,  # 2.0% UK GDP growth
    "JP": 0.015,  # 1.5% Japan GDP growth
    "CN": 0.045,  # 4.5% China GDP growth
    "IN": 0.060,  # 6.0% India GDP growth
    "BR": 0.030,  # 3.0% Brazil GDP growth
    "RU": 0.025,  # 2.5% Russia GDP growth
}

# Industry-specific parameters
INDUSTRY_PARAMS = {
    "Technology": {
        "ev_ebitda_multiple": 15.0,
        "terminal_growth": 0.035,
        "beta_adjustment": 0.2,  # Add to beta
    },
    "Software": {
        "ev_ebitda_multiple": 18.0,
        "terminal_growth": 0.035,
        "beta_adjustment": 0.3,
    },
    "Healthcare": {
        "ev_ebitda_multiple": 12.0,
        "terminal_growth": 0.030,
        "beta_adjustment": 0.0,
    },
    "Consumer Discretionary": {
        "ev_ebitda_multiple": 10.0,
        "terminal_growth": 0.025,
        "beta_adjustment": 0.1,
    },
    "Consumer Staples": {
        "ev_ebitda_multiple": 11.0,
        "terminal_growth": 0.020,
        "beta_adjustment": -0.2,
    },
    "Energy": {
        "ev_ebitda_multiple": 8.0,
        "terminal_growth": 0.020,
        "beta_adjustment": 0.2,
    },
    "Financials": {
        "ev_ebitda_multiple": 9.0,
        "terminal_growth": 0.025,
        "beta_adjustment": 0.1,
    },
    "Industrials": {
        "ev_ebitda_multiple": 10.0,
        "terminal_growth": 0.025,
        "beta_adjustment": 0.0,
    },
    "Materials": {
        "ev_ebitda_multiple": 8.0,
        "terminal_growth": 0.020,
        "beta_adjustment": 0.1,
    },
    "Real Estate": {
        "ev_ebitda_multiple": 15.0,
        "terminal_growth": 0.025,
        "beta_adjustment": -0.1,
    },
    "Telecommunications": {
        "ev_ebitda_multiple": 7.0,
        "terminal_growth": 0.020,
        "beta_adjustment": -0.1,
    },
    "Utilities": {
        "ev_ebitda_multiple": 9.0,
        "terminal_growth": 0.020,
        "beta_adjustment": -0.3,
    },
}

# Default industry parameters if industry is unknown
DEFAULT_INDUSTRY_PARAMS = {
    "ev_ebitda_multiple": 10.0,
    "terminal_growth": 0.025,
    "beta_adjustment": 0.0,
}

# API configuration
API_CACHE_TTL = 86400  # 24 hours cache TTL in seconds
API_RETRY_COUNT = 3  # Number of retries for API calls
API_RETRY_DELAY = 2  # Initial delay between retries in seconds
