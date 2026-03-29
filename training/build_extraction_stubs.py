#!/usr/bin/env python3
"""Generate extraction stub JSON files for prioritized sources."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from training.corpus_logic import filter_sources, load_registry, load_templates, source_to_template

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / 'training' / 'extracted_sources'


def build_stub(record: Any, templates: dict[str, Any]) -> dict[str, Any]:
    template = source_to_template(record, templates)
    required_fields = template['required_fields']
    return {
        'id': record.id,
        'title': record.title,
        'file_path': record.file_path,
        'source_type': record.source_type,
        'tier': record.tier,
        'primary_bucket': record.primary_bucket,
        'secondary_bucket': record.secondary_bucket,
        'recommended_phase': record.recommended_phase,
        'template_key': record.template_key,
        'assistant_training_targets': template['assistant_training_targets'],
        'source_summary': record.summary,
        'strengths': list(record.strengths),
        'weaknesses': list(record.weaknesses),
        'fields': {field: None for field in required_fields},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description='Generate extraction stubs from the source registry.')
    parser.add_argument('--phase', type=int, default=1, help='Only emit sources from this recommended phase.')
    parser.add_argument('--bucket', type=str, default=None, help='Optional primary bucket filter.')
    parser.add_argument('--include-excluded', action='store_true', help='Include concept-only / excluded records.')
    args = parser.parse_args()

    records = load_registry()
    templates = load_templates()
    selected = filter_sources(
        records,
        bucket=args.bucket,
        phase=args.phase,
        include_excluded=args.include_excluded,
    )

    target_dir = OUT_DIR / f'phase_{args.phase}'
    if args.bucket:
        target_dir = target_dir / args.bucket
    target_dir.mkdir(parents=True, exist_ok=True)

    manifest = []
    for record in selected:
        stub = build_stub(record, templates)
        out_path = target_dir / f'{record.id}.json'
        out_path.write_text(json.dumps(stub, indent=2) + '\n', encoding='utf-8')
        manifest.append({'id': record.id, 'path': str(out_path), 'bucket': record.primary_bucket})

    manifest_path = target_dir / '_manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(f'Wrote {len(selected)} extraction stubs to {target_dir}')
    print(f'Manifest: {manifest_path}')


if __name__ == '__main__':
    main()
