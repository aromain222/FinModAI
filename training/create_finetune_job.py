#!/usr/bin/env python3
"""Upload JSONL files and create an OpenAI supervised fine-tuning job."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from training.openai_finetune_utils import (
    DEFAULT_EVAL_PATH,
    DEFAULT_MODEL,
    DEFAULT_TRAIN_PATH,
    file_sha256,
    get_client,
    load_jsonl,
    utc_now,
    validate_chat_examples,
    write_state,
)


def upload_file(client: Any, path: Path) -> Any:
    with path.open('rb') as handle:
        return client.files.create(file=handle, purpose='fine-tune')


def main() -> None:
    parser = argparse.ArgumentParser(description='Create an OpenAI fine-tuning job from local JSONL files.')
    parser.add_argument('--train-file', type=Path, default=DEFAULT_TRAIN_PATH)
    parser.add_argument('--eval-file', type=Path, default=DEFAULT_EVAL_PATH)
    parser.add_argument('--model', type=str, default=DEFAULT_MODEL)
    parser.add_argument('--suffix', type=str, default='analyst-copilot')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()

    train_rows = load_jsonl(args.train_file)
    eval_rows = load_jsonl(args.eval_file)
    train_report = validate_chat_examples(train_rows)
    eval_report = validate_chat_examples(eval_rows)
    if not train_report['valid'] or not eval_report['valid']:
        raise SystemExit('Validation failed; run validate_finetune_files.py and fix errors before upload.')

    payload = {
        'created_at': utc_now(),
        'model': args.model,
        'suffix': args.suffix,
        'train_file': str(args.train_file),
        'eval_file': str(args.eval_file),
        'train_sha256': file_sha256(args.train_file),
        'eval_sha256': file_sha256(args.eval_file),
        'train_rows': len(train_rows),
        'eval_rows': len(eval_rows),
        'dry_run': args.dry_run,
    }

    if args.dry_run:
        state_path = write_state('last_finetune_request.json', payload)
        print(json.dumps({'dry_run': True, 'state_file': str(state_path), **payload}, indent=2))
        return

    client = get_client()
    train_upload = upload_file(client, args.train_file)
    eval_upload = upload_file(client, args.eval_file)
    job = client.fine_tuning.jobs.create(
        model=args.model,
        training_file=train_upload.id,
        validation_file=eval_upload.id,
        suffix=args.suffix,
    )

    payload.update(
        {
            'training_file_id': train_upload.id,
            'validation_file_id': eval_upload.id,
            'job_id': job.id,
            'job_status': getattr(job, 'status', None),
        }
    )
    request_path = write_state('last_finetune_request.json', payload)
    response_path = write_state('last_finetune_job.json', job.model_dump())
    print(json.dumps({'request_file': str(request_path), 'job_file': str(response_path), **payload}, indent=2))


if __name__ == '__main__':
    main()
