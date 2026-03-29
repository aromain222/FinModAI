#!/usr/bin/env python3
"""Fetch fine-tuning job status and recent events."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from training.openai_finetune_utils import STATE_DIR, get_client, utc_now, write_state


def latest_job_id() -> str:
    path = STATE_DIR / 'last_finetune_request.json'
    if not path.exists():
        raise RuntimeError('No last_finetune_request.json found; pass --job-id explicitly.')
    data = json.loads(path.read_text(encoding='utf-8'))
    job_id = data.get('job_id')
    if not job_id:
        raise RuntimeError('No job_id found in last_finetune_request.json')
    return job_id


def main() -> None:
    parser = argparse.ArgumentParser(description='Check OpenAI fine-tuning job status and events.')
    parser.add_argument('--job-id', type=str, default='')
    parser.add_argument('--limit', type=int, default=10)
    args = parser.parse_args()

    job_id = args.job_id or latest_job_id()
    client = get_client()
    job = client.fine_tuning.jobs.retrieve(job_id)
    events = client.fine_tuning.jobs.list_events(fine_tuning_job_id=job_id, limit=args.limit)

    payload = {
        'checked_at': utc_now(),
        'job': job.model_dump(),
        'events': [event.model_dump() for event in events.data],
    }
    state_path = write_state('last_finetune_status.json', payload)
    print(json.dumps({'state_file': str(state_path), **payload}, indent=2))


if __name__ == '__main__':
    main()
