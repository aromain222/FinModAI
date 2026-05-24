# PM OS Architecture — CapitalBase Portfolio Manager Operating System

## Overview

CapitalBase has two layers:

1. **Intelligence Engine** — generates signals, scores, theses, and agent views from market data
2. **PM OS** — consumes structured outputs from the Intelligence Engine and turns them into persistent investment workflows

The PM OS does not generate signals. It is the operator, not the brain.

```
Market Data / News / Events
         │
         ▼
┌─────────────────────────────┐
│      Intelligence Engine    │
│                             │
│  lib/ranking/               │
│  lib/analyst/               │
│  app/api/hedge-fund/        │  ← 19-persona consensus
│  app/api/tradingagents/     │  ← research debate + PM decision
│  app/api/rank/              │
└────────────┬────────────────┘
             │ structured outputs
             │ (AgentView, signals, scores, theses)
             ▼
┌─────────────────────────────┐
│         PM OS               │
│                             │
│  Thesis Store               │
│  Agent Memory               │
│  Event Interpretation       │
│  Alert Engine               │
│  Decision Workflow          │
│  Weekly Memo Generator      │
│  PM Dashboard               │
└─────────────────────────────┘
```

---

## Components

### Intelligence Engine (existing — do not modify for PM OS)

The signal generation layer. All PM OS inputs come from here.

| Module | Role |
|---|---|
| `lib/ranking/score.ts` | Composite opportunity score (0–10) across 6 factors |
| `lib/ranking/signals.ts` | Green/yellow/red signal derivation |
| `lib/analyst/orchestrator.ts` | AI analyst chat modes (explain/evaluate/challenge/compare/pitch) |
| `lib/analyst/pmAgentBrain.ts` | PM-style structured analysis output |
| `app/api/hedge-fund/` | 19-persona parallel consensus + PM synthesis |
| `app/api/tradingagents/` | 4-desk research → bull/bear debate → decision + price target |

Outputs consumed by PM OS: `AgentView` records, score breakdowns, thesis strings, signals.

---

### PM Brain

The PM OS entry point. Receives Intelligence Engine outputs and routes them into the correct PM OS workflow.

Responsibilities:
- Ingest `AgentView` records from hedge-fund and tradingagents runs
- Compare new agent view against last persisted view for the ticker
- Determine if a conviction change has occurred
- Trigger thesis update if score delta exceeds threshold (default: ±0.5)
- Create `InvestmentDecision` and route to approval queue if action changes

Location: `lib/pm/decisions/`

---

### Thesis Store

Tracks investment theses across their full lifecycle. Every position has a living thesis document that records old vs new evidence at each update.

Key principle: **never overwrite**. Each thesis change creates a `ThesisUpdate` record preserving the previous state, the new evidence, and what changed in the score.

Location: `lib/pm/thesis/`

Types: `PositionThesis`, `ThesisUpdate`, `ThesisIntegrityStatus`

Integrity states:
- `intact` — score and narrative confirm original thesis
- `degrading` — score dropped or key catalyst failed to materialize
- `broken` — original thesis is no longer supportable; PM action required
- `resolved` — position exited; thesis marked complete

---

### Agent Memory

Persists all agent views so the PM OS can reason about conviction drift over time.

Every time the hedge-fund engine or tradingagents runs for a ticker, the output is stored as an `AgentView` record. The PM OS queries these to:
- Compute conviction trend (is the signal improving or deteriorating?)
- Detect agent conflicts (hedge-fund bullish, tradingagents bearish)
- Surface historical agent reads when generating weekly memos

Location: `lib/pm/memory/`

Types: `AgentView`, `ConvictionChange`

---

### Event Interpretation Engine

Bridges the macro event calendar (`lib/ranking/macroCal.ts`) and company catalyst list with position-level impact assessment.

When a macro event fires (CPI, FOMC, NFP, etc.), the Event Interpretation Engine:
1. Identifies which open positions have exposure via their scoring channel (estimate/multiple/macro/risk)
2. Generates a position-level impact note
3. Creates a `PMAlert` if the expected impact is above threshold
4. Flags thesis snapshots for review if the event outcome diverges from the expected scenario

Location: `lib/pm/alerts/` (event triggers) + consumed by Thesis Store

---

### Alert Engine

Generates `PMAlert` records from threshold-based rules across position data, agent views, and score changes.

Alert categories:
- `thesis_break` — ThesisIntegrityStatus changed to `broken`
- `conviction_drop` — agent consensus flipped from bullish to bearish
- `event_risk` — macro event within 5 days for a position with macro exposure
- `score_change` — score delta ≥ 0.8 since last PM review
- `agent_conflict` — hedge-fund and tradingagents signals disagree
- `approval_needed` — new `InvestmentDecision` awaiting PM sign-off
- `weekly_memo` — weekly memo generated and ready for review

Severity levels: `critical` → `high` → `medium` → `low` → `info`

Location: `lib/pm/alerts/`

---

### Decision Workflow

Manages the lifecycle of investment recommendations from generation to PM approval to execution record.

Flow:
```
Agent run → PM Brain evaluates → InvestmentDecision created (pending)
                                          │
                                          ▼
                                  PM reviews + approves/rejects
                                          │
                                    approved ──► execution note recorded
                                    rejected ──► decision closed with note
                                    deferred ──► back to queue
```

No decision surfaces as actionable in the UI without `approvalStatus: 'approved'`. This is enforced at the component level, not just the API.

Location: `lib/pm/decisions/`

Types: `InvestmentDecision`, `PMApprovalStatus`, `TradeAction`

---

### Weekly Memo Generator

Produces a structured `WeeklyMemo` document each week summarizing:
- Portfolio performance vs thesis expectations
- Positions where thesis was confirmed vs broken
- Agent highlights (notable consensus shifts)
- Macro context and event outcomes
- Open decisions awaiting approval
- Watchlist for the coming week

The memo is generated from persisted PM OS data — it does not make new agent calls. It synthesizes what has already been recorded.

Location: `lib/pm/reports/`

Types: `WeeklyMemo`

---

### PM Dashboard

The primary UI surface. Shows the PM an at-a-glance view of:
- Open positions with current thesis integrity status
- Active alerts sorted by severity
- Decisions awaiting approval
- Conviction changes since last session
- Upcoming events with position-level exposure

Design target: institutional, compact, calm. A PM should see 5–8 positions without scrolling. No decorative motion. No gradients on data panels.

Location: `components/pm/`

---

### Human Approval Workflow

All `InvestmentDecision` records flow through PM approval before the UI treats them as actionable.

PM actions:
- **Approve** — marks decision approved, records timestamp and optional note
- **Reject** — closes decision with rejection note; thesis is updated accordingly
- **Defer** — returns decision to queue with a follow-up date

Approval state is stored on the `InvestmentDecision` record. The Alert Engine creates an `approval_needed` alert when a new decision enters the queue.

---

## Data flow summary

```
1. User runs AI Hedge Fund or TradingAgents on a ticker
2. Response is structured and saved as AgentView (lib/pm/memory)
3. PM Brain compares to prior AgentView → detects conviction change
4. If score delta ≥ threshold → ThesisUpdate created (lib/pm/thesis)
5. If action changes → InvestmentDecision created (lib/pm/decisions)
6. Alert Engine fires appropriate PMAlert (lib/pm/alerts)
7. PM Dashboard surfaces alert + decision for review
8. PM approves/rejects → decision closed, thesis updated
9. Weekly Memo Generator synthesizes the week's changes
```

---

## File locations

```
lib/pm/types.ts          — all shared PM OS types
lib/pm/thesis/           — thesis storage and comparison
lib/pm/memory/           — agent view persistence
lib/pm/alerts/           — alert generation rules
lib/pm/reports/          — weekly memo generation
lib/pm/portfolio/        — portfolio-level aggregations
lib/pm/decisions/        — decision lifecycle

app/api/pm/              — PM OS API routes
components/pm/           — PM OS UI components
```
