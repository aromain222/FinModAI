#!/usr/bin/env python3
"""Run format and numeric-consistency evals for Analyst Copilot."""

from __future__ import annotations

import argparse
import json
import re
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from openai import OpenAI

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_EVAL_FILE = ROOT / "eval" / "eval.jsonl"
DEFAULT_REPORT_FILE = ROOT / "eval" / "report.json"

REQUIRED_HEADERS = [
    "Objective:",
    "Assumptions:",
    "Math:",
    "Recommendation:",
    "Drivers:",
    "Risks:",
    "Next checks:",
    "Citations:",
]

KNOWN_PATTERN = re.compile(
    r"\[KNOWN_ANSWER[^\]]*metric=([^\s\]]+)\s+expected=([-+]?\d*\.?\d+)\s+tol=([-+]?\d*\.?\d+)\]",
    re.IGNORECASE,
)
NUM_PATTERN = re.compile(r"[-+]?\d{1,3}(?:,\d{3})*(?:\.\d+)?|[-+]?\d+\.\d+")


@dataclass
class ExampleResult:
    index: int
    task_type: str
    format_pass: bool
    assumptions_pass: bool
    numeric_check_applicable: bool
    numeric_pass: Optional[bool]
    notes: List[str]


def load_jsonl(path: Path) -> List[Dict]:
    rows: List[Dict] = []
    with path.open("r", encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSONL at line {line_no}: {exc}") from exc
    return rows


def extract_task_type(user_content: str) -> str:
    prefix = "Task type:"
    if user_content.startswith(prefix):
        return user_content.split("\n", 1)[0].replace(prefix, "").strip()
    return "unknown"


def extract_known_answer(user_content: str) -> Optional[Tuple[str, float, float]]:
    match = KNOWN_PATTERN.search(user_content)
    if not match:
        return None
    metric = match.group(1)
    expected = float(match.group(2))
    tol = float(match.group(3))
    return metric, expected, tol


def extract_numbers(text: str) -> List[float]:
    values: List[float] = []
    for token in NUM_PATTERN.findall(text):
        token = token.replace(",", "")
        try:
            values.append(float(token))
        except ValueError:
            continue
    return values


def check_format(response: str) -> Tuple[bool, List[str]]:
    notes: List[str] = []
    missing = [h for h in REQUIRED_HEADERS if h not in response]
    if missing:
        notes.append(f"Missing headers: {', '.join(missing)}")
    return len(missing) == 0, notes


def check_assumptions(response: str) -> Tuple[bool, List[str]]:
    notes: List[str] = []
    pattern = re.compile(r"Assumptions:\s*(?:\n- .+){1,}", re.IGNORECASE)
    ok = bool(pattern.search(response))
    if not ok:
        notes.append("Assumptions section missing bullets")
    return ok, notes


def call_model(client: OpenAI, model: str, messages: List[Dict[str, str]], max_output_tokens: int) -> str:
    try:
        res = client.responses.create(
            model=model,
            input=messages,
            temperature=0,
            max_output_tokens=max_output_tokens,
        )
        if isinstance(res.output_text, str) and res.output_text.strip():
            return res.output_text.strip()
    except Exception:
        pass

    # Fallback to chat completions
    completion = client.chat.completions.create(
        model=model,
        messages=messages,  # type: ignore[arg-type]
        temperature=0,
        max_tokens=max_output_tokens,
    )
    content = completion.choices[0].message.content
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        chunks = []
        for part in content:
            if isinstance(part, dict):
                txt = part.get("text")
                if isinstance(txt, str):
                    chunks.append(txt)
        return "\n".join(chunks).strip()
    return ""


def evaluate_example(index: int, row: Dict, response: str) -> ExampleResult:
    messages = row.get("messages", [])
    user_content = messages[1].get("content", "") if len(messages) > 1 else ""
    task_type = extract_task_type(user_content)

    format_pass, format_notes = check_format(response)
    assumptions_pass, assumptions_notes = check_assumptions(response)

    notes = format_notes + assumptions_notes
    known = extract_known_answer(user_content)
    numeric_applicable = known is not None
    numeric_pass: Optional[bool] = None

    if known:
        metric, expected, tol = known
        numbers = extract_numbers(response)
        numeric_pass = any(abs(value - expected) <= tol for value in numbers)
        if not numeric_pass:
            notes.append(
                f"Numeric mismatch for {metric}: expected {expected} ± {tol}. Extracted numbers={numbers[:12]}"
            )

    return ExampleResult(
        index=index,
        task_type=task_type,
        format_pass=format_pass,
        assumptions_pass=assumptions_pass,
        numeric_check_applicable=numeric_applicable,
        numeric_pass=numeric_pass,
        notes=notes,
    )


def summarize(results: List[ExampleResult]) -> Dict:
    total = len(results)
    format_pass = sum(1 for r in results if r.format_pass)
    assumptions_pass = sum(1 for r in results if r.assumptions_pass)

    numeric_subset = [r for r in results if r.numeric_check_applicable]
    numeric_pass = sum(1 for r in numeric_subset if r.numeric_pass)

    by_task: Dict[str, Dict[str, float]] = {}
    for r in results:
        bucket = by_task.setdefault(r.task_type, {"count": 0, "format_pass": 0, "assumptions_pass": 0})
        bucket["count"] += 1
        bucket["format_pass"] += int(r.format_pass)
        bucket["assumptions_pass"] += int(r.assumptions_pass)

    for task, bucket in by_task.items():
        count = max(int(bucket["count"]), 1)
        bucket["format_pass_rate"] = round(bucket["format_pass"] / count, 4)
        bucket["assumptions_pass_rate"] = round(bucket["assumptions_pass"] / count, 4)

    return {
        "total_examples": total,
        "format_pass_rate": round(format_pass / max(total, 1), 4),
        "assumptions_pass_rate": round(assumptions_pass / max(total, 1), 4),
        "numeric_examples": len(numeric_subset),
        "numeric_pass_rate": round(numeric_pass / max(len(numeric_subset), 1), 4) if numeric_subset else None,
        "by_task": by_task,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Analyst Copilot eval suite")
    parser.add_argument("--eval-file", type=Path, default=DEFAULT_EVAL_FILE)
    parser.add_argument("--report-file", type=Path, default=DEFAULT_REPORT_FILE)
    parser.add_argument("--model", type=str, default="gpt-4o-mini")
    parser.add_argument("--max-output-tokens", type=int, default=700)
    parser.add_argument("--limit", type=int, default=0, help="0 means all")
    args = parser.parse_args()

    rows = load_jsonl(args.eval_file)
    if args.limit > 0:
        rows = rows[: args.limit]

    client = OpenAI()

    results: List[ExampleResult] = []
    for idx, row in enumerate(rows):
        messages = row.get("messages", [])
        if not isinstance(messages, list) or len(messages) < 2:
            results.append(
                ExampleResult(
                    index=idx,
                    task_type="unknown",
                    format_pass=False,
                    assumptions_pass=False,
                    numeric_check_applicable=False,
                    numeric_pass=None,
                    notes=["Invalid messages schema"],
                )
            )
            continue

        try:
            output = call_model(client, args.model, messages, args.max_output_tokens)
            results.append(evaluate_example(idx, row, output))
        except Exception as exc:
            results.append(
                ExampleResult(
                    index=idx,
                    task_type=extract_task_type(messages[1].get("content", "")),
                    format_pass=False,
                    assumptions_pass=False,
                    numeric_check_applicable=extract_known_answer(messages[1].get("content", "")) is not None,
                    numeric_pass=False,
                    notes=[f"Model call failed: {exc}"],
                )
            )

    summary = summarize(results)
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "model": args.model,
        "eval_file": str(args.eval_file),
        "summary": summary,
        "results": [asdict(r) for r in results],
        "pass_fail": {
            "format": summary["format_pass_rate"] >= 0.9,
            "assumptions": summary["assumptions_pass_rate"] >= 0.9,
            "numeric": (summary["numeric_pass_rate"] or 0) >= 0.85 if summary["numeric_examples"] else True,
        },
    }

    args.report_file.parent.mkdir(parents=True, exist_ok=True)
    args.report_file.write_text(json.dumps(report, indent=2), encoding="utf-8")

    print(f"Eval complete. Report written to {args.report_file}")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
