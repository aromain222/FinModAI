# PM OS Implementation Plan

## Status: Phase 1 — Scaffold complete

---

## Phase 1 — Scaffold (current)

**Goal:** Establish types, folder structure, and documentation without breaking anything.

- [x] `AGENTS.md` updated with PM OS layer rules
- [x] `CLAUDE.md` created with agent guidance for finmodai-next
- [x] `docs/pm-os-architecture.md` written
- [x] `lib/pm/` folder structure created
- [x] `lib/pm/types.ts` — all shared PM OS types defined
- [x] `app/api/pm/` placeholder created
- [x] `components/pm/` placeholder created

**Acceptance:** Build passes, no new TypeScript errors, no existing routes broken.

---

## Phase 2 — Database & Persistence Layer

**Goal:** Wire PM OS types to a persistence backend (Supabase or localStorage fallback).

Tasks:
- Define Supabase table schemas for: `agent_views`, `position_theses`, `thesis_updates`, `investment_decisions`, `pm_alerts`, `conviction_changes`, `weekly_memos`
- Create migration files in `supabase/migrations/`
- Build `lib/pm/memory/agentViewStore.ts` — save/query AgentView records
- Build `lib/pm/thesis/thesisStore.ts` — save/query PositionThesis and ThesisUpdate
- Build `lib/pm/decisions/decisionStore.ts` — save/query InvestmentDecision
- Build `lib/pm/alerts/alertStore.ts` — save/query PMAlert
- Add localStorage fallback for all stores (offline/demo mode)

**Acceptance:** Can persist and retrieve an AgentView after running the hedge-fund agent.

---

## Phase 3 — Backend API Routes

**Goal:** Expose PM OS operations via typed API routes.

Routes to create under `app/api/pm/`:

| Route | Method | Purpose |
|---|---|---|
| `app/api/pm/agent-view/route.ts` | POST | Save an AgentView from hedge-fund/tradingagents output |
| `app/api/pm/thesis/route.ts` | GET/POST | Retrieve or create a PositionThesis |
| `app/api/pm/thesis/[id]/update/route.ts` | POST | Add ThesisUpdate record |
| `app/api/pm/decisions/route.ts` | GET/POST | List or create InvestmentDecision |
| `app/api/pm/decisions/[id]/approve/route.ts` | POST | Approve a decision |
| `app/api/pm/alerts/route.ts` | GET | List PMAlerts for the PM dashboard |
| `app/api/pm/alerts/[id]/acknowledge/route.ts` | POST | Acknowledge an alert |

**Acceptance:** Can POST an agent view, see it retrieved, and create a decision from it.

---

## Phase 4 — Intelligence Integration

**Goal:** Connect Intelligence Engine outputs into PM OS workflows automatically.

Tasks:
- After hedge-fund or tradingagents run completes in `InvestmentChat.tsx`, POST result to `app/api/pm/agent-view`
- Build `lib/pm/decisions/pmBrain.ts` — detects conviction changes between consecutive AgentViews
- Build `lib/pm/thesis/thesisComparator.ts` — compares old thesis string vs new evidence, produces ThesisUpdate
- Wire score change detection: when `onStockUpdate` fires in InvestmentChat, compare delta and trigger thesis snapshot if ≥ 0.5

**Acceptance:** Running the hedge-fund agent on a ticker creates an AgentView record and, if signal changed, a ThesisUpdate.

---

## Phase 5 — Alert Engine

**Goal:** Generate PMAlerts from threshold rules across position and agent data.

Tasks:
- Build `lib/pm/alerts/alertEngine.ts` — evaluates open positions against alert rules
- Implement rules: thesis_break, conviction_drop, event_risk, score_change, agent_conflict, approval_needed
- Create `app/api/pm/alerts/generate/route.ts` — runs alert engine on demand
- Add scheduled trigger (or hook into post-agent-run flow) to regenerate alerts

**Acceptance:** After a position's score drops 1.0+, an alert appears in the PM dashboard.

---

## Phase 6 — PM Dashboard UI

**Goal:** Build the primary PM OS interface.

Components to create under `components/pm/`:

| Component | Purpose |
|---|---|
| `PMDashboard.tsx` | Top-level layout: positions, alerts, decisions |
| `PositionRow.tsx` | Compact position row with thesis integrity badge |
| `ThesisCard.tsx` | Full thesis view with update history |
| `AlertFeed.tsx` | Sorted alert list with acknowledge actions |
| `DecisionQueue.tsx` | Pending approvals list with approve/reject/defer |
| `ConvictionChart.tsx` | Agent consensus trend over time for a ticker |
| `AgentMemoryPanel.tsx` | Historical agent views for a position |

Design rules: institutional, compact, calm. 5–8 positions visible without scroll. Amber border on approval-needed items. Use `--cb-*` CSS variables only.

**Acceptance:** PM can see all open positions with thesis status, review a decision, and approve it.

---

## Phase 7 — Weekly Memo Generation

**Goal:** Auto-generate a structured WeeklyMemo from the week's PM OS data.

Tasks:
- Build `lib/pm/reports/memoGenerator.ts` — queries week's AgentViews, ThesisUpdates, Decisions, Alerts
- Build `app/api/pm/memo/route.ts` — triggers generation and returns WeeklyMemo
- Build `components/pm/WeeklyMemo.tsx` — renders memo in readable format
- Add `weekly_memo` alert when new memo is generated

**Acceptance:** Can generate a WeeklyMemo that summarizes the week's thesis changes and agent highlights.

---

## Phase 8 — QA & Hardening

Tasks:
- Full `npm run build` with zero errors
- `npx tsc --noEmit` clean
- `npm run lint` clean
- Integration test: hedge-fund run → AgentView → conviction change → decision → approval flow
- Playwright E2E: PM can open dashboard, see alert, approve decision
- Review all PM OS API routes for missing input validation
- Confirm no existing routes or components broken

---

## What is explicitly out of scope

- Live order execution or brokerage integration
- Autonomous position sizing or trade routing
- Replacing the Intelligence Engine signal generation
- Rebuilding existing `lib/portfolio/` or `lib/trading/` modules from scratch
- Any feature that removes human approval from the decision loop
