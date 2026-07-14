---
name: model-pipeline
description: Add or modify financial model features (DCF, LBO, Comps, Merger, Three-Statement) — the generateModel pipeline, ModelDocument schema rules, generator file map, and which tests to update. Use whenever touching model generation, Excel output, or the model preview.
---

# Working on the financial model pipeline

## The pipeline (entry: `finmodai-next/app/api/generateModel/route.ts`)

1. **Validate** request (model type, ticker, assumptions)
2. **Fetch financials** — `lib/data/providers/` via `lib/data/providerFactory.ts`, wrapped by `lib/data/fetchWithDiagnostics.ts` (see the `data-providers` skill)
3. **Enrich assumptions** with OpenAI — `lib/enrichUnifiedAssumptions.ts`
4. **Sanitize & clamp** — `lib/sanitizeAssumptions.ts` (all AI-produced numbers pass through here; never skip it)
5. **Generate** — model-specific generators:
   - DCF: `lib/dcfGenerator.ts` + `lib/models/dcf/`
   - LBO: `lib/lboEngine.ts`, `lib/lboGenerator.ts` + `lib/models/lbo/`
   - Comps: `lib/compsExcelGenerator.ts`, `lib/compsCalculator.ts` + `lib/comps/`
   - Merger: `lib/models/merger/`
   - Three-Statement: `lib/models/threeStatement/`
6. **Return** assumptions, preview, downloadUrl, diagnostics

Shared math lives in `lib/financialMathEngine/`, `lib/models/shared/`, and `lib/models/core/`. Check there before writing new financial math — most primitives (IRR, terminal value, debt schedules) already exist.

## ModelDocument: the non-negotiable rule

`lib/models/schema/ModelDocument.ts` is the single source of truth consumed by BOTH the Excel generator and the UI preview:

```
ModelDocument → sections[] → blocks[]
  TableBlock | TextBlock | SpacerBlock | ChartBlock | CalloutBlock
```

- **Never** compute or format a value in the UI preview that isn't in the ModelDocument. Truncation is the only rendering-side operation.
- **Never** duplicate formatting logic between Excel and preview — add it to the schema / `lib/models/schema/StyleTokens.ts` and let both renderers consume it.
- Cell `formula` is for Excel only; the UI reads `value`/`display`. Populate both.
- Styling conventions are defined in `StyleTokens.ts` and documented in `lib/models/schema/README.md` (inputs = blue italic, formulas = black, links = green, checks/errors = red). Read that README before changing any table styling.
- Conversion helpers: `fromModelOutputs.ts`, `fromPreview.ts`, `mappings.ts` in the same folder.

## When you change a model

1. Update the generator AND confirm the ModelDocument it emits covers the new content — don't patch the Excel writer or the preview component directly.
2. Update/add a test in `tests/investment-analysis/` — there is near-1:1 coverage (e.g. `dcf-preview.test.ts`, `merger-model.test.ts`, `three-statement-workbook-integrity.test.ts`, `canonical-workbook-compatibility.test.ts`). Workbook-integrity tests are the ones that catch schema/Excel drift.
3. Run targeted tests, then the full suite (see the `verify` skill).

## Common traps

- Assumption percentages: the codebase has had repeated bugs mixing `0.05` vs `5` — `lib/sanitizeAssumptions.ts` clamps and normalizes; follow its conventions and add clamps there for new assumption fields.
- Root-level Python files (`professional_dcf_model.py` etc.) are a legacy implementation. Never extend them; the Next.js pipeline is canonical.
- Scenario state (base/bull/bear) lives client-side in `lib/modelAssumptionsStore.tsx`; keep new state server-side in API routes unless it's genuinely per-session UI state.
