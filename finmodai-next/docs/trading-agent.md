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
   up to 2 **held positions first** (the book must be managed, not just added
   to) followed by the CapitalBase ranked opportunity board (`/api/rank`,
   which carries the opportunity score and the undervalued/fair/overvalued
   valuation signal), otherwise the static watchlist. Names with an open
   pending decision are skipped so the agent doesn't restate itself. Bounded
   by `maxCandidates` (default 4, cap 8).
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
6. **Defend the book** — held names where the agents turned bearish become
   `bookActions`: a trim of 25% of current exposure (never more than held,
   never a short), through the same execution gates. The loop sells as well
   as buys.

```bash
POST /api/pm/trading-agent

{ "maxCandidates": 4, "maxPicks": 2 }            # fully autonomous
{ "universe": ["NVDA","AMD","TSM"], "maxPicks": 1 }  # constrained scan
```

## Position sizing

The agent assigns its own slice of the portfolio to every pick unless the
caller pins an explicit `notional`:

```
allocation = basePositionPct              (from the personality)
           × confidence / 100             (conviction scaling)
           × 1.2 unanimous / 0.85 majority
           × 1.25 undervalued / personality overvalued multiplier
```

clamped to the personality's per-name cap, minus what the book already holds
in that name (no doubling past the cap via repeated adds). Equity comes from
the live Alpaca paper account when configured, else
`TRADING_AGENT_PORTFOLIO_USD` (default $10,000). Orders under $25 are skipped
as dust. Every pick's response includes the sizing math in plain English.

## Personality

`personality` (request param) or `TRADING_AGENT_PERSONALITY` (env) selects the
risk contract the agent trades under — not flavor text; each one changes the
thresholds and sizing:

| | steward | operator (default) | hunter |
|---|---|---|---|
| Pick confidence floor | 65 | 55 | 50 |
| Execution agreement | unanimous | unanimous | majority |
| Execution confidence floor | 75 | 70 | 65 |
| Base / max position | 3% / 6% | 5% / 10% | 7% / 15% |
| Default picks per scan | 1 | 2 | 3 |
| Overvalued sizing | ×0.25 | ×0.5 | ×0.7 |

## Training loop

Before every run the agent reviews its own record (`lib/pm/tradingAgent/learning.ts`):
it marks the paper book (realized + unrealized P&L from `pm_paper_orders`
against the freshest platform prices) and rereads its recent trade-journal
memories. A losing book raises both the pick floor and the execution floor by
+5 (or +10 when the drawdown exceeds 5% of cost basis); a winning book never
lowers the bar. The track-record summary and journal lessons are included in
every scan story, so the learning is auditable.

## Fully autonomous loop

`GET /api/pm/trading-agent/cron` runs the whole loop with no human input:
source candidates → consult agents → size → execute. `vercel.json` schedules
it **hourly through the US session** (13:30–19:30 UTC, weekdays), protected by
the cron bearer secret. Controls:

- `TRADING_AGENT_EXECUTION_ENABLED=true` — without it, autonomous runs stop
  at pending decisions + previews (paper execution stays off).
- `TRADING_AGENT_PERSONALITY` — the risk contract the loop trades under.
- `TRADING_AGENT_MAX_ORDERS_PER_DAY` (default 6) — once the agent has
  executed that many orders in a UTC day, later hourly runs return early
  (no LLM spend) until tomorrow. Remaining budget also caps picks per run.

Note: Vercel Hobby plans only allow daily crons. For hourly cadence at $0,
use the bundled GitHub Action (`.github/workflows/trading-agent-cron.yml`) —
it curls the deployed route on the same hourly schedule; set the
`TRADING_AGENT_URL` and `EXECUTION_CRON_SECRET` repository secrets and the
loop runs with no machine of yours switched on. Execution remains paper-only
end to end; real-money brokers are reached only through the external
write-back workflow below.

## Daily brief

`GET /api/pm/daily-brief` runs the morning research loop and returns a
markdown brief — no execution, ever:

1. **Book reads** — re-consults the full agent round (research debate +
   committee) on every held name. Holdings come from the `holdings=` query
   param, else the `DAILY_BRIEF_HOLDINGS` env var (comma-separated tickers —
   use this when the real book lives at an external broker), else active
   `pm_positions`.
2. **Discovery** — a small autonomous scan of the ranked board for new ideas.
3. **Theses** — the brief includes each name's full narrative (ranking
   context → what each agent said → consensus), the picks with sizing and
   `decision.id`s, and the write-back command for acting through an external
   broker.

Config: `DAILY_BRIEF_HOLDINGS`, `DAILY_BRIEF_THEMES` (comma-separated; default
swing-trade themes), `DAILY_BRIEF_PERSONALITY` (falls back to
`TRADING_AGENT_PERSONALITY`). Protected by the same cron bearer secrets.

Delivery: `.github/workflows/daily-brief.yml` curls the route every weekday
at 12:45 UTC and posts the markdown as a GitHub issue labeled `daily-brief`.
Watch the repository (with email notifications on) and the brief lands in
your inbox each morning. Uses the same `TRADING_AGENT_URL` +
`EXECUTION_CRON_SECRET` repository secrets as the hourly cron.

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

### Robinhood Phase 2: capped live adds

Phase 2 uses the official Robinhood MCP installed in local Claude Code. It is
buy/add only; options, crypto, shorts, margin, extended hours, and automated
trims are outside this phase. CapitalBase does not receive Robinhood credentials.

1. Generate a fresh CapitalBase decision. The response decision must contain
   `liveExecutionGate.eligible: true`.
2. Through the Robinhood MCP, read the account, portfolio, equity positions,
   equity orders, quote, and tradability. Do not place an order yet.
3. Submit that broker snapshot and the proposed size to:

```bash
POST /api/execution/robinhood/phase2/authorize
Authorization: Bearer $EXECUTION_CRON_SECRET

{
  "decisionId": "<decision.id>",
  "requestedNotional": 25,
  "snapshot": {
    "portfolioValue": 5000,
    "buyingPower": 1000,
    "tradingBlocked": false,
    "marketOpen": true,
    "quote": {
      "symbol": "NVDA",
      "last": 190.00,
      "bid": 189.95,
      "ask": 190.05,
      "observedAt": "<current ISO timestamp>",
      "tradable": true,
      "assetType": "stock"
    },
    "positions": [{ "ticker": "NVDA", "marketValue": 300 }],
    "openOrderTickers": [],
    "todayOrderTickers": [],
    "todayOrderCount": 0,
    "todayOrderNotional": 0
  }
}
```

4. Continue only when `authorization.authorized` is true. Preserve the
   response's short-lived signed `authorizationId`. Pass the returned order to
   `review_equity_order`, inspect that the broker review matches exactly, then
   pass the same fields and `refId` to `place_equity_order`.
5. Report the broker result to `/api/pm/trading-agent/executed`, including
   the exact signed `authorizationId` and the execution bearer token. A fill
   above the authorized dollar amount, a stale receipt, or a receipt for a
   different decision is rejected.

Hard ceilings are code-owned: $50/order, 0.5% of portfolio/order, 1% daily
turnover, two Robinhood orders/day, one action/ticker/day, and 15% post-trade
ticker exposure. Environment configuration may disable Phase 2 but cannot
raise these ceilings.

## Environment

```bash
TRADING_AGENT_EXECUTION_ENABLED=true   # required for any submission
TRADING_AGENT_PERSONALITY=operator     # steward | operator | hunter
TRADING_AGENT_MIN_CONFIDENCE=          # optional override of the personality's execution floor
TRADING_AGENT_PORTFOLIO_USD=10000      # book size for sizing when Alpaca is not configured
TRADING_AGENT_DEFAULT_NOTIONAL=100     # fallback USD per order when sizing is bypassed
ROBINHOOD_PHASE2_ENABLED=false         # set true only after dry-run authorization QA
EXECUTION_CRON_SECRET=                 # required by Phase 2 authorize/write-back routes
```

Alpaca paper credentials and order caps come from the existing execution
layer — see `docs/alpaca-paper-trading.md`. All of its guardrails still apply
(paper endpoint only, notional/qty caps, duplicate-execution blocks).
