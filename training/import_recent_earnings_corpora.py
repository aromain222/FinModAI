#!/usr/bin/env python3
"""Import recently extracted earnings and filing corpora into reviewed training source records."""

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


def compact(items: list[str], limit: int = 6) -> list[str]:
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


def dataset_paths(slug: str) -> tuple[Path, Path, Path]:
    base = DATA_DIR / slug
    return base / "manifest.json", base / "chunks.jsonl", base


def source_metadata(slug: str) -> dict[str, Any]:
    manifest_path, chunks_path, base = dataset_paths(slug)
    manifest = read_json(manifest_path)
    return {
        "manifest_path": str(manifest_path),
        "chunks_path": str(chunks_path),
        "dataset_dir": str(base),
        "page_count": manifest.get("page_count"),
        "chunk_count": manifest.get("chunk_count"),
        "source_url": manifest.get("source_url"),
        "access_status": manifest.get("access_status"),
    }


def write_record(name: str, payload: dict[str, Any]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / f"{name}.json"
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def build_alphabet_transcript() -> Path:
    slug = "alphabet-q4-2025-earnings-call-transcript"
    payload = {
        "id": "alphabet_q4_2025_earnings_call_transcript",
        "title": "Alphabet Q4 2025 Earnings Call Transcript",
        "file_path": str(DATA_DIR / slug),
        "source_type": "earnings_transcript",
        "tier": "A",
        "primary_bucket": "financial_reasoning",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "earnings_transcript",
        "assistant_training_targets": [
            "earnings-call interpretation",
            "management signal extraction",
            "guidance framing",
            "question-and-answer dynamics",
        ],
        "source_summary": "Full Alphabet Q4 2025 earnings-call transcript provided in chat and organized into management themes, KPI highlights, and Q&A signals.",
        "strengths": [
            "management commentary",
            "Q&A dynamics",
            "AI capex and monetization framing",
        ],
        "weaknesses": [
            "user-provided text rather than fetched IR URL",
        ],
        "fields": {
            "title": "Alphabet Q4 2025 Earnings Call Transcript",
            "company_name": "Alphabet Inc.",
            "quarter": "Q4 2025",
            "management_themes": [
                "AI investments and infrastructure are driving growth across Search, Cloud, and product surfaces.",
                "Search is in an expansionary AI moment with more complex queries and early monetization experiments.",
                "Cloud is the clearest monetization engine for AI demand and remains supply constrained.",
            ],
            "financial_highlights": [
                "Q4 2025 consolidated revenue of $113.8 billion.",
                "Google Cloud revenue up 48% to $17.7 billion with 30.1% operating margin.",
                "2026 capex expected in the range of $175 billion to $185 billion.",
            ],
            "guidance_or_outlook": [
                "Management expects continued strong Cloud demand despite tight supply.",
                "Depreciation growth is expected to accelerate in 2026 due to recent infrastructure investment.",
                "Search and Google Services growth are expected to benefit from ongoing product and ad innovation.",
            ],
            "qa_topics": [
                "agentic commerce and Universal Commerce Protocol",
                "AI compute constraints and capex efficiency",
                "SaaS customer demand and Gemini adoption",
                "AI search monetization and cannibalization concerns",
            ],
            "analyst_relevance": [
                "Good source for understanding how management frames capex versus monetization.",
                "Useful for separating reported numbers from the strategic message investors are meant to focus on.",
                "Strong transcript for AI infrastructure, Cloud backlog, and search monetization debate training.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": source_metadata(slug),
    }
    return write_record(payload["id"], payload)


def build_alphabet_release() -> Path:
    slug = "2025q4-alphabet-earnings-release"
    payload = {
        "id": "alphabet_q4_2025_earnings_release",
        "title": "Alphabet Q4 2025 Earnings Release",
        "file_path": str(DATA_DIR / slug),
        "source_type": "earnings_reference",
        "tier": "A",
        "primary_bucket": "financial_reasoning",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "earnings_reference",
        "assistant_training_targets": [
            "earnings-package interpretation",
            "KPI extraction",
            "prepared-remarks compression",
            "investor-facing results framing",
        ],
        "source_summary": "Alphabet's official Q4 2025 earnings release with reported metrics, segment performance, and supplemental financial tables.",
        "strengths": [
            "official reported metrics",
            "segment-level results",
            "supplemental financial tables",
        ],
        "weaknesses": [
            "no adversarial Q&A layer",
        ],
        "fields": {
            "title": "Alphabet Q4 2025 Earnings Release",
            "company_name": "Alphabet Inc.",
            "quarter": "Q4 2025",
            "source_name": "Alphabet Investor Relations",
            "sections": [
                "headline results",
                "supplemental financial information",
                "segment revenue breakdown",
                "webcast information",
            ],
            "key_metrics": [
                "Consolidated revenue of $113.8 billion, up 18%.",
                "Google Services revenue of $95.9 billion.",
                "Google Cloud revenue of $17.7 billion, up 48%.",
                "Operating cash flow and capital expenditure disclosures.",
            ],
            "management_themes": [
                "business acceleration in both Google Services and Google Cloud",
                "AI-related demand and monetization across products",
                "segment performance with Cloud as the fastest-growing major business",
            ],
            "analyst_relevance": [
                "Useful baseline source for reported numbers before transcript interpretation.",
                "Helps tie AI narrative back to the actual segment and cash-flow figures.",
                "Good training source for earnings-release compression and KPI prioritization.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": source_metadata(slug),
    }
    return write_record(payload["id"], payload)


def build_alphabet_slides() -> Path:
    slug = "2025q4-alphabet-earnings-slides"
    payload = {
        "id": "alphabet_q4_2025_earnings_slides",
        "title": "Alphabet Q4 2025 Earnings Slides",
        "file_path": str(DATA_DIR / slug),
        "source_type": "investor_presentation",
        "tier": "A",
        "primary_bucket": "memo_style",
        "secondary_bucket": "financial_reasoning",
        "recommended_phase": 1,
        "template_key": "investor_presentation",
        "assistant_training_targets": [
            "slide compression",
            "contributor/detractor summaries",
            "thesis slide structure",
        ],
        "source_summary": "Alphabet Q4 2025 earnings slides with KPI-heavy summary pages and segment result presentation.",
        "strengths": [
            "KPI prioritization",
            "slide-level compression",
            "segment framing",
        ],
        "weaknesses": [
            "presentation shorthand",
            "forward-looking statement boilerplate",
        ],
        "fields": {
            "title": "Alphabet Q4 2025 Earnings Slides",
            "manager": None,
            "date": "2026-02-04",
            "agenda": [
                "earnings highlights",
                "Google Cloud",
                "Gemini App",
                "Search and Other Ads",
                "financial results",
            ],
            "portfolio_contributors": [],
            "portfolio_detractors": [],
            "holdings_covered": [
                "Google Search & Other",
                "YouTube",
                "Google Cloud",
                "Gemini App",
                "consumer subscriptions",
            ],
            "valuation_points": [
                "Annual revenues exceeded $400 billion for the first time.",
                "Google Cloud annualized revenue run-rate above $70 billion.",
                "Gemini App monthly active users reached 750 million.",
                "Search & Other Ads revenue grew 17% year-over-year.",
            ],
            "exit_or_trim_logic": [],
            "slide_structure_patterns": [
                "front-loaded KPI summary",
                "segment-by-segment performance slides",
                "financial tables and margin bridge visuals",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": source_metadata(slug),
    }
    return write_record(payload["id"], payload)


def build_microsoft_transcript_reference() -> Path:
    slug = "microsoft-fy26-q2-earnings-transcript-reference"
    payload = {
        "id": "microsoft_fy26_q2_earnings_transcript_reference",
        "title": "Microsoft FY26 Q2 Earnings Transcript Reference",
        "file_path": str(DATA_DIR / slug),
        "source_type": "earnings_reference",
        "tier": "A-",
        "primary_bucket": "financial_reasoning",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "earnings_reference",
        "assistant_training_targets": [
            "earnings-package interpretation",
            "KPI extraction",
            "prepared-remarks compression",
            "investor-facing results framing",
        ],
        "source_summary": "Official Microsoft FY26 Q2 earnings reference package anchored to IR pages because the Office viewer wrapper did not expose the transcript body directly.",
        "strengths": [
            "official company source",
            "AI and cloud KPI framing",
            "high-confidence earnings context",
        ],
        "weaknesses": [
            "not a verbatim transcript body",
        ],
        "fields": {
            "title": "Microsoft FY26 Q2 Earnings Transcript Reference",
            "company_name": "Microsoft Corporation",
            "quarter": "FY26 Q2",
            "source_name": "Microsoft Investor Relations",
            "sections": [
                "reported results",
                "segment drivers",
                "investor metrics",
                "training guidance",
            ],
            "key_metrics": [
                "Revenue of $81.3 billion.",
                "Operating income of $38.3 billion.",
                "GAAP diluted EPS of $5.16.",
                "Commercial remaining performance obligation of $625 billion.",
            ],
            "management_themes": [
                "cloud and AI strength across the business",
                "Azure growth and AI infrastructure investment tradeoffs",
                "large-scale enterprise demand visibility through backlog and cloud metrics",
            ],
            "analyst_relevance": [
                "Useful for teaching official-source earnings compression even when the transcript body is unavailable.",
                "Strong for cloud KPI prioritization and AI infrastructure margin tradeoff framing.",
                "Good baseline before layering transcript or Q&A nuance from other sources.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": source_metadata(slug),
    }
    return write_record(payload["id"], payload)


def build_microsoft_slides_reference() -> Path:
    slug = "microsoft-fy26-q2-slides-reference"
    payload = {
        "id": "microsoft_fy26_q2_slides_reference",
        "title": "Microsoft FY26 Q2 Slides Reference",
        "file_path": str(DATA_DIR / slug),
        "source_type": "investor_presentation",
        "tier": "A-",
        "primary_bucket": "memo_style",
        "secondary_bucket": "financial_reasoning",
        "recommended_phase": 1,
        "template_key": "investor_presentation",
        "assistant_training_targets": [
            "slide compression",
            "contributor/detractor summaries",
            "thesis slide structure",
        ],
        "source_summary": "Microsoft FY26 Q2 earnings slide reference anchored to official quarter materials because the Office viewer did not expose the deck body directly.",
        "strengths": [
            "KPI prioritization",
            "official quarter framing",
            "cloud and AI narrative compression",
        ],
        "weaknesses": [
            "reference package rather than literal slide pages",
        ],
        "fields": {
            "title": "Microsoft FY26 Q2 Slides Reference",
            "manager": None,
            "date": None,
            "agenda": [
                "quarter overview",
                "investor metrics",
                "segment commentary",
                "cloud and AI narrative",
            ],
            "portfolio_contributors": [],
            "portfolio_detractors": [],
            "holdings_covered": [
                "Microsoft Cloud",
                "commercial remaining performance obligation",
                "Intelligent Cloud",
                "productivity and business processes",
            ],
            "valuation_points": [
                "Quarter materials emphasize cloud-scale monetization and demand visibility.",
                "AI growth is framed alongside margin and infrastructure investment tradeoffs.",
                "Top-line KPI selection reflects management's investor-priority message.",
            ],
            "exit_or_trim_logic": [],
            "slide_structure_patterns": [
                "quarter-summary compression",
                "KPI-led framing",
                "segment and performance callouts",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": source_metadata(slug),
    }
    return write_record(payload["id"], payload)


def build_microsoft_financials_reference() -> Path:
    slug = "microsoft-fy26-q2-financial-statements-reference"
    payload = {
        "id": "microsoft_fy26_q2_financial_statements_reference",
        "title": "Microsoft FY26 Q2 Financial Statements Reference",
        "file_path": str(DATA_DIR / slug),
        "source_type": "earnings_reference",
        "tier": "A",
        "primary_bucket": "financial_reasoning",
        "secondary_bucket": "valuation_mechanics",
        "recommended_phase": 1,
        "template_key": "earnings_reference",
        "assistant_training_targets": [
            "earnings-package interpretation",
            "KPI extraction",
            "prepared-remarks compression",
            "investor-facing results framing",
        ],
        "source_summary": "Official Microsoft FY26 Q2 financial statement reference package anchored to IR statement pages.",
        "strengths": [
            "official statement pages",
            "cash flow and balance sheet grounding",
            "segment and capex interpretation support",
        ],
        "weaknesses": [
            "reference package rather than raw downloadable workbook",
        ],
        "fields": {
            "title": "Microsoft FY26 Q2 Financial Statements Reference",
            "company_name": "Microsoft Corporation",
            "quarter": "FY26 Q2",
            "source_name": "Microsoft Investor Relations",
            "sections": [
                "income statement",
                "balance sheet",
                "cash flow",
                "segment revenues",
            ],
            "key_metrics": [
                "Reported revenue, operating income, net income, and diluted EPS.",
                "Quarter-end balance sheet and cash generation context.",
                "Segment revenue tables and AI-infrastructure investment implications.",
            ],
            "management_themes": [
                "connect earnings strength to cash generation and capex capacity",
                "interpret AI-related investment intensity through statements",
                "link segment growth to broader cloud and product narrative",
            ],
            "analyst_relevance": [
                "Useful for teaching how to connect earnings headlines to statement detail.",
                "Good source for capex, cash flow, and balance sheet interpretation.",
                "Complements the quarter's results narrative with statement discipline.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": source_metadata(slug),
    }
    return write_record(payload["id"], payload)


def build_micron_release() -> Path:
    slug = "micron-technology-inc-reports-results-for-the-second-quarter-of-fiscal-2026"
    payload = {
        "id": "micron_q2_2026_earnings_release",
        "title": "Micron Q2 Fiscal 2026 Earnings Release",
        "file_path": str(DATA_DIR / slug),
        "source_type": "earnings_reference",
        "tier": "A",
        "primary_bucket": "financial_reasoning",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "earnings_reference",
        "assistant_training_targets": [
            "earnings-package interpretation",
            "KPI extraction",
            "prepared-remarks compression",
            "investor-facing results framing",
        ],
        "source_summary": "Micron's official results release for the second quarter of fiscal 2026.",
        "strengths": [
            "official reported results",
            "semiconductor cycle context",
            "high-signal headline financials",
        ],
        "weaknesses": [
            "no management Q&A",
        ],
        "fields": {
            "title": "Micron Q2 Fiscal 2026 Earnings Release",
            "company_name": "Micron Technology, Inc.",
            "quarter": "Fiscal Q2 2026",
            "source_name": "Micron Investor Relations",
            "sections": [
                "reported results",
                "financial highlights",
                "forward-looking commentary",
            ],
            "key_metrics": [
                "quarterly results and profitability metrics",
                "memory-business revenue and margin context",
                "cash flow and market outlook framing",
            ],
            "management_themes": [
                "strong memory demand and business momentum",
                "AI-driven demand environment",
                "cyclical recovery framed through reported profitability and cash flow",
            ],
            "analyst_relevance": [
                "Good anchor source for the quarter's factual baseline before using prepared remarks.",
                "Useful for semiconductor earnings compression and cycle interpretation.",
                "Should be paired with the deck and remarks for a fuller management picture.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": source_metadata(slug),
    }
    return write_record(payload["id"], payload)


def build_micron_prepared_remarks() -> Path:
    slug = "q2-2026-prepared-remarks"
    payload = {
        "id": "micron_q2_2026_prepared_remarks",
        "title": "Micron Q2 2026 Prepared Remarks",
        "file_path": str(DATA_DIR / slug),
        "source_type": "earnings_transcript",
        "tier": "A",
        "primary_bucket": "financial_reasoning",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "earnings_transcript",
        "assistant_training_targets": [
            "earnings-call interpretation",
            "management signal extraction",
            "guidance framing",
            "question-and-answer dynamics",
        ],
        "source_summary": "Micron fiscal Q2 2026 prepared remarks with management discussion of memory markets, technology ramp, profitability, and outlook.",
        "strengths": [
            "management commentary",
            "semiconductor cycle framing",
            "technology-node and HBM positioning",
        ],
        "weaknesses": [
            "prepared remarks only, without full analyst Q&A in this package",
        ],
        "fields": {
            "title": "Micron Q2 2026 Prepared Remarks",
            "company_name": "Micron Technology, Inc.",
            "quarter": "Fiscal Q2 2026",
            "management_themes": [
                "exceptional quarter with record revenue, margin, EPS, and free cash flow",
                "HBM, DRAM, and NAND demand strength tied to AI infrastructure",
                "technology-node progress and manufacturing ramp discipline",
            ],
            "financial_highlights": [
                "record revenue, gross margin, EPS, and free cash flow highlighted in the prepared remarks",
                "strong business-unit and memory-segment performance",
                "forward guidance signaling continued momentum",
            ],
            "guidance_or_outlook": [
                "Q3 revenue guidance above the full-year revenue of prior years was highlighted in the deck text.",
                "management tied outlook to AI-driven memory demand and node ramp execution",
            ],
            "qa_topics": [
                "HBM and AI memory demand",
                "node transitions and manufacturing yields",
                "margin and free-cash-flow sustainability",
            ],
            "analyst_relevance": [
                "Good source for understanding how Micron frames the memory upcycle and AI demand to investors.",
                "Useful for semiconductor management-tone training and outlook compression.",
                "Prepared remarks help separate structural demand claims from cyclical earnings beats.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": source_metadata(slug),
    }
    return write_record(payload["id"], payload)


def build_micron_deck() -> Path:
    slug = "q2-2026-earnings-deck"
    payload = {
        "id": "micron_q2_2026_earnings_deck",
        "title": "Micron Q2 2026 Earnings Deck",
        "file_path": str(DATA_DIR / slug),
        "source_type": "investor_presentation",
        "tier": "A",
        "primary_bucket": "memo_style",
        "secondary_bucket": "financial_reasoning",
        "recommended_phase": 1,
        "template_key": "investor_presentation",
        "assistant_training_targets": [
            "slide compression",
            "contributor/detractor summaries",
            "thesis slide structure",
        ],
        "source_summary": "Micron Q2 2026 earnings deck with management-overview slides, technology ramp commentary, and AI-driven memory-market framing.",
        "strengths": [
            "slide-level semiconductor framing",
            "technology and demand compression",
            "management KPI emphasis",
        ],
        "weaknesses": [
            "presentation shorthand",
            "selective management framing",
        ],
        "fields": {
            "title": "Micron Q2 2026 Earnings Deck",
            "manager": None,
            "date": "2026-03-18",
            "agenda": [
                "overview",
                "technology",
                "DRAM",
                "NAND",
                "HBM",
                "financial highlights",
            ],
            "portfolio_contributors": [],
            "portfolio_detractors": [],
            "holdings_covered": [
                "HBM",
                "DRAM",
                "NAND",
                "1-gamma DRAM",
                "G9 NAND",
            ],
            "valuation_points": [
                "record revenue, gross margin, EPS, and free cash flow",
                "fiscal Q3 revenue guidance above prior full-year revenue baselines",
                "technology-node ramps framed as a driver of operating leverage and competitiveness",
            ],
            "exit_or_trim_logic": [],
            "slide_structure_patterns": [
                "safe-harbor setup followed by management overview",
                "technology and node-transition slides",
                "financial-performance and guidance summary slides",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": source_metadata(slug),
    }
    return write_record(payload["id"], payload)


def build_micron_filing() -> Path:
    slug = "0000723125-26-000006"
    payload = {
        "id": "micron_q2_2026_10q_filing",
        "title": "Micron Fiscal Q2 2026 10-Q Filing",
        "file_path": str(DATA_DIR / slug),
        "source_type": "sec_public_filings",
        "tier": "A-",
        "primary_bucket": "valuation_mechanics",
        "secondary_bucket": "financial_reasoning",
        "recommended_phase": 1,
        "template_key": "sec_public_filing",
        "assistant_training_targets": [
            "public filing interpretation",
            "capital allocation extraction",
            "liquidity and risk extraction",
            "analyst underwriting takeaways",
        ],
        "source_summary": "Micron's filed 10-Q for the quarter ended February 26, 2026, including statements, MD&A, and risk disclosures.",
        "strengths": [
            "primary filing",
            "MD&A and liquidity sections",
            "statement and notes structure",
        ],
        "weaknesses": [
            "raw filing includes exhibit and plan noise in later pages",
        ],
        "fields": {
            "title": "Micron Fiscal Q2 2026 10-Q Filing",
            "company_name": "Micron Technology, Inc.",
            "ticker": "MU",
            "cik": "0000723125",
            "forms_covered": ["10-Q"],
            "filing_dates": ["quarter ended February 26, 2026"],
            "capital_markets_activity": [
                "Quarterly filing focused primarily on operating performance, statements, and capital structure disclosures.",
            ],
            "capital_allocation_activity": [
                "Use the filing to assess capital allocation, investment intensity, and balance sheet posture from primary disclosures.",
            ],
            "liquidity_notes": [
                "Contains liquidity and capital resources discussion in MD&A.",
                "Includes full financial statements and notes for cash, debt, and working-capital analysis.",
            ],
            "governance_notes": [
                "Includes standard quarterly filing governance and control disclosures.",
            ],
            "controls_and_risk_notes": [
                "Includes risk factors, controls, and MD&A sections relevant for underwriting.",
            ],
            "analyst_relevance": [
                "Good primary source for validating management commentary against filed numbers.",
                "Useful for liquidity, capital structure, and working-capital interpretation.",
                "Should be used to ground any semiconductor thesis derived from the release or deck.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": source_metadata(slug),
    }
    return write_record(payload["id"], payload)


def build_apple_q1_statements() -> Path:
    slug = "fy26-q1-consolidated-financial-statements"
    payload = {
        "id": "apple_fy26_q1_consolidated_financial_statements",
        "title": "Apple FY26 Q1 Consolidated Financial Statements",
        "file_path": str(DATA_DIR / slug),
        "source_type": "sec_public_filings",
        "tier": "A",
        "primary_bucket": "valuation_mechanics",
        "secondary_bucket": "financial_reasoning",
        "recommended_phase": 1,
        "template_key": "sec_public_filing",
        "assistant_training_targets": [
            "public filing interpretation",
            "capital allocation extraction",
            "liquidity and risk extraction",
            "analyst underwriting takeaways",
        ],
        "source_summary": "Apple condensed consolidated financial statements for FY26 Q1 with statements of operations, balance sheet, and cash flow.",
        "strengths": [
            "clean statement-only package",
            "quarterly operating and cash-flow data",
            "high-signal primary financial source",
        ],
        "weaknesses": [
            "does not include full MD&A narrative",
        ],
        "fields": {
            "title": "Apple FY26 Q1 Consolidated Financial Statements",
            "company_name": "Apple Inc.",
            "ticker": "AAPL",
            "cik": "0000320193",
            "forms_covered": ["Condensed consolidated financial statements"],
            "filing_dates": ["three months ended December 27, 2025"],
            "capital_markets_activity": [
                "Statement package is more useful for cash generation and capital structure than episodic financing events.",
            ],
            "capital_allocation_activity": [
                "Use the statement package to evaluate profitability, shareholder returns capacity, and cash deployment.",
            ],
            "liquidity_notes": [
                "Includes condensed balance sheet and cash flow statements.",
                "Useful for cash, marketable securities, debt, and working-capital analysis.",
            ],
            "governance_notes": [
                "Statement-only package with limited governance narrative.",
            ],
            "controls_and_risk_notes": [
                "Risk and controls detail should be paired with the full filed report if needed.",
            ],
            "analyst_relevance": [
                "Good source for quick statement reading without the noise of a full annual filing.",
                "Useful for linking revenue, margin, and cash flow in a very clean primary-source format.",
                "Good complement to longer Apple 10-K style training material.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": source_metadata(slug),
    }
    return write_record(payload["id"], payload)


def build_apple_historical_filings() -> Path:
    payload = {
        "id": "apple_historical_filed_reports",
        "title": "Apple Historical Filed Reports (2022-2025)",
        "file_path": str(DATA_DIR / "10-k-2025-as-filed"),
        "source_type": "sec_public_filings",
        "tier": "A-",
        "primary_bucket": "valuation_mechanics",
        "secondary_bucket": "financial_reasoning",
        "recommended_phase": 1,
        "template_key": "sec_public_filing",
        "assistant_training_targets": [
            "public filing interpretation",
            "capital allocation extraction",
            "liquidity and risk extraction",
            "analyst underwriting takeaways",
        ],
        "source_summary": "Grouped Apple filed-report corpus across 2022-2025, combining annual reports and a more recent quarterly filing package for historical disclosure training.",
        "strengths": [
            "multi-year primary filings",
            "business, MD&A, and risk-factor structure",
            "statement and disclosure continuity across years",
        ],
        "weaknesses": [
            "raw PDF extraction includes some boilerplate and exhibit noise",
            "one quarterly package appears noisier than the annual reports",
        ],
        "fields": {
            "title": "Apple Historical Filed Reports (2022-2025)",
            "company_name": "Apple Inc.",
            "ticker": "AAPL",
            "cik": "0000320193",
            "forms_covered": ["10-K", "10-Q"],
            "filing_dates": [
                "fiscal year ended September 27, 2025",
                "2024 quarterly and annual filed report package",
                "fiscal year ended 2023 as filed",
                "fiscal year ended 2022 as filed",
            ],
            "capital_markets_activity": [
                "Historical Apple filings are most useful for capital return posture, debt disclosures, and long-cycle operating commentary rather than episodic financing events.",
            ],
            "capital_allocation_activity": [
                "Use the multi-year filing set to study buyback capacity, margin durability, and services versus products mix evolution.",
            ],
            "liquidity_notes": [
                "Annual and quarterly reports support multi-period cash, debt, and free-cash-flow interpretation.",
                "Useful for teaching statement continuity and historical trend grounding from primary filings.",
            ],
            "governance_notes": [
                "Annual reports include business, legal, and governance disclosure structure across multiple years.",
            ],
            "controls_and_risk_notes": [
                "Multi-year risk-factor and MD&A structure is useful for teaching how mature companies disclose recurring risks and shifts in emphasis.",
            ],
            "analyst_relevance": [
                "Strong multi-year filing corpus for grounding large-cap tech underwriting in primary disclosures.",
                "Useful for connecting business description, MD&A, and statement analysis over time.",
                "Should be used with cleaner quarterly statement packages when exact numbers are needed quickly.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "datasets": [
                source_metadata("10-k-2025-as-filed"),
                source_metadata("10-q4-2024-as-filed"),
                source_metadata("10-k-q4-2023-as-filed"),
                source_metadata("10-k-2022-as-filed"),
            ]
        },
    }
    return write_record(payload["id"], payload)


def main() -> None:
    outputs = [
        build_alphabet_transcript(),
        build_alphabet_release(),
        build_alphabet_slides(),
        build_microsoft_transcript_reference(),
        build_microsoft_slides_reference(),
        build_microsoft_financials_reference(),
        build_micron_release(),
        build_micron_prepared_remarks(),
        build_micron_deck(),
        build_micron_filing(),
        build_apple_q1_statements(),
        build_apple_historical_filings(),
    ]
    print(json.dumps({"written": [str(path) for path in outputs]}, indent=2))


if __name__ == "__main__":
    main()
