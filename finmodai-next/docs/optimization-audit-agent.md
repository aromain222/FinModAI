# Optimization Audit Workflow

Use this workflow when the goal is to find unoptimized code, prioritize the highest-cost runtime issues, and then hand the fixes to an expert coding agent.

## 1. Run the repo audit

From `/Users/averyromain/FinModAI/finmodai-next`:

```bash
npm run audit:optimize
```

The audit flags:

- oversized modules
- heavy packages imported into client components
- heavy internal runtimes pulled into client components
- `cache: 'no-store'` fetches inside client surfaces
- eager curated fallback defaults

## 2. Prioritize fixes

Fixes should be taken in this order:

1. client components importing heavy chart, workbook, PDF, or LLM runtimes
2. client components importing server-oriented internal logic
3. repeated `no-store` fetches on hot UI paths
4. oversized files that sit on shared routes
5. fallback/default paths that make the cold path too heavy

Do not start with broad deletion. Start with the runtime path that is actually making the app slow.

## 3. Hand findings to the expert coding agent

Use this prompt shape:

```text
Audit findings are below. Fix the top 1-2 performance hotspots only. Keep the change narrow, preserve behavior, and validate the affected slice. Prefer moving heavy logic off the client hot path over deleting fallback infrastructure.
```

Then paste only the top findings from `npm run audit:optimize`.

## 4. Validate after each pass

Run the smallest meaningful validation first:

- targeted route/component test if available
- then a module import check
- then `npm run build` when shared types, routes, or common components changed

## 5. Current structural decision

- The `/market` tab has been removed from workspace navigation.
- Legacy `/market` traffic should redirect into `/news`.
- `market` subdomain traffic should resolve to `/news`.

Keep future optimization work focused on hot runtime paths such as:

- `/news`
- `/events`
- `/models/create`
- Analyst Chat
