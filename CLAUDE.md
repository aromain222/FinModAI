# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read this first: repo map & handoff notes

- **Canonical code is `finmodai-next/` only.** The repo root contains ~100 legacy Python scripts (`professional_*.py`, `finmodai_*.py`, etc.), an old Flask/FastAPI era, and generated artifacts. Never extend root-level Python for a feature; the Next.js pipeline supersedes it. `backend/` is the only Python still in service, and it mostly proxies to Next.js routes.
- **Don't trust the Markdown graveyard.** The root and `finmodai-next/` contain dozens of `*_COMPLETE.md` / `*_SUMMARY.md` / `*_FIX.md` status files from past sessions. They are historical snapshots, frequently stale, and contradict each other. When a doc disagrees with code, the code wins. The only maintained docs are this file, `.claude/skills/`, and `lib/models/schema/README.md`.
- **Skills** (in `.claude/skills/`) carry the detailed procedures — use them:
  - `verify` — how to lint/test/build and exercise a change end-to-end before committing
  - `model-pipeline` — adding/modifying DCF/LBO/Comps/Merger/Three-Statement features, ModelDocument rules, generator file map
  - `data-providers` — the fallback cascade, adding providers, diagnostics, env keys
- **Silent demo fallback is the #1 debugging trap.** Missing API keys make data fetches silently degrade to Supabase cache → demo snapshots. Before debugging "wrong numbers", check the `diagnostics` field of the API response to see which data tier actually served it.
- Fresh clones have no `node_modules` and no `.env.local` — run `npm install` in `finmodai-next/` and copy `.env.local.template` first.

## Commands

All frontend work happens inside `finmodai-next/`:

```bash
cd finmodai-next
npm run dev          # start dev server
npm run build        # production build
npm run lint         # ESLint
npm run test:investment-analysis  # run Node.js investment analysis tests
```

Python backend (rarely needed — most logic lives in Next.js API routes):

```bash
cd backend
pip install -r requirements.txt
python app.py                  # or: uvicorn app:app --reload
pytest tests/ -v
```

There is no root-level test runner. The root `package.json` only declares shared math/finance dependencies (`financejs`, `mathjs`, `pdf-lib`, `simple-statistics`).

## Architecture

### Two-tier, frontend-heavy

`finmodai-next/` (Next.js 14 App Router + TypeScript) contains almost all business logic. The Python FastAPI `backend/` is a thin layer that largely proxies to Next.js API routes — new features go in `finmodai-next/app/api/`.

### ModelDocument: single source of truth

`lib/models/schema/` defines the `ModelDocument` schema used by **both** the Excel generator and the UI preview. Never duplicate formatting logic or calculations between the two — add to the schema and let both renderers consume it.

```
ModelDocument → sections[] → blocks[]
  TableBlock | TextBlock | SpacerBlock | ChartBlock | CalloutBlock
```

Excel cell colors follow a strict convention: blue = section headers, yellow = user inputs, white = formula cells, green = final outputs.

### Financial model pipeline

The main generation flow (triggered from `/api/generateModel`):

1. Validate request (model type, ticker, assumptions)
2. Fetch financials via `lib/data/providers/demoProvider.ts` (Supabase-backed) or live APIs
3. Enrich assumptions via OpenAI (`lib/enrichUnifiedAssumptions.ts`)
4. Sanitize & clamp via `lib/sanitizeAssumptions.ts`
5. Generate Excel via model-specific generators (`lib/dcfGenerator.ts`, `lib/lboEngine.ts`, `lib/compsExcelGenerator.ts`)
6. Return assumptions, preview, downloadUrl, diagnostics

Supported models: DCF, LBO, Comps, Merger, Three-Statement. Each lives in `lib/models/<type>/`.

### Data layer & fallback cascade

Live providers → Supabase cache → demo snapshots. When API keys are absent, the system silently falls back through this chain. `lib/data/fetchWithDiagnostics.ts` wraps all fetches with sanity checks and staleness detection.

News data has its own three-tier cascade: live providers (Perigon → Benzinga → NewsAPI) → `news_headlines` Supabase table → 6 hardcoded demo scenarios in `lib/news/api/shared.ts`. Without API keys in `.env.local`, only the 6 demo headlines are shown.

### Scenario & assumptions state

`lib/modelAssumptionsStore.tsx` (React context) holds the three scenarios (base/bull/bear). `lib/events/store.ts` (Zustand) tracks market events with Supabase persistence. Most other state is server-side via API routes — keep client state minimal.

### Authentication

Supabase Auth with Next.js cookie helpers. Route handler at `app/api/auth/route.ts`. The Python backend has its own separate JWT auth (HS256, bcrypt) for the `/api/v1/` routes it serves directly.

## Environment

Copy `.env.local.template` → `.env.local`. Required keys:

| Key | Purpose |
|-----|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | already set in template |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase auth |
| `OPENAI_API_KEY` | model enrichment, AI chat |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side DB writes (news cache, events) |

Optional but needed for live news: `PERIGON_API_KEY`, `NEWS_API_KEY`.

Without `SUPABASE_SERVICE_ROLE_KEY`, the news cache and market events store are non-functional. Without a news provider key, the news page shows only the 6 demo headlines in `lib/news/api/shared.ts::DEMO_SCENARIOS` regardless of filter selection.
