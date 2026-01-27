# Demo Mode Setup Instructions

## Quick Start

To enable demo mode with fixtures, set these environment variables:

```bash
export DEMO_MODE=1
export DEMO_BYPASS_AUTH=1
```

Or add to your `.env.local` file:

```env
DEMO_MODE=1
DEMO_BYPASS_AUTH=1
```

## What Demo Mode Does

When `DEMO_MODE=1` is set:

1. **Macro Summary** (`/api/macro/summary`):
   - Uses demo fixture data for CPI, unemployment, and Fed funds
   - Shows realistic values instead of "n/a"

2. **Macro Headlines** (`/api/macro/news`):
   - Uses demo fixture headlines if Webz.io unavailable
   - Shows 12 realistic macro news items

3. **Macro Events** (`/api/macro/events`):
   - Uses demo fixture events if providers unavailable
   - Shows 8 realistic macro events with impact ratings

4. **Market Headlines** (`/api/market/headlines`):
   - Uses demo fixture headlines if Webz.io unavailable
   - Shows 10 realistic market news items

5. **Auth Bypass** (`DEMO_BYPASS_AUTH=1`):
   - Allows accessing models/download without Supabase session
   - Uses demo user ID: `00000000-0000-0000-0000-000000000000`

## Verify It's Working

1. Set the environment variables
2. Restart your dev server: `npm run dev`
3. Check the Demo Health indicator (top-right of app)
4. Visit Macro IQ page - should show:
   - CPI: 3.2% (not "n/a")
   - Unemployment: 3.7% (not "n/a")
   - Fed Funds: 5.25% (not "n/a")
   - Headlines should appear (not "No headlines available")

5. Visit Market Intelligence page - should show:
   - Market headlines appear (not "No market headlines available")

## Troubleshooting

If fixtures aren't loading:

1. Check environment variable is set:
   ```bash
   echo $DEMO_MODE
   # Should output: 1
   ```

2. Check fixture files exist:
   ```bash
   ls -la demo/fixtures/
   # Should show: macro-headlines.json, macro-events.json, macro-summary.json, market-headlines.json
   ```

3. Check server logs for errors:
   ```bash
   # Look for: [demo:fixtures] messages
   ```

4. Restart the dev server after changing env vars

## Demo Fixture Files

All fixtures are in `/demo/fixtures/`:
- `macro-headlines.json` - Macro news headlines
- `macro-events.json` - Macro events with impact ratings
- `macro-summary.json` - CPI, unemployment, Fed funds data
- `market-headlines.json` - Market/stock news headlines

These files are JSON and can be edited if needed for demo purposes.

