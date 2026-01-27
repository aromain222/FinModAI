# Model Flow Rebuild Plan

## Problem Identified

**Root Cause:** The `/models/create/page.tsx` renders a preview inline (the "good" one), then navigates to `/models/[modelId]` which shows a different preview, causing the "swap" effect.

### Current Flow (BROKEN):
1. User clicks "Generate Model" on `/models/create`
2. API call to `/api/generateModel` or `/api/models/create` returns `{ modelId, status }`
3. `/models/create` renders inline preview using `ModelResultsShell` + `PreviewForModelType` ✅ (good UI)
4. After ~4 seconds, `router.push(`/models/${modelId}`)` is called
5. `/models/[modelId]` loads and renders a DIFFERENT preview ❌ (blank/buggy UI)

---

## Solution: Single Canonical Preview Route

### New Flow (FIXED):
1. User clicks "Generate Model" on `/models/create`
2. API call returns `{ modelId, status: 'generating' }`
3. **Immediately** navigate to `/models/[modelId]` (no inline preview)
4. `/models/[modelId]` handles ALL states:
   - `generating`: Show progress spinner + "Model generating..."
   - `ready`: Show full preview UI (the "dope" one)
   - `failed`: Show error card with retry button
   - `missing_inputs`: Show input prompts (e.g., shares outstanding)

---

## Implementation Steps

### PHASE 1: Strip `/models/create/page.tsx`

**Remove:**
- All preview rendering logic (`ModelResultsShell`, `PreviewForModelType`, `TearSheetRenderer`)
- `generatedModel` state that holds preview data
- Any inline display of model results

**Keep:**
- Form inputs (ticker, model type, assumptions)
- "Generate Model" button
- API call to create/generate model
- **Immediate** navigation to `/models/[modelId]` after API returns `modelId`

**New behavior:**
```typescript
const handleSubmit = async () => {
  // 1. Create model in database
  const { modelId } = await fetch('/api/models/create', { ... });
  
  // 2. Navigate IMMEDIATELY (don't wait for generation)
  router.push(`/models/${modelId}`);
  
  // 3. Generation happens in background, /models/[modelId] polls for status
};
```

---

### PHASE 2: Rebuild `/models/[modelId]/page.tsx`

This becomes the **ONLY** place where model previews are rendered.

#### State Machine:

```typescript
type ModelStatus = 'created' | 'generating' | 'ready' | 'failed' | 'missing_inputs';

switch (model.status) {
  case 'created':
  case 'generating':
    return <GeneratingState model={model} />;
  
  case 'ready':
    return <SuccessState model={model} />;
  
  case 'failed':
    return <ErrorState model={model} />;
  
  case 'missing_inputs':
    return <MissingInputsState model={model} />;
}
```

#### Polling Logic:
- Poll every 2s while `status === 'generating' || status === 'created'`
- Stop polling when `status === 'ready' || status === 'failed'`
- **Never navigate away** - always stay on `/models/[modelId]`

#### UI Sections (Success State):

```
┌─────────────────────────────────────────────────────────────┐
│ Header                                                       │
│ AAPL — DCF Model                                            │
│ Generated Dec 27, 2024 • Success • [Download Excel]        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Preview (PreviewForModelType)                               │
│ - Valuation cards (EV, Equity, Price/Share)                │
│ - Valuation bridge                                          │
│ - Key assumptions                                           │
│ - Charts/graphs                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Assumptions (collapsible)                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ Diagnostics (collapsible)                                   │
└─────────────────────────────────────────────────────────────┘
```

---

### PHASE 3: Fix Shares Outstanding Handling

#### Backend (`/api/generateModel/route.ts`):

**Current (BROKEN):**
```typescript
if (!sharesOutstanding || sharesOutstanding <= 0) {
  throw new Error('MISSING_INPUTS: sharesOutstanding');
}
```

**New (FIXED):**
```typescript
if (!sharesOutstanding || sharesOutstanding <= 0) {
  return NextResponse.json({
    status: 'missing_inputs',
    modelId,
    missingInputs: ['sharesOutstanding'],
    message: 'Shares outstanding is required for per-share valuation',
    partialResults: {
      enterpriseValue: ev,
      // ... other EV-level outputs
    }
  }, { status: 200 }); // Not a 500 error!
}
```

#### Frontend (`/models/[modelId]/page.tsx`):

**Missing Inputs State:**
```tsx
<Card>
  <CardHeader>
    <h2>Missing Required Inputs</h2>
  </CardHeader>
  <CardContent>
    <p>We need the following to complete the valuation:</p>
    
    <div className="space-y-4">
      <div>
        <Label>Shares Outstanding (millions)</Label>
        <Input 
          type="number" 
          value={sharesInput}
          onChange={(e) => setSharesInput(e.target.value)}
        />
      </div>
      
      <div className="flex gap-2">
        <Button onClick={handleRetryWithInput}>
          Complete Valuation
        </Button>
        <Button variant="outline" onClick={handleAutoFetch}>
          Try Auto-Fetch Again
        </Button>
      </div>
    </div>
    
    {partialResults && (
      <div className="mt-6">
        <h3>Partial Results Available</h3>
        <p>Enterprise Value: {partialResults.enterpriseValue}</p>
      </div>
    )}
  </CardContent>
</Card>
```

---

### PHASE 4: Delete Duplicate Routes

**Files to Delete:**
- `/app/(app)/models/new/page.tsx` (duplicate create page)
- `/app/(app)/models/assumptions/page.tsx` (if unused)
- `/app/(app)/models/scenario/page.tsx` (if unused)

**Files to Keep:**
- `/app/(app)/models/page.tsx` (models list)
- `/app/(app)/models/create/page.tsx` (stripped down form only)
- `/app/(app)/models/[modelId]/page.tsx` (canonical preview)

---

## Files to Modify

### 1. `/app/(app)/models/create/page.tsx`
- Remove all preview rendering
- Remove `generatedModel` state
- Navigate immediately after `modelId` is returned
- Show loading spinner while API call is in progress

### 2. `/app/(app)/models/[modelId]/page.tsx`
- Rebuild from scratch
- Handle all 4 states: generating, ready, failed, missing_inputs
- Poll for status updates
- Render `PreviewForModelType` only in success state
- Never navigate away

### 3. `/app/api/generateModel/route.ts`
- Change shares outstanding validation from hard error to `missing_inputs` response
- Return partial results when possible
- Include `missingInputs: string[]` array in response

### 4. `/app/api/models/[modelId]/route.ts` (GET)
- Ensure it returns consistent status field
- Include `missingInputs` array if applicable

---

## Expected Behavior After Fix

### Happy Path:
1. User fills form on `/models/create`
2. Clicks "Generate Model"
3. **Immediately** navigates to `/models/[modelId]`
4. Sees "Model Generating..." spinner
5. After 5-10s, preview appears (the "dope" one)
6. **No screen swap, no blank screen**

### Missing Shares Outstanding:
1. User fills form, clicks "Generate Model"
2. Navigates to `/models/[modelId]`
3. Sees "Missing Required Inputs" card
4. Enters shares outstanding
5. Clicks "Complete Valuation"
6. Preview appears with full results

### Error Case:
1. User fills form, clicks "Generate Model"
2. Navigates to `/models/[modelId]`
3. Sees "Model Generation Failed" card with error message
4. Can click "Create New Model" to try again

---

## Testing Checklist

- [ ] Generate DCF model → lands on `/models/[modelId]` → shows generating → shows preview → **no swap**
- [ ] Generate LBO model → same flow → **no swap**
- [ ] Generate model with missing shares → shows input prompt → complete → shows preview
- [ ] Generate model that fails → shows error card → can retry
- [ ] Refresh `/models/[modelId]` while generating → still shows generating state
- [ ] Refresh `/models/[modelId]` after ready → shows preview immediately
- [ ] Download Excel button works from preview
- [ ] No console errors
- [ ] No blank screens

---

## Summary

**Root Cause:** Inline preview on `/models/create` + navigation to `/models/[modelId]` = screen swap

**Fix:** Remove inline preview, make `/models/[modelId]` the single source of truth for all model states

**Key Principle:** Navigate early, render late. The preview route handles all states, not the create page.

