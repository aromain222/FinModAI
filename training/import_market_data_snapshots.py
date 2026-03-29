#!/usr/bin/env python3
"""Convert provider market-data snapshots into reviewed training source records."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / "training" / "extracted_sources" / "phase_1"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def compact_list(items: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
      normalized = item.strip()
      if not normalized:
          continue
      key = normalized.lower()
      if key in seen:
          continue
      seen.add(key)
      output.append(normalized)
    return output


def fmt_num(value: Any) -> str:
    if isinstance(value, (int, float)):
        return f"{value:,.2f}"
    return "n/a"


def provider_summary_line(provider_name: str, payload: dict[str, Any], kind: str) -> str:
    if kind == "quote":
        return (
            f"{provider_name}: price={fmt_num(payload.get('price'))}, marketCap={fmt_num(payload.get('marketCap'))}, "
            f"sharesOutstanding={fmt_num(payload.get('sharesOutstanding'))}, asOf={payload.get('asOf') or 'n/a'}"
        )
    return (
        f"{provider_name}: revenueLTM={fmt_num(payload.get('revenueLTM'))}, ebitdaLTM={fmt_num(payload.get('ebitdaLTM'))}, "
        f"netIncomeLTM={fmt_num(payload.get('netIncomeLTM'))}, cash={fmt_num(payload.get('cash'))}, totalDebt={fmt_num(payload.get('totalDebt'))}"
    )


def build_record(snapshot_dir: Path) -> dict[str, Any]:
    manifest = read_json(snapshot_dir / "manifest.json")
    data = read_json(snapshot_dir / "snapshot.json")

    ticker = str(manifest["ticker"]).upper()
    company_name = str(manifest.get("company_name") or ticker)
    providers = [str(provider).lower() for provider in manifest.get("providers", [])]

    quotes = data.get("quotes", {})
    fundamentals = data.get("fundamentals", {})
    comparisons = data.get("comparisons", {})

    quote_lines = compact_list(
        [provider_summary_line(name, payload, "quote") for name, payload in quotes.items() if isinstance(payload, dict)]
    )
    fundamental_lines = compact_list(
        [provider_summary_line(name, payload, "fundamentals") for name, payload in fundamentals.items() if isinstance(payload, dict)]
    )

    provider_differences: list[str] = []
    price_spread = comparisons.get("priceSpreadPct")
    if isinstance(price_spread, (int, float)):
        provider_differences.append(f"Observed quote spread across providers was {price_spread:.2f}%.")
    market_cap_spread = comparisons.get("marketCapSpreadPct")
    if isinstance(market_cap_spread, (int, float)):
        provider_differences.append(f"Observed market-cap spread across providers was {market_cap_spread:.2f}%.")
    missing_fields = comparisons.get("missingFieldsByProvider") or {}
    for provider, fields in missing_fields.items():
        if isinstance(fields, list) and fields:
            provider_differences.append(f"{provider} missing fields: {', '.join(str(field) for field in fields[:6])}.")

    market_context = compact_list(
        [
            f"Snapshot captured at {manifest.get('fetched_at')}.",
            f"Primary quote consensus used {comparisons.get('quoteConsensusProvider') or 'available providers'} for directional context.",
            f"Fundamentals coverage came from {comparisons.get('fundamentalsCoverageLeader') or 'multiple providers'} with explicit provenance.",
        ]
    )

    analyst_relevance = [
        "Use provider-attributed snapshots to sanity-check price, market cap, and share count before running valuation models.",
        "Treat provider disagreements as a prompt to confirm timing, endpoint definitions, and stale fields.",
        "Keep quote provenance separate from fundamentals provenance in any downstream output.",
    ]

    return {
        "id": f"{ticker.lower()}_market_data_snapshot",
        "title": f"{company_name} Market Data Snapshot",
        "file_path": str(snapshot_dir),
        "source_type": "market_data_snapshot",
        "tier": "B",
        "primary_bucket": "valuation_mechanics",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "market_data_snapshot",
        "assistant_training_targets": [
            "market-data provenance",
            "cross-provider reconciliation",
            "quote and fundamental sanity checks",
            "analyst data-quality interpretation",
        ],
        "source_summary": f"Cross-provider snapshot for {ticker} built from Polygon, Tiingo, Twelve Data, and Alpha Vantage where available.",
        "strengths": [
            "explicit provider provenance",
            "cross-provider comparison",
            "quote and fundamentals sanity checks",
        ],
        "weaknesses": [
            "snapshot values can go stale quickly",
            "providers differ in field coverage and definitions",
        ],
        "fields": {
            "title": f"{company_name} Market Data Snapshot",
            "ticker": ticker,
            "company_name": company_name,
            "providers_queried": providers,
            "quote_snapshot": quote_lines,
            "fundamental_snapshot": fundamental_lines,
            "provider_differences": provider_differences,
            "market_context": market_context,
            "analyst_relevance": analyst_relevance,
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "manifest_path": str(snapshot_dir / "manifest.json"),
            "snapshot_path": str(snapshot_dir / "snapshot.json"),
            "providers": providers,
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--snapshot-dir", required=True)
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    args = parser.parse_args()

    snapshot_dir = Path(args.snapshot_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    record = build_record(snapshot_dir)
    output_path = output_dir / f"{record['id']}.json"
    output_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(json.dumps({"record_path": str(output_path), "record_id": record["id"]}, indent=2))


if __name__ == "__main__":
    main()
