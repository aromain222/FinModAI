#!/usr/bin/env python3
"""Helpers for local OpenAI fine-tuning workflows."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TRAIN_PATH = ROOT / 'training' / 'training.jsonl'
DEFAULT_EVAL_PATH = ROOT / 'eval' / 'eval.jsonl'
STATE_DIR = ROOT / 'training' / 'fine_tune_state'
DEFAULT_MODEL = 'gpt-4.1-mini-2025-04-14'
ENV_CANDIDATES = [
    ROOT / '.env.local',
    ROOT / '.env',
    ROOT / 'finmodai-next' / '.env.local',
    ROOT / 'finmodai-next' / '.env',
]


def _load_dotenv_path(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding='utf-8').splitlines():
        line = raw_line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    return values


def get_openai_api_key() -> str:
    env_value = os.environ.get('OPENAI_API_KEY')
    if env_value:
        return env_value
    for path in ENV_CANDIDATES:
        values = _load_dotenv_path(path)
        api_key = values.get('OPENAI_API_KEY')
        if api_key:
            os.environ['OPENAI_API_KEY'] = api_key
            return api_key
    raise RuntimeError('OPENAI_API_KEY not found in environment or local .env files')


def get_client() -> OpenAI:
    return OpenAI(api_key=get_openai_api_key())


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    with path.open('r', encoding='utf-8') as handle:
        for idx, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as exc:
                raise ValueError(f'{path} line {idx}: invalid JSON - {exc}') from exc
            rows.append(row)
    return rows


def validate_chat_examples(rows: Iterable[dict[str, Any]], *, min_rows: int = 10) -> dict[str, Any]:
    rows = list(rows)
    errors: list[str] = []
    if len(rows) < min_rows:
        errors.append(f'dataset too small: {len(rows)} rows, expected at least {min_rows}')

    task_counts: dict[str, int] = {}
    for idx, row in enumerate(rows, start=1):
        messages = row.get('messages')
        if not isinstance(messages, list) or len(messages) < 3:
            errors.append(f'row {idx}: messages must be a list with at least 3 entries')
            continue
        if messages[0].get('role') != 'system':
            errors.append(f'row {idx}: first message must be system')
        if messages[1].get('role') != 'user':
            errors.append(f'row {idx}: second message must be user')
        if messages[-1].get('role') != 'assistant':
            errors.append(f'row {idx}: last message must be assistant')
        for message_index, message in enumerate(messages, start=1):
            if not isinstance(message, dict):
                errors.append(f'row {idx}: message {message_index} is not an object')
                continue
            role = message.get('role')
            content = message.get('content')
            if role not in {'system', 'user', 'assistant'}:
                errors.append(f'row {idx}: message {message_index} has invalid role {role!r}')
            if not isinstance(content, str) or not content.strip():
                errors.append(f'row {idx}: message {message_index} has empty content')
        user_content = messages[1].get('content', '')
        if isinstance(user_content, str) and user_content.startswith('Task type: '):
            task = user_content.split('\n', 1)[0].replace('Task type: ', '').strip()
            task_counts[task] = task_counts.get(task, 0) + 1

    return {
        'row_count': len(rows),
        'task_counts': task_counts,
        'errors': errors,
        'valid': not errors,
    }


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


def write_state(name: str, payload: dict[str, Any]) -> Path:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    path = STATE_DIR / name
    path.write_text(json.dumps(payload, indent=2) + '\n', encoding='utf-8')
    return path


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()
