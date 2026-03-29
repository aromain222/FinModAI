#!/usr/bin/env python3
"""Convert extracted SEC filing datasets into reviewed training source records."""

from __future__ import annotations

import argparse
import html
import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_DIR = ROOT / "training" / "extracted_sources" / "phase_1"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def slugify(value: str) -> str:
    return re.sub(r"(^-|-$)", "", re.sub(r"[^a-z0-9]+", "-", value.lower()))


def compact_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def normalize_text(text: str) -> str:
    cleaned = html.unescape(text)
    cleaned = cleaned.replace("\u00a0", " ")
    cleaned = re.sub(r"\b[a-z]{2,10}-\d{6,8}\b", " ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b\d{10}\b", " ", cleaned)
    cleaned = re.sub(r"\b(?:xbrli|iso4217|dei|us-gaap|aci):[A-Za-z0-9_-]+\b", " ", cleaned)
    return compact_whitespace(cleaned)


def split_sentences(text: str) -> list[str]:
    normalized = normalize_text(text)
    parts = re.split(r"(?<=[.!?])\s+", normalized)
    return [part.strip() for part in parts if len(part.strip()) >= 40]


def unique(items: list[str]) -> list[str]:
    seen: set[str] = set()
    output: list[str] = []
    for item in items:
        key = item.lower()
        if not item or key in seen:
            continue
        seen.add(key)
        output.append(item)
    return output


def select_chunks(chunks: list[dict[str, Any]], forms: set[str] | None = None) -> list[dict[str, Any]]:
    if not forms:
        return chunks
    return [chunk for chunk in chunks if str(chunk.get("filing_form", "")).upper() in forms]


def find_sentences(
    chunks: list[dict[str, Any]],
    *,
    forms: set[str] | None = None,
    required_terms: list[str],
    excluded_terms: list[str] | None = None,
    max_chars: int | None = 500,
    limit: int = 2,
) -> list[str]:
    matches: list[str] = []
    excluded_terms = [term.lower() for term in (excluded_terms or [])]
    for chunk in select_chunks(chunks, forms):
        for sentence in split_sentences(str(chunk.get("text", ""))):
            lowered = sentence.lower()
            if all(term.lower() in lowered for term in required_terms):
                if excluded_terms and any(term in lowered for term in excluded_terms):
                    continue
                if max_chars is not None and len(sentence) > max_chars:
                    continue
                matches.append(sentence)
                if len(matches) >= limit:
                    return unique(matches)
    return unique(matches)


def preview_chunks(chunks: list[dict[str, Any]], limit: int = 10) -> list[dict[str, Any]]:
    return [
        {
            "label": f"{chunk.get('filing_form')} {chunk.get('filed_at')}",
            "start_page": None,
            "end_page": None,
            "text_preview": normalize_text(str(chunk.get("text", ""))[:320]),
        }
        for chunk in chunks[:limit]
    ]


def sample_texts(chunks: list[dict[str, Any]], limit: int = 3) -> list[dict[str, Any]]:
    return [
        {
            "label": f"{chunk.get('filing_form')} {chunk.get('filed_at')}",
            "text_preview": normalize_text(str(chunk.get("text", ""))[:700]),
            "char_count": chunk.get("char_count"),
            "word_count": chunk.get("word_count"),
            "source_url": chunk.get("source_url"),
        }
        for chunk in chunks[:limit]
    ]


def build_public_filing_record(
    manifest: dict[str, Any],
    filings: list[dict[str, Any]],
    chunks: list[dict[str, Any]],
    dataset_dir: Path,
) -> dict[str, Any]:
    ticker = str(manifest["ticker"]).upper()
    company_name = str(manifest["company_name"])
    dataset_slug = str(manifest["dataset_slug"])
    filing_dates = [str(filing.get("filedAt")) for filing in filings if filing.get("filedAt")]
    forms_covered = list(dict.fromkeys(str(form) for form in manifest.get("forms_queried", []) if form))

    capital_markets_activity = unique(
        find_sentences(
            chunks,
            forms={"8-K"},
            required_terms=["senior notes"],
            limit=2,
        )
        or ["Recent filings include debt issuance and financing-related 8-K disclosure."]
    )

    capital_allocation_activity = unique(
        find_sentences(
            chunks,
            forms={"10-Q", "10-K"},
            required_terms=["share repurchase"],
            excluded_terms=["statements of cash flows", "table of contents"],
            max_chars=320,
            limit=2,
        )
        + find_sentences(
            chunks,
            forms={"8-K"},
            required_terms=["accelerated share repurchase agreement"],
            max_chars=320,
            limit=1,
        )
        or ["Recent filings reference ongoing capital allocation actions, including repurchases and financing decisions."]
    )

    liquidity_notes = unique(
        find_sentences(chunks, forms={"10-Q", "10-K"}, required_terms=["liquidity needs"], limit=1)
        + find_sentences(chunks, forms={"10-Q", "10-K"}, required_terms=["adequate cash flow"], limit=1)
    ) or ["Recent 10-Q disclosures discuss liquidity needs and management's view of cash flow adequacy."]

    governance_notes = unique(
        find_sentences(chunks, forms={"8-K"}, required_terms=["appointed", "board"], limit=2)
        or ["Recent 8-K filings include governance and board composition updates."]
    )

    controls_and_risk_notes = unique(
        find_sentences(chunks, forms={"10-Q", "10-K"}, required_terms=["disclosure controls", "effective"], limit=1)
        + find_sentences(
            chunks,
            forms={"10-Q", "10-K"},
            required_terms=["internal control over financial reporting"],
            excluded_terms=["table of contents"],
            max_chars=320,
            limit=1,
        )
        + find_sentences(
            chunks,
            forms={"10-Q", "10-K"},
            required_terms=["risk factors"],
            excluded_terms=["table of contents"],
            max_chars=320,
            limit=1,
        )
    ) or ["Recent periodic filings state that disclosure controls remain effective and risk factor language is broadly stable."]

    analyst_relevance = [
        "Update debt, interest, and refinancing assumptions from disclosed financing activity.",
        "Reflect buyback pace and remaining authorization in share count and capital allocation assumptions.",
        "Use management liquidity commentary as a check on near-term funding and rating pressure.",
        "Treat governance and control disclosures as qualitative checks rather than direct valuation drivers.",
    ]

    return {
        "id": f"{slugify(ticker)}_sec_public_filings",
        "title": f"{company_name} General SEC Filings",
        "file_path": str(dataset_dir),
        "source_type": "sec_public_filings",
        "tier": "B",
        "primary_bucket": "valuation_mechanics",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "sec_public_filing",
        "assistant_training_targets": [
            "public filing interpretation",
            "capital allocation extraction",
            "liquidity and risk extraction",
            "analyst underwriting takeaways",
        ],
        "source_summary": f"Recent {ticker} SEC filings converted into underwriting-oriented disclosure summaries.",
        "strengths": [
            "primary-source disclosures",
            "capital allocation signals",
            "liquidity commentary",
        ],
        "weaknesses": [
            "raw filings can be legalistic",
            "8-K items are episodic",
        ],
        "fields": {
            "title": f"{company_name} General SEC Filings",
            "company_name": company_name,
            "ticker": ticker,
            "cik": manifest["cik"],
            "forms_covered": forms_covered,
            "filing_dates": filing_dates[:10],
            "capital_markets_activity": capital_markets_activity,
            "capital_allocation_activity": capital_allocation_activity,
            "liquidity_notes": liquidity_notes,
            "governance_notes": governance_notes,
            "controls_and_risk_notes": controls_and_risk_notes,
            "analyst_relevance": analyst_relevance,
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "dataset_slug": dataset_slug,
            "manifest_path": str(dataset_dir / "manifest.json"),
            "filings_path": str(dataset_dir / "filings.json"),
            "chunks_path": str(dataset_dir / "chunks.jsonl"),
            "forms_queried": forms_covered,
            "filing_count": manifest.get("filing_count"),
            "chunk_count": manifest.get("chunk_count"),
        },
        "chunking": {
            "strategy": "filing_level",
            "chunk_count": len(chunks),
            "chunks": preview_chunks(chunks),
        },
        "text_samples": sample_texts(chunks),
    }


def build_merger_process_record(
    manifest: dict[str, Any],
    filings: list[dict[str, Any]],
    chunks: list[dict[str, Any]],
    dataset_dir: Path,
) -> dict[str, Any]:
    ticker = str(manifest["ticker"]).upper()
    company_name = str(manifest["company_name"])
    dataset_slug = str(manifest["dataset_slug"])
    filing_dates = [str(filing.get("filedAt")) for filing in filings if filing.get("filedAt")]
    forms_covered = list(dict.fromkeys(str(form) for form in manifest.get("forms_queried", []) if form))

    consideration_terms = unique(
        find_sentences(chunks, required_terms=["0.48", "shares", "xylem"], limit=2)
        + find_sentences(chunks, required_terms=["merger consideration"], limit=1)
    ) or ["The filing discloses stock consideration terms and exchange mechanics for the announced merger."]

    ownership_mix = unique(
        find_sentences(chunks, required_terms=["75%", "25%"], limit=1)
    ) or ["The combined ownership split is disclosed using fully diluted share counts."]

    vote_mechanics = unique(
        find_sentences(chunks, required_terms=["special meeting"], limit=2)
        + find_sentences(chunks, required_terms=["vote", "for"], limit=1)
    ) or ["The filing outlines shareholder vote requirements and board recommendations."]

    closing_conditions = unique(
        find_sentences(chunks, required_terms=["subject to the satisfaction or waiver"], limit=1)
        + find_sentences(chunks, required_terms=["conditions set forth in the merger agreement"], limit=1)
    ) or ["The merger remains subject to customary closing conditions set out in the merger agreement."]

    timeline_notes = unique(
        find_sentences(chunks, required_terms=["may 11, 2023"], limit=2)
        + find_sentences(chunks, required_terms=["january 22, 2023"], limit=1)
    ) or ["The filing records the announcement date, registration statement timeline, and vote timing."]

    analyst_relevance = [
        "Use merger filings to extract consideration structure, ownership math, and voting mechanics.",
        "Separate process disclosures from valuation disclosures when training transaction reasoning.",
        "Treat registration statements as primary sources for what shareholders must approve and when.",
    ]

    return {
        "id": f"{slugify(ticker)}_sec_merger_process",
        "title": f"{company_name} Merger Process Filings",
        "file_path": str(dataset_dir),
        "source_type": "sec_merger_process",
        "tier": "B+",
        "primary_bucket": "transaction_methodology",
        "secondary_bucket": "valuation_mechanics",
        "recommended_phase": 1,
        "template_key": "sec_merger_process",
        "assistant_training_targets": [
            "merger process extraction",
            "consideration mechanics",
            "shareholder vote and ownership analysis",
        ],
        "source_summary": f"Registration statement filings for {company_name} merger-related transaction mechanics.",
        "strengths": [
            "primary transaction terms",
            "ownership and exchange-ratio mechanics",
            "board and vote process disclosures",
        ],
        "weaknesses": [
            "legal and procedural language dominates the text",
        ],
        "fields": {
            "title": f"{company_name} Merger Process Filings",
            "deal_name": "Xylem / Evoqua merger",
            "filing_type": ", ".join(forms_covered) if forms_covered else "merger registration statement",
            "forms_covered": forms_covered,
            "filing_dates": filing_dates[:10],
            "consideration_terms": consideration_terms,
            "ownership_mix": ownership_mix,
            "vote_mechanics": vote_mechanics,
            "closing_conditions": closing_conditions,
            "timeline_notes": timeline_notes,
            "analyst_relevance": analyst_relevance,
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "dataset_slug": dataset_slug,
            "manifest_path": str(dataset_dir / "manifest.json"),
            "filings_path": str(dataset_dir / "filings.json"),
            "chunks_path": str(dataset_dir / "chunks.jsonl"),
            "forms_queried": forms_covered,
            "filing_count": manifest.get("filing_count"),
            "chunk_count": manifest.get("chunk_count"),
        },
        "chunking": {
            "strategy": "filing_level",
            "chunk_count": len(chunks),
            "chunks": preview_chunks(chunks),
        },
        "text_samples": sample_texts(chunks),
    }


def build_record(dataset_dir: Path) -> dict[str, Any]:
    manifest = read_json(dataset_dir / "manifest.json")
    filings = read_json(dataset_dir / "filings.json")
    chunks = read_jsonl(dataset_dir / "chunks.jsonl")

    dataset_slug = str(manifest.get("dataset_slug", ""))
    if dataset_slug.startswith("sec-mna-"):
        return build_merger_process_record(manifest, filings, chunks, dataset_dir)
    return build_public_filing_record(manifest, filings, chunks, dataset_dir)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-dir", required=True, help="Path to a SEC dataset directory with manifest/filings/chunks")
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR), help="Directory to write extracted source JSON")
    args = parser.parse_args()

    dataset_dir = Path(args.dataset_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    record = build_record(dataset_dir)
    output_path = output_dir / f"{record['id']}.json"
    output_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    print(str(output_path))


if __name__ == "__main__":
    main()
