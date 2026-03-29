#!/usr/bin/env python3
"""Utilities for loading and prioritizing CapitalBase training sources."""

from __future__ import annotations

import json
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
REGISTRY_PATH = ROOT / "training" / "source_registry.json"
TEMPLATES_PATH = ROOT / "training" / "extraction_templates.json"

TIER_BASE_SCORE = {
    "A": 100,
    "B+": 85,
    "B": 70,
    "C": 40,
    "D": 0,
}

BUCKET_PRIORITY = {
    "memo_style": 35,
    "valuation_mechanics": 30,
    "transaction_methodology": 15,
    "eval_cases": 10,
    "special_situations": 7,
    "concept_only": 3,
}


@dataclass(frozen=True)
class SourceRecord:
    id: str
    file_path: str
    title: str
    source_type: str
    tier: str
    primary_bucket: str
    secondary_bucket: str | None
    style_weight: float
    mechanics_weight: float
    methodology_weight: float
    special_situations_weight: float
    eval_weight: float
    summary: str
    strengths: tuple[str, ...]
    weaknesses: tuple[str, ...]
    extraction_status: str
    recommended_phase: int
    exclude_from_core_training: bool
    canonical_bucket: str
    template_key: str

    @property
    def tier_base_score(self) -> int:
        return TIER_BASE_SCORE.get(self.tier, 0)

    @property
    def bucket_priority(self) -> int:
        return BUCKET_PRIORITY.get(self.primary_bucket, 0)

    @property
    def ingestion_score(self) -> float:
        phase_bonus = {1: 15, 2: 5, 3: 0}.get(self.recommended_phase, 0)
        core_penalty = -50 if self.exclude_from_core_training else 0
        return float(self.tier_base_score + self.bucket_priority + phase_bonus + core_penalty)


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def load_registry(path: Path = REGISTRY_PATH) -> list[SourceRecord]:
    raw_records = _read_json(path)
    return [
        SourceRecord(
            id=raw["id"],
            file_path=raw["file_path"],
            title=raw["title"],
            source_type=raw["source_type"],
            tier=raw["tier"],
            primary_bucket=raw["primary_bucket"],
            secondary_bucket=raw.get("secondary_bucket"),
            style_weight=float(raw["style_weight"]),
            mechanics_weight=float(raw["mechanics_weight"]),
            methodology_weight=float(raw["methodology_weight"]),
            special_situations_weight=float(raw["special_situations_weight"]),
            eval_weight=float(raw["eval_weight"]),
            summary=raw["summary"],
            strengths=tuple(raw.get("strengths", [])),
            weaknesses=tuple(raw.get("weaknesses", [])),
            extraction_status=raw["extraction_status"],
            recommended_phase=int(raw["recommended_phase"]),
            exclude_from_core_training=bool(raw["exclude_from_core_training"]),
            canonical_bucket=raw["canonical_bucket"],
            template_key=raw["template_key"],
        )
        for raw in raw_records
    ]


def load_templates(path: Path = TEMPLATES_PATH) -> dict[str, Any]:
    return _read_json(path)


def filter_sources(
    records: Iterable[SourceRecord],
    *,
    bucket: str | None = None,
    phase: int | None = None,
    include_excluded: bool = False,
) -> list[SourceRecord]:
    result = []
    for record in records:
        if bucket and record.primary_bucket != bucket:
            continue
        if phase and record.recommended_phase != phase:
            continue
        if not include_excluded and record.exclude_from_core_training:
            continue
        result.append(record)
    return result


def sort_by_ingestion_score(records: Iterable[SourceRecord]) -> list[SourceRecord]:
    return sorted(
        records,
        key=lambda r: (r.recommended_phase, -r.ingestion_score, r.title.lower()),
    )


def build_phase_queue(records: Iterable[SourceRecord]) -> dict[int, list[SourceRecord]]:
    grouped: dict[int, list[SourceRecord]] = defaultdict(list)
    for record in sort_by_ingestion_score(records):
        grouped[record.recommended_phase].append(record)
    return dict(sorted(grouped.items()))


def build_bucket_summary(records: Iterable[SourceRecord]) -> dict[str, dict[str, Any]]:
    summary: dict[str, dict[str, Any]] = {}
    grouped: dict[str, list[SourceRecord]] = defaultdict(list)
    for record in records:
        if record.exclude_from_core_training:
            continue
        grouped[record.primary_bucket].append(record)

    for bucket, bucket_records in grouped.items():
        summary[bucket] = {
            "count": len(bucket_records),
            "top_titles": [r.title for r in sort_by_ingestion_score(bucket_records)[:5]],
            "average_style_weight": round(sum(r.style_weight for r in bucket_records) / len(bucket_records), 3),
            "average_mechanics_weight": round(sum(r.mechanics_weight for r in bucket_records) / len(bucket_records), 3),
        }
    return dict(sorted(summary.items()))


def source_to_template(record: SourceRecord, templates: dict[str, Any] | None = None) -> dict[str, Any]:
    templates = templates or load_templates()
    return templates[record.template_key]
