# Logging Configuration

## Overview

Logging is configurable via environment variables so you can control what's logged in production.

## Environment Variables

### `LOG_LEVEL`
Controls what gets logged:
- **`all`** (default): Log everything (info, warn, error, debug)
- **`errors`**: Only log errors and warnings
- **`none`**: Disable all logging (not recommended)

### `DISABLE_DEBUG_ENDPOINT`
Controls the `/api/stocks/debug` endpoint:
- **unset** (default): Debug endpoint enabled
- **`true`**: Debug endpoint disabled

## Default Behavior

**For Stock Move Explainer:**
- All logging is enabled by default (`LOG_LEVEL=all`)
- This includes cache hits/misses, provider info, fetch times, etc.
- You can reduce to errors-only or disable entirely if needed

**For Other APIs:**
- Use `LOG_LEVEL` to control what gets logged
- Errors are always logged unless explicitly disabled

## Example Usage

```bash
# Log everything (default for move explainer)
LOG_LEVEL=all

# Only log errors and warnings
LOG_LEVEL=errors

# Disable all logging (not recommended)
LOG_LEVEL=none

# Disable debug endpoint
DISABLE_DEBUG_ENDPOINT=true
```

## What Gets Logged (when LOG_LEVEL=all)

1. **Cache Operations**:
   - Cache hits/misses
   - Cache keys
   - TTL information

2. **Provider Operations**:
   - Provider names used
   - Fetch times per provider
   - Response sizes
   - Success/failure status

3. **Processing**:
   - Match times
   - Total processing time
   - Move counts

4. **Errors**:
   - Always logged (even if LOG_LEVEL=errors or none)

## Recommendation

Keep `LOG_LEVEL=all` for Stock Move Explainer in production because:
- Helps diagnose cache issues
- Monitors provider health
- Tracks performance metrics
- Essential for debugging production issues

You can reduce logging for other parts of the app by setting `LOG_LEVEL=errors` if needed.

