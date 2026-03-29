#!/usr/bin/env python3
"""Register and optionally extract a new investor document source into the training corpus."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from training.build_extraction_stubs import build_stub
from training.corpus_logic import load_templates
from training.extract_sources import populate_stub

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "training" / "source_registry.json"
OUTPUT_DIR = ROOT / "training" / "extracted_sources" / "phase_1"

TYPE_CONFIG: dict[str, dict[str, Any]] = {
    "investor_letter": {
        "source_type": "investor_letter",
        "primary_bucket": "memo_style",
        "secondary_bucket": "eval_cases",
        "template_key": "investor_letter",
        "tier": "A",
        "summary": "Investor letter / fund note for memo-style and thesis extraction.",
        "strengths": ["investor reasoning", "thesis framing", "portfolio commentary"],
        "weaknesses": ["not a primary filing", "may reflect manager worldview bias"],
    },
    "investor_presentation": {
        "source_type": "investor_presentation",
        "primary_bucket": "memo_style",
        "secondary_bucket": "transaction_methodology",
        "template_key": "investor_presentation",
        "tier": "A",
        "summary": "Investor presentation or annual meeting deck for slide compression and thesis framing.",
        "strengths": ["slide compression", "holdings coverage", "valuation framing"],
        "weaknesses": ["presentation shorthand", "not a full underwriting memo"],
    },
    "case_study": {
        "source_type": "case_study",
        "primary_bucket": "eval_cases",
        "secondary_bucket": "valuation_mechanics",
        "template_key": "case_study",
        "tier": "A",
        "summary": "Case-study source for structured valuation or investment reasoning exercises.",
        "strengths": ["explicit task framing", "worked-case reasoning", "valuation mechanics"],
        "weaknesses": ["educational framing"],
    },
}


def slugify(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def read_registry() -> list[dict[str, Any]]:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def write_registry(records: list[dict[str, Any]]) -> None:
    REGISTRY_PATH.write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")


def build_registry_record(args: argparse.Namespace) -> dict[str, Any]:
    config = TYPE_CONFIG[args.kind]
    title = args.title or Path(args.file_path).stem
    record_id = args.record_id or slugify(title)
    return {
        "id": record_id,
        "file_path": str(Path(args.file_path).resolve()),
        "title": title,
        "source_type": config["source_type"],
        "tier": args.tier or config["tier"],
        "primary_bucket": config["primary_bucket"],
        "secondary_bucket": config["secondary_bucket"],
        "style_weight": args.style_weight,
        "mechanics_weight": args.mechanics_weight,
        "methodology_weight": args.methodology_weight,
        "special_situations_weight": 0.0,
        "eval_weight": args.eval_weight,
        "summary": args.summary or config["summary"],
        "strengths": args.strengths or config["strengths"],
        "weaknesses": args.weaknesses or config["weaknesses"],
        "extraction_status": "pending",
        "recommended_phase": args.phase,
        "exclude_from_core_training": False,
        "canonical_bucket": config["primary_bucket"],
        "template_key": config["template_key"],
    }


def upsert_registry_record(record: dict[str, Any]) -> None:
    registry = read_registry()
    updated = False
    for index, existing in enumerate(registry):
        if existing.get("id") == record["id"]:
            registry[index] = record
            updated = True
            break
    if not updated:
        registry.append(record)
    write_registry(registry)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--file-path", required=True)
    parser.add_argument("--kind", choices=sorted(TYPE_CONFIG.keys()), required=True)
    parser.add_argument("--title")
    parser.add_argument("--record-id")
    parser.add_argument("--summary")
    parser.add_argument("--phase", type=int, default=1)
    parser.add_argument("--tier")
    parser.add_argument("--style-weight", type=float, default=1.0)
    parser.add_argument("--mechanics-weight", type=float, default=0.2)
    parser.add_argument("--methodology-weight", type=float, default=0.2)
    parser.add_argument("--eval-weight", type=float, default=0.5)
    parser.add_argument("--strength", dest="strengths", action="append")
    parser.add_argument("--weakness", dest="weaknesses", action="append")
    parser.add_argument("--skip-extract", action="store_true")
    args = parser.parse_args()

    record = build_registry_record(args)
    upsert_registry_record(record)

    output_path = None
    if not args.skip_extract:
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        templates = load_templates()
        stub = build_stub(SimpleNamespace(**record), templates)
        populated = populate_stub(stub, SimpleNamespace(**record))
        output_path = OUTPUT_DIR / f"{record['id']}.json"
        output_path.write_text(json.dumps(populated, indent=2) + "\n", encoding="utf-8")

    print(
        json.dumps(
            {
                "record_id": record["id"],
                "registry_path": str(REGISTRY_PATH),
                "extracted_path": str(output_path) if output_path else None,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
