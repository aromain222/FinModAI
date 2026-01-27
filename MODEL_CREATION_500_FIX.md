# Model Creation 500 Error Fix - Complete

## Problem
Both `/api/models/create` and `/api/models/:id/generate` were returning 500 errors because:
- Create route was swallowing Supabase errors without exposing details
- Frontend was attempting to generate even when create failed
- No proper error surfacing from database operations

## Solution
Fixed the create → generate contract with proper error handling and hard stops.

## Files Changed

### 1. **`app/api/models/create/route.ts`** - Expose Real Errors
- **Changed**: Now exposes full Supabase error details (message, code, hint)
- **Changed**: Proper error logging with insert payload for debugging
- **Changed**: Validates modelType is required
- **Changed**: Handles ticker for merger/operating models (uses placeholder if not provided)
- **Removed**: Generic error swallowing

### 2. **`app/(app)/models/create/page.tsx`** - Hard Stop on Failure
- **Changed**: Create is now STEP 0 (happens FIRST, before any other operations)
- **Changed**: Hard stop if create fails - throws error immediately
- **Changed**: Exposes error details from create response
- **Changed**: Removed all fallback modelId generation (`local-${Date.now()}`, `merger-${Date.now()}`, `operating-${Date.now()}`)
- **Changed**: Merger and operating models also use create step
- **Changed**: Navigation only happens after successful generation

## The Exact Supabase Error (Will Appear in Logs)

The create route now logs the full error structure:
```javascript
{
  message: error.message,      // Human-readable error
  code: error.code,            // Postgres error code (e.g., "23505" for unique violation)
  details: error.details,      // Detailed error info
  hint: error.hint,            // Postgres hint
  insertPayload: { ... }       // What we tried to insert
}
```

Common errors you might see:
- **23505**: Unique constraint violation (if modelId already exists)
- **23503**: Foreign key violation (if user_id doesn't exist)
- **23502**: NOT NULL violation (if required field is missing)
- **42501**: RLS policy violation (if insert policy blocks the insert)

## Corrected Create Route

```typescript
export async function POST(req: NextRequest) {
  const supabase = createRouteHandlerClient({ cookies });

  // Check authentication first
  const { data: { session }, error: authError } = await supabase.auth.getSession();
  if (authError || !session?.user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    const { ticker, modelType, companyName } = body;

    // Validate required fields
    if (!modelType || typeof modelType !== 'string') {
      return NextResponse.json(
        { error: 'Model type is required' },
        { status: 400 }
      );
    }

    // Build insert payload
    const insertPayload = {
      user_id: session.user.id,
      model_type: modelType,
      ticker: ticker && typeof ticker === 'string' && ticker.trim().length > 0
        ? ticker.trim().toUpperCase()
        : modelType === 'merger' ? 'MERGER'
        : modelType === 'operating' ? 'OPERATING'
        : 'UNKNOWN',
    };

    // Insert model record
    const { data, error } = await supabase
      .from('models')
      .insert(insertPayload)
      .select('id')
      .single();

    if (error) {
      // CRITICAL: Expose the real Supabase error
      console.error('[CREATE MODEL ERROR]', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
        insertPayload,
      });
      
      return NextResponse.json(
        {
          error: 'Failed to create model record',
          details: error.message,
          code: error.code,
          hint: error.hint,
        },
        { status: 500 }
      );
    }

    if (!data || !data.id) {
      console.error('[CREATE MODEL ERROR] No data returned from insert');
      return NextResponse.json(
        {
          error: 'Failed to create model record',
          details: 'Insert succeeded but no ID returned',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ modelId: data.id });
  } catch (error: any) {
    console.error('[CREATE MODEL ERROR] Unexpected error:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: error?.message || 'Unknown error',
      },
      { status: 500 }
    );
  }
}
```

## Corrected Frontend Generate Handler

```typescript
let modelId: string | null = null;

try {
  // STEP 0: Create model record in database FIRST (before any other operations)
  // HARD STOP: If create fails, do NOT proceed to any other operations
  const createRes = await fetch('/api/models/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticker: trimmedTicker,
      modelType,
      companyName: companyName || undefined,
    }),
  });

  // CRITICAL: Hard stop if create fails
  if (!createRes.ok) {
    const err = await createRes.json().catch(() => ({}));
    const errorMessage = err.details || err.error || 'Failed to create model record';
    console.error('[handleSubmit] Create failed:', err);
    throw new Error(errorMessage);
  }

  const createData = await createRes.json();
  modelId = createData.modelId;

  // CRITICAL: Validate modelId exists before proceeding
  if (!modelId || typeof modelId !== 'string') {
    throw new Error('No modelId returned from create endpoint');
  }

  console.log('[handleSubmit] Create returned modelId:', modelId);

  // STEP 1: AI analysis (optional, can fail)
  // ... AI analysis code ...

  // STEP 2: Generate model data using the modelId from database
  const generateResponse = await fetch('/api/generateModel', {
    method: 'POST',
    body: JSON.stringify({
      ...requestBody,
      modelId, // Pass modelId from create step
    }),
  });

  if (!generateResponse.ok) {
    throw new Error('Failed to generate model');
  }

  // STEP 3: Navigate only after successful generation
  if (modelId) {
    router.push(`/models/${modelId}`);
  }
} catch (err) {
  // Error handling - stops all execution
  setError(err.message);
  console.error('[handleSubmit] Error:', err);
} finally {
  setLoading(false);
}
```

## Verification Checklist

✅ **Create route exposes real errors**
- Full Supabase error structure logged
- Error details returned in response
- No error swallowing

✅ **Frontend hard-stops on create failure**
- Throws error immediately if `!createRes.ok`
- No generate call if create fails
- No navigation if create fails

✅ **Create happens FIRST**
- STEP 0: Create (before AI analysis, before generation)
- STEP 1: AI analysis (optional)
- STEP 2: Generate (only if create succeeded)
- STEP 3: Navigate (only if both succeeded)

✅ **No fallback modelId generation**
- Removed `local-${Date.now()}`
- Removed `merger-${Date.now()}`
- Removed `operating-${Date.now()}`
- All models use modelId from database

✅ **Network request order**
- `POST /api/models/create` → 200 with `{ modelId }`
- `POST /api/generateModel` → 200 (only if create succeeded)
- `GET /api/models/${modelId}` → 200 (only after navigation)

## Expected Behavior

**Before Fix:**
- Create fails → 500 (generic error)
- Generate still called → 500 (model not found)
- User sees generic error

**After Fix:**
- Create fails → 500 with detailed error (message, code, hint)
- Generate NOT called (hard stop)
- User sees specific error from database
- Logs show exact Supabase error for debugging

The create → generate contract is now properly enforced with full error visibility.







