# Runbook: Data Quality & Provider Management

This document outlines the procedures for triaging data provider failures, managing the data quarantine, and ensuring the overall health of the financial data pipeline.

## 1. Triage Provider Failures

Provider failures are detected by the nightly health check and will trigger a Slack alert.

### Steps:
1.  **Check the Nightly Health Report** in Slack for details on which provider and tickers failed.
2.  **Run the Diagnostic Tool manually** for a failing ticker to get real-time status:
    ```bash
    make diag:data TICKER=MSFT
    ```
3.  **Inspect the Output Table**:
    *   Look for `HTTP Status` codes (e.g., 401, 429, 503).
    *   Check the `Error` column for messages like "API key invalid" or "Rate limit exceeded."
4.  **Resolve Common Issues**:
    *   **401 Unauthorized**: Verify the corresponding `_API_KEY` is correct in your `.env` file or Koyeb environment variables.
    *   **429 Too Many Requests**: The provider's rate limit was hit. The system should back off automatically. If this happens frequently, consider upgrading the API plan or reducing query frequency.
    *   **503 Service Unavailable**: The provider's service is temporarily down. The `data_router` should automatically fail over to the next provider.
    *   **EDGAR Failures**: Ensure the `SEC_UA_EMAIL` environment variable is set, as EDGAR requires a custom User-Agent.

## 2. Manage the Data Quarantine

The system will automatically quarantine tickers if it detects data outliers (e.g., a >10% change in shares outstanding overnight). A Slack alert will be sent for each new quarantine.

### Commands (run from your terminal):

#### List Quarantined Tickers
Shows all tickers currently in quarantine and the reason.
```bash
python scripts/admin_cli.py list
```

#### Clear a Ticker from Quarantine
If you've investigated an outlier and deemed it correct (e.g., due to a stock split or acquisition), you can clear it.
```bash
python scripts/admin_cli.py clear <TICKER> "Note explaining why it was cleared"
```
**Example:**
```bash
python scripts/admin_cli.py clear TSLA "Verified 5:1 stock split"
```

#### Force a Data Refresh
To re-fetch data for a ticker and see if it passes quarantine checks now.
```bash
python scripts/admin_cli.py refresh <TICKER>
```

## 3. Onboarding a New Data Provider

1.  Create a new provider client in `backend/providers/` that inherits from `BaseProvider`.
2.  Implement `get_quote`, `get_fundamentals`, and `health_check` methods.
3.  Add the new provider to the `PROVIDER_MODULES` list in `scripts/diagnose_data.py`.
4.  Add the provider to the `data_router.py` hierarchy.
5.  Add any required API key to `.env.example` and your environment.

# --- Core Settings ---
---
*This is a living document. Please update it as the system evolves.*
