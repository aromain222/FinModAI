# Alpaca Paper Trading

CapitalBase uses Alpaca only as a guarded paper-execution adapter. The PM Brain still owns recommendations, approvals, thesis tracking, and memory.

## Environment

Set paper credentials in Vercel or `.env.local`:

```bash
ALPACA_API_KEY_ID=...
ALPACA_SECRET_KEY=...
ALPACA_PAPER_BASE_URL=https://paper-api.alpaca.markets
EXECUTION_MAX_ORDER_NOTIONAL=1000
EXECUTION_MAX_ORDER_QTY=1000
```

`APCA_API_KEY_ID` and `APCA_API_SECRET_KEY` are also accepted.

## Flow

1. PM Brain creates an `InvestmentDecision`.
2. Human PM approves it with `/api/pm/decisions/[id]/approve`.
3. UI calls `/api/execution/orders` with `dryRun: true` to preview and risk-check.
4. UI calls `/api/execution/orders` with `dryRun: false` to submit to Alpaca paper trading.
5. The decision receives `executedAt` and `executionNote`; PM memory records the outcome.

## Guardrails

- Paper endpoint only.
- No autonomous execution.
- No live trading endpoint.
- Approval required before submission.
- Stale approvals and duplicate executions are blocked.
- `hold`, `watch`, and `short` decisions are not executable.

## Auto Paper Mode

Auto paper mode submits only PM-approved, unexecuted, executable decisions. It never approves decisions and never uses a live trading endpoint.

```bash
ALPACA_AUTO_PAPER_ENABLED=true
ALPACA_AUTO_PAPER_NOTIONAL=100
ALPACA_AUTO_PAPER_MIN_CONFIDENCE=65
ALPACA_AUTO_PAPER_MAX_ORDERS=3
EXECUTION_CRON_SECRET=...
```

Preview:

```bash
GET /api/execution/auto-paper
```

Submit approved paper orders:

```bash
POST /api/execution/auto-paper
Authorization: Bearer $EXECUTION_CRON_SECRET

{ "dryRun": false, "notional": 100 }
```

## PM Agent Auto-Approval

The PM Agent can auto-approve paper-trade decisions before the paper auto-trader runs. This is still paper-only.

```bash
PM_AGENT_AUTO_APPROVAL_ENABLED=true
PM_AGENT_AUTO_APPROVAL_MIN_CONFIDENCE=78
PM_AGENT_AUTO_APPROVAL_MAX_APPROVALS=3
```

Preview approvals:

```bash
GET /api/pm/decisions/auto-approve
```

Approve qualifying paper decisions:

```bash
POST /api/pm/decisions/auto-approve
Authorization: Bearer $EXECUTION_CRON_SECRET

{ "dryRun": false }
```

Approve and execute paper decisions in one guarded call:

```bash
POST /api/execution/auto-paper
Authorization: Bearer $EXECUTION_CRON_SECRET

{ "dryRun": false, "autoApprove": true, "notional": 100 }
```
