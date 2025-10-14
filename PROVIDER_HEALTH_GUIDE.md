# Data Provider Health System

## Overview

The enhanced data provider layer implements:
- **Startup preflight checks** with non-blocking health tests
- **Unified error mapping** across all providers
- **Fail-fast** for invalid API keys
- **Exponential backoff** for rate limits (100ms → 300ms → 900ms)
- **Response caching** with configurable TTL (6-24 hours)
- **Structured logging** with trace IDs
- **Proper error surfacing** to frontend without leaking secrets

## Architecture

```
┌─────────────────────────────────────────────┐
│  Application Startup                         │
│  └── preflight_check()                       │
│      └── run_startup_checks()                │
│          ├── Test Finnhub (2s timeout)       │
│          ├── Test FMP (2s timeout)           │
│          ├── Test Alpha Vantage (2s timeout) │
│          └── Test FRED (2s timeout)          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Request: POST /models/generate              │
│  └── DataFetcher.fetch_with_fallback()      │
│      ├── Check cache first                   │
│      ├── Try provider chain (20s budget)     │
│      │   ├── Skip if invalid_api_key         │
│      │   ├── Retry if rate_limited (3x)      │
│      │   └── Fallback on failure             │
│      └── Cache successful responses          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│  Response to Frontend                        │
│  Success:                                    │
│    { "provider": "Finnhub",                  │
│      "trace_id": "5f95c2ee",                 │
│      "preview": {...} }                      │
│  Error:                                      │
│    { "error": "data_provider_unavailable",   │
│      "provider_attempts": ["Finnhub", ...],  │
│      "message": "All providers failed..." }  │
└─────────────────────────────────────────────┘
```

## Configuration

### Required Environment Variables

```bash
# Provider API Keys (at least one required)
FINNHUB_API_KEY=your_finnhub_key
FMP_API_KEY=your_fmp_key
ALPHAVANTAGE_API_KEY=your_alpha_vantage_key
FRED_API_KEY=your_fred_key
```

### Provider Parameter Names

**CRITICAL:** Each provider uses different parameter names:

| Provider | Param Name | Example URL |
|----------|------------|-------------|
| Finnhub | `token` | `?symbol=AAPL&token=KEY` |
| FMP | `apikey` | `?symbol=AAPL&apikey=KEY` |
| Alpha Vantage | `apikey` | `?function=OVERVIEW&apikey=KEY` |
| FRED | `api_key` | `?series_id=DGS10&api_key=KEY` |

Using the wrong param name (e.g., `apikey` for Finnhub) will result in **401 Invalid API key**.

## Startup Behavior

### Preflight Checks

On application start, the system performs lightweight health checks:

```
============================================================
STARTUP PREFLIGHT: Checking data providers...
============================================================
PROVIDER_OK Finnhub as_of=2025-10-09 10:45:32 response_time=245ms
PROVIDER_FAIL FMP status=down reason=invalid_api_key message=401 Invalid API key
PROVIDER_OK AlphaVantage as_of=2025-10-09 10:45:34 response_time=412ms
⊘ FRED: No API key configured (FRED_API_KEY not set)
============================================================
Provider summary: 2/4 active
============================================================
```

**Important:** The app **does not block** if providers fail. Providers marked `down` are skipped during runtime.

## Error Mapping

### HTTP Status → Error Type

| Status | Error Type | Behavior |
|--------|-----------|----------|
| 401, 403 | `invalid_api_key` | **Fail-fast**: Skip provider for entire runtime |
| 429 | `rate_limited` | **Backoff**: Retry 3x (100ms, 300ms, 900ms), then fallback |
| 5xx | `provider_unavailable` | **Fallback**: Try next provider |
| Timeout | `timeout` | **Fallback**: Try next provider |

### Alpha Vantage Special Case

Alpha Vantage returns `200 OK` with a `"Note"` field when rate limited:

```json
{
  "Note": "Thank you for using Alpha Vantage! Our standard API call frequency is 5 calls per minute..."
}
```

The system **detects this** and treats it as `rate_limited`.

## Fail-Fast Behavior

When a provider returns `invalid_api_key`:
1. Provider is added to `invalid_keys` set
2. Provider is **skipped** for all subsequent requests
3. No retry loops wasting time on bad keys

**Example:** If Finnhub key is invalid at startup:
```
PROVIDER_FAIL Finnhub reason=invalid_api_key message=401 Invalid API key
```

Then during requests:
```
[5f95c2ee] Skipping Finnhub (invalid key)
```

## Caching

Successful responses are cached with TTL:

```python
CachePolicy.SHORT  = 6 hours   # Volatile data (quotes)
CachePolicy.MEDIUM = 12 hours  # Financials
CachePolicy.LONG   = 24 hours  # Company info
```

Cache key: `{ticker}:{endpoint}` (e.g., `AAPL:profile`)

## Request Flow

### Successful Request

```
[5f95c2ee] Fetching profile for AAPL
[5f95c2ee] Finnhub success: endpoint=profile ticker=AAPL status=200 ms=245
Provider: Finnhub, Cache hit: false, Time: 245ms
```

### Rate Limited with Backoff

```
[7a2b3c4d] Fetching profile for MSFT
[7a2b3c4d] Finnhub failed: error=rate_limited message=429 Rate limit time=120ms
[7a2b3c4d] Backoff attempt 1: waiting 100ms
[7a2b3c4d] Finnhub success: endpoint=profile ticker=MSFT status=200 ms=380
```

### All Providers Failed

```
[9e8f7g6h] Fetching profile for TSLA
[9e8f7g6h] Skipping Finnhub (invalid key)
[9e8f7g6h] FMP failed: error=timeout message=Timeout after 6s time=6000ms
[9e8f7g6h] AlphaVantage failed: error=rate_limited message=Rate limited after retries time=1200ms
Error: All providers failed for TSLA. Attempted: FMP, AlphaVantage. Likely invalid key or rate limit.
```

## Frontend Error Responses

### Provider Unavailable

```json
{
  "error": "data_provider_unavailable",
  "provider_attempts": ["Finnhub", "FMP", "AlphaVantage"],
  "message": "All providers failed for AAPL. Likely invalid key or rate limit. Check keys on server.",
  "error_type": "provider_unavailable"
}
```

**Note:** Actual API keys are **never exposed** to the frontend.

## Debugging

### 1. Check Environment Variables

```bash
# In Python
import os
print({k: v[:4]+'...' for k, v in os.environ.items() if 'KEY' in k or 'TOKEN' in k})
```

### 2. Test Provider Directly

**Finnhub:**
```bash
curl -i "https://finnhub.io/api/v1/stock/profile2?symbol=AAPL&token=$FINNHUB_API_KEY"
```

**FMP:**
```bash
curl -i "https://financialmodelingprep.com/api/v3/profile/AAPL?apikey=$FMP_API_KEY"
```

**Alpha Vantage:**
```bash
curl -i "https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=AAPL&apikey=$ALPHAVANTAGE_API_KEY"
```

### 3. Run Health Check Script

```bash
python test_provider_health.py
```

### 4. Check Application Logs

Look for structured log lines:

```
PROVIDER_OK Finnhub as_of=2025-10-09 response_time=245ms
[trace_id] provider success: endpoint=profile ticker=AAPL status=200 ms=245
[trace_id] provider failed: error=invalid_api_key message=401 Invalid API key time=120ms
```

## Common Issues

### Issue: "401 Invalid API key" immediately

**Cause:** Wrong parameter name or invalid key

**Fix:**
1. Verify key is correct in provider dashboard
2. Check parameter name matches provider requirements (see table above)
3. Regenerate key if needed

### Issue: "429 Rate limited" repeatedly

**Cause:** Exceeded provider's rate limit

**Fix:**
1. Wait for rate limit window to reset
2. Check provider's rate limit policy:
   - Finnhub Free: 60 calls/minute
   - FMP Free: 250 calls/day
   - Alpha Vantage Free: 5 calls/minute
3. Upgrade to paid tier or add more providers

### Issue: "All providers failed"

**Cause:** All providers down/rate limited/invalid keys

**Fix:**
1. Run `python test_provider_health.py`
2. Check startup logs for preflight results
3. Verify at least one provider is `PROVIDER_OK`
4. Test providers directly with curl commands

### Issue: Wrong parameter name (e.g., `apikey` for Finnhub)

**Symptom:**
```
PROVIDER_FAIL Finnhub reason=invalid_api_key message=401 Invalid API key
```

**Fix:** Update `ENDPOINTS` config in `data_fetcher.py` with correct `param_name`.

## Timeouts

- **Per-request timeout:** 6 seconds
- **Provider chain budget:** 20 seconds total
- **Health check timeout:** 2 seconds

If a request exceeds 20 seconds across all providers, it fails with timeout error.

## Observability

### Structured Logs

All log lines include:
- `trace_id`: Unique identifier for request (8 chars)
- `provider`: Provider name
- `endpoint`: Endpoint being accessed
- `status`: HTTP status code
- `ms`: Response time in milliseconds

**Example:**
```
[5f95c2ee] Finnhub success: endpoint=profile ticker=AAPL status=200 ms=245
[5f95c2ee] FMP failed: error=rate_limited message=429 Rate limit time=120ms
```

### Health Check Endpoint

`GET /healthz` includes provider status:

```json
{
  "status": "ok",
  "timestamp": "2025-10-09T10:50:05.123Z",
  "version": "1.0.0",
  "providers": {
    "Finnhub": {
      "status": "up",
      "last_check": "2025-10-09T10:45:32.123Z",
      "response_time_ms": 245
    },
    "FMP": {
      "status": "down",
      "last_check": "2025-10-09T10:45:33.456Z",
      "response_time_ms": 120
    }
  }
}
```

## Security

### API Key Protection

- Keys are **never logged** in full
- Keys are **never sent to frontend**
- Error messages **never include** key values
- Logs mask keys: `FINN...` or `***`

### Error Messages

Frontend receives **sanitized errors**:
- ✅ "All providers failed. Likely invalid key or rate limit."
- ❌ "Finnhub API key abc123xyz is invalid"

## Performance

### Caching Impact

With 24-hour cache for company profiles:
- **First request:** 245ms (API call)
- **Cached requests:** <1ms (memory lookup)
- **Cache hit rate:** ~90% for common tickers

### Fail-Fast Impact

Invalid key detection:
- **Without fail-fast:** 6s timeout × 3 providers = 18s wasted
- **With fail-fast:** 0ms (skip immediately)

## Deployment Checklist

- [ ] Set all API keys in environment
- [ ] Verify parameter names match providers
- [ ] Test keys with curl commands
- [ ] Run `python test_provider_health.py`
- [ ] Check startup logs for `PROVIDER_OK` messages
- [ ] Test `/healthz` endpoint
- [ ] Test `/models/generate` with real ticker
- [ ] Verify error messages don't leak keys

## Support

If you see environment variable typos:
1. Check `.env` or hosting platform config
2. Restart application after changing keys
3. Keys are read at startup, not hot-reloaded

