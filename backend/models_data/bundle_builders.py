"""Helpers to convert consolidated company data dictionaries into model bundles."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, Iterable, List, Optional

from backend.models_data.bundles import (
    CapitalStructure,
    CompsFields,
    DCFFields,
    HistoricalFinancial,
    LBOFields,
    MarketData,
    Provenance,
)


def _to_decimal(value: Any, default: str = "0") -> Decimal:
    """Safely convert numeric inputs to Decimal."""

    if value is None:
        return Decimal(default)

    if isinstance(value, Decimal):
        return value

    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def _parse_timestamp(value: Optional[str]) -> datetime:
    if not value:
        return datetime.utcnow()
    try:
        if value.endswith("Z"):
            value = value[:-1]
        return datetime.fromisoformat(value)
    except ValueError:
        return datetime.utcnow()


def _build_provenance(raw: Optional[Dict[str, Any]], fields: Iterable[str]) -> Dict[str, Provenance]:
    provenance: Dict[str, Provenance] = {}
    raw = raw or {}
    for field in fields:
        info = raw.get(field, {})
        provider = info.get("provider") or info.get("source") or "unknown"
        timestamp = _parse_timestamp(info.get("as_of"))
        confidence = info.get("confidence")
        provenance[field] = Provenance(provider=provider, timestamp=timestamp, confidence=confidence)

    if not provenance:
        now = datetime.utcnow()
        for field in fields:
            provenance[field] = Provenance(provider="internal", timestamp=now)

    return provenance


def build_dcf_fields_from_company_data(company_data: Dict[str, Any]) -> DCFFields:
    """Convert the consolidated company data dictionary into DCF bundle inputs."""

    historicals_raw = company_data.get("historicals", []) or []
    if len(historicals_raw) < 3:
        raise ValueError("DCF requires at least 3 years of historical financial data")

    # Sort ascending by year to preserve chronological order
    historicals_raw = sorted(historicals_raw, key=lambda h: h.get("year", 0))[-5:]
    historicals: List[HistoricalFinancial] = []
    for row in historicals_raw:
        historicals.append(
            HistoricalFinancial(
                year=int(row.get("year", datetime.utcnow().year)),
                revenue=_to_decimal(row.get("revenue")),
                ebit=_to_decimal(row.get("ebit")),
                ebitda=_to_decimal(row.get("ebitda")),
                net_income=_to_decimal(row.get("net_income")),
                free_cash_flow=_to_decimal(row.get("free_cash_flow")),
                capex=_to_decimal(row.get("capex")),
                delta_nwc=_to_decimal(row.get("delta_nwc")),
            )
        )

    market = company_data.get("market", {}) or {}
    latest = company_data.get("latest", {}) or {}

    price = _to_decimal(market.get("price"))
    market_cap = _to_decimal(market.get("market_cap"))

    shares_out = market.get("shares_out") or market.get("shares_outstanding") or market.get("shares" )
    if (not shares_out or shares_out == 0) and market_cap and price:
        try:
            shares_out = market_cap / price
        except (InvalidOperation, ZeroDivisionError):
            shares_out = 0

    shares_out_dec = _to_decimal(shares_out)
    if shares_out_dec <= 0:
        raise ValueError("Shares outstanding must be greater than zero for DCF bundle")

    beta = _to_decimal(market.get("beta", 1))
    volume = market.get("volume")

    cash = market.get("cash")
    gross_debt = market.get("gross_debt") or market.get("total_debt")
    net_debt = market.get("net_debt")

    if gross_debt is None and net_debt is not None and cash is not None:
        gross_debt = net_debt + cash
    if net_debt is None and gross_debt is not None and cash is not None:
        net_debt = gross_debt - cash

    capital = CapitalStructure(
        cash=_to_decimal(cash),
        gross_debt=_to_decimal(gross_debt),
        net_debt=_to_decimal(net_debt),
        equity=_to_decimal(market.get("equity", market_cap)),
    )

    provenance = _build_provenance(
        company_data.get("provenance"),
        [
            "revenue",
            "ebit",
            "ebitda",
            "net_income",
            "free_cash_flow",
            "capex",
            "delta_nwc",
            "price",
            "market_cap",
            "shares_out",
        ],
    )

    as_of_quotes = _parse_timestamp(company_data.get("as_of_quotes"))
    as_of_fundamentals = _parse_timestamp(company_data.get("as_of_fundamentals"))

    return DCFFields(
        historicals=historicals,
        market=MarketData(
            price=price,
            market_cap=market_cap,
            shares_outstanding=shares_out_dec,
            beta=beta,
            volume=volume,
        ),
        capital=capital,
        current_revenue=_to_decimal(latest.get("revenue")),
        current_ebit=_to_decimal(latest.get("ebit")),
        current_ebitda=_to_decimal(latest.get("ebitda")),
        current_fcf=_to_decimal(latest.get("free_cash_flow")),
        provenance=provenance,
        as_of_quotes=as_of_quotes,
        as_of_fundamentals=as_of_fundamentals,
        stale=bool(company_data.get("stale", False)),
    )


def build_lbo_fields_from_company_data(company_data: Dict[str, Any]) -> LBOFields:
    """Convert company data into LBO bundle inputs."""

    dcf_fields = build_dcf_fields_from_company_data(company_data)

    return LBOFields(
        historicals=dcf_fields.historicals,
        market=dcf_fields.market,
        capital=dcf_fields.capital,
        current_revenue=dcf_fields.current_revenue,
        current_ebitda=dcf_fields.current_ebitda,
        current_fcf=dcf_fields.current_fcf,
        provenance=dcf_fields.provenance,
        as_of_quotes=dcf_fields.as_of_quotes,
        as_of_fundamentals=dcf_fields.as_of_fundamentals,
        stale=dcf_fields.stale,
    )


def build_comps_fields_from_company_data(
    company_data: Dict[str, Any],
    peer_company_data: Optional[List[Dict[str, Any]]] = None,
) -> CompsFields:
    """Create Comps bundle inputs for a company and optional peer data."""

    dcf_fields = build_dcf_fields_from_company_data(company_data)

    peers: List[Dict[str, Any]] = []

    peer_company_data = peer_company_data or []
    for peer in peer_company_data:
        peer_market = peer.get("market", {}) or {}
        peer_latest = peer.get("latest", {}) or {}

        peers.append(
            {
                "ticker": peer.get("ticker", "UNKNOWN"),
                "market_cap": float(peer_market.get("market_cap") or 0),
                "revenue": float(peer_latest.get("revenue") or 0),
                "ebitda": float(peer_latest.get("ebitda") or 0),
            }
        )

    if not peers:
        # Ensure at least self is present for downstream calculations
        peers.append(
            {
                "ticker": company_data.get("ticker", "UNKNOWN"),
                "market_cap": float(dcf_fields.market.market_cap),
                "revenue": float(dcf_fields.current_revenue),
                "ebitda": float(dcf_fields.current_ebitda),
            }
        )

    provenance = dcf_fields.provenance.copy()
    provenance.setdefault("peers", Provenance(provider="internal", timestamp=datetime.utcnow()))

    return CompsFields(
        ticker=company_data.get("ticker", ""),
        market=dcf_fields.market,
        current_revenue=dcf_fields.current_revenue,
        current_ebitda=dcf_fields.current_ebitda,
        current_ebit=dcf_fields.current_ebit,
        peers=peers,
        provenance=provenance,
        as_of_quotes=dcf_fields.as_of_quotes,
        as_of_fundamentals=dcf_fields.as_of_fundamentals,
        stale=dcf_fields.stale,
    )


