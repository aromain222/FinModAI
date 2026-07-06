---
name: verify
description: Verify a change to FinModAI end-to-end — lint, targeted Node tests, build, and (for API changes) hitting the route in a live dev server. Use before committing any nontrivial change to finmodai-next.
---

# Verifying changes in FinModAI

All verification happens inside `finmodai-next/`. The root of the repo is legacy Python — do not try to verify frontend changes there.

## 0. One-time setup

```bash
cd finmodai-next
npm install        # node_modules is not committed; fresh clones need this
```

There is no `.env.local` in fresh clones. Copy `.env.local.template` → `.env.local` if you need Supabase/OpenAI-backed behavior. Without keys the app still runs — it silently falls back to demo data (see CLAUDE.md "Data layer & fallback cascade"), so a working page does NOT prove live-data code paths work.

## 1. Lint + types

```bash
npm run lint
```

TypeScript errors surface in `npm run build` (step 3), not lint.

## 2. Tests (the main safety net)

The only test suite is the Node.js test runner suite in `tests/investment-analysis/`:

```bash
npm run test:investment-analysis                 # full suite (~60 files)
node --import tsx --test tests/investment-analysis/dcf-preview.test.ts   # one file
```

Run the targeted file(s) matching your change first, then the full suite before committing. Test fixtures live in `tests/investment-analysis/fixtures.ts` and `tests/fixtures/`. Additional standalone tests exist at `tests/*.test.ts` (dcf, breakEven, debtCapacityLite, demoMode) — run them the same way with `node --import tsx --test`.

There is no Jest/Vitest. Do not add one; extend the Node test runner suite.

## 3. Build

```bash
npm run build
```

Required for any change touching `app/` routes, imports, or types — this is where TS errors and Next.js route problems appear.

## 4. Exercise the change live

For API route changes, drive the actual route:

```bash
npm run dev   # starts on :3000
curl -s localhost:3000/api/health
curl -s -X POST localhost:3000/api/generateModel -H 'content-type: application/json' \
  -d '{"modelType":"dcf","ticker":"AAPL"}'
```

Check the JSON response's `diagnostics` field — the pipeline reports data-source fallbacks and sanity-check warnings there. A 200 with demo-fallback diagnostics is not the same as a verified live path.

For model generation changes: confirm both renderers, since `ModelDocument` feeds Excel AND the UI preview. Generate a model, inspect the preview JSON, and if the change affects Excel output, download and open the workbook (exceljs output) or at minimum assert on the generated `ModelDocument` in a test.

## Python backend (rare)

Only if you touched `backend/`:

```bash
cd backend && pip install -r requirements.txt && pytest tests/ -v
```
