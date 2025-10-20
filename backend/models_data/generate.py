"""
Model Generation Engine
Execute financial models and generate results
"""

from typing import Dict, Any, List
from decimal import Decimal
from .bundles import (
    DCFFields,
    LBOFields,
    CompsFields,
    MergerFields,
)
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))


def generate_dcf_model(
    bundle: DCFFields, custom_assumptions: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Generate DCF model results

    Args:
        bundle: DCF input bundle
        custom_assumptions: Optional custom assumptions

    Returns:
        DCF model results
    """
    # Extract inputs
    historicals = bundle.historicals
    market = bundle.market
    capital = bundle.capital

    # Calculate historical growth rates
    if len(historicals) >= 2:
        revenue_growth = calculate_cagr(
            historicals[0].revenue or 0, historicals[-1].revenue or 0, len(historicals)
        )
        ebitda_growth = calculate_cagr(
            historicals[0].ebitda or 0, historicals[-1].ebitda or 0, len(historicals)
        )
    else:
        revenue_growth = Decimal("0.10")
        ebitda_growth = Decimal("0.15")

    # Apply custom assumptions if provided
    if custom_assumptions:
        revenue_growth = Decimal(
            str(custom_assumptions.get("revenue_cagr_1_5", revenue_growth))
        )
        ebitda_growth = Decimal(
            str(custom_assumptions.get("ebitda_cagr", ebitda_growth))
        )

    # Default assumptions
    wacc = (
        Decimal(str(custom_assumptions.get("wacc", "0.10")))
        if custom_assumptions
        else Decimal("0.10")
    )
    terminal_growth = (
        Decimal(str(custom_assumptions.get("terminal_growth", "0.025")))
        if custom_assumptions
        else Decimal("0.025")
    )
    capex_pct_sales = (
        Decimal(str(custom_assumptions.get("capex_pct_sales", "0.05")))
        if custom_assumptions
        else Decimal("0.05")
    )
    delta_nwc_pct_sales = (
        Decimal(str(custom_assumptions.get("delta_nwc_pct_sales", "0.01")))
        if custom_assumptions
        else Decimal("0.01")
    )

    # Validate assumptions
    if terminal_growth >= wacc:
        raise ValueError("Terminal growth must be less than WACC")

    # Project 5 years
    projections = []
    current_revenue = historicals[-1].revenue or bundle.current_revenue
    current_ebitda = historicals[-1].ebitda or bundle.current_ebitda

    for year in range(1, 6):
        year_revenue = current_revenue * ((1 + revenue_growth) ** year)
        year_ebitda = current_ebitda * ((1 + ebitda_growth) ** year)
        year_capex = year_revenue * capex_pct_sales
        year_delta_nwc = year_revenue * delta_nwc_pct_sales
        year_fcf = year_ebitda - year_capex - year_delta_nwc

        pv_factor = 1 / ((1 + wacc) ** year)
        pv_fcf = year_fcf * pv_factor

        projections.append(
            {
                "year": year,
                "revenue": float(year_revenue),
                "ebitda": float(year_ebitda),
                "capex": float(year_capex),
                "delta_nwc": float(year_delta_nwc),
                "fcf": float(year_fcf),
                "pv_factor": float(pv_factor),
                "pv_fcf": float(pv_fcf),
            }
        )

    # Calculate terminal value
    terminal_fcf = projections[-1]["fcf"] * (1 + terminal_growth)
    terminal_value = float(terminal_fcf / (wacc - terminal_growth))
    pv_terminal_value = terminal_value / ((1 + wacc) ** 5)

    # Calculate enterprise value
    pv_of_fcf = sum(p["pv_fcf"] for p in projections)
    enterprise_value = pv_of_fcf + pv_terminal_value

    # Calculate equity value
    equity_value = enterprise_value - float(capital.net_debt)

    # Calculate implied price
    implied_price = equity_value / float(market.shares_outstanding)
    current_price = float(market.price)
    upside_pct = ((implied_price - current_price) / current_price) * 100

    # Generate warnings
    warnings = []
    if pv_terminal_value / enterprise_value > 0.8:
        warnings.append("Terminal value is > 80% of EV (typically < 80%)")

    # Build results
    results = {
        "enterprise_value": enterprise_value,
        "equity_value": equity_value,
        "implied_price": implied_price,
        "current_price": current_price,
        "upside_pct": upside_pct,
        "projections": projections,
        "terminal_value": terminal_value,
        "pv_terminal_value": pv_terminal_value,
        "pv_of_fcf": pv_of_fcf,
        "wacc": float(wacc),
        "terminal_growth": float(terminal_growth),
        "revenue_cagr": float(revenue_growth),
        "ebitda_cagr": float(ebitda_growth),
        "warnings": warnings,
    }

    return results


def generate_lbo_model(
    bundle: LBOFields, custom_assumptions: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Generate LBO model results

    Args:
        bundle: LBO input bundle
        custom_assumptions: Optional custom assumptions

    Returns:
        LBO model results
    """
    # Extract inputs
    market = bundle.market
    capital = bundle.capital

    # LBO assumptions
    entry_multiple = (
        Decimal(str(custom_assumptions.get("entry_multiple", "10.0")))
        if custom_assumptions
        else Decimal("10.0")
    )
    exit_multiple = (
        Decimal(str(custom_assumptions.get("exit_multiple", "12.0")))
        if custom_assumptions
        else Decimal("12.0")
    )
    leverage_ratio = (
        Decimal(str(custom_assumptions.get("leverage_ratio", "0.75")))
        if custom_assumptions
        else Decimal("0.75")
    )
    interest_rate = (
        Decimal(str(custom_assumptions.get("interest_rate", "0.085")))
        if custom_assumptions
        else Decimal("0.085")
    )
    amortization_pct = (
        Decimal(str(custom_assumptions.get("amortization_pct", "0.01")))
        if custom_assumptions
        else Decimal("0.01")
    )

    # Calculate transaction structure
    enterprise_value = float(market.market_cap) / (1 - leverage_ratio)
    total_debt = enterprise_value * leverage_ratio
    sponsor_equity = enterprise_value * (1 - leverage_ratio)

    # Calculate current EBITDA
    current_ebitda = bundle.current_ebitda

    # Project 5 years
    ebitda_growth = Decimal("0.15")  # Default 15% growth
    if custom_assumptions and "ebitda_cagr" in custom_assumptions:
        ebitda_growth = Decimal(str(custom_assumptions["ebitda_cagr"]))

    projections = []
    for year in range(1, 6):
        year_ebitda = current_ebitda * ((1 + ebitda_growth) ** year)
        year_interest = total_debt * interest_rate
        year_principal = total_debt * amortization_pct
        year_fcf = year_ebitda - year_interest - year_principal

        projections.append(
            {
                "year": year,
                "ebitda": float(year_ebitda),
                "interest": float(year_interest),
                "principal": float(year_principal),
                "fcf": float(year_fcf),
                "debt_balance": float(total_debt * (1 - amortization_pct) ** year),
            }
        )

    # Calculate exit
    exit_ebitda = projections[-1]["ebitda"]
    exit_enterprise_value = exit_ebitda * exit_multiple
    exit_debt = projections[-1]["debt_balance"]
    exit_equity_value = exit_enterprise_value - exit_debt
    sponsor_equity_value = exit_equity_value * (
        sponsor_equity / (sponsor_equity + float(capital.equity or 0))
    )

    # Calculate returns
    irr = calculate_irr(sponsor_equity, sponsor_equity_value, 5)
    moic = sponsor_equity_value / sponsor_equity

    # Build results
    results = {
        "transaction_size": enterprise_value,
        "total_debt": total_debt,
        "sponsor_equity": sponsor_equity,
        "leverage_ratio": float(leverage_ratio),
        "debt_ebitda": total_debt / float(current_ebitda),
        "projections": projections,
        "exit_ebitda": exit_ebitda,
        "exit_enterprise_value": exit_enterprise_value,
        "exit_equity_value": exit_equity_value,
        "sponsor_equity_value": sponsor_equity_value,
        "irr": irr,
        "moic": moic,
        "entry_multiple": float(entry_multiple),
        "exit_multiple": float(exit_multiple),
    }

    return results


def generate_comps_model(
    bundle: CompsFields, custom_assumptions: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Generate Comps model results

    Args:
        bundle: Comps input bundle
        custom_assumptions: Optional custom assumptions

    Returns:
        Comps model results
    """
    # Extract inputs
    market = bundle.market
    current_revenue = bundle.current_revenue
    current_ebitda = bundle.current_ebitda

    # Calculate company multiples
    company_ev = float(market.market_cap)
    company_ev_revenue = company_ev / float(current_revenue)
    company_ev_ebitda = company_ev / float(current_ebitda)

    # Calculate peer multiples
    peer_multiples = []
    for peer in bundle.peers:
        peer_ev = peer.get("market_cap", 0)
        peer_revenue = peer.get("revenue", 1)
        peer_ebitda = peer.get("ebitda", 1)

        if peer_revenue > 0 and peer_ebitda > 0:
            peer_multiples.append(
                {
                    "ticker": peer.get("ticker", "Unknown"),
                    "ev_revenue": peer_ev / peer_revenue,
                    "ev_ebitda": peer_ev / peer_ebitda,
                }
            )

    # Calculate percentiles
    ev_revenue_values = [p["ev_revenue"] for p in peer_multiples]
    ev_ebitda_values = [p["ev_ebitda"] for p in peer_multiples]

    ev_revenue_p25 = percentile(ev_revenue_values, 25) if ev_revenue_values else 0
    ev_revenue_median = percentile(ev_revenue_values, 50) if ev_revenue_values else 0
    ev_revenue_p75 = percentile(ev_revenue_values, 75) if ev_revenue_values else 0

    ev_ebitda_p25 = percentile(ev_ebitda_values, 25) if ev_ebitda_values else 0
    ev_ebitda_median = percentile(ev_ebitda_values, 50) if ev_ebitda_values else 0
    ev_ebitda_p75 = percentile(ev_ebitda_values, 75) if ev_ebitda_values else 0

    # Calculate implied values
    implied_ev_revenue = current_revenue * ev_revenue_median
    implied_ev_ebitda = current_ebitda * ev_ebitda_median

    # Build results
    results = {
        "company_multiples": {
            "ev_revenue": company_ev_revenue,
            "ev_ebitda": company_ev_ebitda,
        },
        "peer_multiples": peer_multiples,
        "percentiles": {
            "ev_revenue": {
                "p25": ev_revenue_p25,
                "median": ev_revenue_median,
                "p75": ev_revenue_p75,
            },
            "ev_ebitda": {
                "p25": ev_ebitda_p25,
                "median": ev_ebitda_median,
                "p75": ev_ebitda_p75,
            },
        },
        "implied_values": {
            "ev_revenue": float(implied_ev_revenue),
            "ev_ebitda": float(implied_ev_ebitda),
        },
    }

    return results


def generate_merger_model(
    bundle: MergerFields, custom_assumptions: Dict[str, Any] = None
) -> Dict[str, Any]:
    """
    Generate Merger model results

    Args:
        bundle: Merger input bundle
        custom_assumptions: Optional custom assumptions

    Returns:
        Merger model results
    """
    # Merger assumptions
    premium_pct = (
        Decimal(str(custom_assumptions.get("premium_pct", "0.20")))
        if custom_assumptions
        else Decimal("0.20")
    )
    synergy_pct = (
        Decimal(str(custom_assumptions.get("synergy_pct", "0.15")))
        if custom_assumptions
        else Decimal("0.15")
    )
    consideration_mix = (
        custom_assumptions.get("consideration_mix", {"cash": 0.5, "stock": 0.5})
        if custom_assumptions
        else {"cash": 0.5, "stock": 0.5}
    )

    # Calculate purchase price
    target_share_price = float(bundle.target_market.price)
    premium_per_share = target_share_price * premium_pct
    purchase_price_per_share = target_share_price + premium_per_share
    total_purchase_price = purchase_price_per_share * float(
        bundle.target_market.shares_outstanding
    )

    # Calculate synergies
    combined_revenue = float(bundle.acquirer_revenue + bundle.target_revenue)
    combined_ebitda = float(bundle.acquirer_ebitda + bundle.target_ebitda)
    synergy_ebitda = combined_ebitda * synergy_pct

    # Calculate accretion/dilution
    acquirer_eps = (float(bundle.acquirer_ebitda) * 0.7) / float(
        bundle.acquirer_shares
    )  # Assume 70% conversion
    combined_eps = (combined_ebitda * 0.7) / (
        float(bundle.acquirer_shares) + float(bundle.target_shares)
    )

    accretion_pct = ((combined_eps - acquirer_eps) / acquirer_eps) * 100

    # Calculate sources and uses
    sources = {
        "cash": total_purchase_price * consideration_mix.get("cash", 0.5),
        "stock": total_purchase_price * consideration_mix.get("stock", 0.5),
        "debt": 0,  # Simplified
    }

    uses = {
        "purchase_price": total_purchase_price,
        "transaction_fees": total_purchase_price * 0.01,
        "total": total_purchase_price * 1.01,
    }

    # Build results
    results = {
        "purchase_price_per_share": purchase_price_per_share,
        "total_purchase_price": total_purchase_price,
        "premium_pct": float(premium_pct * 100),
        "synergy_ebitda": synergy_ebitda,
        "combined_revenue": combined_revenue,
        "combined_ebitda": combined_ebitda,
        "accretion_pct": accretion_pct,
        "sources": sources,
        "uses": uses,
    }

    return results


# Helper functions


def calculate_cagr(start_value: Decimal, end_value: Decimal, periods: int) -> Decimal:
    """Calculate CAGR"""
    if start_value <= 0:
        return Decimal("0")
    return (end_value / start_value) ** (Decimal("1") / periods) - Decimal("1")


def calculate_irr(initial_investment: float, final_value: float, years: int) -> float:
    """Calculate IRR (simplified)"""
    if initial_investment <= 0:
        return 0.0
    return ((final_value / initial_investment) ** (1 / years)) - 1


def percentile(data: List[float], p: int) -> float:
    """Calculate percentile"""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    index = int(len(sorted_data) * p / 100)
    return sorted_data[index] if index < len(sorted_data) else sorted_data[-1]
