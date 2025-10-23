"""
Validation Rules
Custom assumptions validation and sanity checks
"""

from typing import Dict, Any, List, Tuple
from decimal import Decimal
from pydantic import BaseModel


class ValidationError(Exception):
    """Validation error with details"""

    def __init__(self, message: str, code: str, field: str = None):
        self.message = message
        self.code = code
        self.field = field
        super().__init__(self.message)


class ValidationWarning(BaseModel):
    """Validation warning"""

    message: str
    code: str
    field: str = None


def validate_dcf_assumptions(
    assumptions: Dict[str, Any],
) -> Tuple[List[ValidationError], List[ValidationWarning]]:
    """
    Validate DCF custom assumptions

    Args:
        assumptions: Custom assumptions dictionary

    Returns:
        Tuple of (errors, warnings)
    """
    errors = []
    warnings = []

    # Revenue CAGR validation
    if "revenue_cagr_1_5" in assumptions:
        cagr = Decimal(str(assumptions["revenue_cagr_1_5"]))
        if cagr < 0 or cagr > 1:
            errors.append(
                ValidationError(
                    "Revenue CAGR must be between 0% and 100%",
                    "invalid_range",
                    "revenue_cagr_1_5",
                )
            )
        elif cagr > 0.5:
            warnings.append(
                ValidationWarning(
                    "Revenue CAGR > 50% is unusually high",
                    "high_growth",
                    "revenue_cagr_1_5",
                )
            )

    # WACC validation
    if "wacc" in assumptions:
        wacc = Decimal(str(assumptions["wacc"]))
        if wacc <= 0 or wacc > 1:
            errors.append(
                ValidationError("WACC must be between 0% and 100%", "invalid_range", "wacc")
            )
        elif wacc > 0.25:
            warnings.append(ValidationWarning("WACC > 25% is unusually high", "high_wacc", "wacc"))

    # Terminal growth validation
    if "terminal_growth" in assumptions:
        terminal_growth = Decimal(str(assumptions["terminal_growth"]))
        if terminal_growth < 0 or terminal_growth > 1:
            errors.append(
                ValidationError(
                    "Terminal growth must be between 0% and 100%",
                    "invalid_range",
                    "terminal_growth",
                )
            )

        # Check terminal growth < WACC
        wacc = Decimal(str(assumptions.get("wacc", 0.10)))
        if terminal_growth >= wacc:
            errors.append(
                ValidationError(
                    f"Terminal growth ({terminal_growth:.1%}) must be less than WACC ({wacc:.1%})",
                    "terminal_growth_exceeds_wacc",
                    "terminal_growth",
                )
            )

    # CapEx % revenue validation
    if "capex_pct_sales" in assumptions:
        capex_pct = Decimal(str(assumptions["capex_pct_sales"]))
        if capex_pct < 0 or capex_pct > 1:
            errors.append(
                ValidationError(
                    "CapEx % revenue must be between 0% and 100%",
                    "invalid_range",
                    "capex_pct_sales",
                )
            )
        elif capex_pct > 0.3:
            warnings.append(
                ValidationWarning(
                    "CapEx > 30% of revenue is unusually high",
                    "high_capex",
                    "capex_pct_sales",
                )
            )

    # ΔNWC % revenue validation
    if "delta_nwc_pct_sales" in assumptions:
        delta_nwc_pct = Decimal(str(assumptions["delta_nwc_pct_sales"]))
        if delta_nwc_pct < -1 or delta_nwc_pct > 1:
            errors.append(
                ValidationError(
                    "ΔNWC % revenue must be between -100% and 100%",
                    "invalid_range",
                    "delta_nwc_pct_sales",
                )
            )

    # Target margin validation
    if "target_margin_ebit" in assumptions:
        margin = Decimal(str(assumptions["target_margin_ebit"]))
        if margin < 0 or margin > 1:
            errors.append(
                ValidationError(
                    "Target EBIT margin must be between 0% and 100%",
                    "invalid_range",
                    "target_margin_ebit",
                )
            )

    if "target_margin_ebitda" in assumptions:
        margin = Decimal(str(assumptions["target_margin_ebitda"]))
        if margin < 0 or margin > 1:
            errors.append(
                ValidationError(
                    "Target EBITDA margin must be between 0% and 100%",
                    "invalid_range",
                    "target_margin_ebitda",
                )
            )

    return errors, warnings


def validate_lbo_assumptions(
    assumptions: Dict[str, Any],
) -> Tuple[List[ValidationError], List[ValidationWarning]]:
    """
    Validate LBO custom assumptions

    Args:
        assumptions: Custom assumptions dictionary

    Returns:
        Tuple of (errors, warnings)
    """
    errors = []
    warnings = []

    # Entry multiple validation
    if "entry_multiple" in assumptions:
        entry_multiple = Decimal(str(assumptions["entry_multiple"]))
        if entry_multiple <= 0 or entry_multiple > 50:
            errors.append(
                ValidationError(
                    "Entry multiple must be between 0 and 50x",
                    "invalid_range",
                    "entry_multiple",
                )
            )

    # Exit multiple validation
    if "exit_multiple" in assumptions:
        exit_multiple = Decimal(str(assumptions["exit_multiple"]))
        if exit_multiple <= 0 or exit_multiple > 50:
            errors.append(
                ValidationError(
                    "Exit multiple must be between 0 and 50x",
                    "invalid_range",
                    "exit_multiple",
                )
            )

        # Check exit > entry
        entry_multiple = Decimal(str(assumptions.get("entry_multiple", 10)))
        if exit_multiple < entry_multiple:
            warnings.append(
                ValidationWarning(
                    f"Exit multiple ({exit_multiple:.1f}x) is less than entry multiple ({entry_multiple:.1f}x)",
                    "exit_below_entry",
                    "exit_multiple",
                )
            )

    # Leverage ratio validation
    if "leverage_ratio" in assumptions:
        leverage = Decimal(str(assumptions["leverage_ratio"]))
        if leverage < 0 or leverage > 1:
            errors.append(
                ValidationError(
                    "Leverage ratio must be between 0% and 100%",
                    "invalid_range",
                    "leverage_ratio",
                )
            )
        elif leverage > 0.85:
            warnings.append(
                ValidationWarning("Leverage > 85% is very high", "high_leverage", "leverage_ratio")
            )

    # Interest rate validation
    if "interest_rate" in assumptions:
        interest_rate = Decimal(str(assumptions["interest_rate"]))
        if interest_rate < 0 or interest_rate > 1:
            errors.append(
                ValidationError(
                    "Interest rate must be between 0% and 100%",
                    "invalid_range",
                    "interest_rate",
                )
            )

    # Tax rate validation
    if "tax_rate" in assumptions:
        tax_rate = Decimal(str(assumptions["tax_rate"]))
        if tax_rate < 0 or tax_rate > 1:
            errors.append(
                ValidationError("Tax rate must be between 0% and 100%", "invalid_range", "tax_rate")
            )

    return errors, warnings


def validate_comps_assumptions(
    assumptions: Dict[str, Any],
) -> Tuple[List[ValidationError], List[ValidationWarning]]:
    """
    Validate Comps custom assumptions

    Args:
        assumptions: Custom assumptions dictionary

    Returns:
        Tuple of (errors, warnings)
    """
    errors = []
    warnings = []

    # Peer tickers validation
    if "peer_tickers" in assumptions:
        peer_tickers = assumptions["peer_tickers"]
        if not isinstance(peer_tickers, list):
            errors.append(
                ValidationError("Peer tickers must be a list", "invalid_type", "peer_tickers")
            )
        elif len(peer_tickers) < 2:
            errors.append(
                ValidationError(
                    "At least 2 peer tickers required",
                    "insufficient_peers",
                    "peer_tickers",
                )
            )
        elif len(peer_tickers) > 20:
            warnings.append(
                ValidationWarning(
                    "More than 20 peer tickers may be excessive",
                    "too_many_peers",
                    "peer_tickers",
                )
            )

    return errors, warnings


def validate_merger_assumptions(
    assumptions: Dict[str, Any],
) -> Tuple[List[ValidationError], List[ValidationWarning]]:
    """
    Validate Merger custom assumptions

    Args:
        assumptions: Custom assumptions dictionary

    Returns:
        Tuple of (errors, warnings)
    """
    errors = []
    warnings = []

    # Premium % validation
    if "premium_pct" in assumptions:
        premium = Decimal(str(assumptions["premium_pct"]))
        if premium < 0 or premium > 1:
            errors.append(
                ValidationError(
                    "Premium % must be between 0% and 100%",
                    "invalid_range",
                    "premium_pct",
                )
            )
        elif premium > 0.5:
            warnings.append(
                ValidationWarning("Premium > 50% is unusually high", "high_premium", "premium_pct")
            )

    # Synergy % validation
    if "synergy_pct" in assumptions:
        synergy = Decimal(str(assumptions["synergy_pct"]))
        if synergy < 0 or synergy > 1:
            errors.append(
                ValidationError(
                    "Synergy % must be between 0% and 100%",
                    "invalid_range",
                    "synergy_pct",
                )
            )
        elif synergy > 0.3:
            warnings.append(
                ValidationWarning("Synergy > 30% is unusually high", "high_synergy", "synergy_pct")
            )

    # Consideration mix validation
    if "consideration_mix" in assumptions:
        mix = assumptions["consideration_mix"]
        if not isinstance(mix, dict):
            errors.append(
                ValidationError(
                    "Consideration mix must be a dictionary",
                    "invalid_type",
                    "consideration_mix",
                )
            )
        else:
            cash_pct = Decimal(str(mix.get("cash", 0)))
            stock_pct = Decimal(str(mix.get("stock", 0)))

            if cash_pct < 0 or cash_pct > 1:
                errors.append(
                    ValidationError(
                        "Cash % must be between 0% and 100%",
                        "invalid_range",
                        "consideration_mix.cash",
                    )
                )

            if stock_pct < 0 or stock_pct > 1:
                errors.append(
                    ValidationError(
                        "Stock % must be between 0% and 100%",
                        "invalid_range",
                        "consideration_mix.stock",
                    )
                )

            total = cash_pct + stock_pct
            if abs(total - 1.0) > 0.01:  # Allow small floating point errors
                errors.append(
                    ValidationError(
                        f"Consideration mix must sum to 100% (currently {total:.1%})",
                        "invalid_sum",
                        "consideration_mix",
                    )
                )

    return errors, warnings


def validate_sanity_checks(model_data: Dict[str, Any], model_type: str) -> List[ValidationWarning]:
    """
    Run sanity checks on model results

    Args:
        model_data: Model results dictionary
        model_type: Type of model (dcf, lbo, comps, merger)

    Returns:
        List of warnings
    """
    warnings = []

    if model_type == "dcf":
        # Check terminal value as % of EV
        pv_terminal_value = model_data.get("pv_terminal_value", 0)
        enterprise_value = model_data.get("enterprise_value", 1)

        if enterprise_value > 0:
            terminal_pct = pv_terminal_value / enterprise_value
            if terminal_pct > 0.8:
                warnings.append(
                    ValidationWarning(
                        f"Terminal value is {terminal_pct:.1%} of EV (typically < 80%)",
                        "high_terminal_value",
                        "terminal_value",
                    )
                )

        # Check market cap consistency
        implied_price = model_data.get("implied_price", 0)
        current_price = model_data.get("current_price", 1)

        if current_price > 0:
            price_diff_pct = abs(implied_price - current_price) / current_price
            if price_diff_pct > 0.15:
                warnings.append(
                    ValidationWarning(
                        f"Implied price differs from current price by {price_diff_pct:.1%}",
                        "price_inconsistency",
                        "implied_price",
                    )
                )

    elif model_type == "lbo":
        # Check leverage ratios
        debt_ebitda = model_data.get("debt_ebitda", 0)
        if debt_ebitda > 10:
            warnings.append(
                ValidationWarning(
                    f"Debt/EBITDA is {debt_ebitda:.1f}x (typically < 10x)",
                    "high_leverage",
                    "debt_ebitda",
                )
            )

        # Check IRR
        irr = model_data.get("irr", 0)
        if irr < 0:
            warnings.append(
                ValidationWarning(f"IRR is negative ({irr:.1%})", "negative_irr", "irr")
            )

    elif model_type == "comps":
        # Check peer count
        peer_multiples = model_data.get("peer_multiples", [])
        if len(peer_multiples) < 3:
            warnings.append(
                ValidationWarning(
                    f"Only {len(peer_multiples)} peers available (recommend ≥ 3)",
                    "insufficient_peers",
                    "peer_multiples",
                )
            )

    return warnings
