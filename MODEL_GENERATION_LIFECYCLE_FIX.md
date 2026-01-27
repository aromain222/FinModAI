# Model Generation Lifecycle Fix - Complete

## Problem
The app was showing `{ "error": "Model not found" }` during model generation because:
- ModelId was generated client-side (via `randomUUID()` in API) before database insert
- Frontend could try to fetch/navigate before DB insert completed
- No separation between "create" and "generate" steps

## Solution
Implemented strict separation: **modelId must come ONLY from database insert**

## Files Changed

### 1. **`app/api/models/create/route.ts`** (NEW)
- Creates model record in database FIRST
- Returns `{ modelId }` from database
- Sets status to 'running' during generation

### 2. **`app/api/generateModel/route.ts`**
- **Removed**: `randomUUID()` import and client-side modelId generation
- **Added**: Requires `modelId` in request body (from create step)
- **Added**: Verifies model exists in database before generating
- **Changed**: Updates existing model record instead of inserting
- **Changed**: Response always includes `modelId` (no fallback)

### 3. **`app/(app)/models/create/page.tsx`**
- **Changed**: Generation flow now follows strict sequence:
  1. POST `/api/models/create` → get `modelId`
  2. POST `/api/generateModel` with `modelId`
  3. Navigate to `/models/${modelId}` only after success
- **Removed**: Fallback `local-${Date.now()}` modelId generation
- **Added**: Logging: `console.log("Create returned modelId:", modelId)`

### 4. **`app/api/models/[modelId]/route.ts`**
- **Changed**: Uses `.maybeSingle()` instead of `.single()` for graceful 404
- **Changed**: Column name from `type` to `model_type`
- **Added**: Better error logging for debugging

### 5. **`app/(app)/models/[modelId]/page.tsx`** (Already fixed)
- Guards prevent fetch with undefined/empty modelId
- Handles 404 gracefully with redirect to `/app`
- Clears stale localStorage keys

## Old vs New Flow

### ❌ OLD FLOW (BROKEN)
```
Client → POST /api/generateModel
  → API generates modelId with randomUUID()
  → API builds workbook
  → API uploads to R2
  → API inserts into DB
  → Returns modelId
  → Client might navigate before insert completes
  → "Model not found" error
```

### ✅ NEW FLOW (FIXED)
```
Client → POST /api/models/create
  → DB inserts model record
  → Returns { modelId } from database
  → Client receives modelId
  
Client → POST /api/generateModel (with modelId)
  → API verifies model exists in DB
  → API builds workbook
  → API uploads to R2
  → API updates model record
  → Returns success
  
Client → router.push(`/models/${modelId}`)
  → Navigation only after both steps succeed
```

## Final Generate Handler Code

```typescript
// STEP 1: Create model record in database FIRST
const createResponse = await fetch('/api/models/create', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    ticker: trimmedTicker,
    modelType,
  }),
});

if (!createResponse.ok) {
  const errorData = await createResponse.json().catch(() => ({}));
  throw new Error(errorData.error || 'Failed to create model record');
}

const createData = await createResponse.json();
const modelId = createData.modelId;

if (!modelId || typeof modelId !== 'string') {
  throw new Error('Invalid model ID returned from create endpoint');
}

console.log('[handleSubmit] Create returned modelId:', modelId);

// STEP 2: Generate model data using the modelId from database
const generateResponse = await fetch('/api/generateModel', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
  body: JSON.stringify({
    ...requestBody,
    modelId, // Pass modelId from create step
  }),
});

if (!generateResponse.ok) {
  const errorData = await generateResponse.json().catch(() => ({}));
  throw new Error(errorData.error || 'Failed to generate model');
}

const generateData = await generateResponse.json();

// STEP 3: Navigate to model detail page ONLY after successful generation
if (modelId) {
  console.log('[handleSubmit] Navigation to model:', modelId);
  router.push(`/models/${modelId}`);
}
```

## Backend Hardening

### `/api/generateModel` - Model Verification
```typescript
// CRITICAL: Verify model exists in database before generating
modelId = body.modelId;
const { data: existingModel, error: fetchError } = await supabase
  .from('models')
  .select('id, user_id, ticker, model_type')
  .eq('id', modelId)
  .maybeSingle();

if (!existingModel) {
  console.log('[generateModel] Model not found:', modelId);
  return NextResponse.json(
    { error: 'Model not found. The model record does not exist in the database.' },
    { status: 404 }
  );
}
```

### `/api/models/[modelId]` - Graceful 404
```typescript
// Fetch model using maybeSingle() to handle not found gracefully
const { data: model, error: modelError } = await supabase
  .from('models')
  .select('id, ticker, model_type, status, notes, created_at, file_name, user_id')
  .eq('id', modelId)
  .maybeSingle();

if (!model) {
  // Model truly does not exist - return clean 404
  console.log('[GET /api/models/[modelId]] Model not found:', modelId);
  return NextResponse.json(
    { error: 'Model not found' },
    { status: 404 }
  );
}
```

## Verification Checklist

✅ **ModelId comes only from database**
- No `randomUUID()` calls in client code
- No `local-${Date.now()}` fallbacks
- No client-side modelId generation

✅ **Strict generation sequence**
- Create → Generate → Navigate (in order)
- No navigation before create completes
- No fetch before modelId exists

✅ **Backend validation**
- `/api/generateModel` requires modelId
- `/api/generateModel` verifies model exists
- `/api/models/[modelId]` uses `.maybeSingle()`
- All endpoints return clean 404 when model missing

✅ **Guards prevent early fetches**
- Model detail page checks modelId before fetch
- Redirects to `/app` if modelId invalid
- Clears stale localStorage on 404

✅ **Network request order**
- `POST /api/models/create` → 200 with `{ modelId }`
- `POST /api/generateModel` → 200 with model data
- `GET /api/models/${modelId}` → 200 with model details
- Navigation only after all succeed

## Confirmation

**"Model not found" no longer appears during generation** because:
1. ModelId is created in DB first (via `/api/models/create`)
2. ModelId is verified before generation starts
3. Navigation only happens after successful generation
4. All endpoints properly handle missing models with 404

The generation flow is now **race-condition free** and **database-first**.







