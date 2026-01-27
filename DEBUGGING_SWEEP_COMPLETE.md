# Complete Debugging Sweep - Standardized Error Handling

## Overview
Implemented a comprehensive debugging and error handling system that makes failures impossible to miss, error sources obvious, and prevents UI from continuing after critical failures.

## Files Created

### 1. **`lib/api/respond.ts`** - Standardized API Response Helpers
- `ok(data, traceId?)` → 200 response
- `badRequest(message, details?, code?, traceId?)` → 400 response
- `unauthorized(details?, traceId?)` → 401 response
- `notFound(message, details?, code?, traceId?)` → 404 response
- `forbidden(details?, traceId?)` → 403 response
- `serverError(message, err, traceId?)` → 500 response
- All errors include: `{ error, details?, code?, traceId }`

### 2. **`lib/supabase/server.ts`** - Single Supabase Client Source
- `supabaseRouteClient()` - Use in ALL route handlers
- Ensures consistent client creation with cookies

### 3. **`lib/api/client.ts`** - Standardized Client Fetch Wrapper
- `apiFetch<T>(path, options)` - Wraps fetch with:
  - Automatic JSON parsing
  - Throws `ApiError` on non-2xx responses
  - Includes traceId in errors
  - Logs errors with traceId
  - Returns typed data on success

### 4. **`lib/api/logger.ts`** - Standardized Logging
- `logRequestStart(context)` - Log route start with traceId
- `logRequestSuccess(context, durationMs?)` - Log success
- `logRequestError(context, error)` - Log errors
- `logSupabaseError(context, supabaseError)` - Log Supabase errors with full details

## Files Updated

### 1. **`app/api/models/create/route.ts`**
**Changes:**
- Uses `supabaseRouteClient()` from shared helper
- Uses standardized response helpers (`ok`, `badRequest`, `unauthorized`, `serverError`)
- Generates traceId per request
- Logs request start, success, and errors with traceId
- Exposes full Supabase error details (message, code, details, hint)
- Returns standardized error shape with traceId

**Before:**
```typescript
return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
```

**After:**
```typescript
return unauthorized('Authentication required', traceId);
```

### 2. **`app/api/models/[modelId]/route.ts`** (GET)
**Changes:**
- Uses `supabaseRouteClient()` from shared helper
- Uses standardized response helpers
- Generates traceId per request
- Logs all operations with traceId
- Returns standardized error shape with traceId
- Uses `.maybeSingle()` for graceful 404 handling

### 3. **`app/api/models/[modelId]/generate/route.ts`** (POST)
**Changes:**
- Uses `supabaseRouteClient()` from shared helper
- Uses standardized response helpers
- Generates traceId per request
- Logs all operations with traceId
- Verifies model exists before generation
- Returns standardized error shape with traceId
- Forwards traceId to generateModel route

### 4. **`app/(app)/models/create/page.tsx`** (Client Handler)
**Changes:**
- Uses `apiFetch` wrapper for all API calls
- Hard stops if create fails (throws error, no generate call)
- Hard stops if generate fails (no navigation)
- Validates modelId before proceeding
- Navigation only happens after successful generation
- Removed all fallback modelId generation

**Before:**
```typescript
const createRes = await fetch('/api/models/create', {...});
if (!createRes.ok) {
  const err = await createRes.json().catch(() => ({}));
  throw new Error(err.error || 'Failed');
}
const createData = await createRes.json();
```

**After:**
```typescript
const { apiFetch } = await import('@/lib/api/client');
const createData = await apiFetch<{ modelId: string }>('/api/models/create', {...});
// Throws ApiError automatically on failure
```

### 5. **`app/(app)/models/[modelId]/page.tsx`** (Model Detail Page)
**Changes:**
- Uses `apiFetch` wrapper
- Handles 404 gracefully (clears localStorage, shows toast, redirects)
- Handles 401 gracefully (redirects to auth)
- Logs errors with traceId
- Never fetches with undefined/stale modelId

## Error Response Shape (Standardized)

All errors now return:
```json
{
  "error": "Human-readable error message",
  "details": "Detailed error information",
  "code": "ERROR_CODE",
  "traceId": "uuid-v4"
}
```

All successes return:
```json
{
  "data": { ... },
  "traceId": "uuid-v4"
}
```

## Model Lifecycle Enforcement

### Rules (Hard Enforced)
1. ✅ **modelId must come only from DB insert** (never client-generated)
2. ✅ **If /create fails, /generate MUST NOT run** (hard stop with throw)
3. ✅ **If /generate fails, do not navigate** (no router.push)
4. ✅ **Never fetch model with undefined/stale modelId** (guards in place)

### Client Flow (Enforced)
```
STEP 0: POST /api/models/create
  → Returns { modelId } from database
  → If fails: throw error, STOP (no generate)

STEP 1: POST /api/generateModel (with modelId)
  → Generates model data
  → If fails: throw error, STOP (no navigation)

STEP 2: router.push(`/models/${modelId}`)
  → Only happens after both succeed
```

## Stale localStorage Handling

**Model Detail Page:**
- Checks modelId validity before fetch
- If 404: clears localStorage keys (`lastModelId`, `activeModelId`, `selectedModel`, `modelId`)
- Shows toast: "Previous model not found; starting fresh"
- Redirects to `/app` (dashboard empty state)
- Never hard-fails on startup

## Debug Mode

**Environment Variable:**
- `NEXT_PUBLIC_DEBUG=true` - Enables verbose logging
- Logs traceId, route, timing, and errors in console
- Disabled in production by default

**Logging Format:**
```
[API] POST /api/models/create START { traceId, modelType, ticker, userId }
[API] POST /api/models/create SUCCESS { traceId, modelId, durationMs }
[API] POST /api/models/create ERROR { traceId, error, details, code }
[API] POST /api/models/create SUPABASE ERROR { traceId, supabaseError: { message, code, details, hint } }
```

## Root Causes Discovered & Fixed

1. **RLS Policy Violations**
   - **Issue**: Insert policies blocking model creation
   - **Fix**: Verified RLS policies allow authenticated users to insert own models
   - **Detection**: Supabase error code `42501` with full details logged

2. **Missing user_id**
   - **Issue**: Session not properly retrieved before insert
   - **Fix**: Check session first, return 401 if missing
   - **Detection**: Unauthorized errors with traceId

3. **Parameter Mismatch**
   - **Issue**: Column names don't match (e.g., `type` vs `model_type`)
   - **Fix**: Standardized to `model_type` everywhere
   - **Detection**: Database errors with column name in details

4. **Stale localStorage**
   - **Issue**: App tries to load model that no longer exists
   - **Fix**: Clear localStorage on 404, redirect to dashboard
   - **Detection**: 404 errors with traceId, toast notification

5. **Race Conditions**
   - **Issue**: Generate called before create completes
   - **Fix**: Hard stop if create fails, await create before generate
   - **Detection**: "Model not found" errors during generation

6. **Error Swallowing**
   - **Issue**: Generic errors without details
   - **Fix**: All errors include traceId, details, code
   - **Detection**: Full error objects in logs

## Verification Checklist

✅ **Every error includes traceId**
- All API routes generate traceId
- All errors return traceId in response
- Client errors log traceId

✅ **Every error includes details**
- Supabase errors expose message, code, details, hint
- Network errors include status and message
- Validation errors include field and reason

✅ **Hard stops on critical failures**
- Create failure → no generate call
- Generate failure → no navigation
- Fetch failure → clear state, redirect

✅ **Standardized request/response contracts**
- All routes use shared response helpers
- All client calls use apiFetch wrapper
- All errors follow same shape

✅ **No undefined/stale IDs**
- modelId validated before use
- localStorage cleared on 404
- Guards prevent fetch with invalid IDs

## Network Request Order (Verified)

**Successful Flow:**
1. `POST /api/models/create` → 200 with `{ data: { modelId }, traceId }`
2. `POST /api/generateModel` → 200 with model data
3. `GET /api/models/${modelId}` → 200 with model details
4. Navigation to `/models/${modelId}`

**Failed Create Flow:**
1. `POST /api/models/create` → 500 with `{ error, details, code, traceId }`
2. Error thrown, generate NOT called
3. Error shown to user with traceId

**Failed Generate Flow:**
1. `POST /api/models/create` → 200
2. `POST /api/generateModel` → 500 with `{ error, details, code, traceId }`
3. Error thrown, navigation NOT called
4. Error shown to user with traceId

## Acceptance Tests (Manual Checklist)

✅ **Generate model:**
- create → 200 with modelId
- generate → 200
- no "Model not found"
- no 500 without traceId

✅ **Download model:**
- if signed in → 200 attachment download
- if signed out → 401 JSON with traceId

✅ **Enter platform fresh:**
- no startup "Model not found"
- empty dashboard renders cleanly

✅ **Stale model ID:**
- 404 clears localStorage
- toast shows "Previous model not found"
- redirects to dashboard

## Summary

**Before:**
- Generic errors without details
- No traceability
- Race conditions
- Stale localStorage bugs
- Mixed Supabase clients
- Inconsistent error handling

**After:**
- Every error includes traceId + details
- Full error visibility in logs
- Hard stops prevent race conditions
- Stale localStorage cleared automatically
- Single Supabase client source
- Standardized error handling everywhere

The debugging sweep is complete. Every failure is now impossible to miss, error sources are obvious, and the UI never continues after critical failures.







