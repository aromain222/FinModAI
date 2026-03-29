#!/usr/bin/env python3
"""Promote approved earnings package cache entries into extracted training sources."""

from __future__ import annotations

import json
import os
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = ROOT / "training" / "extracted_sources" / "phase_1"


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SystemExit(f"Missing required environment variable: {name}")
    return value


def supabase_request(path: str, query: str = "") -> Any:
    base = env("SUPABASE_URL").rstrip("/")
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    url = f"{base}/rest/v1/{path}"
    if query:
        url = f"{url}?{query}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode("utf-8"))


def patch_queue_row(row_id: str, payload: dict[str, Any]) -> None:
    base = env("SUPABASE_URL").rstrip("/")
    key = env("SUPABASE_SERVICE_ROLE_KEY")
    url = f"{base}/rest/v1/earnings_training_queue?id=eq.{urllib.parse.quote(row_id)}"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="PATCH",
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(req):
        return


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


def quarter_label(pkg: dict[str, Any]) -> str:
    fiscal_period = (pkg.get("fiscal_period") or "").strip()
    fiscal_year = pkg.get("fiscal_year")
    if fiscal_period and fiscal_year:
        return f"Fiscal {fiscal_period} {fiscal_year}"
    if fiscal_period:
        return fiscal_period
    if fiscal_year:
        return str(fiscal_year)
    report_end = (pkg.get("report_end_date") or "").strip()
    return report_end or "recent quarter"


def output_slug(prefix: str, pkg: dict[str, Any]) -> str:
    ticker = str(pkg.get("ticker", "")).lower()
    fiscal_period = str(pkg.get("fiscal_period") or "recent").lower()
    fiscal_year = str(pkg.get("fiscal_year") or "na")
    return f"{prefix}_{ticker}_{fiscal_period}_{fiscal_year}"


def build_reference_record(pkg: dict[str, Any]) -> dict[str, Any]:
    quarter = pkg.get("quarter_data") or {}
    annual = pkg.get("annual_data") or {}
    commentary = pkg.get("commentary_data") or {}
    release_highlights = compact(list(commentary.get("releaseHighlights") or []), limit=3)
    transcript_highlights = compact(list(commentary.get("transcriptHighlights") or []), limit=3)
    merged_highlights = compact(release_highlights + transcript_highlights, limit=4)
    company_name = pkg.get("company_name") or pkg.get("ticker")
    title = f"{company_name} {quarter_label(pkg)} Earnings Package"
    return {
        "id": output_slug("queued", pkg) + "_earnings_reference",
        "title": title,
        "file_path": f"supabase://earnings_packages/{pkg.get('id')}",
        "source_type": "earnings_reference",
        "tier": "A",
        "primary_bucket": "financial_reasoning",
        "secondary_bucket": "memo_style",
        "recommended_phase": 1,
        "template_key": "earnings_reference",
        "assistant_training_targets": [
            "earnings-package interpretation",
            "KPI extraction",
            "quarterly results framing",
            "investor-facing results compression",
        ],
        "source_summary": f"Stored earnings package for {company_name}.",
        "strengths": compact([
            "official quarter package cache",
            "normalized quarter financials",
            "source-traceable runtime package",
        ], limit=3),
        "weaknesses": compact([
            "training promotion requires runtime package review",
            "release text may be thinner than a full transcript",
        ], limit=2),
        "fields": {
            "title": title,
            "company_name": company_name,
            "quarter": quarter_label(pkg),
            "source_name": "CapitalBase earnings package cache",
            "sections": compact([
                "reported results",
                "quarterly financials",
                "earnings release summary" if release_highlights else "",
                "commentary highlights" if merged_highlights else "",
                "report link" if quarter.get("reportUrl") else "",
            ]),
            "key_metrics": compact([
                f"Revenue: {quarter.get('revenue')}" if quarter.get("revenue") is not None else "",
                f"Operating income: {quarter.get('operatingIncome')}" if quarter.get("operatingIncome") is not None else "",
                f"Net income: {quarter.get('netIncome')}" if quarter.get("netIncome") is not None else "",
                f"EPS: {quarter.get('eps')}" if quarter.get("eps") is not None else "",
                f"Annual revenue: {annual.get('revenue')}" if annual.get("revenue") is not None else "",
            ], limit=5),
            "management_themes": merged_highlights,
            "analyst_relevance": compact([
                "Good anchor source for reported quarter facts before writing a memo or revising assumptions.",
                "Useful for runtime-to-training promotion of high-signal cached earnings materials.",
            ], limit=3),
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "supabase_table": "earnings_packages",
            "earnings_package_id": pkg.get("id"),
            "package_key": pkg.get("package_key"),
            "report_end_date": pkg.get("report_end_date"),
            "fiscal_period": pkg.get("fiscal_period"),
            "fiscal_year": pkg.get("fiscal_year"),
            "report_url": quarter.get("reportUrl"),
            "last_fetched_at": pkg.get("last_fetched_at"),
        },
    }


def build_transcript_record(pkg: dict[str, Any]) -> dict[str, Any] | None:
    commentary = pkg.get("commentary_data") or {}
    highlights = compact(
        list(commentary.get("transcriptHighlights") or []) or list(commentary.get("highlights") or []),
        limit=3,
    )
    if not highlights:
        return None
    company_name = pkg.get("company_name") or pkg.get("ticker")
    title = f"{company_name} {quarter_label(pkg)} Earnings Commentary"
    return {
        "id": output_slug("queued", pkg) + "_earnings_transcript",
        "title": title,
        "file_path": f"supabase://earnings_packages/{pkg.get('id')}",
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
            "prepared-remarks compression",
        ],
        "source_summary": f"Stored earnings commentary package for {company_name}.",
        "strengths": [
            "commentary grounded in a runtime earnings package",
            "good bridge from reported quarter facts to interpretation",
        ],
        "weaknesses": [
            "commentary may be excerpt-level rather than full verbatim transcript",
        ],
        "fields": {
            "title": title,
            "company_name": company_name,
            "quarter": quarter_label(pkg),
            "management_themes": compact(highlights, limit=3),
            "financial_highlights": compact(list(commentary.get("sourceNotes") or []), limit=4),
            "transcript_excerpts": highlights,
            "guidance_or_outlook": compact([
                "Use the commentary package to see which issues management is emphasizing around demand, margin, guidance, and capital allocation."
            ], limit=2),
            "qa_topics": compact(list(commentary.get("sourceNotes") or []), limit=4),
            "analyst_relevance": [
                "Useful for teaching the model to separate quarter facts from management framing.",
                "Should be paired with the cached earnings reference package for the same quarter.",
            ],
        },
        "extraction_status": "extracted",
        "source_metadata": {
            "supabase_table": "earnings_packages",
            "earnings_package_id": pkg.get("id"),
            "package_key": pkg.get("package_key"),
            "last_fetched_at": pkg.get("last_fetched_at"),
        },
    }


def write_record(record: dict[str, Any]) -> Path:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / f"{record['id']}.json"
    path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    return path


def main() -> None:
    queue_rows = supabase_request(
        "earnings_training_queue",
        urllib.parse.urlencode(
            {
                "select": "id,earnings_package_id,review_status,ingestion_status",
                "review_status": "eq.approved",
                "ingestion_status": "in.(not_imported,import_failed)",
                "order": "created_at.asc",
            }
        ),
    )
    if not isinstance(queue_rows, list) or not queue_rows:
        print("No approved earnings packages queued for import.")
        return

    package_ids = [row["earnings_package_id"] for row in queue_rows if row.get("earnings_package_id")]
    packages = supabase_request(
        "earnings_packages",
        urllib.parse.urlencode(
            {
                "select": "*",
                "id": f"in.({','.join(package_ids)})",
            }
        ),
    )
    package_map = {row["id"]: row for row in packages if isinstance(row, dict) and row.get("id")}

    for queue_row in queue_rows:
        queue_id = queue_row["id"]
        pkg = package_map.get(queue_row["earnings_package_id"])
        if not pkg:
            patch_queue_row(queue_id, {"ingestion_status": "import_failed", "notes": "Missing earnings package row."})
            continue
        try:
            write_record(build_reference_record(pkg))
            transcript_record = build_transcript_record(pkg)
            if transcript_record:
                write_record(transcript_record)
            patch_queue_row(
                queue_id,
                {
                    "ingestion_status": "imported",
                    "notes": "Promoted into extracted_sources/phase_1.",
                },
            )
        except Exception as exc:
            patch_queue_row(
                queue_id,
                {
                    "ingestion_status": "import_failed",
                    "notes": str(exc),
                },
            )


if __name__ == "__main__":
    main()
