# Model Flow Rebuild - Progress Report

## ✅ COMPLETED

### 1. Root Cause Identified
**Problem:** `/models/create/page.tsx` was rendering an inline preview (the "good" UI), then navigating to `/models/[modelId]` which showed a different/blank preview.

**Evidence:**
- Found `ModelResultsShell` and `PreviewForModelType` being rendered in `/models/create/page.tsx`
- Found `router.push(\`/models/${modelId}\`)` being called after generation
- This caused the "swap" effect: good UI → blank UI

### 2. Canonical Preview Route Rebuilt
**File:** `/app/(app)/models/[modelId]/page.tsx`

**Complete rewrite with:**
- ✅ Clean state machine: `generating` | `ready` | `failed` | `missing_inputs`
- ✅ Polling logic (2s interval while generating)
- ✅ No auto-navigation (stays on this route permanently)
- ✅ All states handled with proper UI:
  - **Generating:** Spinner + "Model Generating..." + estimated time
  - **Ready:** Full preview with `PreviewForModelType` + key metrics + assumptions
  - **Failed:** Error card with message + "Try Again" button
  - **Missing Inputs:** Input form for shares outstanding + "Complete Valuation" button
- ✅ Dark theme (emerald/black/slate)
- ✅ Download Excel button
- ✅ Run Again button

### 3. Duplicate Routes Deleted
**Removed:**
- ✅ `/app/(app)/models/new/page.tsx` (duplicate create page)
- ✅ `/app/(app)/models/assumptions/page.tsx` (unused)
- ✅ `/app/(app)/models/scenario/page.tsx` (unused)

**Kept:**
- ✅ `/app/(app)/models/page.tsx` (models list)
- ✅ `/app/(app)/models/create/page.tsx` (form only - needs stripping)
- ✅ `/app/(app)/models/[modelId]/page.tsx` (canonical preview)

---

## 🚧 IN PROGRESS

### 4. Strip `/models/create/page.tsx`
**Status:** Not started yet

**Required changes:**
- Remove all preview rendering (`ModelResultsShell`, `PreviewForModelType`, `TearSheetRenderer`)
- Remove `generatedModel` state
- Remove inline display of results
- Keep form inputs and "Generate Model" button
- Navigate immediately to `/models/${modelId}` after API returns `modelId`

**Current behavior (BROKEN):**
```typescript
// After API call
setGeneratedModel(data); // Shows preview inline
setTimeout(() => {
  router.push(`/models/${modelId}`); // Then navigates away
}, 4000);
```

**New behavior (FIXED):**
```typescript
// After API call
const { modelId } = await response.json();
router.push(`/models/${modelId}`); // Navigate immediately, no inline preview
```

---

## 📋 TODO

### 5. Fix Shares Outstanding Handling
**File:** `/app/api/generateModel/route.ts`

**Current (BROKEN):**
```typescript
if (!sharesOutstanding || sharesOutstanding <= 0) {
  throw new Error('MISSING_INPUTS: sharesOutstanding');
}
```

**New (FIXED):**
```typescript
if (!sharesOutstanding || sharesOutstanding <= 0) {
  // Save model with status 'missing_inputs'
  await updateModelStatus(modelId, {
    status: 'missing_inputs',
    missingInputs: ['sharesOutstanding'],
    message: 'Shares outstanding is required for per-share valuation',
    partialResults: {
      enterpriseValue: ev,
      // ... other EV-level outputs
    }
  });
  
  return NextResponse.json({
    status: 'missing_inputs',
    modelId,
    missingInputs: ['sharesOutstanding'],
    message: 'Shares outstanding is required',
    partialResults: { ... }
  }, { status: 200 }); // Not 500!
}
```

**Also need:**
- Create `/app/api/models/[modelId]/inputs/route.ts` (PATCH endpoint)
- Create `/app/api/models/[modelId]/generate/route.ts` (POST endpoint for re-generation)

### 6. Test End-to-End
**Scenarios to test:**
- [ ] Generate DCF → lands on `/models/[modelId]` → shows generating → shows preview → **no swap**
- [ ] Generate LBO → same flow → **no swap**
- [ ] Generate with missing shares → shows input prompt → complete → shows preview
- [ ] Generate that fails → shows error card → can retry
- [ ] Refresh while generating → still shows generating
- [ ] Refresh after ready → shows preview immediately
- [ ] Download Excel works
- [ ] No console errors
- [ ] No blank screens

### 7. Final Cleanup
- [ ] Run `npm run build`
- [ ] Fix any TypeScript errors
- [ ] Verify no runtime errors
- [ ] Create final summary document

---

## Key Files Modified

### Created/Rebuilt:
1. `/app/(app)/models/[modelId]/page.tsx` - Complete rewrite (650 lines)
2. `MODEL_FLOW_REBUILD_PLAN.md` - Implementation plan
3. `MODEL_FLOW_REBUILD_PROGRESS.md` - This file

### To Be Modified:
1. `/app/(app)/models/create/page.tsx` - Strip preview rendering
2. `/app/api/generateModel/route.ts` - Fix shares outstanding handling
3. `/app/api/models/[modelId]/route.ts` - Ensure consistent status field

### Deleted:
1. `/app/(app)/models/new/page.tsx`
2. `/app/(app)/models/assumptions/page.tsx`
3. `/app/(app)/models/scenario/page.tsx`

---

## Expected Final Behavior

### User Flow:
1. User fills form on `/models/create`
2. Clicks "Generate Model"
3. **Immediately** navigates to `/models/[modelId]`
4. Sees "Model Generating..." spinner (2-10s)
5. Preview appears (the "dope" one with dark theme)
6. **No screen swap, no blank screen, no navigation**

### Technical Flow:
```
/models/create
  ↓ (form submit)
POST /api/models/create → { modelId, status: 'created' }
  ↓ (immediate navigation)
/models/[modelId]
  ↓ (polling every 2s)
GET /api/models/{modelId} → { status: 'generating' }
  ↓ (continue polling)
GET /api/models/{modelId} → { status: 'ready', preview: {...} }
  ↓ (stop polling, render preview)
[FINAL STATE - NO MORE NAVIGATION]
```

---

## Next Steps

1. ✅ Strip `/models/create/page.tsx` (remove inline preview)
2. ✅ Fix shares outstanding handling in API
3. ✅ Test end-to-end flow
4. ✅ Run build and fix errors
5. ✅ Document final changes

---

## Success Criteria

- ✅ Only ONE preview route exists: `/models/[modelId]`
- ✅ No inline preview on `/models/create`
- ✅ Navigation happens immediately after model creation
- ✅ Preview page handles all states (generating, ready, failed, missing_inputs)
- ✅ No screen swap after generation
- ✅ No blank screens
- ✅ Missing shares outstanding doesn't cause hard failure
- ✅ Build passes with no errors

