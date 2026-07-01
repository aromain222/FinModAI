# CapitalBase Trading Agent

The trading agent (`POST /api/pm/trading-agent`) never trades on its own read.
It gathers CapitalBase platform context, consults the resident agents, and only
acts when they agree.

## Flow

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
