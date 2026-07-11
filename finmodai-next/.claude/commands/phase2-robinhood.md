Run CapitalBase Robinhood Phase 2 for: $ARGUMENTS

This command may place a real Robinhood stock/ETF buy, but only after the
CapitalBase Phase 2 endpoint authorizes the exact order. Never place options,
crypto, shorts, sells, extended-hours orders, or more than the returned amount.

1. Call CapitalBase `POST /api/pm/trading-agent` with `execute:false` for the
   requested ticker/universe. Use the operator personality. Do not continue for
   any decision whose `liveExecutionGate.eligible` is not exactly `true`.
2. Using Robinhood MCP, fetch accounts, portfolio, equity positions, current
   equity orders, the exact ticker quote, and equity tradability. Do not place
   or review an order yet.
3. Construct the broker snapshot required by
   `POST /api/execution/robinhood/phase2/authorize`. Use a current ISO quote
   timestamp, actual portfolio value/buying power/positions/open orders, and a
   requested notional no larger than $50. From Robinhood's full order history,
   also provide `todayOrderTickers`, `todayOrderCount`, and
   `todayOrderNotional` for every order submitted during the current New York
   trading day (open, filled, cancelled, or rejected). Authenticate with the
   local `EXECUTION_CRON_SECRET` (or `CRON_SECRET` only if the execution secret
   is absent). Stop on any non-200 response.
4. Verify `authorization.authorized === true` and use only the returned order.
   Call Robinhood `review_equity_order` with the selected account and the exact
   symbol, side, type, dollar amount, and regular-hours setting. Stop if the
   broker review differs, warns, rejects, changes quantity, or indicates an
   unavailable market.
5. Call `place_equity_order` with the exact reviewed fields and use
   `authorization.order.refId` as `ref_id`. Never retry with a different ref_id.
6. Read the broker response. Report it to
   `POST /api/pm/trading-agent/executed` with the execution bearer token,
   decisionId, broker `robinhood`, actual status/notional/fill data, and the
   exact signed `authorizationId` returned by the Phase 2 authorization route.
7. Return a concise receipt: ticker, dollars, broker status, decision ID,
   Robinhood reference, and which Phase 2 limits were checked. If anything
   failed, return the blocker and place no trade.

Do not infer missing account or quote fields. Missing data means no trade.
