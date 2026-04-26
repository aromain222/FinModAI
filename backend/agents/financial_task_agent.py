"""
Financial Task Agent

Takes extracted financial data + a user goal, determines the right model
(DCF / LBO / Comps), assembles the input bundle from extracted data,
runs the model, and returns a rich result with assumptions used.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime
from decimal import Decimal
from typing import Any

import anthropic

from backend.agents.pdf_extraction_agent import ExtractedFinancials
from backend.models_data.bundles import (
    CapitalStructure,
    DCFFields,
    HistoricalFinancial,
    LBOFields,
    MarketData,
    ModelType,
    Provenance,
)
from backend.models_data.generate import (
    generate_dcf_model,
    generate_lbo_model,
)

logger = logging.getLogger(__name__)

_GOAL_CLASSIFICATION_PROMPT = """\
You are a financial analyst assistant. Given a user's goal, identify:
1. Which financial model to build: "dcf", "lbo", "comps", or "general_analysis"
2. Any custom assumptions the user specified (WACC, growth rate, exit multiple, etc.)

Return ONLY valid JSON in this exact format:
{
  "model_type": "<dcf|lbo|comps|general_analysis>",
  "custom_assumptions": {
    "wacc": <float or null>,
    "terminal_growth": <float or null>,
    "revenue_cagr_1_5": <float or null>,
    "ebitda_cagr": <float or null>,
    "entry_multiple": <float or null>,
    "exit_multiple": <float or null>,
    "leverage_ratio": <float or null>,
    "capex_pct_sales": <float or null>
  },
  "reasoning": "<one sentence explaining choice>"
}
"""


def _classify_goal(goal: str, model: str = "claude-haiku-4-5-20251001") -> dict[str, Any]:
    """Use Claude to classify the user's goal and extract custom assumptions."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EnvironmentError("ANTHROPIC_API_KEY is not set")

    client = anthropic.Anthropic(api_key=api_key)
    response = client.messages.create(
        model=model,
        max_tokens=512,
        system=_GOAL_CLASSIFICATION_PROMPT,
        messages=[{"role": "user", "content": f"User goal: {goal}"}],
    )
    import json
    text = response.content[0].text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[4:]
        text = text.strip()
    return json.loads(text)


def _safe_decimal(value: Any, default: float) -> Decimal:
    """Convert a value to Decimal, falling back to default if None/invalid."""
    if value is None:
        return Decimal(str(default))
    try:
        return Decimal(str(float(value)))
    except (ValueError, TypeError):
        return Decimal(str(default))


def _build_provenance(source: str = "pdf_extraction") -> dict[str, Provenance]:
    now = datetime.utcnow()
    return {
        "revenue": Provenance(provider=source, timestamp=now, confidence=0.9),
        "ebitda": Provenance(provider=source, timestamp=now, confidence=0.9),
        "market": Provenance(provider=source, timestamp=now, confidence=0.85),
    }


def _build_historicals(data: ExtractedFinancials) -> list[HistoricalFinancial]:
    """Build HistoricalFinancial list from extracted data, padding if needed."""
    raw = data.historicals or []
    historicals = []
    for h in raw:
        historicals.append(HistoricalFinancial(
            year=int(h.get("year", 2022)),
            revenue=_safe_decimal(h.get("revenue"), 0) if h.get("revenue") else None,
            ebit=_safe_decimal(h.get("ebit"), 0) if h.get("ebit") else None,
            ebitda=_safe_decimal(h.get("ebitda"), 0) if h.get("ebitda") else None,
            net_income=_safe_decimal(h.get("net_income"), 0) if h.get("net_income") else None,
            free_cash_flow=_safe_decimal(h.get("free_cash_flow"), 0) if h.get("free_cash_flow") else None,
            capex=_safe_decimal(h.get("capex"), 0) if h.get("capex") else None,
            delta_nwc=_safe_decimal(h.get("delta_nwc"), 0) if h.get("delta_nwc") else None,
        ))

    # DCF requires at least 3 years — synthesize from current if short
    if len(historicals) < 3:
        curr = data.current_financials or {}
        rev = float(curr.get("revenue") or 100)
        ebitda = float(curr.get("ebitda") or rev * 0.20)
        base_year = 2022
        for i in range(3 - len(historicals)):
            factor = 0.85 ** (3 - len(historicals) - i)
            historicals.insert(0, HistoricalFinancial(
                year=base_year + i,
                revenue=Decimal(str(round(rev * factor, 2))),
                ebitda=Decimal(str(round(ebitda * factor, 2))),
            ))

    return historicals


def _build_market_data(data: ExtractedFinancials) -> MarketData:
    mkt = data.market_data or {}
    curr = data.current_financials or {}
    revenue = float(curr.get("revenue") or 100)

    price = _safe_decimal(mkt.get("price"), 20.0)
    market_cap = _safe_decimal(mkt.get("market_cap"), revenue * 2)
    shares = _safe_decimal(mkt.get("shares_outstanding"), float(market_cap) / float(price))
    beta = _safe_decimal(mkt.get("beta"), 1.1)

    return MarketData(
        price=price,
        market_cap=market_cap,
        shares_outstanding=shares,
        beta=beta,
    )


def _build_capital_structure(data: ExtractedFinancials) -> CapitalStructure:
    bs = data.balance_sheet or {}
    cash = _safe_decimal(bs.get("cash"), 0)
    gross_debt = _safe_decimal(bs.get("gross_debt"), 0)
    net_debt = _safe_decimal(bs.get("net_debt"), float(gross_debt) - float(cash))
    equity = _safe_decimal(bs.get("total_equity"), 0) if bs.get("total_equity") else None
    return CapitalStructure(cash=cash, gross_debt=gross_debt, net_debt=net_debt, equity=equity)


def _run_dcf(data: ExtractedFinancials, custom: dict[str, Any]) -> dict[str, Any]:
    """Assemble a DCFFields bundle and run the DCF model."""
    curr = data.current_financials or {}
    historicals = _build_historicals(data)
    market = _build_market_data(data)
    capital = _build_capital_structure(data)

    current_revenue = _safe_decimal(curr.get("revenue"), float(historicals[-1].revenue or 100))
    current_ebit = _safe_decimal(curr.get("ebit"), float(current_revenue) * 0.15)
    current_ebitda = _safe_decimal(curr.get("ebitda"), float(current_revenue) * 0.20)
    current_fcf = _safe_decimal(curr.get("free_cash_flow"), float(current_ebitda) * 0.70)

    now = datetime.utcnow()
    bundle = DCFFields(
        historicals=historicals,
        market=market,
        capital=capital,
        current_revenue=current_revenue,
        current_ebit=current_ebit,
        current_ebitda=current_ebitda,
        current_fcf=current_fcf,
        provenance=_build_provenance(),
        as_of_quotes=now,
        as_of_fundamentals=now,
    )

    # Filter None values from custom assumptions
    filtered_custom = {k: v for k, v in custom.items() if v is not None}
    return generate_dcf_model(bundle, filtered_custom if filtered_custom else None)


def _run_lbo(data: ExtractedFinancials, custom: dict[str, Any]) -> dict[str, Any]:
    """Assemble an LBOFields bundle and run the LBO model."""
    curr = data.current_financials or {}
    historicals = _build_historicals(data)
    market = _build_market_data(data)
    capital = _build_capital_structure(data)

    current_revenue = _safe_decimal(curr.get("revenue"), float(historicals[-1].revenue or 100))
    current_ebitda = _safe_decimal(curr.get("ebitda"), float(current_revenue) * 0.20)
    current_fcf = _safe_decimal(curr.get("free_cash_flow"), float(current_ebitda) * 0.70)

    now = datetime.utcnow()
    bundle = LBOFields(
        historicals=historicals,
        market=market,
        capital=capital,
        current_revenue=current_revenue,
        current_ebitda=current_ebitda,
        current_fcf=current_fcf,
        provenance=_build_provenance(),
        as_of_quotes=now,
        as_of_fundamentals=now,
    )

    filtered_custom = {k: v for k, v in custom.items() if v is not None}
    return generate_lbo_model(bundle, filtered_custom if filtered_custom else None)


def _run_general_analysis(data: ExtractedFinancials) -> dict[str, Any]:
    """Return a rich summary when no specific model is requested."""
    curr = data.current_financials or {}
    mkt = data.market_data or {}
    bs = data.balance_sheet or {}
    guidance = data.guidance or {}

    revenue = curr.get("revenue")
    ebitda = curr.get("ebitda")
    ev = mkt.get("enterprise_value") or (
        (mkt.get("market_cap") or 0) + (bs.get("net_debt") or 0)
    )

    summary: dict[str, Any] = {
        "company": data.company_name,
        "ticker": data.ticker,
        "period": data.reporting_period,
        "document_type": data.document_type,
        "key_metrics": {
            "revenue_mm": revenue,
            "ebitda_mm": ebitda,
            "ebitda_margin": round(ebitda / revenue, 4) if (revenue and ebitda) else None,
            "enterprise_value_mm": ev,
            "ev_ebitda": round(ev / ebitda, 2) if (ev and ebitda) else None,
            "net_debt_mm": bs.get("net_debt"),
            "shares_outstanding_mm": mkt.get("shares_outstanding"),
        },
        "revenue_guidance": {
            "low": guidance.get("revenue_guidance_low"),
            "high": guidance.get("revenue_guidance_high"),
            "growth_pct": guidance.get("revenue_growth_guidance"),
        },
        "management_commentary": data.management_commentary,
        "extraction_notes": data.extraction_notes,
    }
    return summary


def run_financial_task(
    extracted: ExtractedFinancials,
    goal: str,
) -> dict[str, Any]:
    """
    Main entry point: classify the goal, run the appropriate model,
    return results + metadata.

    Args:
        extracted: Financials extracted from the PDF.
        goal: Plain-English user goal.

    Returns:
        dict with keys: model_type, company_info, model_results,
                        assumptions_used, extraction_notes, warnings
    """
    classification = _classify_goal(goal)
    model_type: str = classification.get("model_type", "general_analysis")
    custom_assumptions: dict[str, Any] = classification.get("custom_assumptions", {}) or {}

    logger.info("Goal classified as model_type=%s", model_type)

    warnings: list[str] = []
    model_results: dict[str, Any] = {}

    try:
        if model_type == ModelType.DCF:
            model_results = _run_dcf(extracted, custom_assumptions)
        elif model_type == ModelType.LBO:
            model_results = _run_lbo(extracted, custom_assumptions)
        elif model_type == "general_analysis":
            model_results = _run_general_analysis(extracted)
        else:
            # comps or unknown — fall back to general analysis with a note
            warnings.append(
                f"Model type '{model_type}' requires live market peer data not available "
                "in PDF-only mode. Returning general analysis instead."
            )
            model_type = "general_analysis"
            model_results = _run_general_analysis(extracted)
    except Exception as e:
        logger.error("Model run failed: %s", e, exc_info=True)
        warnings.append(f"Model calculation error: {e}. Returning extracted data only.")
        model_results = _run_general_analysis(extracted)
        model_type = "general_analysis"

    assumptions_used = {
        "source": "pdf_extraction",
        "model_type": model_type,
        "classification_reasoning": classification.get("reasoning", ""),
        **{k: v for k, v in custom_assumptions.items() if v is not None},
    }

    return {
        "model_type": model_type,
        "company_info": {
            "name": extracted.company_name,
            "ticker": extracted.ticker,
            "reporting_period": extracted.reporting_period,
            "document_type": extracted.document_type,
        },
        "extracted_financials": {
            "current": extracted.current_financials,
            "balance_sheet": extracted.balance_sheet,
            "market_data": extracted.market_data,
            "guidance": extracted.guidance,
            "historicals": extracted.historicals,
        },
        "model_results": model_results,
        "assumptions_used": assumptions_used,
        "extraction_notes": extracted.extraction_notes,
        "warnings": warnings + (model_results.get("warnings") or []),
    }
