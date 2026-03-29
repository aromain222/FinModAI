#!/usr/bin/env python3
"""Print the current recommended ingestion queue for CapitalBase sources."""

from __future__ import annotations

from training.corpus_logic import build_bucket_summary, build_phase_queue, load_registry


def main() -> None:
    records = load_registry()
    phase_queue = build_phase_queue(records)
    print("CapitalBase ingestion queue\n")
    for phase, items in phase_queue.items():
        print(f"Phase {phase}")
        for item in items:
            flag = "exclude" if item.exclude_from_core_training else item.primary_bucket
            print(f"- [{item.tier}] {item.title} :: {flag} :: {item.file_path}")
        print()

    print("Bucket summary")
    for bucket, stats in build_bucket_summary(records).items():
        print(f"- {bucket}: {stats['count']} sources")
        print(f"  top_titles: {', '.join(stats['top_titles'])}")
        print(f"  avg_style_weight: {stats['average_style_weight']}")
        print(f"  avg_mechanics_weight: {stats['average_mechanics_weight']}")


if __name__ == '__main__':
    main()
