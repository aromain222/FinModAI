#!/usr/bin/env python3
"""Validate train/eval JSONL files before OpenAI upload."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from training.openai_finetune_utils import DEFAULT_EVAL_PATH, DEFAULT_TRAIN_PATH, load_jsonl, validate_chat_examples


def main() -> None:
    parser = argparse.ArgumentParser(description='Validate fine-tuning JSONL files.')
    parser.add_argument('--train-file', type=Path, default=DEFAULT_TRAIN_PATH)
    parser.add_argument('--eval-file', type=Path, default=DEFAULT_EVAL_PATH)
    args = parser.parse_args()

    train_rows = load_jsonl(args.train_file)
    eval_rows = load_jsonl(args.eval_file)
    train_report = validate_chat_examples(train_rows)
    eval_report = validate_chat_examples(eval_rows)

    report = {
        'train_file': str(args.train_file),
        'eval_file': str(args.eval_file),
        'train': train_report,
        'eval': eval_report,
        'train_eval_overlap_rows': len({json.dumps(r, sort_keys=True) for r in train_rows} & {json.dumps(r, sort_keys=True) for r in eval_rows}),
    }
    print(json.dumps(report, indent=2))
    if not train_report['valid'] or not eval_report['valid']:
        raise SystemExit(1)


if __name__ == '__main__':
    main()
