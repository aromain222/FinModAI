# Analyst Copilot Training Data

This folder contains supervised fine-tuning (SFT) data generation assets for Analyst Copilot.
The generator now mixes:
- extracted corpus-backed examples from reviewed source documents
- synthetic finance/math templates for broad task coverage

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
PYTHONPYCACHEPREFIX=/tmp/pycache PYTHONPATH=/Users/averyromain/FinModAI python /Users/averyromain/FinModAI/training/generate_dataset.py
```

5. Spot-check random rows and run eval:

```bash
python /Users/averyromain/FinModAI/eval/run_eval.py --eval-file /Users/averyromain/FinModAI/eval/eval.jsonl
```


## Corpus Registry
The training folder now includes a source-governance layer for memo style, valuation mechanics, transaction methodology, special situations, and eval cases.

New files:
- `source_registry.json`: canonical reviewed-source registry with tiers, buckets, weights, and recommended ingestion phase.
- `extraction_templates.json`: required extraction fields by source type.
- `corpus_logic.py`: helper module for loading and ranking sources.
- `print_ingestion_queue.py`: prints the current phased ingestion queue.
- `build_extraction_stubs.py`: generates structured JSON stubs for sources selected by phase/bucket.
- `extract_sources.py`: populates extraction JSON from PDFs, workbooks, and manual overrides.
- `extracted_sources/`: generated extraction stubs and manifests.

### Quick Start
Print the current queue:

```bash
PYTHONPYCACHEPREFIX=/tmp/pycache PYTHONPATH=/Users/averyromain/FinModAI python /Users/averyromain/FinModAI/training/print_ingestion_queue.py
```

Generate Phase 1 extraction stubs:

```bash
PYTHONPYCACHEPREFIX=/tmp/pycache PYTHONPATH=/Users/averyromain/FinModAI python /Users/averyromain/FinModAI/training/build_extraction_stubs.py --phase 1
```

Generate Phase 2 extraction stubs:

```bash
PYTHONPYCACHEPREFIX=/tmp/pycache PYTHONPATH=/Users/averyromain/FinModAI python /Users/averyromain/FinModAI/training/build_extraction_stubs.py --phase 2
```

Generate stubs for one bucket only:

```bash
PYTHONPYCACHEPREFIX=/tmp/pycache PYTHONPATH=/Users/averyromain/FinModAI python /Users/averyromain/FinModAI/training/build_extraction_stubs.py --phase 1 --bucket memo_style
```

Populate extracted JSON for phase 1:

```bash
PYTHONPYCACHEPREFIX=/tmp/pycache PYTHONPATH=/Users/averyromain/FinModAI python /Users/averyromain/FinModAI/training/extract_sources.py --phase 1
```

Populate one bucket only:

```bash
PYTHONPYCACHEPREFIX=/tmp/pycache PYTHONPATH=/Users/averyromain/FinModAI python /Users/averyromain/FinModAI/training/extract_sources.py --phase 1 --bucket transaction_methodology
```

### Intended Use
- `memo_style`: investor letters and presentations used for tone, thesis articulation, and portfolio commentary.
- `valuation_mechanics`: workbooks and cases used for formulas, schedules, assumptions, and output logic.
- `transaction_methodology`: merger docs used for DCF/comps/precedent extraction.
- `special_situations`: activist and short materials used only in a separate lane.
- `eval_cases`: prompts and worked cases used for benchmarking and grading.
- `concept_only`: narrow examples kept out of the main corpus.

### Extraction Rules
- Large compilations should not be ingested raw. Example: `Buffett.pdf` must be chunked by letter, year, or passage before extraction.
- `A` tier sources feed the core corpus first, but still require source-specific extraction discipline.
- `B+` and `B` tier sources are primarily supporting material unless their bucket fills a gap in the corpus.
- `C` tier sources remain outside core training unless explicitly included for eval or concept coverage.
- Some SEC methodology docs are represented through curated manual overrides until the underlying filing text is stored locally.

### Current Training Flow
1. Maintain reviewed sources in `source_registry.json`.
2. Generate or refresh extraction stubs with `build_extraction_stubs.py`.
3. Populate extracted JSON with `extract_sources.py`.
4. Generate `training.jsonl` and `eval.jsonl` with `generate_dataset.py`.
5. Run eval before uploading any training file to a fine-tuning job.
