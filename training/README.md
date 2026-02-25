# Analyst Copilot Training Data

This folder contains supervised fine-tuning (SFT) data generation assets for Analyst Copilot.

## Files
- `system_prompt.txt`: single source of truth for the system instruction.
- `generate_dataset.py`: generates `training.jsonl` and `eval.jsonl` in chat SFT format.
- `training.jsonl`: train split (generated, >=150 examples).
- `../eval/eval.jsonl`: eval split (generated, >=30 examples).

## JSONL Format
Each line is one chat training example:

```json
{"messages":[{"role":"system","content":"..."},{"role":"user","content":"..."},{"role":"assistant","content":"..."}]}
```

Rules:
- The same `system_prompt.txt` content is used in **every** example.
- Assistant responses follow structured analyst format and include assumptions.
- Web-derived tasks use placeholder citations (`[SOURCE]`) in training data.

## Label Taxonomy
Examples are tagged in the user prompt as `Task type: <label>`.

- `financial_reasoning`
  - valuation sanity checks, accounting ties, KPI math
- `web_research`
  - source-backed market/company research requests with citations
- `table_extraction`
  - parse HTML snippets into structured tables and summarize
- `scrape_then_analyze`
  - ethical scraping plan first, then analysis approach
- `modeling_template`
  - reusable model/framework templates (DCF, unit economics, scenarios)

## Quality Checklist
Before using generated data, validate:

1. Numerical correctness
- Formulas match stated assumptions.
- Arithmetic is internally consistent.
- Units are explicit (%, $, bps, months, etc.).

2. Structure compliance
- Includes: Objective, Assumptions, Math, Recommendation, Drivers, Risks, Next checks, Citations.

3. Citation hygiene
- No hallucinated links.
- If web research task, placeholders are clearly marked `[SOURCE]`.
- If non-web task, citation line says no external web sources used.

4. Reasoning quality
- Clear assumptions and caveats.
- Decision-useful recommendation.
- Risks and falsification checks are specific.

## Expanding the Dataset
1. Add new template generators in `generate_dataset.py`.
2. Keep outputs deterministic and reproducible (fixed seed where needed).
3. Add category-balanced examples across taxonomy labels.
4. Re-run generator:

```bash
python /Users/averyromain/FinModAI/training/generate_dataset.py
```

5. Spot-check random rows and run eval:

```bash
python /Users/averyromain/FinModAI/eval/run_eval.py --eval-file /Users/averyromain/FinModAI/eval/eval.jsonl
```
