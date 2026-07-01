# CapitalBase Trading Agent

The trading agent (`POST /api/pm/trading-agent`) never trades on its own read.
It gathers CapitalBase platform context, consults the resident agents, and only
acts when they agree.

It has two modes:

- **Deep dive** — pass a `ticker` and it runs the full consult round on that
  one name.
- **Autonomous scan** — omit `ticker` and the agent finds its own ideas: it
  sources candidates, consults the agents on each, and chooses which names to
  invest in. Nobody has to tell it what to buy.

## Autonomous scan

1. **Source candidates** — caller-provided `universe` if present, otherwise
   the CapitalBase ranked opportunity board (`/api/rank`, which carries the
   opportunity score and the undervalued/fair/overvalued valuation signal),
   otherwise the static watchlist. Names with an open pending decision are
   skipped so the agent doesn't restate itself. Bounded by `maxCandidates`
   (default 4, cap 8).
2. **Consult the agents on every candidate** (two names at a time) — the same
   research-debate + committee round as a deep dive.
3. **Choose investments** — only `unanimous`/`majority` **bullish** reads at
   ≥ 55 confidence are investable. Candidates are ordered by a composite
   selection score: consensus confidence, +10 for unanimity, +6 undervalued /
   −12 overvalued, plus the ranked-board score as a tiebreak. Top `maxPicks`
   (default 2, cap 3) win.
4. **Tell the story** — the response includes a per-ticker narrative (ranking
   context → what each agent said → consensus) and a run-level story
   explaining what was scanned, what was passed over and why, and why the
   picks won.
5. **Persist + execute** — pending `InvestmentDecision`s are created only for
   the picks; the execution stage applies the same gates as a deep dive.

```bash
POST /api/pm/trading-agent

{ "maxCandidates": 4, "maxPicks": 2 }            # fully autonomous
{ "universe": ["NVDA","AMD","TSM"], "maxPicks": 1 }  # constrained scan
```

## Deep-dive flow

1. **Gather platform context** — current position for the ticker
   (`pm_positions`), latest quant scout scores from the monitoring store.
2. **Consult the agents** (in parallel):
   - `/api/tradingagents` — 4-analyst research debate + PM synthesis.
   - `/api/hedge-fund` (`mode: committee`) — 13-persona Senior Investment
     Committee.
3. **Synthesize a consensus** (`lib/pm/tradingAgent/synthesize.ts`):
   - Both directional and aligned → `unanimous`; action `buy`/`add` or `trim`.
   - Direction + neutral, or only one agent responded → `majority`; confidence
     dampened 20%.
   - Bullish vs bearish → `split`; defensive `hold`, confidence halved.
   - No agent responded → `no_signal`; nothing is persisted or traded.
   - Bearish without an existing position is always `hold` — the agent never
     opens shorts.
4. **Persist an `InvestmentDecision`** (pending PM approval) with the agent
   verdicts and analyst notes as the evidence trail.
5. **Execution stage** (paper-only, via the existing Alpaca adapter and risk
   checks):
   - Default runs return a risk-checked order **preview** only.
   - `execute: true` submits a paper order only when ALL gates pass:
     unanimous agreement, confidence ≥ threshold, executable action,
     `TRADING_AGENT_EXECUTION_ENABLED=true`, and a valid cron/execution
     bearer secret on the request.

## Request

```bash
POST /api/pm/trading-agent
Authorization: Bearer $EXECUTION_CRON_SECRET   # only required when execute=true

{
  "ticker": "NVDA",
  "themes": ["ai"],        # optional mandate check forwarded to the debate
  "notional": 100,          # optional paper order size in USD
  "execute": false          # default: analyze + preview only
}
```

The response contains `consultations` (each agent's stance, confidence,
summary, evidence), `consensus`, the persisted `decision`, the `execution`
outcome (`not_requested` / `previewed` / `skipped` / `submitted` / `failed`),
and the platform `context` the agent factored in.

## Using with a broker MCP (e.g. Robinhood)

When execution happens outside CapitalBase — for example a Claude session
driving a Robinhood MCP server — the trading agent is the pre-trade check and
CapitalBase keeps the decision trail:

1. **Before the trade**, call `POST /api/pm/trading-agent` with
   `execute: false` (the default). Gate the broker order on the response:
   only trade when `consensus.agreement` is `unanimous` (or `majority`, per
   your risk appetite) and `consensus.confidence` clears your threshold.
   Respect `consensus.action` — `hold` / `watch` means no order.
2. **Place the order through the broker MCP**, sized off `notional` and the
   `execution.preview` order if present.
3. **After the fill**, report back with
   `POST /api/pm/trading-agent/executed`:

```bash
POST /api/pm/trading-agent/executed

{
  "decisionId": "<decision.id from step 1>",
  "broker": "robinhood",
  "status": "filled",          # or rejected / cancelled
  "qty": 2,                     # or "notional": 500
  "fillPrice": 187.42,
  "note": "optional context"
}
```

A fill marks the decision approved (attributed to `<broker>_mcp`) and
executed, and records the outcome in PM memory — so the same decision can
never be double-executed and the agents' hit rate stays auditable.

## Environment

```bash
TRADING_AGENT_EXECUTION_ENABLED=true   # required for any submission
TRADING_AGENT_MIN_CONFIDENCE=70        # consensus confidence execution floor
TRADING_AGENT_DEFAULT_NOTIONAL=100     # USD per paper order when not specified
```

Alpaca paper credentials and order caps come from the existing execution
layer — see `docs/alpaca-paper-trading.md`. All of its guardrails still apply
(paper endpoint only, notional/qty caps, duplicate-execution blocks).
