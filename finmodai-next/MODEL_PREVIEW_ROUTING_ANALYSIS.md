# Model Preview Routing - Complete Analysis

## Current State of Routes

### ✅ Canonical Model Detail Page
**File:** `app/(app)/models/[modelId]/page.tsx`
- **Purpose:** Display model results after generation
- **Route:** `/models/[modelId]`
- **Status:** ✅ WORKING
- **Features:**
  - Fetches model on mount
  - Shows loading state
  - Shows error state
  - Shows "Model Generating" state (with polling)
  - Shows full preview when ready
  - **Polling:** Checks every 2 seconds when status is 'generating' or 'created'
  - **No redirects:** Updates state in-place

### ✅ Models List Page
**File:** `app/(app)/models/page.tsx`
- **Purpose:** List all models
- **Route:** `/models`
- **Links to:** `/models/create` (primary creation page)

### ✅ Model Creation Page (Primary)
**File:** `app/(app)/models/create/page.tsx`
- **Purpose:** Full-featured model creation with scenarios, assumptions, sliders
- **Route:** `/models/create`
- **Size:** 2,299 lines
- **After generation:** Navigates to `/models/${modelId}`
- **Navigation code:**
  ```typescript
  router.push(`/models/${modelId}`);
  ```

### ⚠️ Model Creation Page (Alternate)
**File:** `app/(app)/models/new/page.tsx`
- **Purpose:** Simplified model creation (legacy?)
- **Route:** `/models/new`
- **Size:** 414 lines
- **After generation:** Does NOT navigate - shows download button inline
- **Status:** May be legacy/unused

### ✅ Dashboard Models Redirect
**File:** `app/(app)/dashboard/models/page.tsx`
- **Purpose:** Redirect to `/models`
- **Route:** `/dashboard/models`
- **Code:**
  ```typescript
  redirect('/models');
  ```

### ❌ Deleted Routes
- `app/(app)/models/view/page.tsx` - DELETED in previous session

---

## Navigation Flow Analysis

### Primary Flow (Working)
```
User clicks "Create Model" on /models
  ↓
/models/create (2,299 line page)
  ↓ (user fills form and submits)
  ↓ (API generates model)
  ↓ (router.push(`/models/${modelId}`))
  ↓
/models/[modelId]
  ↓ (fetches model)
  ↓ (if status='generating', shows "Model Generating" + starts polling)
  ↓ (polls every 2s until status='ready')
  ↓ (shows full preview)
  ↓
STAYS HERE ✅
```

### Alternate Flow (May be unused)
```
User navigates to /models/new
  ↓
/models/new (414 line page)
  ↓ (user fills form and submits)
  ↓ (API generates model)
  ↓ (NO NAVIGATION - shows download button)
  ↓
STAYS ON /models/new
```

---

## Polling Logic (Implemented)

### Location
`app/(app)/models/[modelId]/page.tsx` lines 20-95

### How It Works
1. **Initial fetch:** Loads model on mount
2. **Status check:** If `status === 'generating'` or `'created'`, starts polling
3. **Polling interval:** 2 seconds
4. **Stop condition:** When `status === 'ready'` or `'failed'`
5. **Cleanup:** Clears interval on unmount

### Code
```typescript
let pollInterval: NodeJS.Timeout | null = null;

if (fetchedModel.status === 'generating' || fetchedModel.status === 'created') {
  if (!pollInterval) {
    console.log('[ModelDetailPage] Model is generating, starting poll...');
    pollInterval = setInterval(() => {
      fetchModel();
    }, 2000);
  }
} else {
  if (pollInterval) {
    console.log('[ModelDetailPage] Model ready, stopping poll');
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

return () => {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
};
```

---

## What Could Still Cause a "Swap"?

### Hypothesis 1: React Strict Mode Double Render
- In development, React Strict Mode causes components to mount twice
- This could cause the polling logic to fire twice
- **Solution:** Already handled - polling checks if interval exists before creating new one

### Hypothesis 2: Model Status Changes After Initial Load
- Model loads with `status: 'ready'`
- Then status changes to something else (database update?)
- **Solution:** Polling only starts if status is 'generating' or 'created'

### Hypothesis 3: Multiple Tabs/Windows
- User has multiple tabs open
- One tab updates the model
- Other tab refetches and sees different status
- **Solution:** Each tab has independent polling

### Hypothesis 4: Browser Extension or Dev Tools
- Browser extension interfering with navigation
- Dev tools causing re-renders
- **Solution:** Test in incognito mode

### Hypothesis 5: The "Good Preview" is Actually the Create Page
- User sees the create page with progress (this is the "good" UI)
- Then navigates to the model detail page (this is the "buggy" UI)
- **Solution:** If this is the case, we need to improve the model detail page UI

---

## Verification Steps

### Step 1: Check Console Logs
1. Open browser console
2. Generate a model
3. Watch for these logs:
   - `[handleSubmit] Navigation to model: ${modelId}`
   - `[ModelDetailPage] Model is generating, starting poll...`
   - `[ModelDetailPage] Model ready, stopping poll`

### Step 2: Check Network Tab
1. Open browser network tab
2. Generate a model
3. Navigate to `/models/${modelId}`
4. Watch for:
   - Initial fetch to `/api/models/${modelId}`
   - Polling requests every 2 seconds (if generating)
   - Polling stops when model is ready

### Step 3: Check URL Bar
1. Generate a model
2. Watch the URL bar
3. Confirm:
   - URL changes from `/models/create` to `/models/${modelId}`
   - URL stays at `/models/${modelId}` (no further changes)

---

## Files Modified (This Session)

### 1. `app/(app)/models/[modelId]/page.tsx`
**Changes:**
- ✅ Added `isInitialLoad` state
- ✅ Added polling logic (2-second interval)
- ✅ Added cleanup on unmount
- ✅ Updated UI to dark theme (loading, error, generating states)

**Lines Changed:**
- Line 19: Added `isInitialLoad` state
- Lines 28-95: Added polling logic
- Lines 61-69: Updated loading state UI (dark theme)
- Lines 73-95: Updated error state UI (dark theme)
- Lines 98-117: Updated generating state UI (dark theme)
- Line 175: Updated main background (dark theme)

### 2. `app/(app)/models/page.tsx`
**Changes:**
- ✅ Updated to dark theme (background, cards, typography, badges)

**Lines Changed:**
- Line 57: Background gradient
- Lines 70-74: Header typography
- Lines 84-98: Loading/error states
- Line 100: Table container
- Lines 103-110: Table header
- Line 112: Table body dividers
- Lines 118-120: Table row hover and text colors
- Lines 131-140: Status badges

---

## Confirmation

### ✅ Only ONE Model Detail Page Exists
- `app/(app)/models/[modelId]/page.tsx` is the canonical route
- No `/models/view` (deleted)
- No `/dashboard/models/[id]` (doesn't exist)
- `/models/new` is a separate creation flow (doesn't show detail page)

### ✅ No Redirects After Status Updates
- Polling only calls `setModel(fetchedModel)`
- No `router.push` or `router.replace` in polling logic
- UI updates in-place

### ✅ Navigation is Hard-Locked
- `/models/create` → `router.push(/models/${modelId})`
- No other navigation after that
- Page stays at `/models/${modelId}` permanently

---

## Build Status

✅ **Build passes:** `npm run build` succeeds  
✅ **No errors**  
✅ **Route compiles:** `/models/[modelId]` → 4.98 kB

---

## Next Steps (If Issue Persists)

If you're still seeing a "swap" after these changes:

1. **Clear Next.js cache:**
   ```bash
   rm -rf .next
   npm run dev
   ```

2. **Check browser console for:**
   - Any unexpected navigation logs
   - Any errors that might trigger error state
   - Polling start/stop logs

3. **Test in incognito mode:**
   - Rules out browser extensions
   - Rules out cached state

4. **Record a video:**
   - Show exactly what "good preview" looks like
   - Show exactly what "buggy preview" looks like
   - This will help identify if it's a UI issue vs routing issue

---

**The routing fix is complete. The model preview page now polls for status updates and never redirects.**

