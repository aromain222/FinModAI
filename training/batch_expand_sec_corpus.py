#!/usr/bin/env python3
"""Batch extract broad SEC filing datasets and import them into the training corpus."""

from __future__ import annotations

import argparse
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NEXT_ROOT = ROOT / "finmodai-next"
EXTRACT_SCRIPT = NEXT_ROOT / "scripts" / "extract-sec-mna-training.ts"
IMPORT_SCRIPT = ROOT / "training" / "import_sec_dataset.py"
DEFAULT_FORMS = "10-K,10-Q,8-K"
DEFAULT_TICKERS = [
    "AAPL",
    "AMZN",
    "GOOGL",
    "META",
    "NVDA",
    "NFLX",
    "JPM",
    "BAC",
    "WMT",
    "COST",
    "XOM",
    "LLY",
]


def run(command: list[str], *, cwd: Path, extra_env: dict[str, str] | None = None) -> None:
    env = os.environ.copy()
    existing_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = str(ROOT) if not existing_pythonpath else f"{str(ROOT)}:{existing_pythonpath}"
    if extra_env:
        env.update(extra_env)
    result = subprocess.run(command, cwd=str(cwd), env=env, check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(description="Expand SEC training corpus across many tickers.")
    parser.add_argument("--tickers", nargs="*", default=DEFAULT_TICKERS)
    parser.add_argument("--forms", default=DEFAULT_FORMS)
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--skip-rebuild", action="store_true")
    parser.add_argument("--edgar-only", action="store_true")
    parser.add_argument("--sleep-seconds", type=float, default=0.0)
    args = parser.parse_args()

    tickers = [ticker.strip().upper() for ticker in args.tickers if ticker.strip()]
    if not tickers:
        raise SystemExit("No tickers provided")

    extract_env = {"SEC_DISABLE_SEC_API": "1"} if args.edgar_only else None

    for ticker in tickers:
        dataset_dir = ROOT / "data" / "training" / f"sec-filings-{ticker.lower()}"
        print(f"[batch-expand] extracting {ticker} -> {dataset_dir}")
        run(
            [
                "node",
                "--import",
                "tsx",
                str(EXTRACT_SCRIPT),
                "--ticker",
                ticker,
                "--forms",
                args.forms,
                "--limit",
                str(args.limit),
            ],
            cwd=NEXT_ROOT,
            extra_env=extract_env,
        )
        print(f"[batch-expand] importing {ticker}")
        run(
            [
                sys.executable,
                str(IMPORT_SCRIPT),
                "--dataset-dir",
                str(dataset_dir),
            ],
            cwd=ROOT,
        )
        if args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)

    if args.skip_rebuild:
        return

    print("[batch-expand] regenerating training dataset")
    run([sys.executable, str(ROOT / "training" / "generate_dataset.py")], cwd=ROOT)
    print("[batch-expand] validating fine-tune files")
    run([sys.executable, str(ROOT / "training" / "validate_finetune_files.py")], cwd=ROOT)


if __name__ == "__main__":
    main()
