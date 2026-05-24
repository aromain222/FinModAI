# CLAUDE.md — finmodai-next

Guidance for Claude Code agents working inside `finmodai-next/`. See root `AGENTS.md` for product direction.

## Before editing anything

1. Read `AGENTS.md` for product rules and layer boundaries.
2. Run `ls lib/` and `ls app/api/` to understand what already exists.
3. Check `lib/pm/types.ts` for shared PM OS types before defining new ones.
4. Check `lib/portfolio/types.ts` and `lib/trading/` before defining position or thesis types.
5. Do not duplicate types that already exist — import or extend them.

## Intelligence Engine — do not rewrite

These are signal-generation modules. Treat as read-only for PM OS work:

- `lib/ranking/` — scoring, signals, catalyst types
- `lib/analyst/` — orchestrator, pmAgentBrain, pmPlaybook
- `app/api/hedge-fund/` — 19-persona consensus
- `app/api/tradingagents/` — research debate + PM decision
- `app/api/rank/` — ranking pipeline

## Design system

- Use existing CSS variables: `--cb-border`, `--cb-surface`, `--cb-text-primary`, `--cb-text-secondary`, `--cb-text-muted`, `--cb-surface-subtle`
- Use existing Tailwind config — do not introduce new utilities or extend the theme
- Do not add new icon libraries — Lucide is already installed
- Do not add new animation libraries — use Tailwind transitions

## PM UI standards

- Institutional, compact, calm. Every element should earn its space.
- No gradients on data panels.
- No decorative motion on tables or data grids.
- Density target: a PM should see 5–8 positions in a single viewport without scrolling.
- Empty states must be explicit: "No positions" not a blank panel.
- Approval-required items must be visually distinct — amber border or badge.

## After UI changes

Test in browser before marking done. Check:
- [ ] Renders correctly at 1280px and 1440px
- [ ] No horizontal scroll on the panel
- [ ] Dark mode CSS variables render with correct contrast
- [ ] No TypeScript errors: `npx tsc --noEmit`

## TypeScript rules

- Strict mode — no `any`, no type assertions without a comment explaining why
- Extend existing types via intersection (`&`) before creating new interfaces
- Export from `lib/pm/types.ts` for all PM OS types
- Import `RankedStock` from `@/lib/ranking/types`, not redefined locally

## Adding a new PM API route

1. Create under `app/api/pm/<route-name>/route.ts`
2. Validate input with `zod`
3. Return structured JSON — no plain text from PM routes
4. Do not call `app/api/hedge-fund` or `app/api/tradingagents` from client components — go through a PM route

## Commands

```bash
npm run dev          # start dev server
npm run build        # production build — run before finishing
npm run lint         # ESLint
npx tsc --noEmit     # type check
npm run test:investment-analysis
```
