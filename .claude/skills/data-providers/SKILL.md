---
name: data-providers
description: Work on financial/news data fetching — the provider fallback cascade (live APIs → Supabase cache → demo snapshots), adding a provider, diagnostics, and env keys. Use when touching lib/data, lib/news, or debugging "wrong/stale data" reports.
---

# Data layer & fallback cascade

## The cascade (financial data)

```
Live providers → Supabase cache → demo snapshots (lib/data/providers/demoProvider.ts)
```

- Provider implementations: `finmodai-next/lib/data/providers/` (secEdgar, polygon, finnhub, tiingo, alphavantage, fred, twelvedata, …). Shared plumbing in `providers/shared.ts` and `providers/types.ts`.
- Selection/orchestration: `lib/data/providerFactory.ts`.
- Every fetch goes through `lib/data/fetchWithDiagnostics.ts` — it attaches sanity checks, staleness detection, and records which tier actually served the data. **Route new fetches through it; never `fetch()` a provider directly from feature code.**
- When API keys are absent the cascade falls through **silently**. This is by design (demo mode) but is the #1 source of "the numbers are wrong" confusion: always check the `diagnostics` field in API responses to see which tier served the data before debugging calculation logic.

## News cascade (separate, three tiers)

```
Perigon → Benzinga → NewsAPI  →  Supabase `news_headlines` table  →  6 hardcoded demo scenarios
```

Demo scenarios live in `lib/news/api/shared.ts::DEMO_SCENARIOS`. Without a provider key, the news page shows only those 6 headlines regardless of filters — that is expected, not a bug.

## Env keys (in `finmodai-next/.env.local`, template: `.env.local.template`)

| Key | Without it |
|-----|------------|
| `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` | no auth |
| `OPENAI_API_KEY` | no assumption enrichment / AI chat |
| `SUPABASE_SERVICE_ROLE_KEY` | news cache + market events store non-functional |
| `PERIGON_API_KEY`, `NEWS_API_KEY` | news falls to demo scenarios |
| provider keys (polygon, finnhub, …) | financial data falls to Supabase cache → demo |

`lib/keyStatus.ts` and `/api/health` report which keys are present.

## Adding a provider

1. New file in `lib/data/providers/` implementing the interfaces in `providers/types.ts`; reuse `providers/shared.ts` helpers (rate limiting, retries).
2. Register it in `providers/index.ts` and slot it into the cascade in `providerFactory.ts` — order matters; put it above the tiers it should beat.
3. Read its key from env and degrade silently (return null / throw a typed error the factory catches) when the key is missing — never crash the cascade.
4. Add a test under `tests/providers/` and run `npm run test:investment-analysis` for regressions in downstream models.
