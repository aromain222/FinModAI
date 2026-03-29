#!/usr/bin/env python3
"""Import previously extracted non-SEC corpora into reviewed training source records."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data" / "training"
OUTPUT_DIR = ROOT / "training" / "extracted_sources" / "phase_1"


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    if not path.exists():
        return rows
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        rows.append(json.loads(line))
    return rows


def compact(items: list[str], limit: int = 8) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for item in items:
        cleaned = " ".join(str(item).split()).strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(cleaned)
        if len(out) >= limit:
            break
    return out


def write_record(name: str, payload: dict[str, Any]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return path


def build_acf4_record() -> Path:
    manifest = read_json(DATA_DIR / "acf4ebook" / "manifest.json")
    specials = read_jsonl(DATA_DIR / "acf4ebook" / "special_items.jsonl")
    chunk_path = DATA_DIR / "acf4ebook" / "chunks.jsonl"

    section_counts = manifest.get("section_type_counts", {})
    chapters = manifest.get("chapters", [])
    chapter_titles = compact([str(chapter.get("chapter_title", "")) for chapter in chapters], limit=8)
    learning_modes = []
    if section_counts.get("live_case", 0):
        learning_modes.append(f"{section_counts['live_case']} live case studies")
    if section_counts.get("illustration", 0):
        learning_modes.append(f"{section_counts['illustration']} worked illustrations")
    if section_counts.get("concept_question", 0):
        learning_modes.append(f"{section_counts['concept_question']} concept-question sections")

    payload = {
        "id": "damodaran_acf4_handbook",
        "title": "Applied Corporate Finance (4th ed.)",
        "file_path": str(DATA_DIR / "acf4ebook"),
        "source_type": "finance_handbook",
        "tier": "A",
        "primary_bucket": "valuation_mechanics",
        "secondary_bucket": "eval_cases",
        "recommended_phase": 1,
        "template_key": "finance_handbook",
        "assistant_training_targets": [
            "corporate finance reasoning",
            "decision framework extraction",
            "valuation mechanics",
            "capital allocation logic",
        ],
        "source_summary": "Damodaran corporate finance textbook extracted into chapters and applied-learning sections.",
        "strengths": [
            "first-principles corporate finance",
            "valuation and capital structure logic",
            "applied learning sections",
        ],
        "weaknesses": [
            "textbook tone",
            "not a primary market source",
        ],
        "fields": {
            "title": "Applied Corporate Finance (4th ed.)",
            "author": "Aswath Damodaran",
            "subject_areas": [
                "investment decision",
                "financing decision",
                "dividend and payout policy",
                "risk and hurdle rates",
                "capital structure",
                "valuation",
            ],
            "chapter_titles": chapter_titles,
            "core_frameworks": [
                "invest only in assets that earn above the hurdle rate",
                "match financing mix to asset risk and tenor",
                "return excess cash when you cannot clear the hurdle rate",
                "maximize firm value through integrated investment, financing, and payout decisions",
            ],
            "applied_learning_modes": learning_modes or ["chapter applications and worked illustrations"],
            "analyst_relevance": [
                "Build reusable investment, financing, and payout decision frameworks.",
                "Strengthen DCF, hurdle-rate, and capital-structure reasoning.",
                "Use live cases and concept questions as evaluation-style prompts.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "manifest_path": str(DATA_DIR / "acf4ebook" / "manifest.json"),
            "chunks_path": str(chunk_path),
            "special_items_path": str(DATA_DIR / "acf4ebook" / "special_items.jsonl"),
            "page_count": manifest.get("page_count"),
            "chunk_count": manifest.get("chunk_count"),
            "special_item_count": manifest.get("special_item_count"),
        },
        "chunking": {
            "strategy": "chapter_and_special_section",
            "chunk_count": manifest.get("chunk_count"),
            "chunks": [
                {
                    "label": entry.get("section_type"),
                    "start_page": entry.get("page_start"),
                    "end_page": entry.get("page_end"),
                    "text_preview": " ".join(str(entry.get("text", ""))[:260].split()),
                }
                for entry in specials[:6]
            ],
        },
        "text_samples": [],
    }
    return write_record("damodaran_acf4_handbook", payload)


def build_macrosynergy_record() -> Path:
    manifest = read_json(DATA_DIR / "macrosynergy-macro-quantimental-investment-handbook" / "manifest.json")
    chunk_path = DATA_DIR / "macrosynergy-macro-quantimental-investment-handbook" / "chunks.jsonl"
    chapters = manifest.get("chapters", [])
    chapter_titles = compact([str(chapter.get("chapter_title", "")) for chapter in chapters], limit=8)

    payload = {
        "id": "macrosynergy_quantamental_handbook",
        "title": "Macrosynergy Macro-Quantimental Investment Handbook",
        "file_path": str(DATA_DIR / "macrosynergy-macro-quantimental-investment-handbook"),
        "source_type": "macro_handbook",
        "tier": "B+",
        "primary_bucket": "valuation_mechanics",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "macro_handbook",
        "assistant_training_targets": [
            "macro strategy reasoning",
            "signal design logic",
            "systematic macro framing",
            "quantamental methodology",
        ],
        "source_summary": "Macro-quantamental handbook focused on point-in-time macro indicators and systematic trading design.",
        "strengths": [
            "point-in-time macro discipline",
            "signal construction logic",
            "systematic macro process",
        ],
        "weaknesses": [
            "methodology-heavy tone",
            "not a live market note source",
        ],
        "fields": {
            "title": "Macrosynergy Macro-Quantimental Investment Handbook",
            "publisher": "Macrosynergy",
            "subject_areas": [
                "macro information states",
                "quantamental indicators",
                "systematic macro trading",
                "proof-of-concept design",
                "data science for macro signals",
            ],
            "chapter_titles": chapter_titles,
            "core_frameworks": [
                "use point-in-time macro information to avoid look-ahead bias",
                "connect economic information states to tradable market signals",
                "build systematic macro strategies through explicit data and signal design",
            ],
            "signal_design_principles": [
                "point-in-time data integrity",
                "vintage-aware macro histories",
                "signal backtesting without hindsight contamination",
                "causal linkage between macro states and asset returns",
            ],
            "analyst_relevance": [
                "Improve macro mechanism reasoning and signal hygiene.",
                "Train the model to think in point-in-time rather than revised-history terms.",
                "Support systematic macro and multi-asset research workflows.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "manifest_path": str(DATA_DIR / "macrosynergy-macro-quantimental-investment-handbook" / "manifest.json"),
            "chunks_path": str(chunk_path),
            "page_count": manifest.get("page_count"),
            "chunk_count": manifest.get("chunk_count"),
        },
        "chunking": {
            "strategy": "chapter_text",
            "chunk_count": manifest.get("chunk_count"),
            "chunks": [],
        },
        "text_samples": [],
    }
    return write_record("macrosynergy_quantamental_handbook", payload)


def build_geopolitical_alpha_record() -> Path:
    manifest = read_json(DATA_DIR / "geopolitical-alpha-pdf" / "manifest.json")
    chunk_path = DATA_DIR / "geopolitical-alpha-pdf" / "chunks.jsonl"
    chapters = manifest.get("chapters", [])
    chapter_titles = compact([str(chapter.get("chapter_title", "")) for chapter in chapters], limit=8)

    payload = {
        "id": "geopolitical_alpha_playbook",
        "title": "Geopolitical Alpha",
        "file_path": str(DATA_DIR / "geopolitical-alpha-pdf"),
        "source_type": "macro_handbook",
        "tier": "B",
        "primary_bucket": "memo_style",
        "secondary_bucket": "financial_reasoning",
        "recommended_phase": 1,
        "template_key": "macro_handbook",
        "assistant_training_targets": [
            "macro strategy reasoning",
            "geopolitical transmission logic",
            "institutional-constraint framing",
            "event-to-market causal analysis",
        ],
        "source_summary": "Geopolitical framework book focused on constraints, institutions, and market transmission of political shocks.",
        "strengths": [
            "institutional and political-process framing",
            "good event-to-market transmission structure",
            "useful for geopolitical headline interpretation",
        ],
        "weaknesses": [
            "OCR and formatting noise in the extracted PDF",
            "appears to be a derivative summary rather than a pristine original edition",
        ],
        "fields": {
            "title": "Geopolitical Alpha",
            "publisher": "Book-length geopolitical strategy reference",
            "subject_areas": [
                "geopolitical constraints",
                "institutions and bureaucracies",
                "market implications of geopolitical events",
                "investment integration of geopolitical analysis",
            ],
            "chapter_titles": chapter_titles,
            "core_frameworks": [
                "separate political intent from institutional capacity",
                "map geopolitical shocks through commodities, trade routes, and risk premia",
                "treat implementation constraints as a core part of market analysis",
            ],
            "signal_design_principles": [
                "focus on constraints, not personalities",
                "identify first-order versus second-order market channels",
                "use process and institutions to gauge whether the headline is durable",
            ],
            "analyst_relevance": [
                "Improve geopolitical event framing in headlines and events products.",
                "Support disciplined market-impact analysis on sanctions, conflict, trade, and shipping risk.",
                "Help the model suppress low-signal political noise when institutional follow-through is weak.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "manifest_path": str(DATA_DIR / "geopolitical-alpha-pdf" / "manifest.json"),
            "chunks_path": str(chunk_path),
            "page_count": manifest.get("page_count"),
            "chunk_count": manifest.get("chunk_count"),
        },
        "chunking": {
            "strategy": "chapter_text",
            "chunk_count": manifest.get("chunk_count"),
            "chunks": [],
        },
        "text_samples": [],
    }
    return write_record("geopolitical_alpha_playbook", payload)


def build_changing_world_order_record() -> Path:
    manifest = read_json(DATA_DIR / "changing-world-order-ray-dalio" / "manifest.json")
    chunk_path = DATA_DIR / "changing-world-order-ray-dalio" / "chunks.jsonl"

    payload = {
        "id": "changing_world_order_dalio",
        "title": "The Changing World Order",
        "file_path": str(DATA_DIR / "changing-world-order-ray-dalio"),
        "source_type": "macro_handbook",
        "tier": "A-",
        "primary_bucket": "financial_reasoning",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "macro_handbook",
        "assistant_training_targets": [
            "debt-cycle reasoning",
            "reserve-currency regime framing",
            "capital-flow and term-premium logic",
            "macro scenario construction",
        ],
        "source_summary": "Dalio framework on debt cycles, reserve currencies, empire transitions, and the market implications of long-cycle macro shifts.",
        "strengths": [
            "strong debt and reserve-currency cycle framing",
            "useful long-duration macro template",
            "connects policy limits to asset-pricing regimes",
        ],
        "weaknesses": [
            "historical and thematic rather than point-in-time",
            "chapter detection in extraction was weak",
        ],
        "fields": {
            "title": "The Changing World Order",
            "publisher": "Bridgewater / Ray Dalio macro reference",
            "subject_areas": [
                "debt cycles",
                "money and credit",
                "reserve currencies",
                "empire transitions",
                "capital markets under regime change",
            ],
            "chapter_titles": [
                "The Big Cycles in a Tiny Nutshell",
                "The Big Cycle of Money, Credit, Debt, and Economic Activity",
                "The Changing Value of Money",
                "The Big Cycles of Empires and Their Currencies",
            ],
            "core_frameworks": [
                "high debt plus low rates can reduce policy flexibility",
                "reserve-currency strength and capital flows shape duration and FX behavior",
                "internal conflict and external rivalry can coincide with weaker monetary regimes",
            ],
            "signal_design_principles": [
                "treat debt and reserve-currency stress as market-regime variables",
                "separate nominal growth from the cost of capital",
                "watch policy capacity, not just policy intent",
            ],
            "analyst_relevance": [
                "Support structural macro and rates narratives in CapitalBase events outputs.",
                "Improve scenario framing for debt stress, reserve rebalancing, and long-duration valuation pressure.",
                "Help the model reason about why lower growth does not always imply lower discount rates.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "manifest_path": str(DATA_DIR / "changing-world-order-ray-dalio" / "manifest.json"),
            "chunks_path": str(chunk_path),
            "page_count": manifest.get("page_count"),
            "chunk_count": manifest.get("chunk_count"),
        },
        "chunking": {
            "strategy": "chunk_text",
            "chunk_count": manifest.get("chunk_count"),
            "chunks": [],
        },
        "text_samples": [],
    }
    return write_record("changing_world_order_dalio", payload)


def build_this_time_is_different_record() -> Path:
    manifest = read_json(DATA_DIR / "this-time-is-different" / "manifest.json")
    chunk_path = DATA_DIR / "this-time-is-different" / "chunks.jsonl"
    chapters = manifest.get("chapters", [])
    chapter_titles = compact([str(chapter.get("chapter_title", "")) for chapter in chapters], limit=8)

    payload = {
        "id": "this_time_is_different_crisis_handbook",
        "title": "This Time Is Different",
        "file_path": str(DATA_DIR / "this-time-is-different"),
        "source_type": "macro_handbook",
        "tier": "A-",
        "primary_bucket": "financial_reasoning",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "macro_handbook",
        "assistant_training_targets": [
            "financial-crisis pattern recognition",
            "sovereign and banking stress reasoning",
            "credit-cycle market transmission",
            "crisis scenario framing",
        ],
        "source_summary": "Historical crisis reference focused on banking panics, sovereign defaults, and recurring leverage/funding patterns across centuries.",
        "strengths": [
            "strong crisis pattern library",
            "banking and sovereign stress framing",
            "good for debt, funding, and sudden-stop reasoning",
        ],
        "weaknesses": [
            "the extracted file appears partial / excerpted rather than full length",
            "best used as framework training, not exhaustive historical data",
        ],
        "fields": {
            "title": "This Time Is Different",
            "publisher": "Historical financial-crisis reference",
            "subject_areas": [
                "banking crises",
                "sovereign defaults",
                "debt overhang",
                "credit booms and busts",
                "sudden stops and funding stress",
            ],
            "chapter_titles": chapter_titles or ["Financial Crises", "The United States in the run-up to the financial crisis"],
            "core_frameworks": [
                "credit booms often end in banking or sovereign stress rather than a smooth normalization",
                "funding and rollover pressure can tighten financial conditions before macro data fully deteriorates",
                "crisis regimes are recurrent and should be treated as pattern problems, not one-off surprises",
            ],
            "signal_design_principles": [
                "watch funding stress and balance-sheet fragility before GDP catches up",
                "track sovereign and banking stress as linked but distinct channels",
                "treat crisis regimes as nonlinear scenario problems with wider tails",
            ],
            "analyst_relevance": [
                "Strengthen crisis framing in headlines and event intelligence.",
                "Improve scenario logic for banking panic, sovereign stress, and sudden-stop environments.",
                "Teach the model to explain balance-sheet transmission rather than reducing every crisis to a generic slowdown.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "manifest_path": str(DATA_DIR / "this-time-is-different" / "manifest.json"),
            "chunks_path": str(chunk_path),
            "page_count": manifest.get("page_count"),
            "chunk_count": manifest.get("chunk_count"),
        },
        "chunking": {
            "strategy": "chapter_text",
            "chunk_count": manifest.get("chunk_count"),
            "chunks": [],
        },
        "text_samples": [],
    }
    return write_record("this_time_is_different_crisis_handbook", payload)


def build_investopedia_record() -> Path:
    manifest = read_json(DATA_DIR / "investopedia-economic-indicators-stock-market" / "manifest.json")
    payload = {
        "id": "investopedia_macro_indicators_reference",
        "title": "Key Macroeconomic Indicators Impacting the US Stock Market",
        "file_path": str(DATA_DIR / "investopedia-economic-indicators-stock-market"),
        "source_type": "reference_article",
        "tier": "B",
        "primary_bucket": "memo_style",
        "secondary_bucket": "valuation_mechanics",
        "recommended_phase": 1,
        "template_key": "reference_article",
        "assistant_training_targets": [
            "macro mechanism explanation",
            "market interpretation",
            "plain-English teaching",
        ],
        "source_summary": "Reference explainer on how key macro indicators feed through to stock-market expectations.",
        "strengths": [
            "clear market mechanisms",
            "plain-English macro explanation",
            "useful refresher structure",
        ],
        "weaknesses": [
            "secondary source",
            "not suitable for live-data citation",
        ],
        "fields": {
            "title": manifest.get("title"),
            "source_name": manifest.get("source_name"),
            "topic": "macro indicators and equity-market transmission",
            "sections": manifest.get("sections", []),
            "key_mechanisms": [
                "GDP shapes earnings expectations and equity valuations",
                "employment data influences consumer demand and profit expectations",
                "inflation data changes rate expectations and discount rates",
                "retail sales and industrial production act as real-economy demand and activity signals",
            ],
            "analyst_relevance": [
                "Use as a teaching reference for macro-to-equity transmission.",
                "Support clear explanations of why macro data releases move markets.",
                "Pair with primary macro releases for current analysis.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "manifest_path": str(DATA_DIR / "investopedia-economic-indicators-stock-market" / "manifest.json"),
            "chunks_path": str(DATA_DIR / "investopedia-economic-indicators-stock-market" / "chunks.jsonl"),
            "chunk_count": manifest.get("chunk_count"),
            "updated_at": manifest.get("updated_at"),
            "source_url": manifest.get("source_url"),
        },
        "chunking": {
            "strategy": "web_sections",
            "chunk_count": manifest.get("chunk_count"),
            "chunks": [],
        },
        "text_samples": [],
    }
    return write_record("investopedia_macro_indicators_reference", payload)


def main() -> None:
    paths = [
        build_acf4_record(),
        build_macrosynergy_record(),
        build_geopolitical_alpha_record(),
        build_changing_world_order_record(),
        build_this_time_is_different_record(),
        build_investopedia_record(),
    ]
    for path in paths:
        print(path)


if __name__ == "__main__":
    main()
