"""
PDF Financial Extraction Agent

Parses a PDF document and uses Claude to extract structured financial data
relevant to the user's goal (DCF, LBO, Comps, etc.).
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any

import anthropic
from pypdf import PdfReader
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

_EXTRACTION_SYSTEM_PROMPT = """\
You are an expert financial analyst and CFA charterholder.
Your job is to extract structured financial data from a document (earnings call transcript,
10-K, 10-Q, investor presentation, or other financial filing).

Rules:
- Extract numbers exactly as stated. Do NOT fabricate or hallucinate values.
- For dollar amounts, convert to millions (e.g. "$2.3B" → 2300, "$450M" → 450).
- For percentages, return as decimals (e.g. "15%" → 0.15).
- If a value is not present in the document, return null for that field.
- For historical data, extract up to 5 years. Most recent year goes last in the array.
- Include the company name and reporting period when identifiable.
- Provide a brief "extraction_notes" field explaining what was found or missing.
"""

_EXTRACTION_USER_TEMPLATE = """\
User goal: {goal}

Document text:
---
{text}
---

Extract the following financial data as JSON matching this exact schema.
Return ONLY the JSON object, no markdown, no explanation outside the object.

{{
  "company_name": "<string or null>",
  "ticker": "<string or null>",
  "reporting_period": "<e.g. FY2024, Q3 2024, or null>",
  "document_type": "<earnings_call | 10K | 10Q | presentation | merger | other>",

  "historicals": [
    {{
      "year": <int>,
      "revenue": <float or null>,
      "ebit": <float or null>,
      "ebitda": <float or null>,
      "net_income": <float or null>,
      "free_cash_flow": <float or null>,
      "capex": <float or null>,
      "depreciation_amortization": <float or null>,
      "delta_nwc": <float or null>
    }}
  ],

  "current_financials": {{
    "revenue": <float or null>,
    "ebit": <float or null>,
    "ebitda": <float or null>,
    "net_income": <float or null>,
    "free_cash_flow": <float or null>,
    "capex": <float or null>,
    "depreciation_amortization": <float or null>
  }},

  "balance_sheet": {{
    "cash": <float or null>,
    "gross_debt": <float or null>,
    "net_debt": <float or null>,
    "total_assets": <float or null>,
    "total_equity": <float or null>
  }},

  "market_data": {{
    "price": <float or null>,
    "market_cap": <float or null>,
    "shares_outstanding": <float or null>,
    "beta": <float or null>,
    "enterprise_value": <float or null>
  }},

  "guidance": {{
    "revenue_guidance_low": <float or null>,
    "revenue_guidance_high": <float or null>,
    "ebitda_guidance_low": <float or null>,
    "ebitda_guidance_high": <float or null>,
    "revenue_growth_guidance": <float or null>,
    "capex_guidance": <float or null>
  }},

  "management_commentary": {{
    "revenue_growth_outlook": "<management commentary on growth, or null>",
    "margin_trends": "<commentary on margins, or null>",
    "key_risks": "<key risks mentioned, or null>",
    "strategic_priorities": "<strategic priorities, or null>"
  }},

  "valuation_multiples": {{
    "ev_ebitda": <float or null>,
    "ev_revenue": <float or null>,
    "pe_ratio": <float or null>,
    "price_book": <float or null>
  }},

  "capital_structure": {{
    "debt_equity_ratio": <float or null>,
    "interest_expense": <float or null>,
    "effective_tax_rate": <float or null>,
    "cost_of_debt": <float or null>
  }},

  "wacc_inputs": {{
    "risk_free_rate": <float or null>,
    "equity_risk_premium": <float or null>,
    "beta": <float or null>,
    "cost_of_equity": <float or null>,
    "wacc": <float or null>
  }},

  "extraction_notes": "<brief explanation of what was found/missing and data quality>"
}}
"""


class ExtractedFinancials(BaseModel):
    """Structured financial data extracted from a PDF document."""

    company_name: str | None = None
    ticker: str | None = None
    reporting_period: str | None = None
    document_type: str = "other"

    historicals: list[dict[str, Any]] = Field(default_factory=list)
    current_financials: dict[str, Any] = Field(default_factory=dict)
    balance_sheet: dict[str, Any] = Field(default_factory=dict)
    market_data: dict[str, Any] = Field(default_factory=dict)
    guidance: dict[str, Any] = Field(default_factory=dict)
    management_commentary: dict[str, Any] = Field(default_factory=dict)
    valuation_multiples: dict[str, Any] = Field(default_factory=dict)
    capital_structure: dict[str, Any] = Field(default_factory=dict)
    wacc_inputs: dict[str, Any] = Field(default_factory=dict)
    extraction_notes: str = ""

    # Raw PDF text for downstream use
    raw_text: str = ""


def _extract_pdf_text(pdf_bytes: bytes) -> str:
    """Extract all text from a PDF given its raw bytes."""
    import io
    reader = PdfReader(io.BytesIO(pdf_bytes))
    pages = []
    for page in reader.pages:
        text = page.extract_text()
        if text:
            pages.append(text)
    return "\n\n".join(pages)


def _truncate_text(text: str, max_chars: int = 80_000) -> str:
    """Truncate text to fit within Claude's context, keeping start and end."""
    if len(text) <= max_chars:
        return text
    half = max_chars // 2
    return text[:half] + "\n\n[... middle section truncated ...]\n\n" + text[-half:]


def extract_financials_from_pdf(
    pdf_bytes: bytes,
    goal: str,
    model: str = "claude-sonnet-4-6",
) -> ExtractedFinancials:
    """
    Extract structured financial data from a PDF using Claude.

    Args:
        pdf_bytes: Raw PDF file bytes.
        goal: The user's modeling goal (e.g. "build a DCF model").
        model: Claude model to use.

    Returns:
        ExtractedFinancials with all found data fields populated.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise EnvironmentError("ANTHROPIC_API_KEY is not set")

    raw_text = _extract_pdf_text(pdf_bytes)
    if not raw_text.strip():
        raise ValueError("Could not extract any text from the PDF. Is it a scanned/image PDF?")

    truncated = _truncate_text(raw_text)

    client = anthropic.Anthropic(api_key=api_key)

    user_message = _EXTRACTION_USER_TEMPLATE.format(
        goal=goal,
        text=truncated,
    )

    logger.info("Calling Claude for financial extraction (doc length=%d chars)", len(truncated))

    response = client.messages.create(
        model=model,
        max_tokens=4096,
        system=_EXTRACTION_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_message}],
    )

    raw_json = response.content[0].text.strip()

    # Strip markdown code fences if Claude wrapped it
    if raw_json.startswith("```"):
        raw_json = raw_json.split("```")[1]
        if raw_json.startswith("json"):
            raw_json = raw_json[4:]
        raw_json = raw_json.strip()

    try:
        data = json.loads(raw_json)
    except json.JSONDecodeError as e:
        logger.error("Claude returned non-JSON: %s", raw_json[:500])
        raise ValueError(f"Claude extraction returned invalid JSON: {e}") from e

    extracted = ExtractedFinancials(**data)
    extracted.raw_text = raw_text
    return extracted
