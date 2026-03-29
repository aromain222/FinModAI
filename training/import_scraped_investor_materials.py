#!/usr/bin/env python3
"""Import scraped investor-material directories into reviewed training source records."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
SCRAPED_DATA_DIR = ROOT / "finmodai-next" / "data"
OUTPUT_DIR = ROOT / "training" / "extracted_sources" / "phase_1"
SKIP_GENERIC_FOR_TICKERS = {"AAPL", "AMZN", "GOOGL", "META", "MSFT", "NVDA"}

EARNINGS_TITLE_PATTERNS = (
    "earnings",
    "results",
    "press release",
    "financial results",
    "quarter",
)
TRANSCRIPT_TITLE_PATTERNS = (
    "transcript",
    "conference call",
    "earnings call",
    "prepared remarks",
    "webcast",
)
PRESENTATION_TITLE_PATTERNS = (
    "presentation",
    "slides",
    "deck",
    "annual meeting",
    "investor day",
    "healthcare",
    "jpm",
    "quarterly presentation",
)


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


def normalize_title(path: Path) -> str:
    title = path.stem
    title = re.sub(r"-[0-9a-f]{10}$", "", title)
    title = title.replace("_", " ").replace("-", " ")
    title = re.sub(r"\s+", " ", title).strip()
    return title or path.stem


def load_company_map() -> dict[str, str]:
    mapping: dict[str, str] = {}
    for path in SCRAPED_DATA_DIR.glob("company-batch*.json"):
        try:
            rows = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(rows, list):
            continue
        for row in rows:
            ticker = str(row.get("ticker", "")).upper().strip()
            name = str(row.get("name", "")).strip()
            if ticker and name:
                mapping[ticker] = name

    for path in SCRAPED_DATA_DIR.glob("investor-materials-scrape-results*.json"):
        try:
            rows = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if not isinstance(rows, list):
            continue
        for row in rows:
            ticker = str(row.get("ticker", "")).upper().strip()
            name = str(row.get("company", "")).strip()
            if ticker and name:
                mapping[ticker] = name
    return mapping


def list_titles(category_dir: Path, limit: int = 6) -> list[str]:
    files = sorted(
        [path for path in category_dir.iterdir() if path.is_file()],
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    return compact([normalize_title(path) for path in files], limit=limit)


def list_filtered_titles(category_dir: Path, patterns: tuple[str, ...], limit: int = 8) -> list[str]:
    titles = list_titles(category_dir, limit=50)
    filtered = [title for title in titles if any(pattern in title.lower() for pattern in patterns)]
    return compact(filtered, limit=limit)


def write_record(payload: dict[str, Any]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / f"{payload['id']}.json"
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    return path


def base_metadata(company_dir: Path) -> dict[str, Any]:
    categories = {}
    total_files = 0
    for child in sorted(company_dir.iterdir()):
        if not child.is_dir():
            continue
        count = len([path for path in child.iterdir() if path.is_file()])
        categories[child.name] = count
        total_files += count
    return {
        "dataset_dir": str(company_dir),
        "categories": categories,
        "document_count": total_files,
    }


def has_existing_curated_sec_record(ticker: str) -> bool:
    return (OUTPUT_DIR / f"{ticker.lower()}_sec_public_filings.json").exists()


def build_sec_public_filing(ticker: str, company_name: str, company_dir: Path) -> dict[str, Any] | None:
    tenk_dir = company_dir / "10k"
    tenq_dir = company_dir / "10q"
    if not tenk_dir.is_dir() and not tenq_dir.is_dir():
        return None
    has_richer_materials = any((company_dir / category).is_dir() for category in ("earnings", "presentation", "transcript"))
    if ticker in SKIP_GENERIC_FOR_TICKERS or has_richer_materials or has_existing_curated_sec_record(ticker):
        return None

    forms_covered: list[str] = []
    filing_dates: list[str] = []
    if tenk_dir.is_dir():
        forms_covered.append("10-K")
        filing_dates.extend(list_titles(tenk_dir, limit=4))
    if tenq_dir.is_dir():
        forms_covered.append("10-Q")
        filing_dates.extend(list_titles(tenq_dir, limit=4))

    return {
        "id": f"scraped_{ticker.lower()}_sec_public_filings",
        "title": f"{company_name} Scraped Public Filings",
        "file_path": str(company_dir),
        "source_type": "sec_public_filing",
        "tier": "B",
        "primary_bucket": "financial_reasoning",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "sec_public_filing",
        "assistant_training_targets": [
            "public filing interpretation",
            "capital allocation extraction",
            "liquidity and risk extraction",
            "analyst underwriting takeaways",
        ],
        "source_summary": f"Scraper-collected recent {', '.join(forms_covered)} materials for {company_name}, stored locally from official filings or company investor-material pages.",
        "strengths": [
            "official company disclosures",
            "recent 10-K and 10-Q coverage",
            "good baseline for underwriting workflow",
        ],
        "weaknesses": [
            "import is title-driven rather than section-by-section extracted",
            "capital allocation and risk notes should be refined with deeper filing parsing later",
        ],
        "fields": {
            "title": f"{company_name} Scraped Public Filings",
            "company_name": company_name,
            "ticker": ticker,
            "cik": None,
            "forms_covered": forms_covered,
            "filing_dates": compact(filing_dates, limit=8),
            "capital_markets_activity": [
                "Use the recent filing set to identify financing, share issuance, debt activity, or recapitalization only after deeper filing parsing.",
            ],
            "capital_allocation_activity": [
                "Look for buybacks, dividends, and investment posture in the latest annual and quarterly filings.",
            ],
            "liquidity_notes": [
                "Recent 10-Q and 10-K filings provide the baseline liquidity and balance-sheet check for underwriting.",
            ],
            "governance_notes": [
                "Use the filing set to cross-check control statements, governance updates, and disclosure consistency.",
            ],
            "controls_and_risk_notes": [
                "Risk and controls language should be pulled from the latest annual report before changing the underwriting view.",
            ],
            "analyst_relevance": [
                "Useful baseline source for keeping model assumptions tied to actual company disclosures.",
                "Good training lane for separating recurring filing signals from one-off market narratives.",
                "Should be paired with richer IR materials when available.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": base_metadata(company_dir),
    }


def build_earnings_reference(ticker: str, company_name: str, company_dir: Path) -> dict[str, Any] | None:
    earnings_dir = company_dir / "earnings"
    if not earnings_dir.is_dir():
        return None
    titles = list_filtered_titles(earnings_dir, EARNINGS_TITLE_PATTERNS, limit=8)
    if not titles:
        return None
    return {
        "id": f"scraped_{ticker.lower()}_earnings_reference",
        "title": f"{company_name} Scraped Earnings Package",
        "file_path": str(earnings_dir),
        "source_type": "earnings_reference",
        "tier": "B",
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
        "source_summary": f"Scraper-collected earnings releases and related materials for {company_name}.",
        "strengths": [
            "official company earnings package",
            "good for KPI prioritization",
            "ties company messaging to investor materials",
        ],
        "weaknesses": [
            "import is derived from scraped titles and document presence, not full manual extraction",
        ],
        "fields": {
            "title": f"{company_name} Scraped Earnings Package",
            "company_name": company_name,
            "quarter": "recent periods",
            "source_name": "Company Investor Relations",
            "sections": titles,
            "key_metrics": [
                "Use the earnings package to anchor the reported quarter before relying on transcript tone or media interpretation.",
                "Prioritize revenue, margin, guidance, and segment signals from the latest release set.",
            ],
            "management_themes": [
                "Management-selected earnings materials indicate which metrics and business lines investors are meant to focus on.",
                "Cross-check the release package against filings before changing model assumptions.",
            ],
            "analyst_relevance": [
                "Good for earnings-package compression and KPI prioritization.",
                "Useful source lane between raw filings and full transcripts.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": base_metadata(company_dir),
    }


def build_presentation(ticker: str, company_name: str, company_dir: Path) -> dict[str, Any] | None:
    presentation_dir = company_dir / "presentation"
    if not presentation_dir.is_dir():
        return None
    titles = list_filtered_titles(presentation_dir, PRESENTATION_TITLE_PATTERNS, limit=8)
    if not titles:
        return None
    return {
        "id": f"scraped_{ticker.lower()}_investor_presentation",
        "title": f"{company_name} Scraped Investor Presentation Materials",
        "file_path": str(presentation_dir),
        "source_type": "investor_presentation",
        "tier": "B",
        "primary_bucket": "memo_style",
        "secondary_bucket": "financial_reasoning",
        "recommended_phase": 1,
        "template_key": "investor_presentation",
        "assistant_training_targets": [
            "slide compression",
            "contributor/detractor summaries",
            "thesis slide structure",
        ],
        "source_summary": f"Scraper-collected investor presentation and slide materials for {company_name}.",
        "strengths": [
            "management KPI emphasis",
            "slide-structured communication",
            "useful for compression and prioritization",
        ],
        "weaknesses": [
            "presentation materials are management-selected and should not outweigh filings",
        ],
        "fields": {
            "title": f"{company_name} Scraped Investor Presentation Materials",
            "manager": None,
            "date": None,
            "agenda": titles,
            "portfolio_contributors": [],
            "portfolio_detractors": [],
            "holdings_covered": [company_name],
            "valuation_points": [
                "Use presentation materials to identify which KPIs and segment narratives management wants investors to underwrite.",
            ],
            "exit_or_trim_logic": [],
            "slide_structure_patterns": [
                "Lead with quarter highlights and KPI framing.",
                "Use investor slides to compress the company's preferred narrative before testing it against filings.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": base_metadata(company_dir),
    }


def build_transcript(ticker: str, company_name: str, company_dir: Path) -> dict[str, Any] | None:
    transcript_dir = company_dir / "transcript"
    if not transcript_dir.is_dir():
        return None
    titles = list_filtered_titles(transcript_dir, TRANSCRIPT_TITLE_PATTERNS, limit=8)
    if not titles:
        return None
    return {
        "id": f"scraped_{ticker.lower()}_earnings_transcript",
        "title": f"{company_name} Scraped Transcript Materials",
        "file_path": str(transcript_dir),
        "source_type": "earnings_transcript",
        "tier": "B",
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
        "source_summary": f"Scraper-collected transcript or conference-call materials for {company_name}.",
        "strengths": [
            "management language",
            "prepared-remarks or transcript context",
            "good bridge from reported numbers to interpretation",
        ],
        "weaknesses": [
            "some transcript folders may include event-call materials that are not pure earnings-call Q&A",
        ],
        "fields": {
            "title": f"{company_name} Scraped Transcript Materials",
            "company_name": company_name,
            "quarter": "recent periods",
            "management_themes": [
                "Use transcript materials to separate management emphasis from the reported KPI baseline.",
                "Focus on guidance, demand commentary, margins, and unresolved analyst questions.",
            ],
            "financial_highlights": titles,
            "guidance_or_outlook": [
                "Use the transcript set to identify where management is widening, narrowing, or defending the outlook.",
            ],
            "qa_topics": [
                "Capacity, demand, margin trajectory, capital allocation, and segment performance are typical focus areas in the transcript lane.",
            ],
            "analyst_relevance": [
                "Useful for teaching the model to distinguish numbers from tone and framing.",
                "Should be paired with the earnings package and filings for full context.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": base_metadata(company_dir),
    }


def main() -> None:
    company_map = load_company_map()
    imported = 0

    for company_dir in sorted(SCRAPED_DATA_DIR.iterdir()):
        if not company_dir.is_dir():
            continue
        ticker = company_dir.name.upper()
        if not re.fullmatch(r"[A-Z]{1,5}", ticker):
            continue
        company_name = company_map.get(ticker, ticker)

        for builder in (
            build_sec_public_filing,
            build_earnings_reference,
            build_presentation,
            build_transcript,
        ):
            payload = builder(ticker, company_name, company_dir)
            if payload is None:
                continue
            write_record(payload)
            imported += 1

    print(f"Imported {imported} scraped investor-material records into {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
